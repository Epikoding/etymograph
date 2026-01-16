package config

import "os"

type Config struct {
	DatabaseURL  string
	LLMProxyURL  string
	RateLimitURL string
	RedisURL     string
}

func Load() *Config {
	return &Config{
		DatabaseURL:  getEnv("DATABASE_URL", "postgres://etymograph:etymograph@postgres:5432/etymograph?sslmode=disable"),
		LLMProxyURL:  getEnv("LLM_PROXY_URL", "http://llm-proxy:8081"),
		RateLimitURL: getEnv("RATE_LIMIT_URL", "http://rate-limiter:8080"),
		RedisURL:     getEnv("REDIS_URL", "redis://redis:6379"),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
