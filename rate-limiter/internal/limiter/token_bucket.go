package limiter

import (
	"context"
	"fmt"
	"time"

	"github.com/epikoding/etymograph/rate-limiter/internal/storage"
)

type ActionConfig struct {
	Limit  int64
	Window time.Duration
}

var DefaultLimits = map[string]ActionConfig{
	"search":     {Limit: 50, Window: time.Minute},
	"etymology":  {Limit: 30, Window: time.Minute},
	"derivatives": {Limit: 30, Window: time.Minute},
	"synonyms":   {Limit: 30, Window: time.Minute},
	"export":     {Limit: 10, Window: time.Minute},
}

type Limiter struct {
	storage *storage.RedisStorage
}

type CheckResult struct {
	Allowed   bool  `json:"allowed"`
	Remaining int64 `json:"remaining"`
	ResetAt   int64 `json:"reset_at"`
	Limit     int64 `json:"limit"`
}

func NewLimiter(storage *storage.RedisStorage) *Limiter {
	return &Limiter{storage: storage}
}

func (l *Limiter) Check(ctx context.Context, clientID, action string) (*CheckResult, error) {
	config, ok := DefaultLimits[action]
	if !ok {
		// Default limit for unknown actions
		config = ActionConfig{Limit: 100, Window: time.Minute}
	}

	key := fmt.Sprintf("rate:%s:%s", clientID, action)

	count, err := l.storage.Incr(ctx, key, config.Window)
	if err != nil {
		return nil, fmt.Errorf("failed to increment counter: %w", err)
	}

	ttl, err := l.storage.TTL(ctx, key)
	if err != nil {
		return nil, fmt.Errorf("failed to get TTL: %w", err)
	}

	resetAt := time.Now().Add(ttl).Unix()
	remaining := config.Limit - count
	if remaining < 0 {
		remaining = 0
	}

	return &CheckResult{
		Allowed:   count <= config.Limit,
		Remaining: remaining,
		ResetAt:   resetAt,
		Limit:     config.Limit,
	}, nil
}
