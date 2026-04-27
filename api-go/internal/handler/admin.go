package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/etymograph/api/internal/model"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type AdminHandler struct {
	db *gorm.DB
}

func NewAdminHandler(db *gorm.DB) *AdminHandler {
	return &AdminHandler{db: db}
}

type DashboardStats struct {
	TotalReports     int64              `json:"totalReports"`
	PendingReports   int64              `json:"pendingReports"`
	ResolvedReports  int64              `json:"resolvedReports"`
	DismissedReports int64              `json:"dismissedReports"`
	ReportsByType    map[string]int64   `json:"reportsByType"`
	TopReportedWords []WordCount        `json:"topReportedWords"`
	TopSearchedWords []WordCount        `json:"topSearchedWords"`
}

type WordCount struct {
	Word  string `json:"word"`
	Count int64  `json:"count"`
}

// GetStats returns dashboard statistics
func (h *AdminHandler) GetStats(c *gin.Context) {
	var stats DashboardStats

	// Total reports
	h.db.Model(&model.ErrorReport{}).Count(&stats.TotalReports)

	// Reports by status
	h.db.Model(&model.ErrorReport{}).Where("status = ?", model.StatusPending).Count(&stats.PendingReports)
	h.db.Model(&model.ErrorReport{}).Where("status = ?", model.StatusResolved).Count(&stats.ResolvedReports)
	h.db.Model(&model.ErrorReport{}).Where("status = ?", model.StatusDismissed).Count(&stats.DismissedReports)

	// Reports by type
	stats.ReportsByType = make(map[string]int64)
	type TypeCount struct {
		IssueType string
		Count     int64
	}
	var typeCounts []TypeCount
	h.db.Model(&model.ErrorReport{}).
		Select("issue_type, count(*) as count").
		Group("issue_type").
		Scan(&typeCounts)
	for _, tc := range typeCounts {
		stats.ReportsByType[tc.IssueType] = tc.Count
	}

	// Top reported words
	h.db.Model(&model.ErrorReport{}).
		Select("word, count(*) as count").
		Group("word").
		Order("count DESC").
		Limit(10).
		Scan(&stats.TopReportedWords)

	// Top searched words (last 30 days)
	thirtyDaysAgo := time.Now().AddDate(0, 0, -30)
	h.db.Model(&model.SearchHistory{}).
		Select("word, count(*) as count").
		Where("searched_at > ?", thirtyDaysAgo).
		Group("word").
		Order("count DESC").
		Limit(10).
		Scan(&stats.TopSearchedWords)

	c.JSON(http.StatusOK, stats)
}

// ListErrorReports returns all error reports with pagination and filters
func (h *AdminHandler) ListErrorReports(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	status := c.Query("status")
	issueType := c.Query("issueType")

	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}

	offset := (page - 1) * limit

	query := h.db.Model(&model.ErrorReport{})

	if status != "" {
		query = query.Where("status = ?", status)
	}
	if issueType != "" {
		query = query.Where("issue_type = ?", issueType)
	}

	var totalCount int64
	query.Count(&totalCount)

	var reports []model.ErrorReport
	query.Order("created_at DESC").
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

type UpdateErrorReportRequest struct {
	Status     string `json:"status" binding:"required"`
	ReviewNote string `json:"reviewNote"`
}

// UpdateErrorReport updates the status of an error report
func (h *AdminHandler) UpdateErrorReport(c *gin.Context) {
	reportID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid report ID"})
		return
	}

	var req UpdateErrorReportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	// Validate status
	validStatuses := map[string]bool{
		model.StatusPending:   true,
		model.StatusResolved:  true,
		model.StatusDismissed: true,
	}
	if !validStatuses[req.Status] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status"})
		return
	}

	userID, _ := c.Get("userID")

	var report model.ErrorReport
	if err := h.db.First(&report, reportID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "report not found"})
		return
	}

	reviewerID := userID.(int64)
	report.Status = req.Status
	report.ReviewNote = req.ReviewNote
	report.ReviewedBy = &reviewerID
	report.UpdatedAt = time.Now()

	if err := h.db.Save(&report).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update report"})
		return
	}

	c.JSON(http.StatusOK, report)
}

// GetSearchAnalytics returns search frequency analytics
func (h *AdminHandler) GetSearchAnalytics(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))

	if days < 1 || days > 365 {
		days = 30
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}

	startDate := time.Now().AddDate(0, 0, -days)

	var results []WordCount
	h.db.Model(&model.SearchHistory{}).
		Select("word, count(*) as count").
		Where("searched_at > ?", startDate).
		Group("word").
		Order("count DESC").
		Limit(limit).
		Scan(&results)

	c.JSON(http.StatusOK, gin.H{
		"days":  days,
		"words": results,
	})
}
