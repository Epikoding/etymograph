package handler

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/etymograph/api/internal/model"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type SessionHandler struct {
	db *gorm.DB
}

func NewSessionHandler(db *gorm.DB) *SessionHandler {
	return &SessionHandler{db: db}
}

type CreateSessionRequest struct {
	Name string `json:"name"`
}

type AddWordRequest struct {
	Word     string  `json:"word" binding:"required"`
	ParentID *string `json:"parentId"`
}

func (h *SessionHandler) Create(c *gin.Context) {
	var req CreateSessionRequest
	c.ShouldBindJSON(&req)

	var name *string
	if req.Name != "" {
		name = &req.Name
	}

	session := model.Session{
		Name:      name,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}

	if err := h.db.Create(&session).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
		return
	}

	c.JSON(http.StatusCreated, session)
}

func (h *SessionHandler) Get(c *gin.Context) {
	sessionID := c.Param("id")

	var session model.Session
	result := h.db.Preload("Words.Word").First(&session, "id = ?", sessionID)

	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	c.JSON(http.StatusOK, session)
}

func (h *SessionHandler) AddWord(c *gin.Context) {
	sessionIDStr := c.Param("id")
	sessionID, err := strconv.ParseInt(sessionIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session ID"})
		return
	}

	var req AddWordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "word is required"})
		return
	}

	// Check if session exists
	var session model.Session
	if err := h.db.First(&session, "id = ?", sessionID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	// Find or create word
	normalizedWord := strings.ToLower(strings.TrimSpace(req.Word))
	var word model.Word
	result := h.db.Where("word = ?", normalizedWord).First(&word)
	if result.Error != nil {
		word = model.Word{Word: normalizedWord}
		if err := h.db.Create(&word).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create word"})
			return
		}
	}

	// Get current max order
	var maxOrder int
	h.db.Model(&model.SessionWord{}).
		Where("session_id = ?", sessionID).
		Select("COALESCE(MAX(\"order\"), 0)").
		Scan(&maxOrder)

	// Parse ParentID if provided
	var parentID *int64
	if req.ParentID != nil {
		pid, err := strconv.ParseInt(*req.ParentID, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid parent ID"})
			return
		}
		parentID = &pid
	}

	// Create session word
	sessionWord := model.SessionWord{
		SessionID: sessionID,
		WordID:    word.ID,
		Order:     maxOrder + 1,
		ParentID:  parentID,
	}

	if err := h.db.Create(&sessionWord).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add word to session"})
		return
	}

	// Reload with word data
	h.db.Preload("Word").First(&sessionWord, "id = ?", sessionWord.ID)

	c.JSON(http.StatusCreated, sessionWord)
}

func (h *SessionHandler) RemoveWord(c *gin.Context) {
	sessionID := c.Param("id")
	wordID := c.Param("wordId")

	result := h.db.Where("session_id = ? AND id = ?", sessionID, wordID).Delete(&model.SessionWord{})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Word not found in session"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Word removed from session"})
}
