package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/etymograph/api/internal/cache"
	"github.com/etymograph/api/internal/client"
	"github.com/etymograph/api/internal/config"
	"github.com/etymograph/api/internal/filter"
	"github.com/etymograph/api/internal/model"
	"github.com/etymograph/api/internal/validator"
	"github.com/gin-gonic/gin"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

const MaxRevisions = 3

type WordHandler struct {
	db            *gorm.DB
	cache         *cache.RedisCache
	llmClient     *client.LLMClient
	wordValidator *validator.WordValidator
}

func NewWordHandler(db *gorm.DB, redisCache *cache.RedisCache, cfg *config.Config, wordValidator *validator.WordValidator) *WordHandler {
	return &WordHandler{
		db:            db,
		cache:         redisCache,
		llmClient:     client.NewLLMClient(cfg.LLMProxyURL),
		wordValidator: wordValidator,
	}
}

type SearchRequest struct {
	Word     string `json:"word" binding:"required"`
	Language string `json:"language"`
}

func getLanguageKey(language string) string {
	switch strings.ToLower(language) {
	case "korean":
		return "ko"
	case "japanese":
		return "ja"
	case "chinese":
		return "zh"
	default:
		if len(language) >= 2 {
			return strings.ToLower(language[:2])
		}
		return "ko"
	}
}

// getLatestRevision returns the latest revision for a word
func (h *WordHandler) getLatestRevision(wordID int64) (*model.EtymologyRevision, error) {
	var revision model.EtymologyRevision
	result := h.db.Where("word_id = ?", wordID).Order("revision_number DESC").First(&revision)
	if result.Error != nil {
		return nil, result.Error
	}
	return &revision, nil
}

// getUserPreferredRevision returns user's preferred revision or latest if no preference
// Optimized: uses JOIN to fetch in a single query
func (h *WordHandler) getUserPreferredRevision(userID, wordID int64) (*model.EtymologyRevision, error) {
	var revision model.EtymologyRevision
	// Single query with JOIN: preference -> revision
	result := h.db.Raw(`
		SELECT er.* FROM etymology_revisions er
		INNER JOIN user_etymology_preferences uep ON er.id = uep.revision_id
		WHERE uep.user_id = ? AND uep.word_id = ?
		LIMIT 1
	`, userID, wordID).Scan(&revision)

	if result.Error == nil && revision.ID > 0 {
		return &revision, nil
	}
	// Fallback to latest revision
	return h.getLatestRevision(wordID)
}

// getRevisionSummaries returns a list of revision summaries for a word
func (h *WordHandler) getRevisionSummaries(wordID int64) []model.RevisionSummary {
	var revisions []model.EtymologyRevision
	h.db.Where("word_id = ?", wordID).Order("revision_number ASC").Find(&revisions)

	summaries := make([]model.RevisionSummary, len(revisions))
	for i, rev := range revisions {
		summaries[i] = model.RevisionSummary{
			RevisionNumber: rev.RevisionNumber,
			CreatedAt:      rev.CreatedAt,
		}
	}
	return summaries
}

// buildWordResponse builds a WordWithEtymology response
// Optimized: removed redundant COUNT query, uses len(revisions) instead
func (h *WordHandler) buildWordResponse(word *model.Word, revision *model.EtymologyRevision, includeRevisions bool) model.WordWithEtymology {
	response := model.WordWithEtymology{
		ID:        word.ID,
		Word:      word.Word,
		Language:  word.Language,
		CreatedAt: word.CreatedAt,
		UpdatedAt: word.UpdatedAt,
	}

	if revision != nil {
		response.Etymology = revision.Etymology
		response.CurrentRevision = revision.RevisionNumber

		// Always fetch revisions to get accurate count (removes redundant COUNT query)
		response.Revisions = h.getRevisionSummaries(word.ID)
		response.TotalRevisions = len(response.Revisions)

		// Clear revisions from response if not requested
		if !includeRevisions {
			response.Revisions = nil
		}
	}

	return response
}

