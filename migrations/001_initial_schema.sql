-- ARES Postgres migration: 001_initial_schema
-- Runtime registration: services/backend/lib/postgres-store.mjs:POSTGRES_MIGRATIONS

CREATE TABLE IF NOT EXISTS ares_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS ares_users_email_unique_idx
ON ares_users (email)
WHERE email <> '';

CREATE TABLE IF NOT EXISTS ares_organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS ares_memberships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES ares_organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES ares_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS ares_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '',
  focus TEXT NOT NULL DEFAULT '',
  default_query TEXT NOT NULL DEFAULT '',
  keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ares_project_access (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES ares_projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES ares_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS ares_auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES ares_users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  last_seen_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS ares_audit_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL DEFAULT '',
  actor_user_id TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  target_type TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS ares_library (
  project_id TEXT NOT NULL REFERENCES ares_projects(id) ON DELETE CASCADE,
  paper_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, paper_id)
);

CREATE TABLE IF NOT EXISTS ares_reading_queue (
  project_id TEXT NOT NULL REFERENCES ares_projects(id) ON DELETE CASCADE,
  paper_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, paper_id)
);

CREATE TABLE IF NOT EXISTS ares_reading_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES ares_projects(id) ON DELETE CASCADE,
  paper_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL,
  UNIQUE (project_id, paper_id)
);

CREATE TABLE IF NOT EXISTS ares_agent_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES ares_projects(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT '',
  task_kind TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL,
  lease_owner TEXT NOT NULL DEFAULT '',
  lease_expires_at TIMESTAMPTZ NULL,
  heartbeat_at TIMESTAMPTZ NULL,
  payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS ares_project_assets (
  collection_name TEXT NOT NULL,
  id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES ares_projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL,
  PRIMARY KEY (collection_name, id)
);

CREATE INDEX IF NOT EXISTS ares_library_project_updated_idx ON ares_library (project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS ares_reading_queue_project_updated_idx ON ares_reading_queue (project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS ares_reading_sessions_project_updated_idx ON ares_reading_sessions (project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS ares_reading_sessions_project_paper_idx ON ares_reading_sessions (project_id, paper_id);
CREATE INDEX IF NOT EXISTS ares_agent_runs_project_updated_idx ON ares_agent_runs (project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS ares_agent_runs_project_stage_idx ON ares_agent_runs (project_id, stage, updated_at DESC);
CREATE INDEX IF NOT EXISTS ares_agent_runs_claim_idx ON ares_agent_runs (status, lease_expires_at, created_at ASC);
CREATE INDEX IF NOT EXISTS ares_project_assets_collection_project_updated_idx ON ares_project_assets (collection_name, project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS ares_project_access_project_idx ON ares_project_access (project_id, user_id);
CREATE INDEX IF NOT EXISTS ares_memberships_user_idx ON ares_memberships (user_id, organization_id);
CREATE INDEX IF NOT EXISTS ares_auth_sessions_token_idx ON ares_auth_sessions (token);
CREATE INDEX IF NOT EXISTS ares_audit_events_project_created_idx ON ares_audit_events (project_id, created_at DESC);
