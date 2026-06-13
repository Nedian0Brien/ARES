import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';

import { Pool } from 'pg';

import { ASSET_COLLECTIONS, normaliseAsset, normalisePaper } from './asset-model.mjs';
import { normalizeAuditEvent } from './audit-model.mjs';
import {
  normalizeAuthSession,
  normalizeMembership,
  normalizeOrganization,
  normalizeProjectAccess,
  normalizeUser,
} from './identity-model.mjs';
import { assertPostgresMigrationsApplied, runPostgresMigrations } from './postgres-migrations.mjs';
import { normaliseReadingSession } from './reading-model.mjs';

const PROJECT_MAP_COLLECTIONS = ['library', 'readingQueue'];
const IDENTITY_COLLECTIONS = ['users', 'organizations', 'memberships', 'projectAccess', 'authSessions'];
const AUDIT_COLLECTIONS = ['auditEvents'];
const RUNNING_STATUSES = new Set(['queue', 'running']);
const VALID_STATUSES = new Set(['todo', 'queue', 'running', 'done', 'error', 'canceled']);
const MAX_AGENT_PROGRESS_EVENTS = 80;
export const POSTGRES_MIGRATIONS = [
  {
    id: '001_initial_schema',
    up: ensureSchema,
  },
  {
    id: '002_lookup_indexes',
    statements: [
      'CREATE INDEX IF NOT EXISTS ares_users_status_idx ON ares_users (status, updated_at DESC)',
      'CREATE INDEX IF NOT EXISTS ares_organizations_status_idx ON ares_organizations (status, updated_at DESC)',
      'CREATE INDEX IF NOT EXISTS ares_memberships_org_status_role_idx ON ares_memberships (organization_id, status, role)',
      'CREATE INDEX IF NOT EXISTS ares_project_access_user_status_role_idx ON ares_project_access (user_id, status, role)',
      'CREATE INDEX IF NOT EXISTS ares_projects_updated_idx ON ares_projects (updated_at DESC)',
      'CREATE INDEX IF NOT EXISTS ares_reading_sessions_status_updated_idx ON ares_reading_sessions (status, updated_at DESC)',
      'CREATE INDEX IF NOT EXISTS ares_agent_runs_status_updated_idx ON ares_agent_runs (status, updated_at DESC)',
      'CREATE INDEX IF NOT EXISTS ares_project_assets_project_updated_idx ON ares_project_assets (project_id, updated_at DESC)',
    ],
  },
  {
    id: '003_agent_run_leases',
    statements: [
      "ALTER TABLE ares_agent_runs ADD COLUMN IF NOT EXISTS lease_owner TEXT NOT NULL DEFAULT ''",
      'ALTER TABLE ares_agent_runs ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ NULL',
      'ALTER TABLE ares_agent_runs ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ NULL',
      'CREATE INDEX IF NOT EXISTS ares_agent_runs_claim_idx ON ares_agent_runs (status, lease_expires_at, created_at ASC)',
    ],
  },
];
const EVIDENCE_LINK_REFERENCE_COLLECTIONS = [
  'readingPackets',
  'reproductionPlans',
  'resultDossiers',
  'insightCards',
  'draftSections',
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function jsonPayload(value) {
  return JSON.stringify(value ?? {});
}

function ensureArrayMap(state, key) {
  if (!state[key] || typeof state[key] !== 'object' || Array.isArray(state[key])) {
    state[key] = {};
    return true;
  }

  return false;
}

function migrateStoreState(state) {
  let changed = false;

  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    state = {};
    changed = true;
  }

  if (!Array.isArray(state.projects)) {
    state.projects = [];
    changed = true;
  }

  for (const key of IDENTITY_COLLECTIONS) {
    if (!Array.isArray(state[key])) {
      state[key] = [];
      changed = true;
    }
  }
  for (const key of AUDIT_COLLECTIONS) {
    if (!Array.isArray(state[key])) {
      state[key] = [];
      changed = true;
    }
  }

  for (const key of PROJECT_MAP_COLLECTIONS) {
    changed = ensureArrayMap(state, key) || changed;
  }

  for (const key of ASSET_COLLECTIONS) {
    if (!Array.isArray(state[key])) {
      state[key] = [];
      changed = true;
    }
  }

  for (const project of state.projects) {
    for (const key of PROJECT_MAP_COLLECTIONS) {
      if (!Array.isArray(state[key][project.id])) {
        state[key][project.id] = [];
        changed = true;
      }
    }
  }

  return { changed, state };
}