func (h *WordHandler) Search(c *gin.Context) {
	var req SearchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "word is required"})
		return
	}

	normalizedWord := strings.ToLower(strings.TrimSpace(req.Word))

	// Save search history if user is authenticated
	if userID, exists := c.Get("userID"); exists {
		go h.saveSearchHistory(userID.(int64), normalizedWord, req.Language)
	}

	// Block invalid search term "-"
	if normalizedWord == "-" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid search term",
			"code":  "INVALID_SEARCH_TERM",
		})
		return
	}

	language := req.Language
	if language == "" {
		language = "Korean"
	}
	langKey := getLanguageKey(language)
	cacheKey := cache.CacheKey(normalizedWord, langKey)

	// 1. Check Redis cache first
	if h.cache != nil {
		if cached, err := h.cache.Get(c.Request.Context(), cacheKey); err == nil {
			var response model.WordWithEtymology
			if err := json.Unmarshal(cached, &response); err == nil {
				log.Printf("Redis cache hit: %s", cacheKey)
				c.JSON(http.StatusOK, response)
				return
			}
		}
	}

	// 2. Check PostgreSQL for existing word
	var word model.Word
	result := h.db.Where("word = ? AND language = ?", normalizedWord, langKey).First(&word)

	if result.Error == nil {
		// Word exists, get appropriate revision
		var revision *model.EtymologyRevision
		var err error

		if userID, exists := c.Get("userID"); exists {
			revision, err = h.getUserPreferredRevision(userID.(int64), word.ID)
		} else {
			revision, err = h.getLatestRevision(word.ID)
		}

		if err == nil && revision != nil {
			log.Printf("DB cache hit: %s (language: %s)", normalizedWord, langKey)
			response := h.buildWordResponse(&word, revision, true)

			// Store in Redis for next time
			if h.cache != nil {
				if responseJSON, err := json.Marshal(response); err == nil {
					h.cache.Set(c.Request.Context(), cacheKey, responseJSON)
				}
			}
			c.JSON(http.StatusOK, response)
			return
		}
	}

	// Validate word before calling LLM (only for new words)
	// Skip validation for suffixes (-er) and prefixes (un-)
	isSuffixOrPrefix := strings.HasPrefix(normalizedWord, "-") || strings.HasSuffix(normalizedWord, "-")
	if h.wordValidator != nil && !isSuffixOrPrefix {
		isValid, err := h.wordValidator.IsValidWord(normalizedWord)
		if err != nil {
			log.Printf("Word validation error: %v", err)
		}
		if !isValid {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Invalid word",
				"code":  "INVALID_WORD",
				"word":  normalizedWord,
			})
			return
		}
	}

	// Fetch etymology from LLM with specified language
	log.Printf("Fetching etymology for: %s (language: %s)", normalizedWord, language)
	etymology, err := h.llmClient.GetEtymologyWithLang(normalizedWord, language)
	if err != nil {
		log.Printf("Error fetching etymology: %v", err)
		errMsg := err.Error()
		if strings.Contains(errMsg, "429") || strings.Contains(errMsg, "quota") || strings.Contains(errMsg, "RESOURCE_EXHAUSTED") {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": "Rate limit exceeded. Please wait a moment.",
				"code":  "RATE_LIMIT_EXCEEDED",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch etymology"})
		return
	}

	etymologyJSON, _ := json.Marshal(etymology)

	// Create or get word record
	if result.Error != nil {
		word = model.Word{
			Word:     normalizedWord,
			Language: langKey,
		}
		if err := h.db.Create(&word).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save word"})
			return
		}
	}

	// Create first revision
	revision := model.EtymologyRevision{
		WordID:         word.ID,
		RevisionNumber: 1,
		Etymology:      datatypes.JSON(etymologyJSON),
		CreatedAt:      time.Now(),
	}
	if err := h.db.Create(&revision).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save etymology revision"})
		return
	}

	response := h.buildWordResponse(&word, &revision, true)

	// Store in Redis cache
	if h.cache != nil {
		if responseJSON, err := json.Marshal(response); err == nil {
			h.cache.Set(c.Request.Context(), cacheKey, responseJSON)
		}
	}

	c.JSON(http.StatusOK, response)
}

