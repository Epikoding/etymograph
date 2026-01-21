package main

import (
	"bufio"
	"context"
	"log"
	"os"
	"strings"

	"github.com/etymograph/api/internal/cache"
	"github.com/etymograph/api/internal/client"
	"github.com/etymograph/api/internal/config"
	"github.com/etymograph/api/internal/database"
	"github.com/etymograph/api/internal/handler"
	"github.com/etymograph/api/internal/scheduler"
	"github.com/etymograph/api/internal/validator"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()

	// Initialize database
	db, err := database.Connect(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// Auto migrate
	if err := database.Migrate(db); err != nil {
		log.Fatalf("Failed to migrate database: %v", err)
	}

	// Initialize Redis cache
	var redisCache *cache.RedisCache
	redisCache, err = cache.NewRedisCache(cfg.RedisURL)
	if err != nil {
		log.Printf("Warning: Failed to connect to Redis: %v", err)
		// Continue without Redis cache (fail-open)
	}

	// Load words.txt and priority_words.txt into Redis for autocomplete
	if redisCache != nil {
		go loadWordsToRedis(redisCache, "data/words.txt")
		go loadPriorityWordsToRedis(redisCache, "data/priority_words.txt")
	}

	// Initialize word validator
	wordValidator, err := validator.NewWordValidator("data/words.txt")
	if err != nil {
		log.Printf("Warning: Failed to load word validator: %v", err)
		// Continue without validator (fail-open)
	}

	// Initialize handlers
	wordHandler := handler.NewWordHandler(db, redisCache, cfg, wordValidator)
	sessionHandler := handler.NewSessionHandler(db)
	exportHandler := handler.NewExportHandler(db)

	// Initialize and start background scheduler if enabled
	var etymologyScheduler *scheduler.EtymologyScheduler
	if cfg.SchedulerEnabled {
		llmClient := client.NewLLMClient(cfg.LLMProxyURL)
		var err error
		etymologyScheduler, err = scheduler.NewEtymologyScheduler(db, llmClient, scheduler.SchedulerConfig{
			WordListPath: "data/priority_words.txt",
			Interval:     cfg.SchedulerInterval,
			Languages:    []string{"Korean", "Japanese", "Chinese"},
		})
		if err != nil {
			log.Printf("Warning: Failed to initialize scheduler: %v", err)
		} else {
			ctx := context.Background()
			go etymologyScheduler.Start(ctx)
			log.Println("Background etymology scheduler started")
		}
	}

	// Setup router
	r := gin.Default()

	// CORS middleware
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// Scheduler status
	r.GET("/scheduler/status", func(c *gin.Context) {
		if etymologyScheduler != nil {
			c.JSON(200, etymologyScheduler.GetStatus())
		} else {
			c.JSON(200, gin.H{"enabled": false, "message": "Scheduler is disabled"})
		}
	})

	// API routes
	api := r.Group("/api")
	{
		// Words
		api.GET("/words/suggest", wordHandler.Suggest)
		api.POST("/words/search", wordHandler.Search)
		api.GET("/words/:word/etymology", wordHandler.GetEtymology)
		api.GET("/words/:word/derivatives", wordHandler.GetDerivatives)
		api.GET("/words/:word/synonyms", wordHandler.GetSynonyms)
		api.POST("/words/:word/refresh", wordHandler.RefreshEtymology)
		api.POST("/words/:word/apply", wordHandler.ApplyEtymology)
		api.POST("/words/:word/revert", wordHandler.RevertEtymology)

		// Sessions
		api.POST("/sessions", sessionHandler.Create)
		api.GET("/sessions/:id", sessionHandler.Get)
		api.POST("/sessions/:id/words", sessionHandler.AddWord)
		api.DELETE("/sessions/:id/words/:wordId", sessionHandler.RemoveWord)

		// Export
		api.GET("/export/:sessionId", exportHandler.Export)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "4000"
	}

	log.Printf("API server starting on port %s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

// loadWordsToRedis loads words from a file into Redis for autocomplete
func loadWordsToRedis(redisCache *cache.RedisCache, wordListPath string) {
	ctx := context.Background()

	// Check if autocomplete data already exists
	count, err := redisCache.GetAutocompleteCount(ctx)
	if err == nil && count > 0 {
		log.Printf("Autocomplete already populated with %d words, skipping load", count)
		return
	}

	file, err := os.Open(wordListPath)
	if err != nil {
		log.Printf("Warning: Failed to open word list for autocomplete: %v", err)
		return
	}
	defer file.Close()

	var words []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		word := strings.ToLower(strings.TrimSpace(scanner.Text()))
		if word != "" {
			words = append(words, word)
		}
	}

	if err := scanner.Err(); err != nil {
		log.Printf("Warning: Error reading word list: %v", err)
		return
	}

	// Batch insert words in chunks to avoid memory issues
	const batchSize = 1000
	for i := 0; i < len(words); i += batchSize {
		end := i + batchSize
		if end > len(words) {
			end = len(words)
		}
		if err := redisCache.AddWordsToAutocomplete(ctx, words[i:end]); err != nil {
			log.Printf("Warning: Failed to add words to Redis autocomplete: %v", err)
			return
		}
	}

	log.Printf("Loaded %d words to Redis autocomplete", len(words))
}

// loadPriorityWordsToRedis loads priority words from a file into Redis for autocomplete
func loadPriorityWordsToRedis(redisCache *cache.RedisCache, wordListPath string) {
	ctx := context.Background()

	// Check if priority autocomplete data already exists
	count, err := redisCache.GetPriorityAutocompleteCount(ctx)
	if err == nil && count > 0 {
		log.Printf("Priority autocomplete already populated with %d words, skipping load", count)
		return
	}

	file, err := os.Open(wordListPath)
	if err != nil {
		log.Printf("Warning: Failed to open priority word list for autocomplete: %v", err)
		return
	}
	defer file.Close()

	var words []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		word := strings.ToLower(strings.TrimSpace(scanner.Text()))
		if word != "" {
			words = append(words, word)
		}
	}

	if err := scanner.Err(); err != nil {
		log.Printf("Warning: Error reading priority word list: %v", err)
		return
	}

	// Batch insert words in chunks to avoid memory issues
	const batchSize = 1000
	for i := 0; i < len(words); i += batchSize {
		end := i + batchSize
		if end > len(words) {
			end = len(words)
		}
		if err := redisCache.AddPriorityWordsToAutocomplete(ctx, words[i:end]); err != nil {
			log.Printf("Warning: Failed to add words to Redis priority autocomplete: %v", err)
			return
		}
	}

	log.Printf("Loaded %d words to Redis priority autocomplete", len(words))
}
