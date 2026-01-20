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
	httpClient *http.Client
	mu         sync.RWMutex
}

func NewWordValidator(wordListPath string) (*WordValidator, error) {
	v := &WordValidator{
		localWords: make(map[string]struct{}),
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
	}

	if err := v.loadWordList(wordListPath); err != nil {
		return nil, fmt.Errorf("failed to load word list: %w", err)
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
