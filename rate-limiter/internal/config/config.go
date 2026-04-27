package config

import (
	"os"
)

type Config struct {
	Port     string
	RedisURL string
}

func Load() *Config {
	return &Config{
		Port:     getEnv("PORT", "8080"),
		RedisURL: getEnv("REDIS_URL", "redis://localhost:6379"),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
