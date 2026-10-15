ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS registration_ticket_id TEXT,
  ADD COLUMN IF NOT EXISTS registration_ticket_at TIMESTAMPTZ;
