package model

import "time"

type RefreshToken struct {
	ID        int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	UserID    int64     `gorm:"not null;index" json:"userId"`
	Token     string    `gorm:"not null;uniqueIndex;size:255" json:"token"`
	ExpiresAt time.Time `json:"expiresAt"`
	CreatedAt time.Time `json:"createdAt"`
	Revoked   bool      `gorm:"default:false" json:"revoked"`
}

func (RefreshToken) TableName() string {
	return "refresh_tokens"
}
