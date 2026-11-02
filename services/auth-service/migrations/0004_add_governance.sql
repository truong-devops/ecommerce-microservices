CREATE TABLE IF NOT EXISTS governance_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(64) NOT NULL UNIQUE,
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  scope VARCHAR(32) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  version INTEGER NOT NULL DEFAULT 1,
  content TEXT NOT NULL,
  effective_at TIMESTAMPTZ NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT governance_policies_status_check CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  CONSTRAINT governance_policies_scope_check CHECK (scope IN ('MARKETPLACE', 'PRODUCT', 'VIDEO', 'CHAT', 'FINANCE', 'SECURITY')),
  CONSTRAINT governance_policies_version_check CHECK (version > 0)
);

CREATE INDEX IF NOT EXISTS idx_governance_policies_status_updated
  ON governance_policies(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS governance_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  actor_email VARCHAR(255) NOT NULL,
  actor_role VARCHAR(32) NOT NULL,
  action VARCHAR(80) NOT NULL,
  resource_type VARCHAR(64) NOT NULL,
  resource_id VARCHAR(128) NULL,
  description TEXT NOT NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_governance_action_logs_created
  ON governance_action_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_governance_action_logs_actor_created
  ON governance_action_logs(actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_governance_action_logs_resource
  ON governance_action_logs(resource_type, resource_id, created_at DESC);
