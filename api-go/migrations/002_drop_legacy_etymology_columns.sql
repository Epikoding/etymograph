-- Migration: Drop legacy etymology columns from words table
-- Date: 2026-01-23
-- Description: Remove etymology and etymology_prev columns that are no longer used
--              (data has been migrated to etymology_revisions table)

-- Verify migration is complete before dropping (run manually first):
-- SELECT
--   (SELECT COUNT(*) FROM words WHERE etymology IS NOT NULL AND etymology != 'null'::jsonb AND etymology != '{}'::jsonb) as words_with_etymology,
--   (SELECT COUNT(DISTINCT word_id) FROM etymology_revisions) as words_with_revisions;

-- Drop the legacy columns
ALTER TABLE words DROP COLUMN IF EXISTS etymology;
ALTER TABLE words DROP COLUMN IF EXISTS etymology_prev;

-- Drop the index that was only used for the old etymology column
DROP INDEX IF EXISTS idx_words_etymology_null;
