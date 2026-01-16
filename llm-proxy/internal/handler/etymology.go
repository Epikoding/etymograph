package handler

import (
	"fmt"
	"net/http"

	"github.com/epikoding/etymograph/llm-proxy/internal/llm"
	"github.com/gin-gonic/gin"
)

type EtymologyHandler struct {
	client *llm.Client
}

func NewEtymologyHandler(client *llm.Client) *EtymologyHandler {
	return &EtymologyHandler{client: client}
}

type EtymologyRequest struct {
	Word string `json:"word" binding:"required"`
}

func (h *EtymologyHandler) Analyze(c *gin.Context) {
	var req EtymologyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "word is required"})
		return
	}

	prompt := fmt.Sprintf(llm.EtymologyPrompt, req.Word)
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
