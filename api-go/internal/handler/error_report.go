package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/etymograph/api/internal/model"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type ErrorReportHandler struct {
	db *gorm.DB
}

func NewErrorReportHandler(db *gorm.DB) *ErrorReportHandler {
	return &ErrorReportHandler{db: db}
}

type SubmitErrorReportRequest struct {
	WordID      int64  `json:"wordId" binding:"required"`
	IssueType   string `json:"issueType" binding:"required"`
	Description string `json:"description" binding:"required"`
}

// Submit creates a new error report
func (h *ErrorReportHandler) Submit(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	var req SubmitErrorReportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	// Validate issue type
	validTypes := map[string]bool{
		model.IssueTypeEtymology:  true,
		model.IssueTypeDefinition: true,
		model.IssueTypeDerivative: true,
		model.IssueTypeComponent:  true,
		model.IssueTypeOther:      true,
	}
	if !validTypes[req.IssueType] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid issue type"})
		return
	}

	// Get word info
	var word model.Word
	if err := h.db.First(&word, req.WordID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "word not found"})
		return
	}

	// Create error report
	report := model.ErrorReport{
		UserID:      userID.(int64),
		WordID:      req.WordID,
		Word:        word.Word,
		Language:    word.Language,
		IssueType:   req.IssueType,
		Description: req.Description,
		Status:      model.StatusPending,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	if err := h.db.Create(&report).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create error report"})
		return
	}

	c.JSON(http.StatusCreated, report)
}

// ListMy returns the current user's error reports
func (h *ErrorReportHandler) ListMy(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))

	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}

	offset := (page - 1) * limit

	var reports []model.ErrorReport
	var totalCount int64

	h.db.Model(&model.ErrorReport{}).Where("user_id = ?", userID).Count(&totalCount)
	h.db.Where("user_id = ?", userID).
		Order("created_at DESC").
		Offset(offset).
		Limit(limit).
		Find(&reports)

	totalPages := int((totalCount + int64(limit) - 1) / int64(limit))

	c.JSON(http.StatusOK, gin.H{
		"data":       reports,
		"page":       page,
		"limit":      limit,
		"totalCount": totalCount,
		"totalPages": totalPages,
	})
}
