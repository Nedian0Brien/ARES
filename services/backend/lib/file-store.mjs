import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

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

async function ensureRuntimeStore(seedFile, runtimeFile) {
  await fs.mkdir(path.dirname(runtimeFile), { recursive: true });

  try {
    await fs.access(runtimeFile);
  } catch {
    const seed = await fs.readFile(seedFile, 'utf8');
    await fs.writeFile(runtimeFile, seed, 'utf8');
  }

  const raw = await fs.readFile(runtimeFile, 'utf8');
  const migrated = migrateStoreState(JSON.parse(raw));

  if (migrated.changed) {
    await fs.writeFile(runtimeFile, JSON.stringify(migrated.state, null, 2), 'utf8');
  }

  return migrated.state;
}

export async function createFileStore({ seedFile, runtimeFile }) {
  let state = await ensureRuntimeStore(seedFile, runtimeFile);
  let writeChain = Promise.resolve();

  async function persist() {
    const snapshot = JSON.stringify(state, null, 2);
    writeChain = writeChain.then(() => fs.writeFile(runtimeFile, snapshot, 'utf8'));
    await writeChain;
  }

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
      libraryCount: library.length,
      queueCount: queue.length,
      readingSessionCount: readingSessions.length,
      activeRunCount: activeRuns.length,
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

  function upsertBy(collectionName, nextValue, matcher) {
    const collection = collectionFor(collectionName);
    const index = collection.findIndex((entry) => matcher(entry));

    if (index >= 0) {
      collection[index] = { ...collection[index], ...clone(nextValue) };
      return collection[index];
    }

    const inserted = clone(nextValue);
    collection.unshift(inserted);
    return inserted;
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
    backend: 'file',

    getBackendInfo() {
      return {
        backend: 'file',
        runtimeFile,
        seedFile,
      };
    },

    async close() {},

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

      await persist();
      return clone(nextPaper);
    },

    async removePaper(projectId, paperId) {
      ensureProject(projectId);
      state.library[projectId] = libraryFor(projectId).filter((paper) => paper.paperId !== paperId);
      await persist();
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

      await persist();
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

      upsertBy('readingSessions', next, (entry) => entry.projectId === projectId && entry.paperId === paperId);
      await persist();
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
      const next = {
        ...clone(input),
        createdAt,
        id,
        projectId,
        sourceRefs: ensureObjectArray(input.sourceRefs),
        updatedAt,
      };

      upsertBy(collectionName, next, (entry) => entry[matchBy] === next[matchBy]);
      await persist();
      return clone(next);
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

      upsertBy('agentRuns', next, (entry) => entry.id === next.id);
      await persist();
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

      upsertBy('agentRuns', next, (entry) => entry.id === runId);
      await persist();
      return clone(next);
    },
  };
}
