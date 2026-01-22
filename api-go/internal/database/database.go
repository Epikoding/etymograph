package database

import (
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
		&model.ErrorReport{},
	)
	if err != nil {
		return err
	}

	// Drop old unique index on word only (if exists) and create composite unique index
	db.Exec("DROP INDEX IF EXISTS idx_words_word")
	db.Exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_words_word_language ON words(word, language)")

	// Create unique index for users (provider, provider_id)
	db.Exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider_provider_id ON users(provider, provider_id)")

	return nil
}
