package database

import (
	"log"

	"github.com/etymograph/api/internal/config"
	"github.com/etymograph/api/internal/model"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func Connect(cfg *config.Config) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		return nil, err
	}

	return db, nil
}

func Migrate(db *gorm.DB) error {
	err := db.AutoMigrate(
		&model.Word{},
		&model.Session{},
		&model.SessionWord{},
		&model.User{},
		&model.RefreshToken{},
		&model.SearchHistory{},
		&model.SearchHistoryDaily{},
		&model.ErrorReport{},
		&model.EtymologyRevision{},
		&model.UserEtymologyPreference{},
	)
	if err != nil {
		return err
	}

	// Drop old unique index on word only (if exists) and create composite unique index
	db.Exec("DROP INDEX IF EXISTS idx_words_word")
	db.Exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_words_word_language ON words(word, language)")

	// Create unique index for users (provider, provider_id)
	db.Exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider_provider_id ON users(provider, provider_id)")

	// Create unique index for etymology_revisions (word_id, revision_number)
	// This also covers queries filtering by word_id only (leftmost column)
	db.Exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_etymology_revisions_word_revision ON etymology_revisions(word_id, revision_number)")

	// Drop redundant single-column index (covered by composite index above)
	db.Exec("DROP INDEX IF EXISTS idx_etymology_revisions_word_id")

	// Index for user_etymology_preferences JOIN queries on revision_id
	db.Exec("CREATE INDEX IF NOT EXISTS idx_user_etymology_preferences_revision_id ON user_etymology_preferences(revision_id)")

	return nil
}

// MigrateEtymologyToRevisions migrates existing etymology data from words table to etymology_revisions
// This should be called once after the new tables are created
func MigrateEtymologyToRevisions(db *gorm.DB) error {
	// Check if etymology column exists in words table
	var columnExists bool
	row := db.Raw(`
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'words' AND column_name = 'etymology'
		)
	`).Row()
	if err := row.Scan(&columnExists); err != nil {
		return err
	}

	if !columnExists {
		log.Println("Etymology column does not exist in words table, skipping migration")
		return nil
	}

	// Check if any revisions already exist
	var revisionCount int64
	db.Model(&model.EtymologyRevision{}).Count(&revisionCount)
	if revisionCount > 0 {
		log.Printf("Etymology revisions already exist (%d records), skipping migration", revisionCount)
		return nil
	}

	// Migrate existing etymology data
	result := db.Exec(`
		INSERT INTO etymology_revisions (word_id, revision_number, etymology, created_at)
		SELECT id, 1, etymology, created_at
		FROM words
		WHERE etymology IS NOT NULL
		  AND etymology != 'null'::jsonb
		  AND etymology != '{}'::jsonb
		ON CONFLICT (word_id, revision_number) DO NOTHING
	`)

	if result.Error != nil {
		return result.Error
	}

	log.Printf("Migrated %d etymology records to etymology_revisions", result.RowsAffected)
	return nil
}
