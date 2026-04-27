package model

import "time"

type ErrorReport struct {
	ID          int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	UserID      int64     `gorm:"not null;index" json:"userId"`
	WordID      int64     `gorm:"not null;index" json:"wordId"`
	Word        string    `gorm:"not null;size:255" json:"word"`
	Language    string    `gorm:"not null;size:10" json:"language"`
	IssueType   string    `gorm:"not null;size:50" json:"issueType"`
	Description string    `gorm:"type:text" json:"description"`
	Status      string    `gorm:"default:'pending';size:20" json:"status"`
	ReviewedBy  *int64    `json:"reviewedBy,omitempty"`
	ReviewNote  string    `gorm:"type:text" json:"reviewNote,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

func (ErrorReport) TableName() string {
	return "error_reports"
}

// IssueType constants
const (
	IssueTypeEtymology   = "etymology"
	IssueTypeDefinition  = "definition"
	IssueTypeDerivative  = "derivative"
	IssueTypeComponent   = "component"
	IssueTypeOther       = "other"
)

// Status constants
const (
	StatusPending   = "pending"
	StatusResolved  = "resolved"
	StatusDismissed = "dismissed"
)
