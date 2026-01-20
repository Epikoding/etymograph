package handler

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/epikoding/etymograph/llm-proxy/internal/llm"
	"github.com/gin-gonic/gin"
)

type EtymologyHandler struct {
	client llm.LLMClient
}

func NewEtymologyHandler(client llm.LLMClient) *EtymologyHandler {
	return &EtymologyHandler{client: client}
}

type EtymologyRequest struct {
	Word     string `json:"word" binding:"required"`
	Language string `json:"language"` // Target language for translations (e.g., "Korean", "Japanese", "Spanish")
}

// WordType represents the type of word being analyzed
type WordType int

const (
	WordTypeNormal WordType = iota
	WordTypeSuffix // -er, -ing, -tion (starts with -)
	WordTypePrefix // un-, re-, pre- (ends with -)
)

// detectWordType determines if the word is a normal word, suffix, or prefix
// based on dash position:
//   - "-er" → suffix (dash at start)
//   - "un-" → prefix (dash at end)
//   - "teacher" → normal word (no dash)
func detectWordType(word string) (WordType, string) {
	word = strings.TrimSpace(word)

	if strings.HasPrefix(word, "-") && len(word) > 1 {
		return WordTypeSuffix, strings.TrimPrefix(word, "-")
	}
	if strings.HasSuffix(word, "-") && len(word) > 1 {
		return WordTypePrefix, strings.TrimSuffix(word, "-")
	}
	return WordTypeNormal, word
}

func (h *EtymologyHandler) Analyze(c *gin.Context) {
	var req EtymologyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "word is required"})
		return
	}

	// Default to Korean if no language specified
	targetLang := req.Language
	if targetLang == "" {
		targetLang = "Korean"
	}

	// Detect word type based on dash position
	wordType, cleanWord := detectWordType(req.Word)

	var prompt string
	switch wordType {
	case WordTypeSuffix:
		// SuffixEtymologyPrompt has 3 %s placeholders: word, language, word (for JSON)
		prompt = fmt.Sprintf(llm.SuffixEtymologyPrompt, cleanWord, targetLang, cleanWord)
	case WordTypePrefix:
		// PrefixEtymologyPrompt has 3 %s placeholders: word, language, word (for JSON)
		prompt = fmt.Sprintf(llm.PrefixEtymologyPrompt, cleanWord, targetLang, cleanWord)
	default:
		prompt = fmt.Sprintf(llm.EtymologyPrompt, cleanWord, targetLang)
	}

	response, err := h.client.Generate(c.Request.Context(), prompt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	jsonStr, err := llm.ExtractJSON(response)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":       "failed to parse LLM response",
			"rawResponse": response,
		})
		return
	}

	c.Data(http.StatusOK, "application/json", []byte(jsonStr))
}
