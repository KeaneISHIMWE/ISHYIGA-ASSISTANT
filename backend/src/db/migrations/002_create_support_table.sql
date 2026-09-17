CREATE TABLE IF NOT EXISTS support (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_row INTEGER NOT NULL UNIQUE,
  client_name TEXT NOT NULL,
  support_agent TEXT,
  location TEXT,
  sector TEXT,
  visit_at TIMESTAMPTZ,
  branches INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  approval TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  contact TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS support_dedup_idx
  ON support (
    lower(client_name),
    lower(COALESCE(support_agent, '')),
    COALESCE(visit_at, TIMESTAMPTZ 'epoch')
  );

CREATE INDEX IF NOT EXISTS support_client_name_idx
  ON support (lower(client_name));

CREATE INDEX IF NOT EXISTS support_agent_idx
  ON support (lower(support_agent));

CREATE INDEX IF NOT EXISTS support_location_idx
  ON support (lower(location));

CREATE INDEX IF NOT EXISTS support_status_idx
  ON support (status);

CREATE INDEX IF NOT EXISTS support_visit_at_idx
  ON support (visit_at);

DROP TRIGGER IF EXISTS support_set_updated_at ON support;
CREATE TRIGGER support_set_updated_at
  BEFORE UPDATE ON support
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
