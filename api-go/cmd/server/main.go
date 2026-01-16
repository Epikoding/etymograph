package main

import (
	"log"
	"os"

	"github.com/etymograph/api/internal/config"
	"github.com/etymograph/api/internal/database"
	"github.com/etymograph/api/internal/handler"
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

	// Initialize handlers
	wordHandler := handler.NewWordHandler(db, cfg)
	sessionHandler := handler.NewSessionHandler(db)
	exportHandler := handler.NewExportHandler(db)

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

	// API routes
	api := r.Group("/api")
	{
		// Words
		api.POST("/words/search", wordHandler.Search)
		api.GET("/words/:word/etymology", wordHandler.GetEtymology)
		api.GET("/words/:word/derivatives", wordHandler.GetDerivatives)
		api.GET("/words/:word/synonyms", wordHandler.GetSynonyms)

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
