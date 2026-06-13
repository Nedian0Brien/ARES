-- Agent run lease columns for durable worker queue claims.
-- Runtime registration: services/backend/lib/postgres-store.mjs:POSTGRES_MIGRATIONS

ALTER TABLE ares_agent_runs ADD COLUMN IF NOT EXISTS lease_owner TEXT NOT NULL DEFAULT '';
ALTER TABLE ares_agent_runs ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ NULL;
ALTER TABLE ares_agent_runs ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS ares_agent_runs_claim_idx ON ares_agent_runs (status, lease_expires_at, created_at ASC);