function normaliseStatus(status, fallback = 'todo') {
  const value = String(status || '').trim().toLowerCase();
  return VALID_STATUSES.has(value) ? value : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}-${randomUUID()}`;
}

function sortByUpdatedDesc(left, right) {
  const leftStamp = Date.parse(left.updatedAt || left.createdAt || 0) || 0;
  const rightStamp = Date.parse(right.updatedAt || right.createdAt || 0) || 0;
  return rightStamp - leftStamp;
}

function normaliseTimestamp(value, fallback = nowIso()) {
  const date = value instanceof Date ? value : new Date(value || fallback);
  const stamp = date.getTime();
  return Number.isFinite(stamp) ? date.toISOString() : fallback;
}

function claimExpiresAt(now, leaseMs) {
  const duration = Number.isFinite(Number(leaseMs)) && Number(leaseMs) > 0 ? Number(leaseMs) : 60_000;
  return new Date(Date.parse(now) + duration).toISOString();
}

function removeAssetId(values, id) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.filter((value) => value !== id);
}

function ensureText(value, fallback = '') {
  return value === null || value === undefined ? fallback : String(value);
}

function ensureStringArray(values, limit) {
  const next = Array.isArray(values) ? values.map((value) => String(value)).filter(Boolean) : [];
  return typeof limit === 'number' ? next.slice(0, limit) : next;
}

function ensureObjectArray(values) {
  return Array.isArray(values) ? clone(values) : [];
}

function ensureProgressEvents(values) {
  return ensureObjectArray(values).slice(-MAX_AGENT_PROGRESS_EVENTS);
}

function cloneMaybe(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  return clone(value);
}

function toIsoString(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function maskConnectionString(connectionString) {
  if (!connectionString) {
    return '';
  }

  try {
    const url = new URL(connectionString);
    if (url.password) {
      url.password = '***';
    }
    return url.toString();
  } catch {
    return '[invalid postgres url]';
  }
}

function resolveSslConfig(value) {
  if (value === undefined || value === null || value === '' || value === false) {
    return undefined;
  }

  if (value === true) {
    return { rejectUnauthorized: false };
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'require'].includes(normalized)) {
    return { rejectUnauthorized: false };
  }

  if (['strict', 'verify'].includes(normalized)) {
    return { rejectUnauthorized: true };
  }

  return undefined;
}

async function readBootstrapState(seedFile, runtimeFile) {
  const candidates = [runtimeFile, seedFile].filter(Boolean);

  for (const filePath of candidates) {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return migrateStoreState(JSON.parse(raw)).state;
    } catch (error) {
      if (error?.code === 'ENOENT') {
        continue;
      }

      throw error;
    }
  }

  throw new Error('No bootstrap state file was found for the postgres store.');
}

function upsertBy(collection, nextValue, matcher) {
  const index = collection.findIndex((entry) => matcher(entry));

  if (index >= 0) {
    collection[index] = { ...collection[index], ...clone(nextValue) };
    return collection[index];
  }

  const inserted = clone(nextValue);
  collection.unshift(inserted);
  return inserted;
}

async function ensureSchema(pool) {
  const statements = [
    `
      CREATE TABLE IF NOT EXISTS ares_users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL DEFAULT '{}'::jsonb
      )
    `,
    `
      CREATE UNIQUE INDEX IF NOT EXISTS ares_users_email_unique_idx
      ON ares_users (email)
      WHERE email <> ''
    `,
    `
      CREATE TABLE IF NOT EXISTS ares_organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL DEFAULT '{}'::jsonb
      )
    `,
    `
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
      )
    `,
    `
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
      )
    `,
    `
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
      )
    `,
    `
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
      )
    `,
    `
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
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS ares_library (
        project_id TEXT NOT NULL REFERENCES ares_projects(id) ON DELETE CASCADE,
        paper_id TEXT NOT NULL,
        payload JSONB NOT NULL,
        saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (project_id, paper_id)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS ares_reading_queue (
        project_id TEXT NOT NULL REFERENCES ares_projects(id) ON DELETE CASCADE,
        paper_id TEXT NOT NULL,
        payload JSONB NOT NULL,
        queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (project_id, paper_id)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS ares_reading_sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES ares_projects(id) ON DELETE CASCADE,
        paper_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'todo',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL,
        UNIQUE (project_id, paper_id)
      )
    `,
    `
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
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS ares_project_assets (
        collection_name TEXT NOT NULL,
        id TEXT NOT NULL,
        project_id TEXT NOT NULL REFERENCES ares_projects(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL,
        PRIMARY KEY (collection_name, id)
      )
    `,
    'CREATE INDEX IF NOT EXISTS ares_library_project_updated_idx ON ares_library (project_id, updated_at DESC)',
    'CREATE INDEX IF NOT EXISTS ares_reading_queue_project_updated_idx ON ares_reading_queue (project_id, updated_at DESC)',
    'CREATE INDEX IF NOT EXISTS ares_reading_sessions_project_updated_idx ON ares_reading_sessions (project_id, updated_at DESC)',
    'CREATE INDEX IF NOT EXISTS ares_reading_sessions_project_paper_idx ON ares_reading_sessions (project_id, paper_id)',
    'CREATE INDEX IF NOT EXISTS ares_agent_runs_project_updated_idx ON ares_agent_runs (project_id, updated_at DESC)',
    'CREATE INDEX IF NOT EXISTS ares_agent_runs_project_stage_idx ON ares_agent_runs (project_id, stage, updated_at DESC)',
    'CREATE INDEX IF NOT EXISTS ares_agent_runs_claim_idx ON ares_agent_runs (status, lease_expires_at, created_at ASC)',
    'CREATE INDEX IF NOT EXISTS ares_project_assets_collection_project_updated_idx ON ares_project_assets (collection_name, project_id, updated_at DESC)',
    'CREATE INDEX IF NOT EXISTS ares_project_access_project_idx ON ares_project_access (project_id, user_id)',
    'CREATE INDEX IF NOT EXISTS ares_memberships_user_idx ON ares_memberships (user_id, organization_id)',
    'CREATE INDEX IF NOT EXISTS ares_auth_sessions_token_idx ON ares_auth_sessions (token)',
    'CREATE INDEX IF NOT EXISTS ares_audit_events_project_created_idx ON ares_audit_events (project_id, created_at DESC)',
  ];

  for (const statement of statements) {
    await pool.query(statement);
  }
}

async function importBootstrapState(client, state) {
  for (const user of state.users || []) {
    const normalized = normalizeUser(user);
    await client.query(
      `
        INSERT INTO ares_users (id, email, status, created_at, updated_at, payload)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          status = EXCLUDED.status,
          updated_at = EXCLUDED.updated_at,
          payload = EXCLUDED.payload
      `,
      [
        normalized.id,
        normalized.email,
        normalized.status,
        normalized.createdAt,
        normalized.updatedAt,
        jsonPayload(normalized),
      ],
    );
  }

  for (const organization of state.organizations || []) {
    const normalized = normalizeOrganization(organization);
    await client.query(
      `
        INSERT INTO ares_organizations (id, name, status, created_at, updated_at, payload)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          status = EXCLUDED.status,
          updated_at = EXCLUDED.updated_at,
          payload = EXCLUDED.payload
      `,
      [
        normalized.id,
        normalized.name,
        normalized.status,
        normalized.createdAt,
        normalized.updatedAt,
        jsonPayload(normalized),
      ],
    );
  }

  for (const membership of state.memberships || []) {
    const normalized = normalizeMembership(membership);
    await client.query(
      `
        INSERT INTO ares_memberships (id, organization_id, user_id, role, status, created_at, updated_at, payload)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        ON CONFLICT (organization_id, user_id) DO UPDATE SET
          role = EXCLUDED.role,
          status = EXCLUDED.status,
          updated_at = EXCLUDED.updated_at,
          payload = EXCLUDED.payload
      `,
      [
        normalized.id,
        normalized.organizationId,
        normalized.userId,
        normalized.role,
        normalized.status,
        normalized.createdAt,
        normalized.updatedAt,
        jsonPayload(normalized),
      ],
    );
  }

  for (const project of state.projects) {
    await client.query(
      `
        INSERT INTO ares_projects (id, name, color, focus, default_query, keywords, payload)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          color = EXCLUDED.color,
          focus = EXCLUDED.focus,
          default_query = EXCLUDED.default_query,
          keywords = EXCLUDED.keywords,
          payload = EXCLUDED.payload,
          updated_at = NOW()
      `,
      [
        project.id,
        project.name,
        project.color,
        project.focus,
        project.defaultQuery,
        jsonPayload(ensureStringArray(project.keywords)),
        jsonPayload(project),
      ],
    );
  }

  for (const access of state.projectAccess || []) {
    const normalized = normalizeProjectAccess(access);
    await client.query(
      `
        INSERT INTO ares_project_access (id, project_id, user_id, role, status, created_at, updated_at, payload)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        ON CONFLICT (project_id, user_id) DO UPDATE SET
          role = EXCLUDED.role,
          status = EXCLUDED.status,
          updated_at = EXCLUDED.updated_at,
          payload = EXCLUDED.payload
      `,
      [
        normalized.id,
        normalized.projectId,
        normalized.userId,
        normalized.role,
        normalized.status,
        normalized.createdAt,
        normalized.updatedAt,
        jsonPayload(normalized),
      ],
    );
  }

  for (const [projectId, papers] of Object.entries(state.library || {})) {
    for (const paper of papers) {
      await client.query(
        `
          INSERT INTO ares_library (project_id, paper_id, payload, saved_at, updated_at)
          VALUES ($1, $2, $3::jsonb, $4, $5)
          ON CONFLICT (project_id, paper_id) DO UPDATE SET
            payload = EXCLUDED.payload,
            saved_at = EXCLUDED.saved_at,
            updated_at = EXCLUDED.updated_at
        `,
        [projectId, paper.paperId, jsonPayload(paper), paper.savedAt || nowIso(), paper.updatedAt || paper.savedAt || nowIso()],
      );
    }
  }

  for (const [projectId, queueEntries] of Object.entries(state.readingQueue || {})) {
    for (const entry of queueEntries) {
      await client.query(
        `
          INSERT INTO ares_reading_queue (project_id, paper_id, payload, queued_at, updated_at)
          VALUES ($1, $2, $3::jsonb, $4, $5)
          ON CONFLICT (project_id, paper_id) DO UPDATE SET
            payload = EXCLUDED.payload,
            queued_at = EXCLUDED.queued_at,
            updated_at = EXCLUDED.updated_at
        `,
        [projectId, entry.paperId, jsonPayload(entry), entry.queuedAt || nowIso(), entry.updatedAt || entry.queuedAt || nowIso()],
      );
    }
  }

  for (const session of state.readingSessions || []) {
    await client.query(
      `
        INSERT INTO ares_reading_sessions (id, project_id, paper_id, status, created_at, updated_at, payload)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        ON CONFLICT (project_id, paper_id) DO UPDATE SET
          id = EXCLUDED.id,
          status = EXCLUDED.status,
          updated_at = EXCLUDED.updated_at,
          payload = EXCLUDED.payload
      `,
      [
        session.id,
        session.projectId,
        session.paperId,
        normaliseStatus(session.status, 'todo'),
        session.createdAt || nowIso(),
        session.updatedAt || nowIso(),
        jsonPayload(session),
      ],
    );
  }

  for (const run of state.agentRuns || []) {
    await client.query(
      `
        INSERT INTO ares_agent_runs (
          id,
          project_id,
          stage,
          task_kind,
          status,
          created_at,
          updated_at,
          started_at,
          finished_at,
          payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          stage = EXCLUDED.stage,
          task_kind = EXCLUDED.task_kind,
          status = EXCLUDED.status,
          updated_at = EXCLUDED.updated_at,
          started_at = EXCLUDED.started_at,
          finished_at = EXCLUDED.finished_at,
          payload = EXCLUDED.payload
      `,
      [
        run.id,
        run.projectId,
        run.stage || '',
        run.taskKind || '',
        normaliseStatus(run.status, 'todo'),
        run.createdAt || nowIso(),
        run.updatedAt || nowIso(),
        run.startedAt || null,
        run.finishedAt || null,
        jsonPayload(run),
      ],
    );
  }

  for (const collectionName of ASSET_COLLECTIONS.filter((entry) => entry !== 'agentRuns' && entry !== 'readingSessions')) {
    for (const asset of state[collectionName] || []) {
      await client.query(
        `
          INSERT INTO ares_project_assets (collection_name, id, project_id, created_at, updated_at, payload)
          VALUES ($1, $2, $3, $4, $5, $6::jsonb)
          ON CONFLICT (collection_name, id) DO UPDATE SET
            project_id = EXCLUDED.project_id,
            updated_at = EXCLUDED.updated_at,
            payload = EXCLUDED.payload
        `,
        [collectionName, asset.id, asset.projectId, asset.createdAt || nowIso(), asset.updatedAt || nowIso(), jsonPayload(asset)],
      );
    }
  }
}

async function seedDatabaseIfEmpty(pool, { seedFile, runtimeFile }) {
  const result = await pool.query('SELECT COUNT(*)::int AS count FROM ares_projects');
  const count = Number(result.rows[0]?.count) || 0;
  if (count > 0) {
    return false;
  }

  const state = await readBootstrapState(seedFile, runtimeFile);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await importBootstrapState(client, state);
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function inflateProject(row) {
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
  return {
    ...clone(payload),
    color: ensureText(row.color, payload.color || ''),
    defaultQuery: ensureText(row.default_query, payload.defaultQuery || ''),
    focus: ensureText(row.focus, payload.focus || ''),
    id: ensureText(row.id, payload.id || ''),
    keywords: ensureStringArray(row.keywords, 16).length
      ? ensureStringArray(row.keywords, 16)
      : ensureStringArray(payload.keywords, 16),
    name: ensureText(row.name, payload.name || ''),
  };
}

function inflatePayload(row, extra = {}) {
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  return {
    ...clone(payload),
    ...extra,
  };
}

function inflateAgentRunRow(row) {
  return inflatePayload(row, {
    createdAt: toIsoString(row.created_at),
    finishedAt: toIsoString(row.finished_at),
    heartbeatAt: toIsoString(row.heartbeat_at) || null,
    id: ensureText(row.id),
    leaseExpiresAt: toIsoString(row.lease_expires_at) || null,
    leaseOwner: ensureText(row.lease_owner),
    profileId: ensureText(row.payload?.profileId || ''),
    projectId: ensureText(row.project_id),
    stage: ensureText(row.stage),
    startedAt: toIsoString(row.started_at),
    status: normaliseStatus(row.status, 'todo'),
    taskKind: ensureText(row.task_kind),
    updatedAt: toIsoString(row.updated_at),
  });
}

async function loadState(pool) {
  const usersResult = await pool.query(
    `
      SELECT id, email, status, created_at, updated_at, payload
      FROM ares_users
      ORDER BY created_at ASC
    `,
  );
  const organizationsResult = await pool.query(
    `
      SELECT id, name, status, created_at, updated_at, payload
      FROM ares_organizations
      ORDER BY created_at ASC
    `,
  );
  const membershipsResult = await pool.query(
    `
      SELECT id, organization_id, user_id, role, status, created_at, updated_at, payload
      FROM ares_memberships
      ORDER BY created_at ASC
    `,
  );
  const projectsResult = await pool.query(
    `
      SELECT id, name, color, focus, default_query, keywords, payload
      FROM ares_projects
      ORDER BY id ASC
    `,
  );
  const libraryResult = await pool.query(
    `
      SELECT project_id, paper_id, payload, saved_at, updated_at
      FROM ares_library
      ORDER BY updated_at DESC
    `,
  );
  const queueResult = await pool.query(
    `
      SELECT project_id, paper_id, payload, queued_at, updated_at
      FROM ares_reading_queue
      ORDER BY updated_at DESC
    `,
  );
  const readingSessionsResult = await pool.query(
    `
      SELECT id, project_id, paper_id, status, created_at, updated_at, payload
      FROM ares_reading_sessions
      ORDER BY updated_at DESC
    `,
  );
  const agentRunsResult = await pool.query(
    `
      SELECT id, project_id, stage, task_kind, status, created_at, updated_at, started_at, finished_at, lease_owner, lease_expires_at, heartbeat_at, payload
      FROM ares_agent_runs
      ORDER BY updated_at DESC
    `,
  );
  const projectAssetsResult = await pool.query(
    `
      SELECT collection_name, id, project_id, created_at, updated_at, payload
      FROM ares_project_assets
      ORDER BY updated_at DESC
    `,
  );
  const projectAccessResult = await pool.query(
    `
      SELECT id, project_id, user_id, role, status, created_at, updated_at, payload
      FROM ares_project_access
      ORDER BY created_at ASC
    `,
  );
  const authSessionsResult = await pool.query(
    `
      SELECT id, user_id, token, csrf_token, expires_at, revoked_at, last_seen_at, created_at, updated_at, payload
      FROM ares_auth_sessions
      ORDER BY created_at DESC
    `,
  );
  const auditEventsResult = await pool.query(
    `
      SELECT id, project_id, actor_user_id, action, target_type, target_id, reason, created_at, payload
      FROM ares_audit_events
      ORDER BY created_at DESC
    `,
  );

  const state = migrateStoreState({
    projects: projectsResult.rows.map(inflateProject),
  }).state;

  state.users = usersResult.rows.map((row) =>
    inflatePayload(row, {
      createdAt: toIsoString(row.created_at),
      email: ensureText(row.email),
      id: ensureText(row.id),
      status: ensureText(row.status, 'active'),
      updatedAt: toIsoString(row.updated_at),
    }),
  );
  state.organizations = organizationsResult.rows.map((row) =>
    inflatePayload(row, {
      createdAt: toIsoString(row.created_at),
      id: ensureText(row.id),
      name: ensureText(row.name),
      status: ensureText(row.status, 'active'),
      updatedAt: toIsoString(row.updated_at),
    }),
  );
  state.memberships = membershipsResult.rows.map((row) =>
    inflatePayload(row, {
      createdAt: toIsoString(row.created_at),
      id: ensureText(row.id),
      organizationId: ensureText(row.organization_id),
      role: ensureText(row.role, 'viewer'),
      status: ensureText(row.status, 'active'),
      updatedAt: toIsoString(row.updated_at),
      userId: ensureText(row.user_id),
    }),
  );
  state.projectAccess = projectAccessResult.rows.map((row) =>
    inflatePayload(row, {
      createdAt: toIsoString(row.created_at),
      id: ensureText(row.id),
      projectId: ensureText(row.project_id),
      role: ensureText(row.role, 'viewer'),
      status: ensureText(row.status, 'active'),
      updatedAt: toIsoString(row.updated_at),
      userId: ensureText(row.user_id),
    }),
  );
  state.authSessions = authSessionsResult.rows.map((row) =>
    inflatePayload(row, {
      createdAt: toIsoString(row.created_at),
      csrfToken: ensureText(row.csrf_token),
      expiresAt: toIsoString(row.expires_at) || '',
      id: ensureText(row.id),
      lastSeenAt: toIsoString(row.last_seen_at) || '',
      revokedAt: toIsoString(row.revoked_at) || '',
      token: ensureText(row.token),
      updatedAt: toIsoString(row.updated_at),
      userId: ensureText(row.user_id),
    }),
  );
  state.auditEvents = auditEventsResult.rows.map((row) =>
    inflatePayload(row, {
      action: ensureText(row.action),
      actorUserId: ensureText(row.actor_user_id),
      createdAt: toIsoString(row.created_at),
      id: ensureText(row.id),
      projectId: ensureText(row.project_id),
      reason: ensureText(row.reason),
      targetId: ensureText(row.target_id),
      targetType: ensureText(row.target_type),
    }),
  );

  for (const row of libraryResult.rows) {
    state.library[row.project_id] ||= [];
    state.library[row.project_id].push(
      inflatePayload(row, {
        paperId: ensureText(row.paper_id),
        savedAt: toIsoString(row.saved_at),
        updatedAt: toIsoString(row.updated_at),
      }),
    );
  }

  for (const row of queueResult.rows) {
    state.readingQueue[row.project_id] ||= [];
    state.readingQueue[row.project_id].push(
      inflatePayload(row, {
        paperId: ensureText(row.paper_id),
        queuedAt: toIsoString(row.queued_at),
        updatedAt: toIsoString(row.updated_at),
      }),
    );
  }

  for (const row of readingSessionsResult.rows) {
    state.readingSessions.push(
      inflatePayload(row, {
        createdAt: toIsoString(row.created_at),
        id: ensureText(row.id),
        paperId: ensureText(row.paper_id),
        projectId: ensureText(row.project_id),
        status: normaliseStatus(row.status, 'todo'),
        updatedAt: toIsoString(row.updated_at),
      }),
    );
  }

  for (const row of agentRunsResult.rows) {
    state.agentRuns.push(inflateAgentRunRow(row));
  }

  for (const row of projectAssetsResult.rows) {
    if (!ASSET_COLLECTIONS.includes(row.collection_name) || row.collection_name === 'agentRuns' || row.collection_name === 'readingSessions') {
      continue;
    }

    state[row.collection_name].push(
      inflatePayload(row, {
        createdAt: toIsoString(row.created_at),
        id: ensureText(row.id),
        projectId: ensureText(row.project_id),
        updatedAt: toIsoString(row.updated_at),
      }),
    );
  }

  return state;
}

async function upsertLibraryRow(pool, projectId, paper) {
  await pool.query(
    `
      INSERT INTO ares_library (project_id, paper_id, payload, saved_at, updated_at)
      VALUES ($1, $2, $3::jsonb, $4, $5)
      ON CONFLICT (project_id, paper_id) DO UPDATE SET
        payload = EXCLUDED.payload,
        saved_at = EXCLUDED.saved_at,
        updated_at = EXCLUDED.updated_at
    `,
    [projectId, paper.paperId, jsonPayload(paper), paper.savedAt || nowIso(), paper.updatedAt || paper.savedAt || nowIso()],
  );
}

async function upsertQueueRow(pool, projectId, entry) {
  await pool.query(
    `
      INSERT INTO ares_reading_queue (project_id, paper_id, payload, queued_at, updated_at)
      VALUES ($1, $2, $3::jsonb, $4, $5)
      ON CONFLICT (project_id, paper_id) DO UPDATE SET
        payload = EXCLUDED.payload,
        queued_at = EXCLUDED.queued_at,
        updated_at = EXCLUDED.updated_at
    `,
    [projectId, entry.paperId, jsonPayload(entry), entry.queuedAt || nowIso(), entry.updatedAt || entry.queuedAt || nowIso()],
  );
}

async function upsertReadingSessionRow(pool, session) {
  await pool.query(
    `
      INSERT INTO ares_reading_sessions (id, project_id, paper_id, status, created_at, updated_at, payload)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      ON CONFLICT (project_id, paper_id) DO UPDATE SET
        id = EXCLUDED.id,
        status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at,
        payload = EXCLUDED.payload
    `,
    [
      session.id,
      session.projectId,
      session.paperId,
      normaliseStatus(session.status, 'todo'),
      session.createdAt || nowIso(),
      session.updatedAt || nowIso(),
      jsonPayload(session),
    ],
  );
}

async function upsertAgentRunRow(pool, run) {
  await pool.query(
    `
      INSERT INTO ares_agent_runs (
        id,
        project_id,
        stage,
        task_kind,
        status,
        created_at,
        updated_at,
        started_at,
        finished_at,
        lease_owner,
        lease_expires_at,
        heartbeat_at,
        payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        stage = EXCLUDED.stage,
        task_kind = EXCLUDED.task_kind,
        status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at,
        started_at = EXCLUDED.started_at,
        finished_at = EXCLUDED.finished_at,
        lease_owner = EXCLUDED.lease_owner,
        lease_expires_at = EXCLUDED.lease_expires_at,
        heartbeat_at = EXCLUDED.heartbeat_at,
        payload = EXCLUDED.payload
    `,
    [
      run.id,
      run.projectId,
      run.stage || '',
      run.taskKind || '',
      normaliseStatus(run.status, 'todo'),
      run.createdAt || nowIso(),
      run.updatedAt || nowIso(),
      run.startedAt || null,
      run.finishedAt || null,
      ensureText(run.leaseOwner),
      run.leaseExpiresAt || null,
      run.heartbeatAt || null,
      jsonPayload(run),
    ],
  );
}

async function upsertProjectAssetRow(pool, collectionName, asset) {
  await pool.query(
    `
      INSERT INTO ares_project_assets (collection_name, id, project_id, created_at, updated_at, payload)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      ON CONFLICT (collection_name, id) DO UPDATE SET
        project_id = EXCLUDED.project_id,
        updated_at = EXCLUDED.updated_at,
        payload = EXCLUDED.payload
    `,
    [collectionName, asset.id, asset.projectId, asset.createdAt || nowIso(), asset.updatedAt || nowIso(), jsonPayload(asset)],
  );
}

async function upsertUserRow(pool, user) {
  await pool.query(
    `
      INSERT INTO ares_users (id, email, status, created_at, updated_at, payload)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at,
        payload = EXCLUDED.payload
    `,
    [user.id, user.email, user.status, user.createdAt || nowIso(), user.updatedAt || nowIso(), jsonPayload(user)],
  );
}

async function upsertOrganizationRow(pool, organization) {
  await pool.query(
    `
      INSERT INTO ares_organizations (id, name, status, created_at, updated_at, payload)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at,
        payload = EXCLUDED.payload
    `,
    [
      organization.id,
      organization.name,
      organization.status,
      organization.createdAt || nowIso(),
      organization.updatedAt || nowIso(),
      jsonPayload(organization),
    ],
  );
}

async function upsertMembershipRow(pool, membership) {
  await pool.query(
    `
      INSERT INTO ares_memberships (id, organization_id, user_id, role, status, created_at, updated_at, payload)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      ON CONFLICT (organization_id, user_id) DO UPDATE SET
        role = EXCLUDED.role,
        status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at,
        payload = EXCLUDED.payload
    `,
    [
      membership.id,
      membership.organizationId,
      membership.userId,
      membership.role,
      membership.status,
      membership.createdAt || nowIso(),
      membership.updatedAt || nowIso(),
      jsonPayload(membership),
    ],
  );
}

async function upsertProjectAccessRow(pool, access) {
  await pool.query(
    `
      INSERT INTO ares_project_access (id, project_id, user_id, role, status, created_at, updated_at, payload)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      ON CONFLICT (project_id, user_id) DO UPDATE SET
        role = EXCLUDED.role,
        status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at,
        payload = EXCLUDED.payload
    `,
    [
      access.id,
      access.projectId,
      access.userId,
      access.role,
      access.status,
      access.createdAt || nowIso(),
      access.updatedAt || nowIso(),
      jsonPayload(access),
    ],
  );
}

async function upsertAuthSessionRow(pool, session) {
  await pool.query(
    `
      INSERT INTO ares_auth_sessions (
        id, user_id, token, csrf_token, expires_at, revoked_at, last_seen_at, created_at, updated_at, payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        token = EXCLUDED.token,
        csrf_token = EXCLUDED.csrf_token,
        expires_at = EXCLUDED.expires_at,
        revoked_at = EXCLUDED.revoked_at,
        last_seen_at = EXCLUDED.last_seen_at,
        updated_at = EXCLUDED.updated_at,
        payload = EXCLUDED.payload
    `,
    [
      session.id,
      session.userId,
      session.token,
      session.csrfToken,
      session.expiresAt || null,
      session.revokedAt || null,
      session.lastSeenAt || null,
      session.createdAt || nowIso(),
      session.updatedAt || nowIso(),
      jsonPayload(session),
    ],
  );
}

async function insertAuditEventRow(pool, event) {
  await pool.query(
    `
      INSERT INTO ares_audit_events (
        id, project_id, actor_user_id, action, target_type, target_id, reason, created_at, payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
    `,
    [
      event.id,
      event.projectId,
      event.actorUserId,
      event.action,
      event.targetType,
      event.targetId,
      event.reason,
      event.createdAt || nowIso(),
      jsonPayload(event),
    ],
  );
}

export async function createPostgresStore({
  databaseSsl,
  databaseUrl,
  runtimeFile,
  seedFile,
  migrate = true,
  poolConfig = {},
  PoolImpl = Pool,
} = {}) {
  if (!databaseUrl) {
    throw new Error('databaseUrl is required to create the postgres store.');
  }

  const pool = new PoolImpl({
    ...poolConfig,
    connectionString: databaseUrl,
    ssl: resolveSslConfig(databaseSsl),
  });

  if (migrate) {
    await runPostgresMigrations(pool, POSTGRES_MIGRATIONS);
  } else {
    await assertPostgresMigrationsApplied(pool, POSTGRES_MIGRATIONS);
  }
  await seedDatabaseIfEmpty(pool, {
    runtimeFile,
    seedFile,
  });

  let state = await loadState(pool);

  function ensureProject(projectId) {
    const project = state.projects.find((entry) => entry.id === projectId);
    if (!project) {
      throw new Error(`Unknown project: ${projectId}`);
    }

    state.library[projectId] ||= [];
    state.readingQueue[projectId] ||= [];

    return project;
  }

  function libraryFor(projectId) {
    ensureProject(projectId);
    return state.library[projectId];
  }

  function queueFor(projectId) {
    ensureProject(projectId);
    return state.readingQueue[projectId];
  }

  function collectionFor(name) {
    if (!ASSET_COLLECTIONS.includes(name)) {
      throw new Error(`Unknown store collection: ${name}`);
    }

    state[name] ||= [];
    return state[name];
  }

  function identityCollectionFor(name) {
    if (!IDENTITY_COLLECTIONS.includes(name)) {
      throw new Error(`Unknown identity collection: ${name}`);
    }

    state[name] ||= [];
    return state[name];
  }

  function upsertIdentity(collectionName, input, normalize, matcher) {
    const collection = identityCollectionFor(collectionName);
    const existingIndex = collection.findIndex((entry) => matcher(entry));
    const existing = existingIndex >= 0 ? collection[existingIndex] : null;
    const next = normalize(input, existing || null);
    if (existingIndex >= 0) {
      collection[existingIndex] = next;
    } else {
      collection.unshift(next);
    }
    return next;
  }

  function projectSummary(project) {
    const library = libraryFor(project.id);
    const queue = queueFor(project.id);
    const readingSessions = state.readingSessions.filter((entry) => entry.projectId === project.id);
    const activeRuns = state.agentRuns.filter(
      (entry) => entry.projectId === project.id && RUNNING_STATUSES.has(normaliseStatus(entry.status)),
    );

    return {
      ...clone(project),
      activeRunCount: activeRuns.length,
      libraryCount: library.length,
      queueCount: queue.length,
      readingSessionCount: readingSessions.length,
      recentLibrary: clone(library.slice(0, 3)),
      recentReadingSessions: clone(readingSessions.sort(sortByUpdatedDesc).slice(0, 3)),
    };
  }

  function getCollectionItem(name, id) {
    if (!id) {
      return null;
    }

    const match = collectionFor(name).find((entry) => entry.id === id);
    return match ? clone(match) : null;
  }

  function listCollection(name, { projectId, filters = {} } = {}) {
    let values = collectionFor(name);

    if (projectId) {
      ensureProject(projectId);
      values = values.filter((entry) => entry.projectId === projectId);
    }

    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }

      values = values.filter((entry) => entry?.[key] === value);
    }

    return clone(values.slice().sort(sortByUpdatedDesc));
  }

  function findReadingSessionByPaper(projectId, paperId) {
    ensureProject(projectId);
    return (
      state.readingSessions.find((entry) => entry.projectId === projectId && entry.paperId === paperId) || null
    );
  }

  function getPaper(projectId, paperId) {
    ensureProject(projectId);

    const saved = libraryFor(projectId).find((entry) => entry.paperId === paperId);
    if (saved) {
      return clone(saved);
    }

    const queued = queueFor(projectId).find((entry) => entry.paperId === paperId);
    if (queued) {
      return clone(queued);
    }

    const session = findReadingSessionByPaper(projectId, paperId);
    if (session) {
      const normalized = normaliseReadingSession(session);
      return {
        abstract: normalized.abstract || '',
        authors: ensureStringArray(normalized.authors, 8),
        citedByCount: Number(normalized.citedByCount) || 0,
        keyPoints: ensureStringArray(normalized.keyPoints, 6),
        keywords: ensureStringArray(normalized.keywords, 8),
        matchedKeywords: ensureStringArray(normalized.matchedKeywords, 8),
        openAccess: Boolean(normalized.openAccess),
        paperId: normalized.paperId,
        paperUrl: normalized.paperUrl || null,
        pdfUrl: normalized.pdfUrl || null,
        relevance: Number(normalized.relevance) || 0,
        sourceName: normalized.sourceName || 'Reading session',
        sourceProvider: normalized.sourceProvider || 'reading',
        summary: normalized.summary || normalized.summaryCards?.tldr || '',
        title: normalized.title,
        venue: normalized.venue || 'Unknown',
        year: normalized.year ?? null,
      };
    }

    return null;
  }

  function listGraphPapers(projectId) {
    const papers = new Map();

    for (const paper of [...libraryFor(projectId), ...queueFor(projectId)]) {
      const normalized = normalisePaper(paper, { projectId });
      papers.set(normalized.paperId, normalized);
    }

    for (const session of listCollection('readingSessions', { projectId })) {
      const normalized = normaliseReadingSession(session);
      const paper = normalisePaper(
        {
          abstract: normalized.abstract,
          authors: normalized.authors,
          createdAt: normalized.createdAt,
          keywords: normalized.keywords,
          paperId: normalized.paperId,
          paperUrl: normalized.paperUrl,
          pdfUrl: normalized.pdfUrl,
          sourceProvider: normalized.sourceProvider || 'reading',
          status: normalized.status,
          summary: normalized.summary,
          title: normalized.title,
          updatedAt: normalized.updatedAt,
          venue: normalized.venue,
          year: normalized.year,
        },
        { projectId },
      );
      papers.set(paper.paperId, { ...papers.get(paper.paperId), ...paper });
    }

    return Array.from(papers.values()).sort(sortByUpdatedDesc);
  }

  function getProjectGraph(projectId) {
    const project = projectSummary(ensureProject(projectId));
    const researchQuestions = listCollection('researchQuestions', { projectId });
    return {
      drafts: listCollection('drafts', { projectId }),
      draftSections: listCollection('draftSections', { projectId }),
      evidenceLinks: listCollection('evidenceLinks', { projectId }),
      experimentRuns: listCollection('experimentRuns', { projectId }),
      graphVersion: 1,
      insightCards: listCollection('insightCards', { projectId }),
      papers: listGraphPapers(projectId),
      project,
      readingPackets: listCollection('readingPackets', { projectId }),
      reproductionPlans: listCollection('reproductionPlans', { projectId }),
      researchQuestions: researchQuestions.length
        ? researchQuestions
        : [
            normaliseAsset('researchQuestions', {
              id: `question-${project.id}-default`,
              projectId,
              prompt: project.defaultQuery || project.focus || project.name,
              status: 'active',
              title: project.focus || project.defaultQuery || `${project.name} question`,
            }),
          ],
      resultDossiers: listCollection('resultDossiers', { projectId }),
    };
  }

  return {
    backend: 'postgres',

    getBackendInfo() {
      return {
        backend: 'postgres',
        connectionString: maskConnectionString(databaseUrl),
      };
    },

    async close() {
      await pool.end();
    },

    getProjects() {
      return state.projects.map(projectSummary);
    },

    listUsers() {
      return clone(identityCollectionFor('users'));
    },

    listAuditEvents({ projectId, action, actorUserId } = {}) {
      let values = state.auditEvents || [];
      if (projectId) {
        values = values.filter((entry) => entry.projectId === projectId);
      }
      if (action) {
        values = values.filter((entry) => entry.action === action);
      }
      if (actorUserId) {
        values = values.filter((entry) => entry.actorUserId === actorUserId);
      }
      return clone(values.slice().sort(sortByUpdatedDesc));
    },

    async recordAuditEvent(input) {
      const event = normalizeAuditEvent(input);
      state.auditEvents.unshift(event);
      await insertAuditEventRow(pool, event);
      return clone(event);
    },

    getUser(userId) {
      const match = identityCollectionFor('users').find((entry) => entry.id === userId || entry.email === userId);
      return match ? clone(match) : null;
    },

    async upsertUser(input) {
      const next = upsertIdentity('users', input, normalizeUser, (entry) => {
        const id = String(input.id || input.userId || '').trim();
        const email = String(input.email || '').trim();
        return (id && entry.id === id) || (email && entry.email === email);
      });
      await upsertUserRow(pool, next);
      return clone(next);
    },

    listOrganizations() {
      return clone(identityCollectionFor('organizations'));
    },

    getOrganization(organizationId) {
      const match = identityCollectionFor('organizations').find((entry) => entry.id === organizationId);
      return match ? clone(match) : null;
    },

    async upsertOrganization(input) {
      const next = upsertIdentity('organizations', input, normalizeOrganization, (entry) => {
        const id = String(input.id || input.organizationId || '').trim();
        return id && entry.id === id;
      });
      await upsertOrganizationRow(pool, next);
      return clone(next);
    },

    listMemberships({ organizationId, userId } = {}) {
      let values = identityCollectionFor('memberships');
      if (organizationId) {
        values = values.filter((entry) => entry.organizationId === organizationId);
      }
      if (userId) {
        values = values.filter((entry) => entry.userId === userId);
      }
      return clone(values);
    },

    async upsertMembership(input) {
      const next = upsertIdentity('memberships', input, normalizeMembership, (entry) => {
        const id = String(input.id || '').trim();
        return (
          (id && entry.id === id) ||
          (entry.organizationId === input.organizationId && entry.userId === input.userId)
        );
      });
      await upsertMembershipRow(pool, next);
      return clone(next);
    },

    listProjectAccess({ projectId, userId } = {}) {
      let values = identityCollectionFor('projectAccess');
      if (projectId) {
        values = values.filter((entry) => entry.projectId === projectId);
      }
      if (userId) {
        values = values.filter((entry) => entry.userId === userId);
      }
      return clone(values);
    },

    async upsertProjectAccess(input) {
      ensureProject(input.projectId);
      const next = upsertIdentity('projectAccess', input, normalizeProjectAccess, (entry) => {
        const id = String(input.id || '').trim();
        return (
          (id && entry.id === id) ||
          (entry.projectId === input.projectId && entry.userId === input.userId)
        );
      });
      await upsertProjectAccessRow(pool, next);
      return clone(next);
    },

    async createAuthSession(input) {
      const user = this.getUser(String(input.userId || '').trim());
      if (!user) {
        throw new Error(`Unknown user: ${input.userId}`);
      }
      const session = normalizeAuthSession(input);
      identityCollectionFor('authSessions').unshift(session);
      await upsertAuthSessionRow(pool, session);
      return clone(session);
    },

    getAuthSessionByToken(token) {
      const now = Date.now();
      const match = identityCollectionFor('authSessions').find((entry) => {
        if (entry.token !== token || entry.revokedAt) {
          return false;
        }
        if (!entry.expiresAt) {
          return true;
        }
        return (Date.parse(entry.expiresAt) || 0) > now;
      });
      return match ? clone(match) : null;
    },

    async revokeAuthSession(token) {
      const session = identityCollectionFor('authSessions').find((entry) => entry.token === token && !entry.revokedAt);
      if (!session) {
        return { revoked: false };
      }
      session.revokedAt = nowIso();
      session.updatedAt = nowIso();
      await upsertAuthSessionRow(pool, session);
      return { revoked: true };
    },

    getProject(projectId) {
      return projectSummary(ensureProject(projectId));
    },

    getProjectGraph,

    getLibrary(projectId) {
      return clone(libraryFor(projectId));
    },

    getPaper,

    getSavedPaperIds(projectId) {
      return new Set(libraryFor(projectId).map((paper) => paper.paperId));
    },

    getQueuedPaperIds(projectId) {
      return new Set(queueFor(projectId).map((paper) => paper.paperId));
    },

    getReadingSessions(projectId) {
      return listCollection('readingSessions', { projectId });
    },

    getReadingSession(sessionId) {
      return getCollectionItem('readingSessions', sessionId);
    },

    getReadingSessionByPaper(projectId, paperId) {
      const session = findReadingSessionByPaper(projectId, paperId);
      return session ? clone(session) : null;
    },

    getAgentRun(runId) {
      return getCollectionItem('agentRuns', runId);
    },

    listAgentRuns({ projectId, stage } = {}) {
      return listCollection('agentRuns', {
        projectId,
        filters: {
          stage: stage ? String(stage) : undefined,
        },
      });
    },

    async claimNextAgentRun({ workerId, leaseMs = 60_000, now = new Date(), stages = [] } = {}) {
      const owner = ensureText(workerId);
      if (!owner) {
        throw new Error('workerId is required to claim an agent run.');
      }

      const nowValue = normaliseTimestamp(now);
      const leaseExpiresAt = claimExpiresAt(nowValue, leaseMs);
      const stageValues = ensureStringArray(stages, 32);
      const params = [owner, leaseExpiresAt, nowValue];
      let stageClause = '';

      if (stageValues.length > 0) {
        params.push(stageValues);
        stageClause = `AND stage = ANY($${params.length}::text[])`;
      }

      const result = await pool.query(
        `
          UPDATE ares_agent_runs
          SET
            status = 'running',
            started_at = COALESCE(started_at, $3::timestamptz),
            updated_at = $3::timestamptz,
            lease_owner = $1,
            lease_expires_at = $2::timestamptz,
            heartbeat_at = $3::timestamptz,
            payload = payload || jsonb_build_object(
              'status', 'running',
              'startedAt', COALESCE(payload->>'startedAt', $3::text),
              'updatedAt', $3::text,
              'leaseOwner', $1,
              'leaseExpiresAt', $2::text,
              'heartbeatAt', $3::text
            )
          WHERE id = (
            SELECT id
            FROM ares_agent_runs
            WHERE status = 'queue'
              ${stageClause}
              AND (lease_owner = '' OR lease_expires_at IS NULL OR lease_expires_at <= $3::timestamptz)
            ORDER BY created_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          )
          RETURNING id, project_id, stage, task_kind, status, created_at, updated_at, started_at, finished_at, lease_owner, lease_expires_at, heartbeat_at, payload
        `,
        params,
      );

      if (result.rows.length === 0) {
        return null;
      }

      const claimed = inflateAgentRunRow(result.rows[0]);
      upsertBy(state.agentRuns, claimed, (entry) => entry.id === claimed.id);
      return clone(claimed);
    },

    async releaseAgentRun(runId, { workerId, status = 'queue', now = new Date() } = {}) {
      const existing = state.agentRuns.find((entry) => entry.id === runId);
      if (!existing) {
        throw new Error(`Unknown agent run: ${runId}`);
      }

      const owner = ensureText(workerId);
      if (owner && ensureText(existing.leaseOwner) && ensureText(existing.leaseOwner) !== owner) {
        throw new Error('Agent run lease is owned by another worker.');
      }

      const next = {
        ...existing,
        heartbeatAt: null,
        leaseExpiresAt: null,
        leaseOwner: '',
        status: normaliseStatus(status, existing.status),
        updatedAt: normaliseTimestamp(now),
      };

      upsertBy(state.agentRuns, next, (entry) => entry.id === runId);
      await upsertAgentRunRow(pool, next);
      return clone(next);
    },

    listProjectAssets(projectId, collectionName) {
      return listCollection(collectionName, { projectId });
    },

    getProjectAsset(collectionName, assetId) {
      return getCollectionItem(collectionName, assetId);
    },

    async savePaper(projectId, paper) {
      ensureProject(projectId);
      const library = libraryFor(projectId);
      const nextPaper = {
        ...clone(paper),
        savedAt: nowIso(),
      };
      const index = library.findIndex((entry) => entry.paperId === nextPaper.paperId);

      if (index >= 0) {
        library[index] = { ...library[index], ...nextPaper };
      } else {
        library.unshift(nextPaper);
      }

      await upsertLibraryRow(pool, projectId, nextPaper);
      return clone(nextPaper);
    },

    async removePaper(projectId, paperId) {
      ensureProject(projectId);
      state.library[projectId] = libraryFor(projectId).filter((paper) => paper.paperId !== paperId);
      await pool.query('DELETE FROM ares_library WHERE project_id = $1 AND paper_id = $2', [projectId, paperId]);
      return true;
    },

    async queuePaper(projectId, paper, options = {}) {
      ensureProject(projectId);
      const queue = queueFor(projectId);
      const existing = queue.find((entry) => entry.paperId === paper.paperId) || {};
      const timestamp = existing.queuedAt || nowIso();
      const nextEntry = {
        abstract: ensureText(paper.abstract),
        authors: ensureStringArray(paper.authors, 8),
        keyPoints: ensureStringArray(paper.keyPoints, 6),
        keywords: ensureStringArray(paper.keywords, 8),
        matchedKeywords: ensureStringArray(paper.matchedKeywords, 8),
        openAccess: Boolean(paper.openAccess),
        paperId: String(paper.paperId),
        paperUrl: paper.paperUrl ? String(paper.paperUrl) : null,
        pdfUrl: paper.pdfUrl ? String(paper.pdfUrl) : null,
        queuedAt: timestamp,
        relevance: Number(paper.relevance) || 0,
        runId: options.runId ? String(options.runId) : existing.runId || '',
        sessionId: options.sessionId ? String(options.sessionId) : existing.sessionId || '',
        sourceName: ensureText(paper.sourceName, 'Queued paper'),
        sourceProvider: ensureText(paper.sourceProvider, 'queue'),
        status: normaliseStatus(options.status || existing.status, 'queue'),
        summary: ensureText(paper.summary),
        title: ensureText(paper.title, 'Untitled paper'),
        updatedAt: nowIso(),
        venue: ensureText(paper.venue, 'Unknown'),
        year: paper.year === null || paper.year === undefined || paper.year === '' ? null : Number(paper.year),
      };
      const index = queue.findIndex((entry) => entry.paperId === nextEntry.paperId);

      if (index >= 0) {
        queue[index] = { ...queue[index], ...nextEntry };
      } else {
        queue.unshift(nextEntry);
      }

      await upsertQueueRow(pool, projectId, nextEntry);
      return clone(nextEntry);
    },

    async upsertReadingSession(input) {
      const projectId = String(input.projectId || '').trim();
      const paperId = String(input.paperId || '').trim();
      if (!projectId || !paperId) {
        throw new Error('Reading session requires projectId and paperId.');
      }

      ensureProject(projectId);
      const existing = findReadingSessionByPaper(projectId, paperId);
      const next = normaliseReadingSession(
        {
          ...clone(input),
          updatedAt: nowIso(),
        },
        { existing },
      );

      upsertBy(state.readingSessions, next, (entry) => entry.projectId === projectId && entry.paperId === paperId);
      await upsertReadingSessionRow(pool, next);
      return clone(next);
    },

    async upsertProjectAsset(collectionName, input, options = {}) {
      if (!ASSET_COLLECTIONS.includes(collectionName) || collectionName === 'agentRuns' || collectionName === 'readingSessions') {
        throw new Error(`Unsupported asset collection: ${collectionName}`);
      }

      const projectId = String(input.projectId || '').trim();
      if (!projectId) {
        throw new Error(`${collectionName} requires projectId.`);
      }

      ensureProject(projectId);
      const createdAt = input.createdAt || nowIso();
      const updatedAt = nowIso();
      const id = String(input.id || createId(options.prefix || collectionName.replace(/s$/, '')));
      const matchBy = options.matchBy || 'id';
      const collection = collectionFor(collectionName);
      const previous = collection.find((entry) => entry[matchBy] === input[matchBy]) || null;
      const next = {
        ...normaliseAsset(collectionName, input, {
          prefix: options.prefix || collectionName.replace(/s$/, ''),
          projectId,
        }),
        createdAt,
        id,
        projectId,
        updatedAt,
      };

      const persisted = upsertBy(collection, next, (entry) => entry[matchBy] === next[matchBy]);

      if (previous?.id && previous.id !== persisted.id) {
        await pool.query('DELETE FROM ares_project_assets WHERE collection_name = $1 AND id = $2', [collectionName, previous.id]);
      }

      await upsertProjectAssetRow(pool, collectionName, persisted);
      return clone(persisted);
    },

    async deleteProjectAsset(collectionName, id, { projectId } = {}) {
      if (!ASSET_COLLECTIONS.includes(collectionName) || collectionName === 'agentRuns' || collectionName === 'readingSessions') {
        throw new Error(`Unsupported asset collection: ${collectionName}`);
      }

      const assetId = String(id || '').trim();
      if (!assetId) {
        throw new Error(`${collectionName} id is required.`);
      }

      const collection = collectionFor(collectionName);
      const index = collection.findIndex((entry) => {
        if (entry.id !== assetId) {
          return false;
        }

        return !projectId || entry.projectId === projectId;
      });

      if (index < 0) {
        return { deleted: false, id: assetId };
      }

      collection.splice(index, 1);
      const changedReferenceAssets = [];
      if (collectionName === 'insightCards') {
        for (const section of collectionFor('draftSections')) {
          if (projectId && section.projectId !== projectId) {
            continue;
          }

          const nextInsightCardIds = removeAssetId(section.insightCardIds, assetId);
          if (nextInsightCardIds.length !== (section.insightCardIds || []).length) {
            section.insightCardIds = nextInsightCardIds;
            section.updatedAt = nowIso();
            changedReferenceAssets.push(['draftSections', section]);
          }
        }
      }
      if (collectionName === 'evidenceLinks') {
        for (const referenceCollectionName of EVIDENCE_LINK_REFERENCE_COLLECTIONS) {
          for (const asset of collectionFor(referenceCollectionName)) {
            if (projectId && asset.projectId !== projectId) {
              continue;
            }

            const nextEvidenceLinkIds = removeAssetId(asset.evidenceLinkIds, assetId);
            if (nextEvidenceLinkIds.length !== (asset.evidenceLinkIds || []).length) {
              asset.evidenceLinkIds = nextEvidenceLinkIds;
              asset.updatedAt = nowIso();
              changedReferenceAssets.push([referenceCollectionName, asset]);
            }
          }
        }
      }
      const deletedDraftSectionIds = [];
      if (collectionName === 'drafts') {
        const draftSections = collectionFor('draftSections');
        for (let draftSectionIndex = draftSections.length - 1; draftSectionIndex >= 0; draftSectionIndex -= 1) {
          const section = draftSections[draftSectionIndex];
          if (section.draftId !== assetId) {
            continue;
          }

          if (projectId && section.projectId !== projectId) {
            continue;
          }

          deletedDraftSectionIds.push(section.id);
          draftSections.splice(draftSectionIndex, 1);
        }
      }
      if (projectId) {
        await pool.query('DELETE FROM ares_project_assets WHERE collection_name = $1 AND id = $2 AND project_id = $3', [
          collectionName,
          assetId,
          projectId,
        ]);
      } else {
        await pool.query('DELETE FROM ares_project_assets WHERE collection_name = $1 AND id = $2', [
          collectionName,
          assetId,
        ]);
      }
      for (const [referenceCollectionName, asset] of changedReferenceAssets) {
        await upsertProjectAssetRow(pool, referenceCollectionName, asset);
      }
      for (const draftSectionId of deletedDraftSectionIds) {
        if (projectId) {
          await pool.query('DELETE FROM ares_project_assets WHERE collection_name = $1 AND id = $2 AND project_id = $3', [
            'draftSections',
            draftSectionId,
            projectId,
          ]);
        } else {
          await pool.query('DELETE FROM ares_project_assets WHERE collection_name = $1 AND id = $2', [
            'draftSections',
            draftSectionId,
          ]);
        }
      }
      return { deleted: true, id: assetId };
    },

    async createAgentRun(input) {
      const projectId = String(input.projectId || '').trim();
      if (!projectId) {
        throw new Error('Agent run requires projectId.');
      }

      ensureProject(projectId);
      const createdAt = input.createdAt || nowIso();
      const next = {
        agent: ensureText(input.agent, 'Agent'),
        assetRefs: ensureObjectArray(input.assetRefs),
        candidateAssetIds: ensureStringArray(input.candidateAssetIds, 128),
        cancelReason: ensureText(input.cancelReason),
        cancelRequestedAt: input.cancelRequestedAt || null,
        createdAt,
        createdAssetIds: ensureStringArray(input.createdAssetIds, 128),
        error: ensureText(input.error),
        finishedAt: input.finishedAt || null,
        id: String(input.id || createId('run')),
        input: cloneMaybe(input.input, {}),
        heartbeatAt: input.heartbeatAt || null,
        leaseExpiresAt: input.leaseExpiresAt || null,
        leaseOwner: ensureText(input.leaseOwner),
        outputRef: cloneMaybe(input.outputRef, null),
        outputSummary: input.outputSummary === undefined ? '' : clone(input.outputSummary),
        progressEvents: ensureProgressEvents(input.progressEvents),
        profileId: ensureText(input.profileId),
        projectId,
        sourceAssetIds: ensureStringArray(input.sourceAssetIds, 128),
        stage: ensureText(input.stage),
        startedAt: input.startedAt || null,
        status: normaliseStatus(input.status, 'todo'),
        taskKind: ensureText(input.taskKind),
        updatedAt: nowIso(),
        warning: ensureText(input.warning),
      };

      upsertBy(state.agentRuns, next, (entry) => entry.id === next.id);
      await upsertAgentRunRow(pool, next);
      return clone(next);
    },

    async updateAgentRun(runId, patch = {}) {
      const existing = state.agentRuns.find((entry) => entry.id === runId);
      if (!existing) {
        throw new Error(`Unknown agent run: ${runId}`);
      }

      const next = {
        ...existing,
        ...clone(patch),
        assetRefs: patch.assetRefs !== undefined ? ensureObjectArray(patch.assetRefs) : existing.assetRefs,
        candidateAssetIds:
          patch.candidateAssetIds !== undefined ? ensureStringArray(patch.candidateAssetIds, 128) : ensureStringArray(existing.candidateAssetIds, 128),
        cancelReason: patch.cancelReason !== undefined ? ensureText(patch.cancelReason) : ensureText(existing.cancelReason),
        cancelRequestedAt: patch.cancelRequestedAt !== undefined ? patch.cancelRequestedAt : existing.cancelRequestedAt || null,
        createdAssetIds:
          patch.createdAssetIds !== undefined ? ensureStringArray(patch.createdAssetIds, 128) : ensureStringArray(existing.createdAssetIds, 128),
        finishedAt: patch.finishedAt !== undefined ? patch.finishedAt : existing.finishedAt,
        heartbeatAt: patch.heartbeatAt !== undefined ? patch.heartbeatAt : existing.heartbeatAt || null,
        input: patch.input !== undefined ? clone(patch.input) : existing.input,
        leaseExpiresAt: patch.leaseExpiresAt !== undefined ? patch.leaseExpiresAt : existing.leaseExpiresAt || null,
        leaseOwner: patch.leaseOwner !== undefined ? ensureText(patch.leaseOwner) : ensureText(existing.leaseOwner),
        outputRef: patch.outputRef !== undefined ? clone(patch.outputRef) : existing.outputRef,
        outputSummary: patch.outputSummary !== undefined ? clone(patch.outputSummary) : existing.outputSummary,
        progressEvents: patch.progressEvents !== undefined ? ensureProgressEvents(patch.progressEvents) : ensureProgressEvents(existing.progressEvents),
        sourceAssetIds:
          patch.sourceAssetIds !== undefined ? ensureStringArray(patch.sourceAssetIds, 128) : ensureStringArray(existing.sourceAssetIds, 128),
        status: patch.status !== undefined ? normaliseStatus(patch.status, existing.status) : existing.status,
        updatedAt: nowIso(),
      };

      upsertBy(state.agentRuns, next, (entry) => entry.id === runId);
      await upsertAgentRunRow(pool, next);
      return clone(next);
    },
  };
}
