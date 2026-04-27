package handler

import (
	"net/http"

	"github.com/epikoding/etymograph/rate-limiter/internal/limiter"
	"github.com/gin-gonic/gin"
)

type CheckHandler struct {
	limiter *limiter.Limiter
}

func NewCheckHandler(l *limiter.Limiter) *CheckHandler {
	return &CheckHandler{limiter: l}
}

type CheckRequest struct {
	ClientID string `json:"client_id" binding:"required"`
	Action   string `json:"action" binding:"required"`
}

func (h *CheckHandler) Check(c *gin.Context) {
	var req CheckRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "client_id and action are required"})
		return
	}

	result, err := h.limiter.Check(c.Request.Context(), req.ClientID, req.Action)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	status := http.StatusOK
	if !result.Allowed {
		status = http.StatusTooManyRequests
	}

	c.JSON(status, result)
}

func (h *CheckHandler) GetLimits(c *gin.Context) {
	limits := make(map[string]map[string]interface{})
	for action, config := range limiter.DefaultLimits {
		limits[action] = map[string]interface{}{
			"limit":         config.Limit,
			"window_seconds": int(config.Window.Seconds()),
		}
	}
	c.JSON(http.StatusOK, limits)
}
