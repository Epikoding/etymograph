package handler

import (
	"context"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/etymograph/api/internal/cache"
	"github.com/etymograph/api/internal/model"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type HistoryHandler struct {
	db    *gorm.DB
	cache *cache.RedisCache
}

func NewHistoryHandler(db *gorm.DB, cache *cache.RedisCache) *HistoryHandler {
	return &HistoryHandler{db: db, cache: cache}
}

// HistoryItem represents a single history entry for API response
// Maintains backward compatibility with the old SearchHistory model
type HistoryItem struct {
	ID         int64     `json:"id"`
	UserID     int64     `json:"userId"`
	Word       string    `json:"word"`
	Language   string    `json:"language"`
	SearchedAt time.Time `json:"searchedAt"`
}

type HistoryResponse struct {
	Data       []HistoryItem `json:"data"`
	Page       int           `json:"page"`
	Limit      int           `json:"limit"`
	TotalCount int64         `json:"totalCount"`
	TotalPages int           `json:"totalPages"`
}

// FlushUserHistory flushes a user's Redis history buffer to the database
// Groups entries by date and upserts to search_history_daily table
func (h *HistoryHandler) FlushUserHistory(ctx context.Context, userID int64) error {
	// Get all entries from Redis
	entries, err := h.cache.GetAllHistory(ctx, userID)
	if err != nil {
		return err
	}

	if len(entries) == 0 {
		return nil
	}

	// Group entries by date
	dateGroups := make(map[string][]cache.HistoryEntry)
	for _, entry := range entries {
		dateStr := entry.SearchedAt.Format("2006-01-02")
		dateGroups[dateStr] = append(dateGroups[dateStr], entry)
	}

	// Upsert each date's entries to DB
	for dateStr, dayEntries := range dateGroups {
		date, _ := time.Parse("2006-01-02", dateStr)

		// Find or create the daily record
		var daily model.SearchHistoryDaily
		err := h.db.Where("user_id = ? AND date = ?", userID, date).First(&daily).Error

		if err == gorm.ErrRecordNotFound {
			// Create new record
			daily = model.SearchHistoryDaily{
				UserID: userID,
				Date:   date,
				Words:  model.HistoryWords{},
			}
		} else if err != nil {
			log.Printf("Failed to query daily history: %v", err)
			continue
		}

		// Add or update words
		for _, entry := range dayEntries {
			daily.AddOrUpdateWord(entry.Word, entry.Language, entry.SearchedAt)
		}

		// Upsert to DB
		err = h.db.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "user_id"}, {Name: "date"}},
			DoUpdates: clause.AssignmentColumns([]string{"words", "updated_at"}),
		}).Create(&daily).Error

		if err != nil {
			log.Printf("Failed to upsert daily history: %v", err)
			continue
		}
	}

	// Clear Redis buffer after successful flush
	if err := h.cache.ClearUserHistory(ctx, userID); err != nil {
		log.Printf("Failed to clear Redis history for user %d: %v", userID, err)
	}

	return nil
}

// List returns search history for the authenticated user with pagination
func (h *HistoryHandler) List(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	uid := userID.(int64)
	ctx := context.Background()

	// Flush Redis buffer to DB before querying
	if err := h.FlushUserHistory(ctx, uid); err != nil {
		log.Printf("Failed to flush history for user %d: %v", uid, err)
	}

	// Parse pagination params
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))

	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}

	// Fetch all daily records for the user
	var dailyRecords []model.SearchHistoryDaily
	h.db.Where("user_id = ?", uid).Order("date DESC").Find(&dailyRecords)

	// Flatten all words into a single list
	var allItems []HistoryItem
	for _, daily := range dailyRecords {
		for _, word := range daily.Words {
			allItems = append(allItems, HistoryItem{
				ID:         daily.ID, // Use daily record ID
				UserID:     daily.UserID,
				Word:       word.Word,
				Language:   word.Language,
				SearchedAt: word.LastSearchedAt,
			})
		}
	}

	// Sort by searchedAt DESC
	sort.Slice(allItems, func(i, j int) bool {
		return allItems[i].SearchedAt.After(allItems[j].SearchedAt)
	})

	// Paginate
	totalCount := int64(len(allItems))
	offset := (page - 1) * limit
	end := offset + limit
	if offset > len(allItems) {
		offset = len(allItems)
	}
	if end > len(allItems) {
		end = len(allItems)
	}
	paginatedItems := allItems[offset:end]

	totalPages := int((totalCount + int64(limit) - 1) / int64(limit))

	c.JSON(http.StatusOK, HistoryResponse{
		Data:       paginatedItems,
		Page:       page,
		Limit:      limit,
		TotalCount: totalCount,
		TotalPages: totalPages,
	})
}

// Delete removes a specific word from a specific date's history
// Uses query params: date (YYYY-MM-DD), word, language
func (h *HistoryHandler) Delete(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	uid := userID.(int64)
	dateStr := c.Query("date")
	word := c.Query("word")
	language := c.Query("language")

	if dateStr == "" || word == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date and word are required"})
		return
	}

	date, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date format, use YYYY-MM-DD"})
		return
	}

	// Find the daily record
	var daily model.SearchHistoryDaily
	if err := h.db.Where("user_id = ? AND date = ?", uid, date).First(&daily).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "history not found"})
		return
	}

	// Remove the word from JSONB
	if !daily.RemoveWord(word, language) {
		c.JSON(http.StatusNotFound, gin.H{"error": "word not found in history"})
		return
	}

	// Update or delete the record
	if len(daily.Words) == 0 {
		h.db.Delete(&daily)
	} else {
		h.db.Save(&daily)
	}

	c.JSON(http.StatusOK, gin.H{"message": "deleted successfully"})
}

