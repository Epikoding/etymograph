package cache

import (
	"context"
	"log"
	"strconv"
	"strings"
	"time"

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

// AutocompletePriorityKey is the Redis Sorted Set key for priority autocomplete words
const AutocompletePriorityKey = "autocomplete:priority"

// AddPriorityWordsToAutocomplete adds multiple words to the priority autocomplete sorted set in batch
func (c *RedisCache) AddPriorityWordsToAutocomplete(ctx context.Context, words []string) error {
	if len(words) == 0 {
		return nil
	}

	members := make([]redis.Z, len(words))
	for i, word := range words {
		members[i] = redis.Z{Score: 0, Member: strings.ToLower(word)}
	}

	return c.client.ZAdd(ctx, AutocompletePriorityKey, members...).Err()
}

// GetPrioritySuggestions returns priority words matching the given prefix using lexicographic range
func (c *RedisCache) GetPrioritySuggestions(ctx context.Context, prefix string, limit int) ([]string, error) {
	prefix = strings.ToLower(prefix)
	return c.client.ZRangeByLex(ctx, AutocompletePriorityKey, &redis.ZRangeBy{
		Min:    "[" + prefix,
		Max:    "[" + prefix + "\xff",
		Offset: 0,
		Count:  int64(limit),
	}).Result()
}

// GetPriorityAutocompleteCount returns the number of words in the priority autocomplete set
func (c *RedisCache) GetPriorityAutocompleteCount(ctx context.Context) (int64, error) {
	return c.client.ZCard(ctx, AutocompletePriorityKey).Result()
}

// =============================================================================
// History Buffer Methods (ZSET + SET based)
// =============================================================================

// HistoryActiveUsersKey is the Redis SET key for tracking users with pending history
const HistoryActiveUsersKey = "history:active"

// HistoryKey generates a Redis key for a user's history ZSET
// Format: "history:{userId}"
func HistoryKey(userID int64) string {
	return "history:" + strconv.FormatInt(userID, 10)
}

// HistoryMember generates a member string for the history ZSET
// Format: "{word}:{language}"
func HistoryMember(word, language string) string {
	return strings.ToLower(word) + ":" + strings.ToLower(language)
}

// ParseHistoryMember parses a history member string back to word and language
func ParseHistoryMember(member string) (word, language string) {
	parts := strings.SplitN(member, ":", 2)
	if len(parts) == 2 {
		return parts[0], parts[1]
	}
	return member, ""
}

// AddToHistory adds a word to the user's history ZSET with timestamp as score
// Also adds the user to the active users SET
func (c *RedisCache) AddToHistory(ctx context.Context, userID int64, word, language string) error {
	key := HistoryKey(userID)
	member := HistoryMember(word, language)
	score := float64(time.Now().Unix())

	// Use pipeline for atomicity
	pipe := c.client.Pipeline()
	pipe.ZAdd(ctx, key, redis.Z{Score: score, Member: member})
	pipe.SAdd(ctx, HistoryActiveUsersKey, userID)
	_, err := pipe.Exec(ctx)
	return err
}

// GetActiveUsers returns all user IDs with pending history in Redis
func (c *RedisCache) GetActiveUsers(ctx context.Context) ([]int64, error) {
	members, err := c.client.SMembers(ctx, HistoryActiveUsersKey).Result()
	if err != nil {
		return nil, err
	}

	userIDs := make([]int64, 0, len(members))
	for _, m := range members {
		id, err := strconv.ParseInt(m, 10, 64)
		if err == nil {
			userIDs = append(userIDs, id)
		}
	}
	return userIDs, nil
}

// HistoryEntry represents a single history entry from Redis
type HistoryEntry struct {
	Word       string
	Language   string
	SearchedAt time.Time
}

// GetHistoryRange returns history entries within the given time range (inclusive)
// If maxTime is 0, returns all entries up to now
func (c *RedisCache) GetHistoryRange(ctx context.Context, userID int64, minTime, maxTime int64) ([]HistoryEntry, error) {
	key := HistoryKey(userID)

	if maxTime == 0 {
		maxTime = time.Now().Unix()
	}

	results, err := c.client.ZRangeByScoreWithScores(ctx, key, &redis.ZRangeBy{
		Min: strconv.FormatInt(minTime, 10),
		Max: strconv.FormatInt(maxTime, 10),
	}).Result()
	if err != nil {
		return nil, err
	}

	entries := make([]HistoryEntry, 0, len(results))
	for _, z := range results {
		word, lang := ParseHistoryMember(z.Member.(string))
		entries = append(entries, HistoryEntry{
			Word:       word,
			Language:   lang,
			SearchedAt: time.Unix(int64(z.Score), 0),
		})
	}
	return entries, nil
}

// GetAllHistory returns all history entries for a user
func (c *RedisCache) GetAllHistory(ctx context.Context, userID int64) ([]HistoryEntry, error) {
	return c.GetHistoryRange(ctx, userID, 0, 0)
}

// RemoveHistoryRange removes history entries within the given time range
func (c *RedisCache) RemoveHistoryRange(ctx context.Context, userID int64, minTime, maxTime int64) (int64, error) {
	key := HistoryKey(userID)
	return c.client.ZRemRangeByScore(ctx, key,
		strconv.FormatInt(minTime, 10),
		strconv.FormatInt(maxTime, 10),
	).Result()
}

// GetHistoryCount returns the number of entries in a user's history
func (c *RedisCache) GetHistoryCount(ctx context.Context, userID int64) (int64, error) {
	return c.client.ZCard(ctx, HistoryKey(userID)).Result()
}

// RemoveActiveUser removes a user from the active users SET
func (c *RedisCache) RemoveActiveUser(ctx context.Context, userID int64) error {
	return c.client.SRem(ctx, HistoryActiveUsersKey, userID).Err()
}

// ClearUserHistory removes all history for a user and removes them from active users
func (c *RedisCache) ClearUserHistory(ctx context.Context, userID int64) error {
	pipe := c.client.Pipeline()
	pipe.Del(ctx, HistoryKey(userID))
	pipe.SRem(ctx, HistoryActiveUsersKey, userID)
	_, err := pipe.Exec(ctx)
	return err
}
