-- ARES Postgres migration: 002_lookup_indexes
-- Runtime registration: services/backend/lib/postgres-store.mjs:POSTGRES_MIGRATIONS

CREATE INDEX IF NOT EXISTS ares_users_status_idx ON ares_users (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS ares_organizations_status_idx ON ares_organizations (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS ares_memberships_org_status_role_idx ON ares_memberships (organization_id, status, role);
CREATE INDEX IF NOT EXISTS ares_project_access_user_status_role_idx ON ares_project_access (user_id, status, role);
CREATE INDEX IF NOT EXISTS ares_projects_updated_idx ON ares_projects (updated_at DESC);
CREATE INDEX IF NOT EXISTS ares_reading_sessions_status_updated_idx ON ares_reading_sessions (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS ares_agent_runs_status_updated_idx ON ares_agent_runs (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS ares_project_assets_project_updated_idx ON ares_project_assets (project_id, updated_at DESC);