func (h *WordHandler) GetEtymology(c *gin.Context) {
	wordParam := c.Param("word")
	normalizedWord := strings.ToLower(strings.TrimSpace(wordParam))
	language := c.Query("language")
	if language == "" {
		language = "Korean"
	}
	langKey := getLanguageKey(language)

	var word model.Word
	result := h.db.Where("word = ? AND language = ?", normalizedWord, langKey).First(&word)

	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Word not found"})
		return
	}

	// Get appropriate revision
	var revision *model.EtymologyRevision
	var err error

	if userID, exists := c.Get("userID"); exists {
		revision, err = h.getUserPreferredRevision(userID.(int64), word.ID)
	} else {
		revision, err = h.getLatestRevision(word.ID)
	}

	if err != nil || revision == nil {
		// No revision exists, fetch from LLM
		etymology, err := h.llmClient.GetEtymologyWithLang(normalizedWord, language)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch etymology"})
			return
		}

		etymologyJSON, _ := json.Marshal(etymology)
		newRevision := model.EtymologyRevision{
			WordID:         word.ID,
			RevisionNumber: 1,
			Etymology:      datatypes.JSON(etymologyJSON),
			CreatedAt:      time.Now(),
		}
		h.db.Create(&newRevision)
		revision = &newRevision
	}

	response := h.buildWordResponse(&word, revision, true)
	c.JSON(http.StatusOK, response)
}

func (h *WordHandler) GetDerivatives(c *gin.Context) {
	wordParam := c.Param("word")
	normalizedWord := strings.ToLower(strings.TrimSpace(wordParam))
	language := c.Query("language")
	if language == "" {
		language = "Korean"
	}
	langKey := getLanguageKey(language)

	var word model.Word
	result := h.db.Where("word = ? AND language = ?", normalizedWord, langKey).First(&word)

	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Word not found"})
		return
	}

	// Get latest revision for derivatives
	revision, err := h.getLatestRevision(word.ID)
	if err != nil || revision == nil {
		c.JSON(http.StatusOK, gin.H{
			"word":        normalizedWord,
			"language":    langKey,
			"derivatives": []interface{}{},
		})
		return
	}

	// Extract derivatives from etymology JSON
	var etymology map[string]interface{}
	if err := json.Unmarshal(revision.Etymology, &etymology); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"word":        normalizedWord,
			"language":    langKey,
			"derivatives": []interface{}{},
		})
		return
	}

	// Handle nested language structure (etymology.ko, etymology.ja, etc.)
	if langData, ok := etymology[langKey].(map[string]interface{}); ok {
		etymology = langData
	}

	derivatives := etymology["derivatives"]
	if derivatives == nil {
		derivatives = []interface{}{}
	}

	c.JSON(http.StatusOK, gin.H{
		"word":        normalizedWord,
		"language":    langKey,
		"derivatives": derivatives,
	})
}

func (h *WordHandler) GetSynonyms(c *gin.Context) {
	wordParam := c.Param("word")
	normalizedWord := strings.ToLower(strings.TrimSpace(wordParam))
	language := c.Query("language")
	if language == "" {
		language = "Korean"
	}
	langKey := getLanguageKey(language)

	var word model.Word
	result := h.db.Where("word = ? AND language = ?", normalizedWord, langKey).First(&word)

	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Word not found"})
		return
	}

	// Synonyms are fetched on-demand from LLM (not stored in DB)
	synonymsData, err := h.llmClient.GetSynonyms(normalizedWord)
	if err != nil {
		log.Printf("Error fetching synonyms: %v", err)
		errMsg := err.Error()
		if strings.Contains(errMsg, "429") || strings.Contains(errMsg, "quota") || strings.Contains(errMsg, "RESOURCE_EXHAUSTED") {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": "Rate limit exceeded. Please wait a moment.",
				"code":  "RATE_LIMIT_EXCEEDED",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch synonyms"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"word":     normalizedWord,
		"language": langKey,
		"synonyms": synonymsData,
	})
}

