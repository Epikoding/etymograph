package model

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"time"
)

// HistoryWord represents a single word entry in the daily history
type HistoryWord struct {
	Word           string    `json:"word"`
	Language       string    `json:"language"`
	LastSearchedAt time.Time `json:"lastSearchedAt"`
}

// HistoryWords is a slice of HistoryWord that implements SQL scanner/valuer for JSONB
type HistoryWords []HistoryWord

// Value implements driver.Valuer for JSONB serialization
func (h HistoryWords) Value() (driver.Value, error) {
	if h == nil {
		return json.Marshal([]HistoryWord{})
	}
	return json.Marshal(h)
}

// Scan implements sql.Scanner for JSONB deserialization
func (h *HistoryWords) Scan(value interface{}) error {
	if value == nil {
		*h = []HistoryWord{}
		return nil
	}

	bytes, ok := value.([]byte)
	if !ok {
		return errors.New("failed to unmarshal HistoryWords: not a byte slice")
	}

	return json.Unmarshal(bytes, h)
}

// SearchHistoryDaily stores daily aggregated search history per user
// One row = one user + one date + N words (as JSONB array)
type SearchHistoryDaily struct {
	ID        int64        `gorm:"primaryKey;autoIncrement" json:"id"`
	UserID    int64        `gorm:"not null;uniqueIndex:idx_history_daily_user_date,priority:1" json:"userId"`
	Date      time.Time    `gorm:"type:date;not null;uniqueIndex:idx_history_daily_user_date,priority:2" json:"date"`
	Words     HistoryWords `gorm:"type:jsonb;not null;default:'[]'" json:"words"`
	UpdatedAt time.Time    `gorm:"autoUpdateTime" json:"updatedAt"`
}

func (SearchHistoryDaily) TableName() string {
	return "search_history_daily"
}

// AddOrUpdateWord adds a word to the Words slice or updates its lastSearchedAt if it already exists
func (s *SearchHistoryDaily) AddOrUpdateWord(word, language string, searchedAt time.Time) {
	for i, w := range s.Words {
		if w.Word == word && w.Language == language {
			s.Words[i].LastSearchedAt = searchedAt
			return
		}
	}
	s.Words = append(s.Words, HistoryWord{
		Word:           word,
		Language:       language,
		LastSearchedAt: searchedAt,
	})
}

// RemoveWord removes a word from the Words slice
func (s *SearchHistoryDaily) RemoveWord(word, language string) bool {
	for i, w := range s.Words {
		if w.Word == word && w.Language == language {
			s.Words = append(s.Words[:i], s.Words[i+1:]...)
			return true
		}
	}
	return false
}
