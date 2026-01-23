package validator

import (
	"bufio"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

type WordValidator struct {
	localWords map[string]struct{}
	suffixes   map[string]struct{}
	prefixes   map[string]struct{}
	httpClient *http.Client
	mu         sync.RWMutex
}

func NewWordValidator(wordListPath string) (*WordValidator, error) {
	v := &WordValidator{
		localWords: make(map[string]struct{}),
		suffixes:   make(map[string]struct{}),
		prefixes:   make(map[string]struct{}),
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
	}

	if err := v.loadWordList(wordListPath); err != nil {
		return nil, fmt.Errorf("failed to load word list: %w", err)
	}

	// Load suffixes and prefixes from the same directory
	dir := strings.TrimSuffix(wordListPath, "words.txt")
	if err := v.loadAffixList(dir+"suffixes.txt", v.suffixes, "suffixes"); err != nil {
		log.Printf("Warning: failed to load suffixes: %v", err)
	}
	if err := v.loadAffixList(dir+"prefixes.txt", v.prefixes, "prefixes"); err != nil {
		log.Printf("Warning: failed to load prefixes: %v", err)
	}

	return v, nil
}

func (v *WordValidator) loadWordList(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	count := 0
	for scanner.Scan() {
		word := strings.ToLower(strings.TrimSpace(scanner.Text()))
		if word != "" {
			v.localWords[word] = struct{}{}
			count++
		}
	}

	if err := scanner.Err(); err != nil {
		return err
	}

	log.Printf("Loaded %d words into local dictionary", count)
	return nil
}

func (v *WordValidator) loadAffixList(path string, target map[string]struct{}, name string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	count := 0
	for scanner.Scan() {
		affix := strings.ToLower(strings.TrimSpace(scanner.Text()))
		if affix != "" {
			target[affix] = struct{}{}
			count++
		}
	}

	if err := scanner.Err(); err != nil {
		return err
	}

	log.Printf("Loaded %d %s", count, name)
	return nil
}

// IsValidWord checks if the word is valid using hybrid approach
// 1st: Check local word list
// 2nd: If not found, check Free Dictionary API
func (v *WordValidator) IsValidWord(word string) (bool, error) {
	normalizedWord := strings.ToLower(strings.TrimSpace(word))

	// 1차: 로컬 단어 목록 검증
	v.mu.RLock()
	_, exists := v.localWords[normalizedWord]
	v.mu.RUnlock()

	if exists {
		log.Printf("Word '%s' found in local dictionary", normalizedWord)
		return true, nil
	}

	// 2차: Free Dictionary API 검증
	log.Printf("Word '%s' not in local dictionary, checking API...", normalizedWord)
	return v.checkDictionaryAPI(normalizedWord)
}

func (v *WordValidator) checkDictionaryAPI(word string) (bool, error) {
	url := fmt.Sprintf("https://api.dictionaryapi.dev/api/v2/entries/en/%s", word)

	resp, err := v.httpClient.Get(url)
	if err != nil {
		// 네트워크 오류 시 일단 허용 (fail-open)
		log.Printf("Dictionary API error for '%s': %v, allowing word", word, err)
		return true, nil
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		log.Printf("Word '%s' validated by Dictionary API", word)
		// 검증된 단어를 로컬 목록에 추가 (캐싱)
		v.mu.Lock()
		v.localWords[word] = struct{}{}
		v.mu.Unlock()
		return true, nil
	}

	if resp.StatusCode == http.StatusNotFound {
		log.Printf("Word '%s' not found in Dictionary API", word)
		return false, nil
	}

	// 기타 오류 시 일단 허용
	log.Printf("Dictionary API returned %d for '%s', allowing word", resp.StatusCode, word)
	return true, nil
}

// IsInLocalDict checks only local dictionary (for faster checks)
func (v *WordValidator) IsInLocalDict(word string) bool {
	normalizedWord := strings.ToLower(strings.TrimSpace(word))
	v.mu.RLock()
	defer v.mu.RUnlock()
	_, exists := v.localWords[normalizedWord]
	return exists
}

// IsSuffix checks if the given string is a valid suffix (e.g., "-er", "-ing")
func (v *WordValidator) IsSuffix(suffix string) bool {
	normalized := strings.ToLower(strings.TrimSpace(suffix))
	v.mu.RLock()
	defer v.mu.RUnlock()
	_, exists := v.suffixes[normalized]
	return exists
}

// IsPrefix checks if the given string is a valid prefix (e.g., "un-", "re-")
func (v *WordValidator) IsPrefix(prefix string) bool {
	normalized := strings.ToLower(strings.TrimSpace(prefix))
	v.mu.RLock()
	defer v.mu.RUnlock()
	_, exists := v.prefixes[normalized]
	return exists
}

// ExistsInDict checks if a word, suffix, or prefix exists in the dictionary
// Suffixes start with "-" (e.g., "-er"), prefixes end with "-" (e.g., "un-")
func (v *WordValidator) ExistsInDict(term string) bool {
	normalized := strings.ToLower(strings.TrimSpace(term))

	// Check if it's a suffix (starts with -)
	if strings.HasPrefix(normalized, "-") {
		return v.IsSuffix(normalized)
	}

	// Check if it's a prefix (ends with -)
	if strings.HasSuffix(normalized, "-") {
		return v.IsPrefix(normalized)
	}

	// Otherwise, check as a regular word
	return v.IsInLocalDict(normalized)
}

// GetSuffixes returns all loaded suffixes as a slice
func (v *WordValidator) GetSuffixes() []string {
	v.mu.RLock()
	defer v.mu.RUnlock()
	result := make([]string, 0, len(v.suffixes))
	for suffix := range v.suffixes {
		result = append(result, suffix)
	}
	return result
}

// GetPrefixes returns all loaded prefixes as a slice
func (v *WordValidator) GetPrefixes() []string {
	v.mu.RLock()
	defer v.mu.RUnlock()
	result := make([]string, 0, len(v.prefixes))
	for prefix := range v.prefixes {
		result = append(result, prefix)
	}
	return result
}
