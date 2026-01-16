package model

import (
	"time"
)

type Session struct {
	ID        string        `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Name      *string       `json:"name"`
	CreatedAt time.Time     `json:"createdAt"`
	ExpiresAt time.Time     `json:"expiresAt"`
	Words     []SessionWord `gorm:"foreignKey:SessionID" json:"words"`
}

func (Session) TableName() string {
	return "sessions"
}

type SessionWord struct {
	ID        string   `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	SessionID string   `gorm:"type:uuid;not null;index" json:"sessionId"`
	WordID    string   `gorm:"type:uuid;not null" json:"wordId"`
	Order     int      `json:"order"`
	ParentID  *string  `gorm:"type:uuid" json:"parentId"`
	Session   Session  `gorm:"foreignKey:SessionID" json:"-"`
	Word      Word     `gorm:"foreignKey:WordID" json:"word"`
	Parent    *SessionWord `gorm:"foreignKey:ParentID" json:"-"`
}

func (SessionWord) TableName() string {
	return "session_words"
}
