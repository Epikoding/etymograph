package model

import (
	"time"

	"gorm.io/datatypes"
)

// Word represents a word entry without etymology (etymology is stored in EtymologyRevision)
type Word struct {
	ID        int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	Word      string    `gorm:"not null" json:"word"`
	Language  string    `gorm:"not null;default:'ko'" json:"language"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (Word) TableName() string {
	return "words"
}

// EtymologyRevision stores a versioned etymology for a word
// Note: Index on (word_id, revision_number) is created in migration, covers word_id-only queries
type EtymologyRevision struct {
	ID             int64          `gorm:"primaryKey;autoIncrement" json:"id"`
	WordID         int64          `gorm:"not null" json:"wordId"`
	RevisionNumber int            `gorm:"not null" json:"revisionNumber"`
	Etymology      datatypes.JSON `gorm:"not null" json:"etymology"`
	CreatedAt      time.Time      `json:"createdAt"`
}

func (EtymologyRevision) TableName() string {
	return "etymology_revisions"
}

// UserEtymologyPreference stores user's preferred revision for a word
type UserEtymologyPreference struct {
	ID         int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	UserID     int64     `gorm:"uniqueIndex:idx_user_word;not null" json:"userId"`
	WordID     int64     `gorm:"uniqueIndex:idx_user_word;not null" json:"wordId"`
	RevisionID int64     `gorm:"not null" json:"revisionId"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

func (UserEtymologyPreference) TableName() string {
	return "user_etymology_preferences"
}

// WordWithEtymology is a response struct that combines Word with its etymology
type WordWithEtymology struct {
	ID              int64              `json:"id"`
	Word            string             `json:"word"`
	Language        string             `json:"language"`
	Etymology       datatypes.JSON     `json:"etymology"`
	CurrentRevision int                `json:"currentRevision"`
	TotalRevisions  int                `json:"totalRevisions"`
	Revisions       []RevisionSummary  `json:"revisions,omitempty"`
	CreatedAt       time.Time          `json:"createdAt"`
	UpdatedAt       time.Time          `json:"updatedAt"`
}

// RevisionSummary provides a brief overview of a revision
type RevisionSummary struct {
	RevisionNumber int       `json:"revisionNumber"`
	CreatedAt      time.Time `json:"createdAt"`
}
