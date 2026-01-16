package handler

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/etymograph/api/internal/model"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type ExportHandler struct {
	db *gorm.DB
}

func NewExportHandler(db *gorm.DB) *ExportHandler {
	return &ExportHandler{db: db}
}

func (h *ExportHandler) Export(c *gin.Context) {
	sessionID := c.Param("sessionId")
	format := c.DefaultQuery("format", "json")

	var session model.Session
	result := h.db.Preload("Words.Word").First(&session, "id = ?", sessionID)

	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	switch format {
	case "json":
		h.exportJSON(c, &session)
	case "csv":
		h.exportCSV(c, &session)
	case "md", "markdown":
		h.exportMarkdown(c, &session)
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid format. Use json, csv, or md"})
	}
}

func (h *ExportHandler) exportJSON(c *gin.Context, session *model.Session) {
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=session-%s.json", session.ID))
	c.JSON(http.StatusOK, session)
}

func (h *ExportHandler) exportCSV(c *gin.Context, session *model.Session) {
	var buf bytes.Buffer
	writer := csv.NewWriter(&buf)

	// Header
	writer.Write([]string{"Order", "Word", "Origin Language", "Origin Root", "Etymology"})

	for _, sw := range session.Words {
		var etymology map[string]interface{}
		json.Unmarshal(sw.Word.Etymology, &etymology)

		originLang := ""
		originRoot := ""
		if origin, ok := etymology["origin"].(map[string]interface{}); ok {
			if lang, ok := origin["language"].(string); ok {
				originLang = lang
			}
			if root, ok := origin["root"].(string); ok {
				originRoot = root
			}
		}

		evolution := ""
		if ev, ok := etymology["evolution"].(string); ok {
			evolution = ev
		}

		writer.Write([]string{
			fmt.Sprintf("%d", sw.Order),
			sw.Word.Word,
			originLang,
			originRoot,
			evolution,
		})
	}

	writer.Flush()

	c.Header("Content-Type", "text/csv")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=session-%s.csv", session.ID))
	c.Data(http.StatusOK, "text/csv", buf.Bytes())
}

func (h *ExportHandler) exportMarkdown(c *gin.Context, session *model.Session) {
	var buf bytes.Buffer

	// Title
	name := "Untitled Session"
	if session.Name != nil {
		name = *session.Name
	}
	buf.WriteString(fmt.Sprintf("# %s\n\n", name))
	buf.WriteString(fmt.Sprintf("**Created:** %s\n\n", session.CreatedAt.Format("2006-01-02 15:04:05")))

	// Words
	buf.WriteString("## Words\n\n")

	for _, sw := range session.Words {
		var etymology map[string]interface{}
		json.Unmarshal(sw.Word.Etymology, &etymology)

		buf.WriteString(fmt.Sprintf("### %d. %s\n\n", sw.Order, sw.Word.Word))

		if origin, ok := etymology["origin"].(map[string]interface{}); ok {
			if lang, ok := origin["language"].(string); ok {
				if root, ok := origin["root"].(string); ok {
					buf.WriteString(fmt.Sprintf("**Origin:** %s (*%s*)\n\n", lang, root))
				}
			}
		}

		if evolution, ok := etymology["evolution"].(string); ok {
			buf.WriteString(fmt.Sprintf("**Evolution:** %s\n\n", evolution))
		}

		if meaning, ok := etymology["modernMeaning"].(string); ok {
			buf.WriteString(fmt.Sprintf("**Meaning:** %s\n\n", meaning))
		}

		buf.WriteString("---\n\n")
	}

	c.Header("Content-Type", "text/markdown")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=session-%s.md", session.ID))
	c.Data(http.StatusOK, "text/markdown", buf.Bytes())
}
