package model

import (
	"time"

	"github.com/lib/pq"
	"gorm.io/datatypes"
)

type Word struct {
	ID          string         `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Word        string         `gorm:"uniqueIndex;not null" json:"word"`
	Etymology   datatypes.JSON `json:"etymology"`
	Derivatives pq.StringArray `gorm:"type:text[]" json:"derivatives"`
	Synonyms    datatypes.JSON `json:"synonyms"`
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
}

func (Word) TableName() string {
	return "words"
}
