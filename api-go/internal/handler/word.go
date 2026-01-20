package handler

import (
	"encoding/json"
	"log"
	"net/http"
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

func (h *WordHandler) Search(c *gin.Context) {
	var req SearchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "word is required"})
		return
	}

	normalizedWord := strings.ToLower(strings.TrimSpace(req.Word))
	language := req.Language
	if language == "" {
		language = "Korean"
	}
	langKey := getLanguageKey(language)
	cacheKey := cache.CacheKey(normalizedWord, langKey)

	// 1. Check Redis cache first
	if h.cache != nil {
		if cached, err := h.cache.Get(c.Request.Context(), cacheKey); err == nil {
			var word model.Word
			if err := json.Unmarshal(cached, &word); err == nil {
				log.Printf("Redis cache hit: %s", cacheKey)
				c.JSON(http.StatusOK, word)
				return
			}
		}
	}

	// 2. Check PostgreSQL
	var word model.Word
	result := h.db.Where("word = ? AND language = ?", normalizedWord, langKey).First(&word)

	if result.Error == nil && len(word.Etymology) > 0 {
		log.Printf("DB cache hit: %s (language: %s)", normalizedWord, langKey)
		// Store in Redis for next time
		if h.cache != nil {
			if wordJSON, err := json.Marshal(word); err == nil {
				h.cache.Set(c.Request.Context(), cacheKey, wordJSON)
			}
		}
		c.JSON(http.StatusOK, word)
		return
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
		if result.Error == nil {
			c.JSON(http.StatusOK, word)
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch etymology"})
		}
		return
	}

	// Filter derivatives disabled - grammatical variations like "interesting" are valid derivatives
	// filterDerivativesInPlace(normalizedWord, etymology)

	etymologyJSON, _ := json.Marshal(etymology)

	if result.Error == nil {
		h.db.Model(&word).Update("etymology", datatypes.JSON(etymologyJSON))
		word.Etymology = datatypes.JSON(etymologyJSON)
	} else {
		word = model.Word{
			Word:      normalizedWord,
			Language:  langKey,
			Etymology: datatypes.JSON(etymologyJSON),
		}
		if err := h.db.Create(&word).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save word"})
			return
		}
	}

	// Store in Redis cache
	if h.cache != nil {
		if wordJSON, err := json.Marshal(word); err == nil {
			h.cache.Set(c.Request.Context(), cacheKey, wordJSON)
		}
	}

	c.JSON(http.StatusOK, word)
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

	if result.Error == nil && len(word.Etymology) > 0 {
		log.Printf("Cache hit: %s (language: %s)", normalizedWord, langKey)
		c.JSON(http.StatusOK, word)
		return
	}

	etymology, err := h.llmClient.GetEtymologyWithLang(normalizedWord, language)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch etymology"})
		return
	}

	// Filter derivatives disabled - grammatical variations like "interesting" are valid derivatives
	// filterDerivativesInPlace(normalizedWord, etymology)

	etymologyJSON, _ := json.Marshal(etymology)

	if result.Error == nil {
		h.db.Model(&word).Update("etymology", datatypes.JSON(etymologyJSON))
		word.Etymology = datatypes.JSON(etymologyJSON)
	} else {
		word = model.Word{
			Word:      normalizedWord,
			Language:  langKey,
			Etymology: datatypes.JSON(etymologyJSON),
		}
		h.db.Create(&word)
	}

	c.JSON(http.StatusOK, word)
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

	// Extract derivatives from etymology JSON
	var etymology map[string]interface{}
	if err := json.Unmarshal(word.Etymology, &etymology); err != nil {
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

	// Filter derivatives disabled - grammatical variations like "interesting" are valid derivatives
	// filterDerivativesInPlace(normalizedWord, newEtymology)

	newEtymologyJSON, _ := json.Marshal(newEtymology)

	// Save old etymology BEFORE any updates (deep copy)
	oldEtymology := make(datatypes.JSON, len(word.Etymology))
	copy(oldEtymology, word.Etymology)

	h.db.Model(&word).Updates(map[string]interface{}{
		"etymology_prev": oldEtymology,
		"etymology":      datatypes.JSON(newEtymologyJSON),
		"updated_at":     time.Now(),
	})

	word.EtymologyPrev = oldEtymology
	word.Etymology = datatypes.JSON(newEtymologyJSON)

	// Invalidate Redis cache
	cacheKey := cache.CacheKey(normalizedWord, langKey)
	if h.cache != nil {
		h.cache.Delete(c.Request.Context(), cacheKey)
		log.Printf("Redis cache invalidated: %s", cacheKey)
	}

	c.JSON(http.StatusOK, word)
}

func (h *WordHandler) ApplyEtymology(c *gin.Context) {
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

	h.db.Model(&word).Updates(map[string]interface{}{
		"etymology_prev": nil,
		"updated_at":     time.Now(),
	})

	word.EtymologyPrev = nil

	c.JSON(http.StatusOK, word)
}

func (h *WordHandler) RevertEtymology(c *gin.Context) {
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

	if len(word.EtymologyPrev) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No previous etymology to revert"})
		return
	}

	h.db.Model(&word).Updates(map[string]interface{}{
		"etymology":      word.EtymologyPrev,
		"etymology_prev": nil,
		"updated_at":     time.Now(),
	})

	word.Etymology = word.EtymologyPrev
	word.EtymologyPrev = nil

	c.JSON(http.StatusOK, word)
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
