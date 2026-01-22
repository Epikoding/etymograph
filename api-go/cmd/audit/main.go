package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode"

	"github.com/etymograph/api/internal/config"
	"github.com/etymograph/api/internal/model"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type Etymology struct {
	Definition struct {
		Brief    string `json:"brief"`
		Detailed string `json:"detailed"`
	} `json:"definition"`
	Origin struct {
		Language string `json:"language"`
		Root     string `json:"root"`
		Meaning  string `json:"meaning"`
		Components []struct {
			Part    string `json:"part"`
			Meaning string `json:"meaning"`
			Origin  string `json:"origin"`
		} `json:"components"`
	} `json:"origin"`
	Derivatives []struct {
		Word    string `json:"word"`
		Meaning string `json:"meaning"`
	} `json:"derivatives"`
}

type Issue struct {
	Word    string
	ID      int64
	Type    string
	Details string
}

func main() {
	workers := flag.Int("workers", 10, "Number of parallel workers")
	language := flag.String("language", "ko", "Language to audit")
	outputFile := flag.String("output", "audit_results.json", "Output file for results")
	flag.Parse()

	cfg := config.Load()
	db, err := gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// Get total count
	var total int64
	db.Model(&model.Word{}).
		Where("language = ? AND etymology IS NOT NULL AND etymology <> 'null'::jsonb AND etymology <> '{}'::jsonb", *language).
		Count(&total)

	fmt.Printf("Auditing %d words with %d workers...\n", total, *workers)

	// Create channel for words
	wordChan := make(chan model.Word, *workers*10)
	issueChan := make(chan Issue, 1000)

	var processed int64
	var issueCount int64
	var wg sync.WaitGroup

	// Start workers
	for i := 0; i < *workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for word := range wordChan {
				issues := auditWord(word)
				for _, issue := range issues {
					issueChan <- issue
					atomic.AddInt64(&issueCount, 1)
				}
				p := atomic.AddInt64(&processed, 1)
				if p%1000 == 0 {
					fmt.Printf("Progress: %d/%d (%.1f%%), Issues found: %d\n",
						p, total, float64(p)/float64(total)*100, atomic.LoadInt64(&issueCount))
				}
			}
		}()
	}

	// Collect issues
	var issues []Issue
	var issuesMu sync.Mutex
	done := make(chan bool)
	go func() {
		for issue := range issueChan {
			issuesMu.Lock()
			issues = append(issues, issue)
			issuesMu.Unlock()
		}
		done <- true
	}()

	// Fetch words in batches
	startTime := time.Now()
	batchSize := 500
	offset := 0
	for {
		var words []model.Word
		result := db.Where("language = ? AND etymology IS NOT NULL AND etymology <> 'null'::jsonb AND etymology <> '{}'::jsonb", *language).
			Order("id ASC").
			Offset(offset).
			Limit(batchSize).
			Find(&words)

		if result.Error != nil {
			log.Printf("Database error: %v", result.Error)
			break
		}

		if len(words) == 0 {
			break
		}

		for _, word := range words {
			wordChan <- word
		}
		offset += batchSize
	}

	close(wordChan)
	wg.Wait()
	close(issueChan)
	<-done

	elapsed := time.Since(startTime)
	fmt.Printf("\n=== Audit Complete ===\n")
	fmt.Printf("Total words: %d\n", total)
	fmt.Printf("Issues found: %d (%.2f%%)\n", len(issues), float64(len(issues))/float64(total)*100)
	fmt.Printf("Time elapsed: %v\n", elapsed)

	// Group issues by type
	issuesByType := make(map[string][]Issue)
	for _, issue := range issues {
		issuesByType[issue.Type] = append(issuesByType[issue.Type], issue)
	}

	fmt.Printf("\n=== Issues by Type ===\n")
	for typ, typeIssues := range issuesByType {
		fmt.Printf("%s: %d\n", typ, len(typeIssues))
	}

	// Save results
	output := map[string]interface{}{
		"summary": map[string]interface{}{
			"total":      total,
			"issues":     len(issues),
			"percentage": float64(len(issues)) / float64(total) * 100,
			"elapsed":    elapsed.String(),
		},
		"issuesByType": issuesByType,
		"issues":       issues,
	}

	jsonData, _ := json.MarshalIndent(output, "", "  ")
	if err := os.WriteFile(*outputFile, jsonData, 0644); err != nil {
		log.Printf("Failed to write output file: %v", err)
	} else {
		fmt.Printf("\nResults saved to %s\n", *outputFile)
	}
}

