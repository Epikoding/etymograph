package main

import (
	"log"
	"strconv"
	"time"

	"github.com/epikoding/etymograph/llm-proxy/internal/config"
	"github.com/epikoding/etymograph/llm-proxy/internal/handler"
	"github.com/epikoding/etymograph/llm-proxy/internal/llm"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Prometheus metrics
var (
	llmRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "llm_requests_total",
			Help: "Total number of LLM requests",
		},
		[]string{"endpoint", "status"},
	)

	llmRequestDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "llm_request_duration_seconds",
			Help:    "LLM request duration in seconds",
			Buckets: []float64{0.5, 1, 2, 5, 10, 20, 30, 60},
		},
		[]string{"endpoint"},
	)

	llmTokensUsed = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "llm_tokens_used_total",
			Help: "Total LLM tokens used (estimated)",
		},
		[]string{"type"},
	)
)

// metricsMiddleware collects Prometheus metrics for each request
func metricsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()

		c.Next()

		duration := time.Since(start).Seconds()
		status := strconv.Itoa(c.Writer.Status())
		endpoint := c.FullPath()
		if endpoint == "" {
			endpoint = "unknown"
		}

		llmRequestsTotal.WithLabelValues(endpoint, status).Inc()
		llmRequestDuration.WithLabelValues(endpoint).Observe(duration)
	}
}

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

	// Prometheus metrics middleware
	r.Use(metricsMiddleware())

	// Prometheus metrics endpoint
	r.GET("/metrics", gin.WrapH(promhttp.Handler()))

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
