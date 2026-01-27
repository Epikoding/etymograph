package main

import (
	"context"
	"flag"
	"log"
	"time"

	"github.com/etymograph/api/internal/cache"
	"github.com/etymograph/api/internal/config"
	"github.com/etymograph/api/internal/database"
	"github.com/etymograph/api/internal/handler"
)

func main() {
	// Parse command line flags
	dryRun := flag.Bool("dry-run", false, "Show what would be flushed without actually flushing")
	flag.Parse()

	startTime := time.Now()
	log.Println("Starting history flush job...")

	// Load configuration
	cfg := config.Load()

	// Connect to database
	db, err := database.Connect(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// Run migration to ensure tables exist
	if err := database.Migrate(db); err != nil {
		log.Fatalf("Failed to migrate database: %v", err)
	}

	// Connect to Redis
	redisCache, err := cache.NewRedisCache(cfg.RedisURL)
	if err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	defer redisCache.Close()

	ctx := context.Background()

	// Get active users count
	activeUsers, err := redisCache.GetActiveUsers(ctx)
	if err != nil {
		log.Fatalf("Failed to get active users: %v", err)
	}

	log.Printf("Found %d active users with pending history", len(activeUsers))

	if *dryRun {
		log.Println("[DRY RUN] Showing what would be flushed:")
		for _, userID := range activeUsers {
			entries, err := redisCache.GetAllHistory(ctx, userID)
			if err != nil {
				log.Printf("  User %d: error getting history: %v", userID, err)
				continue
			}
			log.Printf("  User %d: %d entries", userID, len(entries))
		}
		log.Println("[DRY RUN] No changes made")
		return
	}

	// Create history handler for flush operation
	historyHandler := handler.NewHistoryHandler(db, redisCache)

	// Flush all users
	flushedCount, err := historyHandler.FlushAllUsers(ctx)
	if err != nil {
		log.Fatalf("Failed to flush history: %v", err)
	}

	elapsed := time.Since(startTime)
	log.Printf("History flush complete. Flushed %d users in %v", flushedCount, elapsed)
}