func auditWord(word model.Word) []Issue {
	var issues []Issue

	var etym Etymology
	if err := json.Unmarshal(word.Etymology, &etym); err != nil {
		issues = append(issues, Issue{
			Word:    word.Word,
			ID:      word.ID,
			Type:    "PARSE_ERROR",
			Details: fmt.Sprintf("Failed to parse etymology JSON: %v", err),
		})
		return issues
	}

	// Check 1: Circular definition (root equals word)
	if strings.EqualFold(etym.Origin.Root, word.Word) {
		issues = append(issues, Issue{
			Word:    word.Word,
			ID:      word.ID,
			Type:    "CIRCULAR_ROOT",
			Details: fmt.Sprintf("Root '%s' equals word", etym.Origin.Root),
		})
	}

	// Check 2: Brief definition in English (should be Korean for ko language)
	if etym.Definition.Brief != "" && isEnglishOnly(etym.Definition.Brief) {
		issues = append(issues, Issue{
			Word:    word.Word,
			ID:      word.ID,
			Type:    "ENGLISH_BRIEF",
			Details: fmt.Sprintf("Brief definition in English: '%s'", etym.Definition.Brief),
		})
	}

	// Check 3: Empty or missing brief definition
	if strings.TrimSpace(etym.Definition.Brief) == "" {
		issues = append(issues, Issue{
			Word:    word.Word,
			ID:      word.ID,
			Type:    "EMPTY_BRIEF",
			Details: "Brief definition is empty",
		})
	}

	// Check 4: Empty origin root
	if strings.TrimSpace(etym.Origin.Root) == "" {
		issues = append(issues, Issue{
			Word:    word.Word,
			ID:      word.ID,
			Type:    "EMPTY_ROOT",
			Details: "Origin root is empty",
		})
	}

	// Check 5: Components with empty parts
	for i, comp := range etym.Origin.Components {
		if strings.TrimSpace(comp.Part) == "" {
			issues = append(issues, Issue{
				Word:    word.Word,
				ID:      word.ID,
				Type:    "EMPTY_COMPONENT_PART",
				Details: fmt.Sprintf("Component %d has empty part", i),
			})
		}
		if strings.TrimSpace(comp.Meaning) == "" {
			issues = append(issues, Issue{
				Word:    word.Word,
				ID:      word.ID,
				Type:    "EMPTY_COMPONENT_MEANING",
				Details: fmt.Sprintf("Component %d has empty meaning", i),
			})
		}
	}

	// Check 6: Suspicious origin language
	suspiciousOrigins := []string{"English", "Modern English", "American English"}
	for _, suspicious := range suspiciousOrigins {
		if strings.EqualFold(etym.Origin.Language, suspicious) {
			// Only flag if the word looks like it could have older origins
			if !isLikelyModernWord(word.Word) {
				issues = append(issues, Issue{
					Word:    word.Word,
					ID:      word.ID,
					Type:    "SUSPICIOUS_ORIGIN",
					Details: fmt.Sprintf("Origin language '%s' may be incorrect for this word", etym.Origin.Language),
				})
			}
		}
	}

	// Check 7: Detailed definition in English only
	if etym.Definition.Detailed != "" && isEnglishOnly(etym.Definition.Detailed) {
		issues = append(issues, Issue{
			Word:    word.Word,
			ID:      word.ID,
			Type:    "ENGLISH_DETAILED",
			Details: fmt.Sprintf("Detailed definition in English: '%s'", truncate(etym.Definition.Detailed, 50)),
		})
	}

	// Check 8: Origin meaning in English only (should be Korean for ko)
	if etym.Origin.Meaning != "" && isEnglishOnly(etym.Origin.Meaning) {
		issues = append(issues, Issue{
			Word:    word.Word,
			ID:      word.ID,
			Type:    "ENGLISH_ORIGIN_MEANING",
			Details: fmt.Sprintf("Origin meaning in English: '%s'", etym.Origin.Meaning),
		})
	}

	// Check 9: Derivatives with English meaning
	for i, deriv := range etym.Derivatives {
		if deriv.Meaning != "" && isEnglishOnly(deriv.Meaning) {
			issues = append(issues, Issue{
				Word:    word.Word,
				ID:      word.ID,
				Type:    "ENGLISH_DERIVATIVE_MEANING",
				Details: fmt.Sprintf("Derivative %d '%s' has English meaning: '%s'", i, deriv.Word, deriv.Meaning),
			})
			break // Only report first instance
		}
	}

	// Check 10: Very short brief (likely incomplete)
	if len(etym.Definition.Brief) > 0 && len(etym.Definition.Brief) < 2 {
		issues = append(issues, Issue{
			Word:    word.Word,
			ID:      word.ID,
			Type:    "TOO_SHORT_BRIEF",
			Details: fmt.Sprintf("Brief too short: '%s'", etym.Definition.Brief),
		})
	}

	return issues
}

// isEnglishOnly checks if the text contains only English characters
func isEnglishOnly(text string) bool {
	text = strings.TrimSpace(text)
	if text == "" {
		return false
	}

	// Remove common punctuation and numbers
	cleaned := regexp.MustCompile(`[0-9\s\p{P}]+`).ReplaceAllString(text, "")
	if cleaned == "" {
		return false
	}

	for _, r := range cleaned {
		if !unicode.IsLetter(r) {
			continue
		}
		// Check if it's NOT a basic Latin letter (i.e., is Korean, Chinese, Japanese, etc.)
		if r > 127 {
			return false
		}
	}
	return true
}

// isLikelyModernWord checks if a word is likely modern (compound, tech term, etc.)
func isLikelyModernWord(word string) bool {
	modernPatterns := []string{
		"email", "internet", "web", "cyber", "digital", "online",
		"blog", "app", "software", "hardware", "computer",
	}
	wordLower := strings.ToLower(word)
	for _, pattern := range modernPatterns {
		if strings.Contains(wordLower, pattern) {
			return true
		}
	}
	return false
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
