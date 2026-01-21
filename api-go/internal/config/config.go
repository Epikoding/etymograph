package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	DatabaseURL        string
	LLMProxyURL        string
	RateLimitURL       string
	RedisURL           string
	SchedulerEnabled   bool
	SchedulerInterval  time.Duration
	JWTSecret          string
	GoogleClientID     string
	GoogleClientSecret string
	GoogleRedirectURL  string
	FrontendURL        string
}

func Load() *Config {
	return &Config{
		DatabaseURL:        getEnv("DATABASE_URL", "postgres://etymograph:etymograph@postgres:5432/etymograph?sslmode=disable"),
		LLMProxyURL:        getEnv("LLM_PROXY_URL", "http://llm-proxy:8081"),
		RateLimitURL:       getEnv("RATE_LIMIT_URL", "http://rate-limiter:8080"),
		RedisURL:           getEnv("REDIS_URL", "redis://redis:6379"),
		SchedulerEnabled:   getEnvBool("SCHEDULER_ENABLED", false),
		SchedulerInterval:  getEnvDuration("SCHEDULER_INTERVAL", 5*time.Second),
		JWTSecret:          getEnv("JWT_SECRET", "your-256-bit-secret-change-in-production"),
		GoogleClientID:     getEnv("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret: getEnv("GOOGLE_CLIENT_SECRET", ""),
		GoogleRedirectURL:  getEnv("GOOGLE_REDIRECT_URL", "http://localhost:4000/auth/google/callback"),
		FrontendURL:        getEnv("FRONTEND_URL", "http://localhost:3000"),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		b, err := strconv.ParseBool(value)
		if err == nil {
			return b
		}
	}
	return defaultValue
}

func getEnvDuration(key string, defaultValue time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		d, err := time.ParseDuration(value)
		if err == nil {
			return d
		}
	}
	return defaultValue
}
