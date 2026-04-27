package model

import "time"

type User struct {
	ID         int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	Provider   string    `gorm:"not null;size:20" json:"provider"`
	ProviderID string    `gorm:"not null;size:255" json:"providerId"`
	Email      string    `gorm:"not null;size:255" json:"email"`
	Name       string    `gorm:"size:255" json:"name"`
	AvatarURL  string    `json:"avatarUrl"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

func (User) TableName() string {
	return "users"
}
