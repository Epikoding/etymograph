package cache

import (
	"context"
	"log"
	"strings"

	"github.com/redis/go-redis/v9"
)

type RedisCache struct {
	client *redis.Client
}

func NewRedisCache(redisURL string) (*RedisCache, error) {
	// Parse redis URL (redis://host:port or redis://host:port/db)
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, err
	}

	client := redis.NewClient(opts)

	// Test connection
	ctx := context.Background()
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, err
	}

	log.Printf("Connected to Redis at %s", redisURL)
	return &RedisCache{client: client}, nil
}

func (c *RedisCache) Get(ctx context.Context, key string) ([]byte, error) {
	return c.client.Get(ctx, key).Bytes()
}

func (c *RedisCache) Set(ctx context.Context, key string, value []byte) error {
	return c.client.Set(ctx, key, value, 0).Err() // TTL 0 = no expiration
}

func (c *RedisCache) Delete(ctx context.Context, key string) error {
	return c.client.Del(ctx, key).Err()
}

func (c *RedisCache) Close() error {
	return c.client.Close()
}

// CacheKey generates a cache key from word and language
// Format: "word:language" (e.g., "teacher:ko")
func CacheKey(word, language string) string {
	return strings.ToLower(word) + ":" + strings.ToLower(language)
}

// AutocompleteKey is the Redis Sorted Set key for autocomplete words
const AutocompleteKey = "autocomplete:words"

// AddWordToAutocomplete adds a word to the autocomplete sorted set
func (c *RedisCache) AddWordToAutocomplete(ctx context.Context, word string) error {
	return c.client.ZAdd(ctx, AutocompleteKey, redis.Z{Score: 0, Member: strings.ToLower(word)}).Err()
}

// AddWordsToAutocomplete adds multiple words to the autocomplete sorted set in batch
func (c *RedisCache) AddWordsToAutocomplete(ctx context.Context, words []string) error {
	if len(words) == 0 {
		return nil
	}

	members := make([]redis.Z, len(words))
	for i, word := range words {
		members[i] = redis.Z{Score: 0, Member: strings.ToLower(word)}
	}

	return c.client.ZAdd(ctx, AutocompleteKey, members...).Err()
}

// GetSuggestions returns words matching the given prefix using lexicographic range
func (c *RedisCache) GetSuggestions(ctx context.Context, prefix string, limit int) ([]string, error) {
	prefix = strings.ToLower(prefix)
	return c.client.ZRangeByLex(ctx, AutocompleteKey, &redis.ZRangeBy{
		Min:    "[" + prefix,
		Max:    "[" + prefix + "\xff",
		Offset: 0,
		Count:  int64(limit),
	}).Result()
}

// GetAutocompleteCount returns the number of words in the autocomplete set
func (c *RedisCache) GetAutocompleteCount(ctx context.Context) (int64, error) {
	return c.client.ZCard(ctx, AutocompleteKey).Result()
}
