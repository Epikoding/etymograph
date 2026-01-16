package main

import (
	"log"

	"github.com/epikoding/etymograph/llm-proxy/internal/config"
	"github.com/epikoding/etymograph/llm-proxy/internal/handler"
	"github.com/epikoding/etymograph/llm-proxy/internal/llm"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	// Load .env file if exists
	_ = godotenv.Load()

	cfg := config.Load()

	// Initialize LLM client
	client := llm.NewClient(cfg.OllamaURL, cfg.Model)

	// Initialize handlers
	etymologyHandler := handler.NewEtymologyHandler(client)
	derivativesHandler := handler.NewDerivativesHandler(client)
	synonymsHandler := handler.NewSynonymsHandler(client)

	// Setup router
	r := gin.Default()

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// API routes
	api := r.Group("/api")
	{
		api.POST("/etymology", etymologyHandler.Analyze)
		api.POST("/derivatives", derivativesHandler.Find)
		api.POST("/synonyms", synonymsHandler.Compare)
	}

	log.Printf("LLM Proxy starting on port %s", cfg.Port)
	log.Printf("Ollama URL: %s", cfg.OllamaURL)
	log.Printf("Model: %s", cfg.Model)

	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatal(err)
	}
}
