CREATE TABLE IF NOT EXISTS studio_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'CONTRIBUTOR')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS studio_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contributor_id UUID NOT NULL REFERENCES studio_users(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (
    type IN (
      'SYSTEM_PROMPT',
      'QUESTION_ANSWER',
      'FEATURE_WORKFLOW',
      'TROUBLESHOOTING'
    )
  ),
  title TEXT NOT NULL,
  question TEXT,
  answer TEXT,
  system_prompt TEXT,
  feature TEXT,
  module TEXT,
  description TEXT,
  steps TEXT,
  symptoms TEXT,
  cause TEXT,
  solution TEXT,
  escalate_when TEXT,
  priority TEXT,
  notes TEXT,
  attachment_note TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
    status IN (
      'PENDING',
      'UNDER_REVIEW',
      'APPROVED',
      'REJECTED',
      'NEEDS_REVISION',
      'ADDED_TO_AI'
    )
  ),
  admin_notes TEXT,
  reviewed_by UUID REFERENCES studio_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS studio_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contribution_id UUID NOT NULL UNIQUE REFERENCES studio_contributions(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_by UUID REFERENCES studio_users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES studio_users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS studio_prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contribution_id UUID REFERENCES studio_contributions(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('APPROVED', 'CURRENT', 'ARCHIVED')),
  created_by UUID REFERENCES studio_users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES studio_users(id) ON DELETE SET NULL,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name, version)
);

CREATE TABLE IF NOT EXISTS studio_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES studio_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS studio_contributions_contributor_idx
  ON studio_contributions (contributor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS studio_contributions_status_idx
  ON studio_contributions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS studio_contributions_type_idx
  ON studio_contributions (type);

CREATE INDEX IF NOT EXISTS studio_knowledge_category_idx
  ON studio_knowledge (category, approved_at DESC);

CREATE INDEX IF NOT EXISTS studio_prompt_versions_name_idx
  ON studio_prompt_versions (name, version DESC);

CREATE INDEX IF NOT EXISTS studio_audit_logs_created_idx
  ON studio_audit_logs (created_at DESC);

DROP TRIGGER IF EXISTS studio_users_set_updated_at ON studio_users;
CREATE TRIGGER studio_users_set_updated_at
  BEFORE UPDATE ON studio_users
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS studio_contributions_set_updated_at ON studio_contributions;
CREATE TRIGGER studio_contributions_set_updated_at
  BEFORE UPDATE ON studio_contributions
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS studio_knowledge_set_updated_at ON studio_knowledge;
CREATE TRIGGER studio_knowledge_set_updated_at
  BEFORE UPDATE ON studio_knowledge
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS studio_prompt_versions_set_updated_at ON studio_prompt_versions;
CREATE TRIGGER studio_prompt_versions_set_updated_at
  BEFORE UPDATE ON studio_prompt_versions
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
