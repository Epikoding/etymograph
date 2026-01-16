package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/etymograph/api/internal/client"
	"github.com/etymograph/api/internal/config"
	"github.com/etymograph/api/internal/model"
	"github.com/gin-gonic/gin"
	"github.com/lib/pq"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type WordHandler struct {
	db        *gorm.DB
	llmClient *client.LLMClient
}

func NewWordHandler(db *gorm.DB, cfg *config.Config) *WordHandler {
	return &WordHandler{
		db:        db,
		llmClient: client.NewLLMClient(cfg.LLMProxyURL),
	}
}

type SearchRequest struct {
	Word string `json:"word" binding:"required"`
}

func (h *WordHandler) Search(c *gin.Context) {
	var req SearchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "word is required"})
		return
	}

	normalizedWord := strings.ToLower(strings.TrimSpace(req.Word))

	// Check if word exists in database
	var word model.Word
	result := h.db.Where("word = ?", normalizedWord).First(&word)

	if result.Error == nil {
		log.Printf("Found cached word: %s", normalizedWord)
		c.JSON(http.StatusOK, word)
		return
	}

	// Fetch etymology from LLM
	log.Printf("Fetching etymology for: %s", normalizedWord)
	etymology, err := h.llmClient.GetEtymology(normalizedWord)
	if err != nil {
		log.Printf("Error fetching etymology: %v", err)
		// Create word without etymology
		word = model.Word{
			Word: normalizedWord,
		}
	} else {
		etymologyJSON, _ := json.Marshal(etymology)
		word = model.Word{
			Word:      normalizedWord,
			Etymology: datatypes.JSON(etymologyJSON),
		}
	}

	if err := h.db.Create(&word).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save word"})
		return
	}

	c.JSON(http.StatusOK, word)
}

func (h *WordHandler) GetEtymology(c *gin.Context) {
	wordParam := c.Param("word")
	normalizedWord := strings.ToLower(strings.TrimSpace(wordParam))

	var word model.Word
	result := h.db.Where("word = ?", normalizedWord).First(&word)

	// If word exists and has etymology, return it
	if result.Error == nil && len(word.Etymology) > 0 {
		c.JSON(http.StatusOK, word)
		return
	}

	// Fetch etymology from LLM
	etymology, err := h.llmClient.GetEtymology(normalizedWord)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch etymology"})
		return
	}

	etymologyJSON, _ := json.Marshal(etymology)

	if result.Error == nil {
		// Update existing word
		h.db.Model(&word).Update("etymology", datatypes.JSON(etymologyJSON))
		word.Etymology = datatypes.JSON(etymologyJSON)
	} else {
		// Create new word
		word = model.Word{
			Word:      normalizedWord,
			Etymology: datatypes.JSON(etymologyJSON),
		}
		h.db.Create(&word)
	}

	c.JSON(http.StatusOK, word)
}

func (h *WordHandler) GetDerivatives(c *gin.Context) {
	wordParam := c.Param("word")
	normalizedWord := strings.ToLower(strings.TrimSpace(wordParam))

	var word model.Word
	result := h.db.Where("word = ?", normalizedWord).First(&word)

	// If word exists and has derivatives, return it
	if result.Error == nil && len(word.Derivatives) > 0 {
		c.JSON(http.StatusOK, word)
		return
	}

	// Fetch derivatives from LLM
	derivativesData, err := h.llmClient.GetDerivatives(normalizedWord)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch derivatives"})
		return
	}

	// Extract derivatives array
	var derivatives []string
	if derivativesArr, ok := derivativesData["derivatives"].([]interface{}); ok {
		for _, d := range derivativesArr {
			if dMap, ok := d.(map[string]interface{}); ok {
				if w, ok := dMap["word"].(string); ok {
					derivatives = append(derivatives, w)
				}
			}
		}
	}

	if result.Error == nil {
		// Update existing word using raw SQL for array type
		h.db.Exec("UPDATE words SET derivatives = ?, updated_at = NOW() WHERE id = ?", pq.Array(derivatives), word.ID)
		word.Derivatives = derivatives
	} else {
		// Create new word
		word = model.Word{
			Word:        normalizedWord,
			Derivatives: derivatives,
		}
		h.db.Create(&word)
	}

	c.JSON(http.StatusOK, word)
}

func (h *WordHandler) GetSynonyms(c *gin.Context) {
	wordParam := c.Param("word")
	normalizedWord := strings.ToLower(strings.TrimSpace(wordParam))

	var word model.Word
	result := h.db.Where("word = ?", normalizedWord).First(&word)

	// If word exists and has synonyms, return it
	if result.Error == nil && len(word.Synonyms) > 0 {
		c.JSON(http.StatusOK, word)
		return
	}

	// Fetch synonyms from LLM
	synonymsData, err := h.llmClient.GetSynonyms(normalizedWord)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch synonyms"})
		return
	}

	synonymsJSON, _ := json.Marshal(synonymsData)

	if result.Error == nil {
		// Update existing word
		h.db.Model(&word).Update("synonyms", datatypes.JSON(synonymsJSON))
		word.Synonyms = datatypes.JSON(synonymsJSON)
	} else {
		// Create new word
		word = model.Word{
			Word:     normalizedWord,
			Synonyms: datatypes.JSON(synonymsJSON),
		}
		h.db.Create(&word)
	}

	c.JSON(http.StatusOK, word)
}
