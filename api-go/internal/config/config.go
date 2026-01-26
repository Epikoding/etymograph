package config

import (
	"os"
	"strings"
)

type Config struct {
	DatabaseURL        string
	LLMProxyURL        string
	RateLimitURL       string
	RedisURL           string
	JWTSecret          string
	GoogleClientID     string
	GoogleClientSecret string
	GoogleRedirectURL  string
	FrontendURL        string
	AdminEmails        []string
}

func Load() *Config {
	return &Config{
		DatabaseURL:        getEnv("DATABASE_URL", "postgres://etymograph:etymograph@postgres:5432/etymograph?sslmode=disable"),
		LLMProxyURL:        getEnv("LLM_PROXY_URL", "http://llm-proxy:8081"),
		RateLimitURL:       getEnv("RATE_LIMIT_URL", "http://rate-limiter:8080"),
		RedisURL:           getEnv("REDIS_URL", "redis://redis:6379"),
		JWTSecret:          getEnv("JWT_SECRET", "your-256-bit-secret-change-in-production"),
		GoogleClientID:     getEnv("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret: getEnv("GOOGLE_CLIENT_SECRET", ""),
		GoogleRedirectURL:  getEnv("GOOGLE_REDIRECT_URL", "http://localhost:4000/api/auth/google/callback"),
		FrontendURL:        getEnv("FRONTEND_URL", "http://localhost:3000"),
		AdminEmails:        parseAdminEmails(getEnv("ADMIN_EMAILS", "")),
	}
}

func parseAdminEmails(emails string) []string {
	if emails == "" {
		return []string{}
	}
	var result []string
	for _, email := range strings.Split(emails, ",") {
		email = strings.TrimSpace(email)
		if email != "" {
			result = append(result, email)
		}
	}
	return result
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
