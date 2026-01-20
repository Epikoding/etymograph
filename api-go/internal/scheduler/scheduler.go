package scheduler

import (
	"bufio"
	"context"
	"encoding/json"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/etymograph/api/internal/client"
	"github.com/etymograph/api/internal/model"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type EtymologyScheduler struct {
	db            *gorm.DB
	llmClient     *client.LLMClient
	words         []string
	currentIndex  int
	interval      time.Duration
	languages     []string
	running       bool
	mu            sync.Mutex
	stopChan      chan struct{}
}

type SchedulerConfig struct {
	WordListPath string
	Interval     time.Duration
	Languages    []string
}

func NewEtymologyScheduler(db *gorm.DB, llmClient *client.LLMClient, cfg SchedulerConfig) (*EtymologyScheduler, error) {
	words, err := loadWordList(cfg.WordListPath)
	if err != nil {
		return nil, err
	}

	if cfg.Interval == 0 {
		cfg.Interval = 5 * time.Second
	}

	if len(cfg.Languages) == 0 {
		cfg.Languages = []string{"Korean", "Japanese", "Chinese"}
	}

	log.Printf("[Scheduler] Loaded %d priority words", len(words))

	return &EtymologyScheduler{
		db:           db,
		llmClient:    llmClient,
		words:        words,
		currentIndex: 0,
		interval:     cfg.Interval,
		languages:    cfg.Languages,
		stopChan:     make(chan struct{}),
	}, nil
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

func (s *EtymologyScheduler) Start(ctx context.Context) {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return
	}
	s.running = true
	s.mu.Unlock()

	log.Printf("[Scheduler] Starting with interval %v", s.interval)

	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("[Scheduler] Context cancelled, stopping")
			return
		case <-s.stopChan:
			log.Println("[Scheduler] Stop signal received")
			return
		case <-ticker.C:
			s.processNextWord()
		}
	}
}

func (s *EtymologyScheduler) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.running {
		close(s.stopChan)
		s.running = false
		log.Println("[Scheduler] Stopped")
	}
}

func (s *EtymologyScheduler) processNextWord() {
	s.mu.Lock()
	if s.currentIndex >= len(s.words) {
		// All words processed, restart from beginning
		s.currentIndex = 0
		log.Println("[Scheduler] Completed all words, restarting cycle")
	}
	word := s.words[s.currentIndex]
	s.currentIndex++
	s.mu.Unlock()

	// Process word for each language
	for _, language := range s.languages {
		langKey := getLangKey(language)

		// Check if already exists in DB
		var existing model.Word
		result := s.db.Where("word = ? AND language = ?", word, langKey).First(&existing)

		if result.Error == nil && len(existing.Etymology) > 0 {
			// Already cached
			continue
		}

		// Fetch from LLM
		log.Printf("[Scheduler] Fetching: %s (%s)", word, langKey)

		etymology, err := s.llmClient.GetEtymologyWithLang(word, language)
		if err != nil {
			log.Printf("[Scheduler] Error fetching %s: %v", word, err)
			continue
		}

		etymologyJSON, _ := json.Marshal(etymology)

		if result.Error == nil {
			// Update existing record
			s.db.Model(&existing).Update("etymology", datatypes.JSON(etymologyJSON))
		} else {
			// Create new record
			newWord := model.Word{
				Word:      word,
				Language:  langKey,
				Etymology: datatypes.JSON(etymologyJSON),
			}
			if err := s.db.Create(&newWord).Error; err != nil {
				log.Printf("[Scheduler] Error saving %s: %v", word, err)
			}
		}

		log.Printf("[Scheduler] Saved: %s (%s)", word, langKey)

		// Small delay between languages to avoid rate limiting
		time.Sleep(500 * time.Millisecond)
	}
}

func getLangKey(language string) string {
	switch strings.ToLower(language) {
	case "korean":
		return "ko"
	case "japanese":
		return "ja"
	case "chinese":
		return "zh"
	default:
		return strings.ToLower(language[:2])
	}
}

// GetStatus returns current scheduler status
func (s *EtymologyScheduler) GetStatus() map[string]interface{} {
	s.mu.Lock()
	defer s.mu.Unlock()

	return map[string]interface{}{
		"running":       s.running,
		"totalWords":    len(s.words),
		"currentIndex":  s.currentIndex,
		"progress":      float64(s.currentIndex) / float64(len(s.words)) * 100,
		"interval":      s.interval.String(),
		"languages":     s.languages,
	}
}
