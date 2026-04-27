package config

import (
	"os"
)

type Config struct {
	Port         string
	LLMProvider  string // "ollama" or "gemini"
	OllamaURL    string
	OllamaModel  string
	GeminiAPIKey string
	GeminiModel  string
}

func Load() *Config {
	return &Config{
		Port:         getEnv("PORT", "8081"),
		LLMProvider:  getEnv("LLM_PROVIDER", "gemini"),
		OllamaURL:    getEnv("OLLAMA_URL", "http://localhost:11434"),
		OllamaModel:  getEnv("OLLAMA_MODEL", "qwen3:8b"),
		GeminiAPIKey: getEnv("GEMINI_API_KEY", ""),
		GeminiModel:  getEnv("GEMINI_MODEL", "gemini-2.0-flash"),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