func (h *WordHandler) RefreshEtymology(c *gin.Context) {
	wordParam := c.Param("word")
	normalizedWord := strings.ToLower(strings.TrimSpace(wordParam))
	language := c.Query("language")
	if language == "" {
		language = "Korean"
	}
	langKey := getLanguageKey(language)

	var word model.Word
	result := h.db.Where("word = ? AND language = ?", normalizedWord, langKey).First(&word)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Word not found"})
		return
	}

	// Check revision count BEFORE calling LLM to avoid wasting tokens
	var revisionCount int64
	h.db.Model(&model.EtymologyRevision{}).Where("word_id = ?", word.ID).Count(&revisionCount)

	if revisionCount >= int64(MaxRevisions) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Maximum revisions reached",
			"code":  "MAX_REVISIONS_REACHED",
		})
		return
	}

	log.Printf("Refreshing etymology for: %s (language: %s)", normalizedWord, language)
	newEtymology, err := h.llmClient.GetEtymologyWithLang(normalizedWord, language)
	if err != nil {
		log.Printf("Error fetching etymology: %v", err)
		errMsg := err.Error()
		if strings.Contains(errMsg, "429") || strings.Contains(errMsg, "quota") || strings.Contains(errMsg, "RESOURCE_EXHAUSTED") {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": "Rate limit exceeded. Please wait a moment.",
				"code":  "RATE_LIMIT_EXCEEDED",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch etymology"})
		return
	}

	newEtymologyJSON, _ := json.Marshal(newEtymology)

	// Get the highest revision number
	var maxRevision int
	h.db.Model(&model.EtymologyRevision{}).Where("word_id = ?", word.ID).
		Select("COALESCE(MAX(revision_number), 0)").Scan(&maxRevision)

	newRevisionNumber := maxRevision + 1

	// Create new revision
	newRevision := model.EtymologyRevision{
		WordID:         word.ID,
		RevisionNumber: newRevisionNumber,
		Etymology:      datatypes.JSON(newEtymologyJSON),
		CreatedAt:      time.Now(),
	}
	if err := h.db.Create(&newRevision).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create revision"})
		return
	}

	// If user is logged in, set their preference to the new revision
	if userID, exists := c.Get("userID"); exists {
		h.db.Where("user_id = ? AND word_id = ?", userID.(int64), word.ID).Delete(&model.UserEtymologyPreference{})
		pref := model.UserEtymologyPreference{
			UserID:     userID.(int64),
			WordID:     word.ID,
			RevisionID: newRevision.ID,
			UpdatedAt:  time.Now(),
		}
		h.db.Create(&pref)
	}

	// Invalidate Redis cache
	cacheKey := cache.CacheKey(normalizedWord, langKey)
	if h.cache != nil {
		h.cache.Delete(c.Request.Context(), cacheKey)
		log.Printf("Redis cache invalidated: %s", cacheKey)
	}

	response := h.buildWordResponse(&word, &newRevision, true)
	c.JSON(http.StatusOK, response)
}

// GetRevisions returns all revisions for a word
func (h *WordHandler) GetRevisions(c *gin.Context) {
	wordParam := c.Param("word")
	normalizedWord := strings.ToLower(strings.TrimSpace(wordParam))
	language := c.Query("language")
	if language == "" {
		language = "Korean"
	}
	langKey := getLanguageKey(language)

	var word model.Word
	if err := h.db.Where("word = ? AND language = ?", normalizedWord, langKey).First(&word).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Word not found"})
		return
	}

	var revisions []model.EtymologyRevision
	h.db.Where("word_id = ?", word.ID).Order("revision_number ASC").Find(&revisions)

	c.JSON(http.StatusOK, gin.H{
		"word":      normalizedWord,
		"language":  langKey,
		"revisions": revisions,
	})
}

