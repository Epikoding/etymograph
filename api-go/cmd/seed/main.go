package main

import (
	"bufio"
	"flag"
	"log"
	"os"
	"strings"

	"github.com/etymograph/api/internal/config"
	"github.com/etymograph/api/internal/database"
	"gorm.io/gorm"
)

func main() {
	// Parse command line flags
	filePath := flag.String("file", "data/priority_words.txt", "Path to word list file")
	languagesStr := flag.String("languages", "ko,ja,zh", "Comma-separated list of languages")
	batchSize := flag.Int("batch", 1000, "Batch size for inserts")
	flag.Parse()

	languages := strings.Split(*languagesStr, ",")
	for i := range languages {
		languages[i] = strings.TrimSpace(languages[i])
	}

	log.Printf("Seeding words from %s for languages: %v", *filePath, languages)

	// Load configuration
	cfg := config.Load()

	// Connect to database
	db, err := database.Connect(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// Run migration
	if err := database.Migrate(db); err != nil {
		log.Fatalf("Failed to migrate database: %v", err)
	}

	// Load words from file
	words, err := loadWordList(*filePath)
	if err != nil {
		log.Fatalf("Failed to load word list: %v", err)
	}

	log.Printf("Loaded %d words from file", len(words))

	// Seed words for each language
	totalInserted := 0
	totalSkipped := 0

	for _, lang := range languages {
		log.Printf("Processing language: %s", lang)

		inserted, skipped := seedWordsForLanguage(db, words, lang, *batchSize)
		totalInserted += inserted
		totalSkipped += skipped

		log.Printf("Language %s: inserted=%d, skipped=%d", lang, inserted, skipped)
	}

	log.Printf("Seeding complete. Total inserted: %d, Total skipped: %d", totalInserted, totalSkipped)
}

func loadWordList(path string) ([]string, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var words []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		// Skip empty lines and comments
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		words = append(words, strings.ToLower(line))
	}

	return words, scanner.Err()
}

func seedWordsForLanguage(db *gorm.DB, words []string, language string, batchSize int) (inserted int, skipped int) {
	for i := 0; i < len(words); i += batchSize {
		end := i + batchSize
		if end > len(words) {
			end = len(words)
		}

		batch := words[i:end]
		batchInserted, batchSkipped := insertBatch(db, batch, language)
		inserted += batchInserted
		skipped += batchSkipped

		if (i/batchSize+1)%10 == 0 {
			log.Printf("Progress: %d/%d words processed", end, len(words))
		}
	}

	return inserted, skipped
}

func insertBatch(db *gorm.DB, words []string, language string) (inserted int, skipped int) {
	for _, word := range words {
		result := db.Exec(`
			INSERT INTO words (word, language, created_at, updated_at)
			VALUES (?, ?, NOW(), NOW())
			ON CONFLICT (word, language) DO NOTHING
		`, word, language)

		if result.Error != nil {
			log.Printf("Error inserting word %s: %v", word, result.Error)
			skipped++
			continue
		}

		if result.RowsAffected > 0 {
			inserted++
		} else {
			skipped++
		}
	}

	return inserted, skipped
}
