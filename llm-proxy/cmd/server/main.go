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

	// Initialize LLM client based on provider
	var client llm.LLMClient
	switch cfg.LLMProvider {
	case "gemini":
		if cfg.GeminiAPIKey == "" {
			log.Fatal("GEMINI_API_KEY is required when using gemini provider")
		}
		client = llm.NewGeminiClient(cfg.GeminiAPIKey, cfg.GeminiModel)
		log.Printf("Using Gemini API with model: %s", cfg.GeminiModel)
	case "ollama":
		client = llm.NewOllamaClient(cfg.OllamaURL, cfg.OllamaModel)
		log.Printf("Using Ollama at %s with model: %s", cfg.OllamaURL, cfg.OllamaModel)
	default:
		log.Fatalf("Unknown LLM provider: %s (supported: gemini, ollama)", cfg.LLMProvider)
	}

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

	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatal(err)
	}
}