// GetRevision returns a specific revision for a word
func (h *WordHandler) GetRevision(c *gin.Context) {
	wordParam := c.Param("word")
	normalizedWord := strings.ToLower(strings.TrimSpace(wordParam))
	revNumStr := c.Param("revNum")
	language := c.Query("language")
	if language == "" {
		language = "Korean"
	}
	langKey := getLanguageKey(language)

	revNum, err := strconv.Atoi(revNumStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid revision number"})
		return
	}

	var word model.Word
	if err := h.db.Where("word = ? AND language = ?", normalizedWord, langKey).First(&word).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Word not found"})
		return
	}

	var revision model.EtymologyRevision
	if err := h.db.Where("word_id = ? AND revision_number = ?", word.ID, revNum).First(&revision).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Revision not found"})
		return
	}

	c.JSON(http.StatusOK, revision)
}

// SelectRevision sets user's preferred revision for a word (requires auth)
func (h *WordHandler) SelectRevision(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
		return
	}

	wordParam := c.Param("word")
	normalizedWord := strings.ToLower(strings.TrimSpace(wordParam))
	revNumStr := c.Param("revNum")
	language := c.Query("language")
	if language == "" {
		language = "Korean"
	}
	langKey := getLanguageKey(language)

	revNum, err := strconv.Atoi(revNumStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid revision number"})
		return
	}

	var word model.Word
	if err := h.db.Where("word = ? AND language = ?", normalizedWord, langKey).First(&word).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Word not found"})
		return
	}

	var revision model.EtymologyRevision
	if err := h.db.Where("word_id = ? AND revision_number = ?", word.ID, revNum).First(&revision).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Revision not found"})
		return
	}

	// Upsert user preference
	var pref model.UserEtymologyPreference
	result := h.db.Where("user_id = ? AND word_id = ?", userID.(int64), word.ID).First(&pref)
	if result.Error != nil {
		// Create new preference
		pref = model.UserEtymologyPreference{
			UserID:     userID.(int64),
			WordID:     word.ID,
			RevisionID: revision.ID,
			UpdatedAt:  time.Now(),
		}
		h.db.Create(&pref)
	} else {
		// Update existing preference
		h.db.Model(&pref).Updates(map[string]interface{}{
			"revision_id": revision.ID,
			"updated_at":  time.Now(),
		})
	}

	response := h.buildWordResponse(&word, &revision, true)
	c.JSON(http.StatusOK, response)
}

// Suggest returns word suggestions for autocomplete based on prefix
func (h *WordHandler) Suggest(c *gin.Context) {
	query := strings.ToLower(strings.TrimSpace(c.Query("q")))
	if len(query) < 2 {
		c.JSON(http.StatusOK, gin.H{"suggestions": gin.H{"priority": []string{}, "general": []string{}}})
		return
	}

	limit := 8
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 20 {
			limit = parsed
		}
	}

	if h.cache == nil {
		c.JSON(http.StatusOK, gin.H{"suggestions": gin.H{"priority": []string{}, "general": []string{}}})
		return
	}

	ctx := c.Request.Context()

	// Get priority suggestions (max 3)
	priorityLimit := 3
	prioritySuggestions, err := h.cache.GetPrioritySuggestions(ctx, query, priorityLimit)
	if err != nil {
		log.Printf("Redis priority suggest error: %v", err)
		prioritySuggestions = []string{}
	}

	// Create a set of priority words for deduplication
	prioritySet := make(map[string]bool)
	for _, word := range prioritySuggestions {
		prioritySet[word] = true
	}

	// Get general suggestions
	generalSuggestions, err := h.cache.GetSuggestions(ctx, query, limit+priorityLimit)
	if err != nil {
		log.Printf("Redis suggest error: %v", err)
		generalSuggestions = []string{}
	}

	// Filter out priority words from general suggestions
	filteredGeneral := make([]string, 0, len(generalSuggestions))
	for _, word := range generalSuggestions {
		if !prioritySet[word] {
			filteredGeneral = append(filteredGeneral, word)
		}
	}

	// Limit general suggestions
	if len(filteredGeneral) > limit-len(prioritySuggestions) {
		filteredGeneral = filteredGeneral[:limit-len(prioritySuggestions)]
	}

	c.JSON(http.StatusOK, gin.H{"suggestions": gin.H{
		"priority": prioritySuggestions,
		"general":  filteredGeneral,
	}})
}

