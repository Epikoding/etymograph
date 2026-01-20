package model

import (
	"time"

	"gorm.io/datatypes"
)

type Word struct {
	ID            int64          `gorm:"primaryKey;autoIncrement" json:"id"`
	Word          string         `gorm:"not null" json:"word"`
	Language      string         `gorm:"not null;default:'ko'" json:"language"`
	Etymology     datatypes.JSON `json:"etymology"`
	EtymologyPrev datatypes.JSON `json:"etymologyPrev,omitempty"`
	CreatedAt     time.Time      `json:"createdAt"`
	UpdatedAt     time.Time      `json:"updatedAt"`
}

func (Word) TableName() string {
	return "words"
}
