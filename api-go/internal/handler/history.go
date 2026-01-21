package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/etymograph/api/internal/model"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type HistoryHandler struct {
	db *gorm.DB
}

func NewHistoryHandler(db *gorm.DB) *HistoryHandler {
	return &HistoryHandler{db: db}
}

type HistoryResponse struct {
	Data       []model.SearchHistory `json:"data"`
	Page       int                   `json:"page"`
	Limit      int                   `json:"limit"`
	TotalCount int64                 `json:"totalCount"`
	TotalPages int                   `json:"totalPages"`
}

// List returns search history for the authenticated user with pagination
func (h *HistoryHandler) List(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
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

	offset := (page - 1) * limit

	// Count total records
	var totalCount int64
	h.db.Model(&model.SearchHistory{}).Where("user_id = ?", userID).Count(&totalCount)

	// Fetch records
	var histories []model.SearchHistory
	h.db.Where("user_id = ?", userID).
		Order("searched_at DESC").
		Offset(offset).
		Limit(limit).
		Find(&histories)

	totalPages := int((totalCount + int64(limit) - 1) / int64(limit))

	c.JSON(http.StatusOK, HistoryResponse{
		Data:       histories,
		Page:       page,
		Limit:      limit,
		TotalCount: totalCount,
		TotalPages: totalPages,
	})
}

// Delete removes a specific search history entry
func (h *HistoryHandler) Delete(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	historyID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid history id"})
		return
	}

	// Delete only if owned by user
	result := h.db.Where("id = ? AND user_id = ?", historyID, userID).Delete(&model.SearchHistory{})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "history not found"})
		return
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

	result := h.db.Where("user_id = ?", userID).Delete(&model.SearchHistory{})

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
	Date  string                `json:"date"`
	Words []model.SearchHistory `json:"words"`
}

// ListDates returns a summary of search history grouped by date
func (h *HistoryHandler) ListDates(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	// Query to get dates with counts and languages
	type dateRow struct {
		Date      string
		Count     int64
		Languages string
	}

	var rows []dateRow
	h.db.Model(&model.SearchHistory{}).
		Select("DATE(searched_at) as date, COUNT(*) as count, STRING_AGG(DISTINCT language, ',') as languages").
		Where("user_id = ?", userID).
		Group("DATE(searched_at)").
		Order("date DESC").
		Scan(&rows)

	var dates []HistoryDateSummary
	var totalSearches int64

	for _, row := range rows {
		languages := []string{}
		if row.Languages != "" {
			for _, lang := range splitString(row.Languages, ",") {
				if lang != "" {
					languages = append(languages, lang)
				}
			}
		}
		dates = append(dates, HistoryDateSummary{
			Date:      row.Date,
			Count:     row.Count,
			Languages: languages,
		})
		totalSearches += row.Count
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

	dateStr := c.Param("date")

	// Validate date format (YYYY-MM-DD)
	_, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date format, use YYYY-MM-DD"})
		return
	}

	var histories []model.SearchHistory
	h.db.Where("user_id = ? AND DATE(searched_at) = ?", userID, dateStr).
		Order("searched_at DESC").
		Find(&histories)

	c.JSON(http.StatusOK, HistoryDateDetailResponse{
		Date:  dateStr,
		Words: histories,
	})
}

// splitString splits a string by delimiter
func splitString(s, sep string) []string {
	if s == "" {
		return []string{}
	}
	result := []string{}
	current := ""
	for _, char := range s {
		if string(char) == sep {
			if current != "" {
				result = append(result, current)
			}
			current = ""
		} else {
			current += string(char)
		}
	}
	if current != "" {
		result = append(result, current)
	}
	return result
}