// filterDerivativesInPlace removes grammatical variations of the input word from etymology derivatives.
func filterDerivativesInPlace(word string, etymology map[string]interface{}) {
	if etymology == nil {
		return
	}

	// Check if derivatives exist at top level
	if derivatives, ok := etymology["derivatives"].([]interface{}); ok {
		etymology["derivatives"] = filter.FilterDerivatives(word, derivatives)
	}
}

// saveSearchHistory saves a search to the user's history
func (h *WordHandler) saveSearchHistory(userID int64, word string, language string) {
	if language == "" {
		language = "Korean"
	}
	langKey := getLanguageKey(language)

	history := model.SearchHistory{
		UserID:     userID,
		Word:       word,
		Language:   langKey,
		SearchedAt: time.Now(),
	}

	if err := h.db.Create(&history).Error; err != nil {
		log.Printf("Failed to save search history: %v", err)
	}
}

// UnfilledWord represents a word without etymology
type UnfilledWord struct {
	ID       int64  `json:"id"`
	Word     string `json:"word"`
	Language string `json:"language"`
}

// GetUnfilled returns words with no etymology revisions (paginated)
func (h *WordHandler) GetUnfilled(c *gin.Context) {
	language := c.Query("language")
	if language == "" {
		language = "ko"
	} else {
		language = getLanguageKey(language)
	}

	// Parse pagination params
	limit := 100
	offset := 0

	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 1000 {
			limit = parsed
		}
	}

	if o := c.Query("offset"); o != "" {
		if parsed, err := strconv.Atoi(o); err == nil && parsed >= 0 {
			offset = parsed
		}
	}

	// Get total count of words without revisions
	var total int64
	h.db.Model(&model.Word{}).
		Where("language = ? AND id NOT IN (SELECT DISTINCT word_id FROM etymology_revisions)", language).
		Count(&total)

	// Get unfilled words
	var words []model.Word
	result := h.db.Select("id, word, language").
		Where("language = ? AND id NOT IN (SELECT DISTINCT word_id FROM etymology_revisions)", language).
		Order("id ASC").
		Limit(limit).
		Offset(offset).
		Find(&words)

	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch unfilled words"})
		return
	}

	// Convert to response format
	unfilledWords := make([]UnfilledWord, len(words))
	for i, w := range words {
		unfilledWords[i] = UnfilledWord{
			ID:       w.ID,
			Word:     w.Word,
			Language: w.Language,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"words":  unfilledWords,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

// Exists checks if a word, suffix, or prefix exists in the dictionary
// Suffixes: "-er", "-ing" (start with -)
// Prefixes: "un-", "re-" (end with -)
// Words: "teacher", "happy" (no hyphen)
func (h *WordHandler) Exists(c *gin.Context) {
	wordParam := c.Param("word")
	normalizedWord := strings.ToLower(strings.TrimSpace(wordParam))

	if normalizedWord == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "word is required"})
		return
	}

	exists := h.wordValidator.ExistsInDict(normalizedWord)
	c.JSON(http.StatusOK, gin.H{"exists": exists})
}

// GetMorphemes returns all suffixes and prefixes for frontend caching
func (h *WordHandler) GetMorphemes(c *gin.Context) {
	if h.wordValidator == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "word validator not initialized"})
		return
	}

	suffixes := h.wordValidator.GetSuffixes()
	prefixes := h.wordValidator.GetPrefixes()

	c.JSON(http.StatusOK, gin.H{
		"suffixes": suffixes,
		"prefixes": prefixes,
	})
}
