package storage

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

type RedisStorage struct {
	client *redis.Client
}

func NewRedisStorage(redisURL string) (*RedisStorage, error) {
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse redis URL: %w", err)
	}

	client := redis.NewClient(opt)

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to redis: %w", err)
	}

	return &RedisStorage{client: client}, nil
}

func (s *RedisStorage) Incr(ctx context.Context, key string, ttl time.Duration) (int64, error) {
	pipe := s.client.Pipeline()

	incr := pipe.Incr(ctx, key)
	pipe.Expire(ctx, key, ttl)

	_, err := pipe.Exec(ctx)
	if err != nil {
		return 0, err
	}

	return incr.Val(), nil
}

func (s *RedisStorage) Get(ctx context.Context, key string) (int64, error) {
	val, err := s.client.Get(ctx, key).Int64()
	if err == redis.Nil {
		return 0, nil
	}
	return val, err
}

func (s *RedisStorage) TTL(ctx context.Context, key string) (time.Duration, error) {
	return s.client.TTL(ctx, key).Result()
}

func (s *RedisStorage) Close() error {
	return s.client.Close()
}