// DeleteAll removes all search history for the authenticated user
func (h *HistoryHandler) DeleteAll(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	uid := userID.(int64)
	ctx := context.Background()

	// Clear Redis buffer
	if err := h.cache.ClearUserHistory(ctx, uid); err != nil {
		log.Printf("Failed to clear Redis history: %v", err)
	}

	// Delete all DB records
	result := h.db.Where("user_id = ?", uid).Delete(&model.SearchHistoryDaily{})

	c.JSON(http.StatusOK, gin.H{
		"message": "all history deleted",
		"count":   result.RowsAffected,
	})
}

// HistoryDateSummary represents a date with search count
type HistoryDateSummary struct {
	Date      string   `json:"date"`
	Count     int64    `json:"count"`
	Languages []string `json:"languages"`
}

// HistoryDatesResponse is the response for ListDates
type HistoryDatesResponse struct {
	Dates         []HistoryDateSummary `json:"dates"`
	TotalDays     int                  `json:"totalDays"`
	TotalSearches int64                `json:"totalSearches"`
}

// HistoryDateDetailResponse is the response for GetDateDetail
type HistoryDateDetailResponse struct {
	Date  string        `json:"date"`
	Words []HistoryItem `json:"words"`
}

// ListDates returns a summary of search history grouped by date
func (h *HistoryHandler) ListDates(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	uid := userID.(int64)
	ctx := context.Background()

	// Flush Redis buffer to DB before querying
	if err := h.FlushUserHistory(ctx, uid); err != nil {
		log.Printf("Failed to flush history for user %d: %v", uid, err)
	}

	// Fetch all daily records
	var dailyRecords []model.SearchHistoryDaily
	h.db.Where("user_id = ?", uid).Order("date DESC").Find(&dailyRecords)

	var dates []HistoryDateSummary
	var totalSearches int64

	for _, daily := range dailyRecords {
		// Collect unique languages
		langSet := make(map[string]bool)
		for _, word := range daily.Words {
			langSet[word.Language] = true
		}
		languages := make([]string, 0, len(langSet))
		for lang := range langSet {
			languages = append(languages, lang)
		}

		count := int64(len(daily.Words))
		dates = append(dates, HistoryDateSummary{
			Date:      daily.Date.Format("2006-01-02"),
			Count:     count,
			Languages: languages,
		})
		totalSearches += count
	}

	c.JSON(http.StatusOK, HistoryDatesResponse{
		Dates:         dates,
		TotalDays:     len(dates),
		TotalSearches: totalSearches,
	})
}

// GetDateDetail returns search history for a specific date
func (h *HistoryHandler) GetDateDetail(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	uid := userID.(int64)
	dateStr := c.Param("date")

	// Validate date format (YYYY-MM-DD)
	date, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date format, use YYYY-MM-DD"})
		return
	}

	ctx := context.Background()

	// Flush Redis buffer to DB before querying
	if err := h.FlushUserHistory(ctx, uid); err != nil {
		log.Printf("Failed to flush history for user %d: %v", uid, err)
	}

	// Find the daily record
	var daily model.SearchHistoryDaily
	if err := h.db.Where("user_id = ? AND date = ?", uid, date).First(&daily).Error; err != nil {
		// Return empty if not found
		c.JSON(http.StatusOK, HistoryDateDetailResponse{
			Date:  dateStr,
			Words: []HistoryItem{},
		})
		return
	}

	// Convert to HistoryItem slice
	words := make([]HistoryItem, 0, len(daily.Words))
	for _, word := range daily.Words {
		words = append(words, HistoryItem{
			ID:         daily.ID,
			UserID:     daily.UserID,
			Word:       word.Word,
			Language:   word.Language,
			SearchedAt: word.LastSearchedAt,
		})
	}

	// Sort by searchedAt DESC
	sort.Slice(words, func(i, j int) bool {
		return words[i].SearchedAt.After(words[j].SearchedAt)
	})

	c.JSON(http.StatusOK, HistoryDateDetailResponse{
		Date:  dateStr,
		Words: words,
	})
}

// FlushAllUsers flushes all active users' history from Redis to DB
// This is called by the CronJob
func (h *HistoryHandler) FlushAllUsers(ctx context.Context) (int, error) {
	userIDs, err := h.cache.GetActiveUsers(ctx)
	if err != nil {
		return 0, err
	}

	flushedCount := 0
	for _, userID := range userIDs {
		if err := h.FlushUserHistory(ctx, userID); err != nil {
			log.Printf("Failed to flush history for user %d: %v", userID, err)
			continue
		}
		flushedCount++
	}

	return flushedCount, nil
}

// splitString splits a string by delimiter
func splitString(s, sep string) []string {
	if s == "" {
		return []string{}
	}
	return strings.Split(s, sep)
}
