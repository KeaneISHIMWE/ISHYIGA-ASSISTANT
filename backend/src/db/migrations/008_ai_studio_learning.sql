CREATE TABLE IF NOT EXISTS ai_studio_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_studio_otps_customer_created_idx
  ON ai_studio_otps (customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_studio_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  original_user_question TEXT NOT NULL DEFAULT '',
  original_ai_response TEXT NOT NULL,
  original_correction TEXT NOT NULL,
  normalized_correction TEXT NOT NULL,
  explanation TEXT NOT NULL DEFAULT '',
  source_language TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'PENDING_REVIEW'
    CHECK (status IN (
      'PENDING_REVIEW',
      'APPROVED',
      'REJECTED',
      'NEEDS_CLARIFICATION',
      'OUTDATED',
      'ARCHIVED'
    )),
  personal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (customer_id, message_id)
);

CREATE INDEX IF NOT EXISTS ai_studio_corrections_customer_idx
  ON ai_studio_corrections (customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_studio_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  memory_type TEXT NOT NULL DEFAULT 'context',
  memory_content TEXT NOT NULL,
  source_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  source_correction_id UUID REFERENCES ai_studio_corrections(id) ON DELETE SET NULL,
  confidence NUMERIC(4, 3) NOT NULL DEFAULT 0.500,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_studio_memories_customer_idx
  ON ai_studio_memories (customer_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_studio_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General Knowledge',
  original_content TEXT NOT NULL,
  normalized_content TEXT NOT NULL,
  source_correction_id UUID REFERENCES ai_studio_corrections(id) ON DELETE SET NULL,
  knowledge_scope TEXT NOT NULL DEFAULT 'global',
  confidence NUMERIC(4, 3) NOT NULL DEFAULT 0.500,
  verification_status TEXT NOT NULL DEFAULT 'PENDING_REVIEW'
    CHECK (verification_status IN (
      'PENDING_REVIEW',
      'APPROVED',
      'REJECTED',
      'NEEDS_CLARIFICATION',
      'OUTDATED',
      'ARCHIVED'
    )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ai_studio_knowledge_status_idx
  ON ai_studio_knowledge (verification_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_studio_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_id UUID NOT NULL REFERENCES ai_studio_knowledge(id) ON DELETE CASCADE,
  reviewer_id UUID,
  decision TEXT NOT NULL,
  review_notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_studio_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  actor_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  previous_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS ai_studio_corrections_set_updated_at ON ai_studio_corrections;
CREATE TRIGGER ai_studio_corrections_set_updated_at
  BEFORE UPDATE ON ai_studio_corrections
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS ai_studio_memories_set_updated_at ON ai_studio_memories;
CREATE TRIGGER ai_studio_memories_set_updated_at
  BEFORE UPDATE ON ai_studio_memories
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS ai_studio_knowledge_set_updated_at ON ai_studio_knowledge;
CREATE TRIGGER ai_studio_knowledge_set_updated_at
  BEFORE UPDATE ON ai_studio_knowledge
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
