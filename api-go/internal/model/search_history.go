package model

import "time"

type SearchHistory struct {
	ID         int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	UserID     int64     `gorm:"not null;index:idx_search_history_user_searched,priority:1" json:"userId"`
	Word       string    `gorm:"not null;size:255" json:"word"`
	Language   string    `gorm:"not null;size:10" json:"language"`
	SearchedAt time.Time `gorm:"index:idx_search_history_user_searched,priority:2,sort:desc" json:"searchedAt"`
}

func (SearchHistory) TableName() string {
	return "search_histories"
}
