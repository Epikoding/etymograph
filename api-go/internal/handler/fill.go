package handler

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/etymograph/api/internal/cache"
	"github.com/etymograph/api/internal/client"
	"github.com/etymograph/api/internal/model"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type FillHandler struct {
	db        *gorm.DB
	cache     *cache.RedisCache
	llmClient *client.LLMClient
	mu        sync.RWMutex
	jobs      map[string]*FillJob
	cancelFns map[string]context.CancelFunc
}

type FillJob struct {
	JobID     string     `json:"jobId"`
	Status    string     `json:"status"` // running, completed, stopped, failed
	Language  string     `json:"language"`
	Workers   int        `json:"workers"`
	DelayMs   int        `json:"delayMs"`
	Total     int        `json:"total"`
	Completed int64      `json:"completed"`
	Failed    int64      `json:"failed"`
	Errors    []JobError `json:"errors"`
	StartedAt time.Time  `json:"startedAt"`
	mu        sync.Mutex
}

type JobError struct {
	Word  string `json:"word"`
	Error string `json:"error"`
}

type FillRequest struct {
	Language string `json:"language"`
	Workers  int    `json:"workers"`
	DelayMs  int    `json:"delayMs"`
}

func NewFillHandler(db *gorm.DB, redisCache *cache.RedisCache, llmProxyURL string) *FillHandler {
	return &FillHandler{
		db:        db,
		cache:     redisCache,
		llmClient: client.NewLLMClient(llmProxyURL),
		jobs:      make(map[string]*FillJob),
		cancelFns: make(map[string]context.CancelFunc),
	}
}

// StartFill starts a background job to fill etymology for words with null etymology
func (h *FillHandler) StartFill(c *gin.Context) {
	var req FillRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	// Set defaults
	if req.Language == "" {
		req.Language = "Korean"
	}
	if req.Workers <= 0 {
		req.Workers = 5 // Default 5 parallel workers
	}
	if req.Workers > 100 {
		req.Workers = 100 // Max 100 workers
	}
	if req.DelayMs <= 0 {
		req.DelayMs = 3000 // Default 3000ms between requests per worker (~100 RPM with 5 workers)
	}

	langKey := getLanguageKey(req.Language)

	// Check if there's already a running job for this language
	h.mu.RLock()
	for _, job := range h.jobs {
		if job.Status == "running" && getLanguageKey(job.Language) == langKey {
			h.mu.RUnlock()
			c.JSON(http.StatusConflict, gin.H{
				"error": "A fill job is already running for this language",
				"jobId": job.JobID,
			})
			return
		}
	}
	h.mu.RUnlock()

	// Count total unfilled words
	var total int64
	h.db.Model(&model.Word{}).
		Where("language = ? AND (etymology IS NULL OR etymology = 'null'::jsonb OR etymology = '{}'::jsonb)", langKey).
		Count(&total)

	if total == 0 {
		c.JSON(http.StatusOK, gin.H{
			"message": "No unfilled words found for this language",
			"total":   0,
		})
		return
	}

	// Create job
	jobID := uuid.New().String()
	job := &FillJob{
		JobID:     jobID,
		Status:    "running",
		Language:  req.Language,
		Workers:   req.Workers,
		DelayMs:   req.DelayMs,
		Total:     int(total),
		Completed: 0,
		Failed:    0,
		Errors:    []JobError{},
		StartedAt: time.Now(),
	}

	// Create cancellation context
	ctx, cancel := context.WithCancel(context.Background())

	h.mu.Lock()
	h.jobs[jobID] = job
	h.cancelFns[jobID] = cancel
	h.mu.Unlock()

	// Start background workers
	go h.runFillJobParallel(ctx, job)

	c.JSON(http.StatusOK, gin.H{
		"jobId":   jobID,
		"status":  "started",
		"total":   total,
		"workers": req.Workers,
	})
}

// GetFillStatus returns the status of a fill job
func (h *FillHandler) GetFillStatus(c *gin.Context) {
	jobID := c.Param("jobId")

	h.mu.RLock()
	job, exists := h.jobs[jobID]
	h.mu.RUnlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "Job not found"})
		return
	}

	completed := atomic.LoadInt64(&job.Completed)
	failed := atomic.LoadInt64(&job.Failed)

	c.JSON(http.StatusOK, gin.H{
		"jobId":   job.JobID,
		"status":  job.Status,
		"workers": job.Workers,
		"progress": gin.H{
			"total":     job.Total,
			"completed": completed,
			"failed":    failed,
			"remaining": int64(job.Total) - completed - failed,
		},
		"startedAt": job.StartedAt,
		"errors":    job.Errors,
	})
}

// StopFill stops any running fill job
func (h *FillHandler) StopFill(c *gin.Context) {
	h.mu.Lock()
	defer h.mu.Unlock()

	stoppedCount := 0
	for jobID, job := range h.jobs {
		if job.Status == "running" {
			if cancel, exists := h.cancelFns[jobID]; exists {
				cancel()
				delete(h.cancelFns, jobID)
			}
			job.Status = "stopped"
			stoppedCount++
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message":      "Stop signal sent",
		"stoppedCount": stoppedCount,
	})
}

// ListJobs returns all jobs
func (h *FillHandler) ListJobs(c *gin.Context) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	jobs := make([]*FillJob, 0, len(h.jobs))
	for _, job := range h.jobs {
		jobs = append(jobs, job)
	}

	c.JSON(http.StatusOK, gin.H{"jobs": jobs})
}

