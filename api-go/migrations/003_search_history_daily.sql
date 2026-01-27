-- Migration: search_histories -> search_history_daily
-- This script migrates existing search history data to the new daily aggregated structure

-- Step 1: Create the new table (if not exists via GORM AutoMigrate)
CREATE TABLE IF NOT EXISTS search_history_daily (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    date DATE NOT NULL,
    words JSONB NOT NULL DEFAULT '[]',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT idx_history_daily_user_date UNIQUE (user_id, date)
);

-- Step 2: Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_history_daily_user_id ON search_history_daily(user_id);

-- Step 3: Migrate data from search_histories to search_history_daily
-- Groups by user_id and date, aggregates words into JSONB array
INSERT INTO search_history_daily (user_id, date, words, updated_at)
SELECT
    user_id,
    DATE(searched_at) as date,
    jsonb_agg(
        jsonb_build_object(
            'word', word,
            'language', language,
            'lastSearchedAt', searched_at
        )
        ORDER BY searched_at DESC
    ) as words,
    MAX(searched_at) as updated_at
FROM search_histories
GROUP BY user_id, DATE(searched_at)
ON CONFLICT (user_id, date)
DO UPDATE SET
    words = (
        -- Merge existing words with new words, keeping unique word+language combinations
        SELECT jsonb_agg(DISTINCT elem)
        FROM (
            SELECT jsonb_array_elements(search_history_daily.words) AS elem
            UNION
            SELECT jsonb_array_elements(EXCLUDED.words) AS elem
        ) combined
    ),
    updated_at = GREATEST(search_history_daily.updated_at, EXCLUDED.updated_at);

-- Step 4: Verify migration
DO $$
DECLARE
    old_count BIGINT;
    new_count BIGINT;
BEGIN
    SELECT COUNT(*) INTO old_count FROM search_histories;
    SELECT SUM(jsonb_array_length(words)) INTO new_count FROM search_history_daily;

    RAISE NOTICE 'Migration complete: % records from search_histories -> % entries in search_history_daily', old_count, new_count;

    IF old_count != COALESCE(new_count, 0) THEN
        RAISE WARNING 'Record count mismatch! Old: %, New: %. Some records may have been deduplicated.', old_count, new_count;
    END IF;
END $$;

-- Note: The old search_histories table is kept for backup
-- To drop it after verification, run:
-- DROP TABLE IF EXISTS search_histories;
