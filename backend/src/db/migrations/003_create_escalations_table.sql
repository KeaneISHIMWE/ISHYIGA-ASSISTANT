CREATE TABLE IF NOT EXISTS escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  customer_number TEXT NOT NULL,
  company TEXT,
  issue_key TEXT NOT NULL,
  issue_summary TEXT NOT NULL,
  reason TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  ticket_id TEXT,
  agent_id TEXT,
  agent_name TEXT,
  notify_number TEXT,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS escalations_customer_status_idx
  ON escalations (customer_number, status);

CREATE INDEX IF NOT EXISTS escalations_conversation_idx
  ON escalations (conversation_id);

CREATE UNIQUE INDEX IF NOT EXISTS escalations_open_issue_idx
  ON escalations (customer_number, issue_key)
  WHERE status <> 'RESOLVED';

DROP TRIGGER IF EXISTS escalations_set_updated_at ON escalations;
CREATE TRIGGER escalations_set_updated_at
  BEFORE UPDATE ON escalations
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
