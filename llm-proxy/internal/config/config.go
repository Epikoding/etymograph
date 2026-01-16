package config

import (
	"os"
)

type Config struct {
	Port      string
	OllamaURL string
	Model     string
}

func Load() *Config {
	return &Config{
		Port:      getEnv("PORT", "8081"),
		OllamaURL: getEnv("OLLAMA_URL", "http://localhost:11434"),
		Model:     getEnv("OLLAMA_MODEL", "qwen3:8b"),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