// runFillJobParallel processes unfilled words using multiple workers
func (h *FillHandler) runFillJobParallel(ctx context.Context, job *FillJob) {
	langKey := getLanguageKey(job.Language)
	delay := time.Duration(job.DelayMs) * time.Millisecond

	log.Printf("[FillJob %s] Started with %d workers for language %s", job.JobID, job.Workers, job.Language)

	// Track words currently being processed to avoid duplicates
	processing := make(map[int64]bool)
	var processingMu sync.Mutex

	// Create a channel for words to process
	wordChan := make(chan model.Word, job.Workers*2)

	// Start worker goroutines
	var wg sync.WaitGroup
	for i := 0; i < job.Workers; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			h.worker(ctx, job, wordChan, workerID, delay, processing, &processingMu)
		}(i)
	}

	// Producer: fetch unfilled words and send to channel
	go func() {
		defer close(wordChan)
		for {
			select {
			case <-ctx.Done():
				return
			default:
				// Fetch a batch of unfilled words
				var words []model.Word
				result := h.db.Where("language = ? AND (etymology IS NULL OR etymology = 'null'::jsonb OR etymology = '{}'::jsonb)", langKey).
					Order("id ASC").
					Limit(job.Workers * 2).
					Find(&words)

				if result.Error != nil {
					log.Printf("[FillJob %s] Database error: %v", job.JobID, result.Error)
					return
				}

				if len(words) == 0 {
					// All words processed
					return
				}

				// Filter out words already being processed
				processingMu.Lock()
				var toProcess []model.Word
				for _, word := range words {
					if !processing[word.ID] {
						processing[word.ID] = true
						toProcess = append(toProcess, word)
					}
				}
				processingMu.Unlock()

				for _, word := range toProcess {
					select {
					case <-ctx.Done():
						return
					case wordChan <- word:
					}
				}

				// Wait longer if no new words to process (all in flight)
				if len(toProcess) == 0 {
					time.Sleep(500 * time.Millisecond)
				} else {
					time.Sleep(100 * time.Millisecond)
				}
			}
		}
	}()

	// Wait for all workers to finish
	wg.Wait()

	// Update job status
	h.mu.Lock()
	if job.Status == "running" {
		job.Status = "completed"
	}
	h.mu.Unlock()

	log.Printf("[FillJob %s] Finished - completed: %d, failed: %d", job.JobID, atomic.LoadInt64(&job.Completed), atomic.LoadInt64(&job.Failed))
}

// worker processes words from the channel
func (h *FillHandler) worker(ctx context.Context, job *FillJob, wordChan <-chan model.Word, workerID int, delay time.Duration, processing map[int64]bool, processingMu *sync.Mutex) {
	maxRetries := 3
	retryDelay := 30 * time.Second

	for {
		select {
		case <-ctx.Done():
			return
		case word, ok := <-wordChan:
			if !ok {
				return
			}

			// Double-check: skip if already filled (safety net for race conditions)
			var check model.Word
			h.db.Select("id", "etymology").Where("id = ?", word.ID).First(&check)
			if len(check.Etymology) > 0 && string(check.Etymology) != "null" && string(check.Etymology) != "{}" {
				// Already filled, remove from processing and skip
				processingMu.Lock()
				delete(processing, word.ID)
				processingMu.Unlock()
				continue
			}

			// Try to fetch etymology with retries
			var etymology map[string]interface{}
			var err error
			for retry := 0; retry < maxRetries; retry++ {
				etymology, err = h.llmClient.GetEtymologyWithLang(word.Word, job.Language)
				if err == nil {
					break
				}

				errMsg := err.Error()
				if strings.Contains(errMsg, "429") || strings.Contains(errMsg, "quota") || strings.Contains(errMsg, "RESOURCE_EXHAUSTED") {
					log.Printf("[Worker %d] Rate limited on %s, waiting %v before retry %d/%d",
						workerID, word.Word, retryDelay, retry+1, maxRetries)

					select {
					case <-ctx.Done():
						return
					case <-time.After(retryDelay):
						continue
					}
				} else {
					// Non-retryable error
					break
				}
			}

			if err != nil {
				log.Printf("[Worker %d] Error fetching etymology for %s: %v", workerID, word.Word, err)
				atomic.AddInt64(&job.Failed, 1)
				job.mu.Lock()
				if len(job.Errors) < 100 { // Limit error history
					job.Errors = append(job.Errors, JobError{Word: word.Word, Error: err.Error()})
				}
				job.mu.Unlock()
			} else {
				// Save etymology to database
				etymologyJSON, _ := json.Marshal(etymology)
				if err := h.db.Model(&word).Update("etymology", datatypes.JSON(etymologyJSON)).Error; err != nil {
					log.Printf("[Worker %d] Error saving %s: %v", workerID, word.Word, err)
					atomic.AddInt64(&job.Failed, 1)
				} else {
					atomic.AddInt64(&job.Completed, 1)
					completed := atomic.LoadInt64(&job.Completed)
					if completed%100 == 0 {
						log.Printf("[FillJob %s] Progress: %d/%d completed", job.JobID, completed, job.Total)
					}
				}
			}

			// Remove from processing set after completion
			processingMu.Lock()
			delete(processing, word.ID)
			processingMu.Unlock()

			// Delay before next request
			select {
			case <-ctx.Done():
				return
			case <-time.After(delay):
			}
		}
	}
}
