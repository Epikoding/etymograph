package main

import (
	"log"

	"github.com/epikoding/etymograph/rate-limiter/internal/config"
	"github.com/epikoding/etymograph/rate-limiter/internal/handler"
	"github.com/epikoding/etymograph/rate-limiter/internal/limiter"
	"github.com/epikoding/etymograph/rate-limiter/internal/storage"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	// Load .env file if exists
	_ = godotenv.Load()

	cfg := config.Load()

	// Initialize Redis storage
	redisStorage, err := storage.NewRedisStorage(cfg.RedisURL)
	if err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	defer redisStorage.Close()

	// Initialize limiter
	rateLimiter := limiter.NewLimiter(redisStorage)

	// Initialize handler
	checkHandler := handler.NewCheckHandler(rateLimiter)

	// Setup router
	r := gin.Default()

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// API routes
	r.POST("/check", checkHandler.Check)
	r.GET("/limits", checkHandler.GetLimits)

	log.Printf("Rate Limiter starting on port %s", cfg.Port)
	log.Printf("Redis URL: %s", cfg.RedisURL)

	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatal(err)
	}
}
