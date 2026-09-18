ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS summary TEXT,
  ADD COLUMN IF NOT EXISTS summary_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE conversations
SET last_activity_at = COALESCE(updated_at, created_at, NOW())
WHERE last_activity_at IS NULL;

CREATE INDEX IF NOT EXISTS conversations_last_activity_idx
  ON conversations (last_activity_at DESC);
