import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';

import { Pool } from 'pg';

const ASSET_COLLECTIONS = [
  'agentRuns',
  'readingSessions',
  'reproChecklistItems',
  'experimentRuns',
  'resultComparisons',
  'insightNotes',
  'writingDrafts',
];

const PROJECT_MAP_COLLECTIONS = ['library', 'readingQueue'];
const RUNNING_STATUSES = new Set(['queue', 'running']);
const VALID_STATUSES = new Set(['todo', 'queue', 'running', 'done']);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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
    'CREATE INDEX IF NOT EXISTS ares_project_assets_collection_project_updated_idx ON ares_project_assets (collection_name, project_id, updated_at DESC)',
  ];

  for (const statement of statements) {
    await pool.query(statement);
  }
}

async function importBootstrapState(client, state) {
  for (const project of state.projects) {
    await client.query(
      `
        INSERT INTO ares_projects (id, name, color, focus, default_query, keywords, payload)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
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
        ensureStringArray(project.keywords),
        project,
      ],
    );
  }

  for (const [projectId, papers] of Object.entries(state.library || {})) {
    for (const paper of papers) {
      await client.query(
        `
          INSERT INTO ares_library (project_id, paper_id, payload, saved_at, updated_at)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (project_id, paper_id) DO UPDATE SET
            payload = EXCLUDED.payload,
            saved_at = EXCLUDED.saved_at,
            updated_at = EXCLUDED.updated_at
        `,
        [projectId, paper.paperId, paper, paper.savedAt || nowIso(), paper.updatedAt || paper.savedAt || nowIso()],
      );
    }
  }

  for (const [projectId, queueEntries] of Object.entries(state.readingQueue || {})) {
    for (const entry of queueEntries) {
      await client.query(
        `
          INSERT INTO ares_reading_queue (project_id, paper_id, payload, queued_at, updated_at)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (project_id, paper_id) DO UPDATE SET
            payload = EXCLUDED.payload,
            queued_at = EXCLUDED.queued_at,
            updated_at = EXCLUDED.updated_at
        `,
        [projectId, entry.paperId, entry, entry.queuedAt || nowIso(), entry.updatedAt || entry.queuedAt || nowIso()],
      );
    }
  }

  for (const session of state.readingSessions || []) {
    await client.query(
      `
        INSERT INTO ares_reading_sessions (id, project_id, paper_id, status, created_at, updated_at, payload)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
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
        session,
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
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
        run,
      ],
    );
  }

  for (const collectionName of ASSET_COLLECTIONS.filter((entry) => entry !== 'agentRuns' && entry !== 'readingSessions')) {
    for (const asset of state[collectionName] || []) {
      await client.query(
        `
          INSERT INTO ares_project_assets (collection_name, id, project_id, created_at, updated_at, payload)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (collection_name, id) DO UPDATE SET
            project_id = EXCLUDED.project_id,
            updated_at = EXCLUDED.updated_at,
            payload = EXCLUDED.payload
        `,
        [collectionName, asset.id, asset.projectId, asset.createdAt || nowIso(), asset.updatedAt || nowIso(), asset],
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

async function loadState(pool) {
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
      SELECT id, project_id, stage, task_kind, status, created_at, updated_at, started_at, finished_at, payload
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

  const state = migrateStoreState({
    projects: projectsResult.rows.map(inflateProject),
  }).state;

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
    state.agentRuns.push(
      inflatePayload(row, {
        createdAt: toIsoString(row.created_at),
        finishedAt: toIsoString(row.finished_at),
        id: ensureText(row.id),
        profileId: ensureText(row.payload?.profileId || ''),
        projectId: ensureText(row.project_id),
        stage: ensureText(row.stage),
        startedAt: toIsoString(row.started_at),
        status: normaliseStatus(row.status, 'todo'),
        taskKind: ensureText(row.task_kind),
        updatedAt: toIsoString(row.updated_at),
      }),
    );
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
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (project_id, paper_id) DO UPDATE SET
        payload = EXCLUDED.payload,
        saved_at = EXCLUDED.saved_at,
        updated_at = EXCLUDED.updated_at
    `,
    [projectId, paper.paperId, paper, paper.savedAt || nowIso(), paper.updatedAt || paper.savedAt || nowIso()],
  );
}

async function upsertQueueRow(pool, projectId, entry) {
  await pool.query(
    `
      INSERT INTO ares_reading_queue (project_id, paper_id, payload, queued_at, updated_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (project_id, paper_id) DO UPDATE SET
        payload = EXCLUDED.payload,
        queued_at = EXCLUDED.queued_at,
        updated_at = EXCLUDED.updated_at
    `,
    [projectId, entry.paperId, entry, entry.queuedAt || nowIso(), entry.updatedAt || entry.queuedAt || nowIso()],
  );
}

async function upsertReadingSessionRow(pool, session) {
  await pool.query(
    `
      INSERT INTO ares_reading_sessions (id, project_id, paper_id, status, created_at, updated_at, payload)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
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
      session,
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
        payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
      run,
    ],
  );
}

async function upsertProjectAssetRow(pool, collectionName, asset) {
  await pool.query(
    `
      INSERT INTO ares_project_assets (collection_name, id, project_id, created_at, updated_at, payload)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (collection_name, id) DO UPDATE SET
        project_id = EXCLUDED.project_id,
        updated_at = EXCLUDED.updated_at,
        payload = EXCLUDED.payload
    `,
    [collectionName, asset.id, asset.projectId, asset.createdAt || nowIso(), asset.updatedAt || nowIso(), asset],
  );
}

export async function createPostgresStore({
  databaseSsl,
  databaseUrl,
  runtimeFile,
  seedFile,
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

  await ensureSchema(pool);
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
      return {
        abstract: session.abstract || '',
        authors: ensureStringArray(session.authors, 8),
        citedByCount: Number(session.citedByCount) || 0,
        keyPoints: ensureStringArray(session.keyPoints, 6),
        keywords: ensureStringArray(session.keywords, 8),
        matchedKeywords: ensureStringArray(session.matchedKeywords, 8),
        openAccess: Boolean(session.openAccess),
        paperId: session.paperId,
        paperUrl: session.paperUrl || null,
        pdfUrl: session.pdfUrl || null,
        relevance: Number(session.relevance) || 0,
        sourceName: session.sourceName || 'Reading session',
        sourceProvider: session.sourceProvider || 'reading',
        summary: session.summary || '',
        title: session.title,
        venue: session.venue || 'Unknown',
        year: session.year ?? null,
      };
    }

    return null;
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

    getProject(projectId) {
      return projectSummary(ensureProject(projectId));
    },

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
      const createdAt = existing?.createdAt || input.createdAt || nowIso();
      const updatedAt = nowIso();
      const next = {
        abstract: ensureText(input.abstract, existing?.abstract || ''),
        agent: ensureText(input.agent, existing?.agent || 'Reader agent'),
        authors: ensureStringArray(input.authors, 8).length
          ? ensureStringArray(input.authors, 8)
          : ensureStringArray(existing?.authors, 8),
        citedByCount:
          input.citedByCount === undefined ? Number(existing?.citedByCount) || 0 : Number(input.citedByCount) || 0,
        createdAt,
        error: ensureText(input.error, existing?.error || ''),
        finishedAt: input.finishedAt !== undefined ? input.finishedAt : existing?.finishedAt || null,
        highlights: input.highlights !== undefined ? ensureObjectArray(input.highlights) : clone(existing?.highlights || []),
        id: String(input.id || existing?.id || createId('reading')),
        keyPoints: input.keyPoints !== undefined ? ensureStringArray(input.keyPoints, 6) : ensureStringArray(existing?.keyPoints, 6),
        keywords: input.keywords !== undefined ? ensureStringArray(input.keywords, 8) : ensureStringArray(existing?.keywords, 8),
        matchedKeywords:
          input.matchedKeywords !== undefined
            ? ensureStringArray(input.matchedKeywords, 8)
            : ensureStringArray(existing?.matchedKeywords, 8),
        notes: input.notes !== undefined ? ensureObjectArray(input.notes) : clone(existing?.notes || []),
        openAccess: input.openAccess === undefined ? Boolean(existing?.openAccess) : Boolean(input.openAccess),
        paperId,
        paperUrl:
          input.paperUrl === undefined
            ? existing?.paperUrl || null
            : input.paperUrl
              ? String(input.paperUrl)
              : null,
        pdfUrl:
          input.pdfUrl === undefined ? existing?.pdfUrl || null : input.pdfUrl ? String(input.pdfUrl) : null,
        projectId,
        relevance: input.relevance === undefined ? Number(existing?.relevance) || 0 : Number(input.relevance) || 0,
        reproParams:
          input.reproParams !== undefined ? ensureObjectArray(input.reproParams) : clone(existing?.reproParams || []),
        runId: ensureText(input.runId, existing?.runId || ''),
        sections: input.sections !== undefined ? ensureObjectArray(input.sections) : clone(existing?.sections || []),
        sourceName: ensureText(input.sourceName, existing?.sourceName || 'Reading session'),
        sourceProvider: ensureText(input.sourceProvider, existing?.sourceProvider || 'reader'),
        sourceRefs:
          input.sourceRefs !== undefined ? ensureObjectArray(input.sourceRefs) : clone(existing?.sourceRefs || []),
        startedAt: input.startedAt !== undefined ? input.startedAt : existing?.startedAt || null,
        status: normaliseStatus(input.status, existing?.status || 'todo'),
        summary: ensureText(input.summary, existing?.summary || ''),
        title: ensureText(input.title, existing?.title || 'Untitled paper'),
        updatedAt,
        venue: ensureText(input.venue, existing?.venue || 'Unknown'),
        warning: ensureText(input.warning, existing?.warning || ''),
        year:
          input.year === undefined
            ? existing?.year ?? null
            : input.year === null || input.year === ''
              ? null
              : Number(input.year) || null,
      };

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
        ...clone(input),
        createdAt,
        id,
        projectId,
        sourceRefs: ensureObjectArray(input.sourceRefs),
        updatedAt,
      };

      const persisted = upsertBy(collection, next, (entry) => entry[matchBy] === next[matchBy]);

      if (previous?.id && previous.id !== persisted.id) {
        await pool.query('DELETE FROM ares_project_assets WHERE collection_name = $1 AND id = $2', [collectionName, previous.id]);
      }

      await upsertProjectAssetRow(pool, collectionName, persisted);
      return clone(persisted);
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
        createdAt,
        error: ensureText(input.error),
        finishedAt: input.finishedAt || null,
        id: String(input.id || createId('run')),
        input: cloneMaybe(input.input, {}),
        outputRef: cloneMaybe(input.outputRef, null),
        outputSummary: input.outputSummary === undefined ? '' : clone(input.outputSummary),
        profileId: ensureText(input.profileId),
        projectId,
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
        finishedAt: patch.finishedAt !== undefined ? patch.finishedAt : existing.finishedAt,
        input: patch.input !== undefined ? clone(patch.input) : existing.input,
        outputRef: patch.outputRef !== undefined ? clone(patch.outputRef) : existing.outputRef,
        outputSummary: patch.outputSummary !== undefined ? clone(patch.outputSummary) : existing.outputSummary,
        status: patch.status !== undefined ? normaliseStatus(patch.status, existing.status) : existing.status,
        updatedAt: nowIso(),
      };

      upsertBy(state.agentRuns, next, (entry) => entry.id === runId);
      await upsertAgentRunRow(pool, next);
      return clone(next);
    },
  };
}
