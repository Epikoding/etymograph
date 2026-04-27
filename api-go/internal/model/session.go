package model

import (
	"time"
)

type Session struct {
	ID        int64         `gorm:"primaryKey;autoIncrement" json:"id"`
	Name      *string       `json:"name"`
	CreatedAt time.Time     `json:"createdAt"`
	ExpiresAt time.Time     `json:"expiresAt"`
	Words     []SessionWord `gorm:"foreignKey:SessionID" json:"words"`
}

func (Session) TableName() string {
	return "sessions"
}

type SessionWord struct {
	ID        int64        `gorm:"primaryKey;autoIncrement" json:"id"`
	SessionID int64        `gorm:"not null;index" json:"sessionId"`
	WordID    int64        `gorm:"not null" json:"wordId"`
	Order     int          `json:"order"`
	ParentID  *int64       `json:"parentId"`
	Session   Session      `gorm:"foreignKey:SessionID" json:"-"`
	Word      Word         `gorm:"foreignKey:WordID" json:"word"`
	Parent    *SessionWord `gorm:"foreignKey:ParentID" json:"-"`
}

func (SessionWord) TableName() string {
	return "session_words"
}
