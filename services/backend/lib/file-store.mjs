import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { ASSET_COLLECTIONS, normaliseAsset, normalisePaper } from './asset-model.mjs';
import { normalizeAuditEvent } from './audit-model.mjs';
import {
  normalizeAuthSession,
  normalizeMembership,
  normalizeOrganization,
  normalizeProjectAccess,
  normalizeUser,
} from './identity-model.mjs';
import { normalizeNewProject } from './project-model.mjs';
import { normaliseReadingSession } from './reading-model.mjs';

const PROJECT_MAP_COLLECTIONS = ['library', 'readingQueue'];
const IDENTITY_COLLECTIONS = ['users', 'organizations', 'memberships', 'projectAccess', 'authSessions'];
const AUDIT_COLLECTIONS = ['auditEvents'];
const RUNNING_STATUSES = new Set(['queue', 'running']);
const VALID_STATUSES = new Set(['todo', 'queue', 'running', 'done', 'error', 'canceled']);
const MAX_AGENT_PROGRESS_EVENTS = 80;
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

  state.users = state.users.map((entry) => normalizeUser(entry));
  state.organizations = state.organizations.map((entry) => normalizeOrganization(entry));
  state.memberships = state.memberships.map((entry) => normalizeMembership(entry));
  state.projectAccess = state.projectAccess.map((entry) => normalizeProjectAccess(entry));
  state.authSessions = state.authSessions.map((entry) => normalizeAuthSession(entry));
  state.auditEvents = state.auditEvents.map((entry) => normalizeAuditEvent(entry));

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

function sortByCreatedAsc(left, right) {
  const leftStamp = Date.parse(left.createdAt || left.updatedAt || 0) || 0;
  const rightStamp = Date.parse(right.createdAt || right.updatedAt || 0) || 0;
  return leftStamp - rightStamp;
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

function isLeaseExpired(run, now) {
  if (!ensureText(run.leaseOwner)) {
    return true;
  }
  const expiresAt = Date.parse(run.leaseExpiresAt || '');
  return !Number.isFinite(expiresAt) || expiresAt <= Date.parse(now);
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
        venue: normalized.venue || '출처 정보 없음',
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
      activityEvents: listCollection('activityEvents', { projectId }),
      commentThreads: listCollection('commentThreads', { projectId }),
      drafts: listCollection('drafts', { projectId }),
      draftSections: listCollection('draftSections', { projectId }),
      draftRevisions: listCollection('draftRevisions', { projectId }),
      evidenceLinks: listCollection('evidenceLinks', { projectId }),
      experimentRuns: listCollection('experimentRuns', { projectId }),
      graphVersion: 1,
      insightCards: listCollection('insightCards', { projectId }),
      notifications: listCollection('notifications', { projectId }),
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

    async createProject(input) {
      const project = normalizeNewProject(input, {
        existingIds: new Set(state.projects.map((entry) => entry.id)),
      });
      state.projects.unshift(project);
      state.library[project.id] = [];
      state.readingQueue[project.id] = [];
      await persist();
      return projectSummary(project);
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
      await persist();
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
      await persist();
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
      await persist();
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
      await persist();
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
      await persist();
      return clone(next);
    },

    async createAuthSession(input) {
      const user = this.getUser(String(input.userId || '').trim());
      if (!user) {
        throw new Error(`Unknown user: ${input.userId}`);
      }
      const session = normalizeAuthSession(input);
      identityCollectionFor('authSessions').unshift(session);
      await persist();
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
      await persist();
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
      const stageSet = new Set(ensureStringArray(stages, 32));
      const run = state.agentRuns
        .filter((entry) => normaliseStatus(entry.status, 'todo') === 'queue')
        .filter((entry) => stageSet.size === 0 || stageSet.has(ensureText(entry.stage)))
        .filter((entry) => isLeaseExpired(entry, nowValue))
        .sort(sortByCreatedAsc)[0];

      if (!run) {
        return null;
      }

      const next = {
        ...run,
        heartbeatAt: nowValue,
        leaseExpiresAt: claimExpiresAt(nowValue, leaseMs),
        leaseOwner: owner,
        startedAt: run.startedAt || nowValue,
        status: 'running',
        updatedAt: nowValue,
      };

      upsertBy('agentRuns', next, (entry) => entry.id === next.id);
      await persist();
      return clone(next);
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

      upsertBy('agentRuns', next, (entry) => entry.id === runId);
      await persist();
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
        sourceName: ensureText(paper.sourceName, '읽기 대기 논문'),
        sourceProvider: ensureText(paper.sourceProvider, 'queue'),
        status: normaliseStatus(options.status || existing.status, 'queue'),
        summary: ensureText(paper.summary),
        title: ensureText(paper.title, '제목 없는 논문'),
        updatedAt: nowIso(),
        venue: ensureText(paper.venue, '출처 정보 없음'),
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
      const next = normaliseReadingSession(
        {
          ...clone(input),
          updatedAt: nowIso(),
        },
        { existing },
      );

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
      const updatedAt = nowIso();
      const matchBy = options.matchBy || 'id';
      const collection = collectionFor(collectionName);
      const existing = collection.find((entry) => entry[matchBy] && entry[matchBy] === input[matchBy]) || null;
      const createdAt = input.createdAt || existing?.createdAt || nowIso();
      const id = String(input.id || existing?.id || createId(options.prefix || collectionName.replace(/s$/, '')));
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

      upsertBy(collectionName, next, (entry) => entry[matchBy] === next[matchBy]);
      await persist();
      return clone(next);
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
      if (collectionName === 'insightCards') {
        for (const section of collectionFor('draftSections')) {
          if (projectId && section.projectId !== projectId) {
            continue;
          }

          const nextInsightCardIds = removeAssetId(section.insightCardIds, assetId);
          if (nextInsightCardIds.length !== (section.insightCardIds || []).length) {
            section.insightCardIds = nextInsightCardIds;
            section.updatedAt = nowIso();
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
            }
          }
        }
      }
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

          draftSections.splice(draftSectionIndex, 1);
        }
      }
      await persist();
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

      upsertBy('agentRuns', next, (entry) => entry.id === runId);
      await persist();
      return clone(next);
    },
  };
}
