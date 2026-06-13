import { randomUUID } from 'node:crypto';

export const LEGACY_ASSET_COLLECTIONS = [
  'agentRuns',
  'readingSessions',
  'reproChecklistItems',
  'experimentRuns',
  'resultComparisons',
  'insightNotes',
  'writingDrafts',
];

export const GRAPH_ASSET_COLLECTIONS = [
  'researchQuestions',
  'readingPackets',
  'evidenceLinks',
  'reproductionPlans',
  'experimentRuns',
  'resultDossiers',
  'insightCards',
  'drafts',
  'draftSections',
];

export const ASSET_COLLECTIONS = Array.from(new Set([...LEGACY_ASSET_COLLECTIONS, ...GRAPH_ASSET_COLLECTIONS]));

const VALID_GENERIC_STATUSES = new Set(['todo', 'queue', 'running', 'done', 'error', 'draft', 'archived']);
const VALID_QUESTION_STATUSES = new Set(['active', 'paused', 'done', 'archived']);
const VALID_INSIGHT_TYPES = new Set(['claim', 'hypothesis', 'decision', 'observation']);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}-${randomUUID()}`;
}

function ensureText(value, fallback = '') {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function ensureNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensureTextArray(value, limit = 32) {
  return ensureArray(value)
    .map((entry) => ensureText(entry))
    .filter(Boolean)
    .slice(0, limit);
}

function ensureObjectArray(value, limit = 64) {
  return ensureArray(value)
    .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => clone(entry))
    .slice(0, limit);
}

function normaliseHandoff(input = {}) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};

  return {
    assetIds: ensureTextArray(value.assetIds, 64),
    noteIds: ensureTextArray(value.noteIds, 64),
    readingSessionId: ensureText(value.readingSessionId),
    sectionIds: ensureTextArray(value.sectionIds, 64),
  };
}

function normaliseInsightQualityCriteria(input = {}) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};

  return {
    contradictionFlag: ensureText(value.contradictionFlag, 'unchecked'),
    evidenceCoverage: ensureText(value.evidenceCoverage, 'unrated'),
    followUpExperimentId: ensureText(value.followUpExperimentId),
  };
}

function normaliseClaimCluster(input = {}) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const id = ensureText(value.id);
  const label = ensureText(value.label);
  if (!id && !label) {
    return null;
  }

  return {
    evidenceLinkCount: Math.max(0, ensureNumber(value.evidenceLinkCount, 0) || 0),
    id: id || label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    label: label || id,
    relatedInsightCardIds: ensureTextArray(value.relatedInsightCardIds, 32),
    sharedTerms: ensureTextArray(value.sharedTerms, 12),
  };
}

function normaliseStatus(value, allowed, fallback) {
  const next = ensureText(value).toLowerCase();
  return allowed.has(next) ? next : fallback;
}

function baseAsset(input, { prefix, projectId, fallbackStatus = 'draft' } = {}) {
  const createdAt = ensureText(input.createdAt, nowIso());
  return {
    createdAt,
    id: ensureText(input.id, createId(prefix)),
    idempotencyKey: ensureText(input.idempotencyKey),
    projectId: ensureText(input.projectId, projectId),
    status: normaliseStatus(input.status, VALID_GENERIC_STATUSES, fallbackStatus),
    updatedAt: ensureText(input.updatedAt, createdAt),
  };
}

export function normaliseResearchQuestion(input = {}, options = {}) {
  const base = baseAsset(input, { ...options, fallbackStatus: 'active', prefix: 'question' });
  const title = ensureText(input.title || input.name, 'Untitled research question');

  return {
    ...base,
    prompt: ensureText(input.prompt || input.defaultQuery || input.query, title),
    scope: input.scope && typeof input.scope === 'object' ? clone(input.scope) : {},
    status: normaliseStatus(input.status, VALID_QUESTION_STATUSES, 'active'),
    title,
  };
}

export function normalisePaper(input = {}, options = {}) {
  const paperId = ensureText(input.paperId || input.id || input.externalId, createId('paper'));

  return {
    abstract: ensureText(input.abstract),
    authors: ensureTextArray(input.authors, 16),
    createdAt: ensureText(input.createdAt || input.savedAt || input.queuedAt, nowIso()),
    externalId: ensureText(input.externalId || paperId),
    id: paperId,
    keywords: ensureTextArray(input.keywords, 16),
    paperId,
    pdfUrl: input.pdfUrl ? String(input.pdfUrl) : null,
    projectId: ensureText(input.projectId, options.projectId),
    questionIds: ensureTextArray(input.questionIds, 16),
    source: ensureText(input.source || input.sourceProvider || input.sourceName, 'local'),
    status: normaliseStatus(input.status, VALID_GENERIC_STATUSES, input.savedAt ? 'done' : 'queue'),
    title: ensureText(input.title, 'Untitled paper'),
    updatedAt: ensureText(input.updatedAt || input.savedAt || input.queuedAt, nowIso()),
    url: input.url || input.paperUrl || null,
    venue: ensureText(input.venue, 'Unknown'),
    year: ensureNumber(input.year),
  };
}

export function normaliseEvidenceLink(input = {}, options = {}) {
  const base = baseAsset(input, { ...options, fallbackStatus: 'done', prefix: 'evidence' });

  return {
    ...base,
    createdBy: ensureText(input.createdBy, 'user'),
    locator: input.locator && typeof input.locator === 'object' ? clone(input.locator) : {},
    page: ensureNumber(input.page),
    paperId: ensureText(input.paperId),
    quote: ensureText(input.quote || input.text),
    sectionId: ensureText(input.sectionId || input.section),
    sourceId: ensureText(input.sourceId),
    sourceType: ensureText(input.sourceType, 'note'),
  };
}

export function normaliseReadingPacket(input = {}, options = {}) {
  const base = baseAsset(input, { ...options, fallbackStatus: 'draft', prefix: 'packet' });

  return {
    ...base,
    agentRunIds: ensureTextArray(input.agentRunIds, 16),
    evidenceLinkIds: ensureTextArray(input.evidenceLinkIds, 64),
    keyPoints: ensureTextArray(input.keyPoints, 16),
    limitations: ensureTextArray(input.limitations, 16),
    methodParameters: ensureObjectArray(input.methodParameters || input.reproParams, 32),
    notes: ensureObjectArray(input.notes, 64),
    paperId: ensureText(input.paperId),
    questionId: ensureText(input.questionId),
    readingSessionId: ensureText(input.readingSessionId || input.sessionId),
    sections: ensureObjectArray(input.sections, 64),
    summary: ensureText(input.summary),
  };
}

export function normaliseReproductionPlan(input = {}, options = {}) {
  const base = baseAsset(input, { ...options, fallbackStatus: 'draft', prefix: 'plan' });

  return {
    ...base,
    agentRunIds: ensureTextArray(input.agentRunIds, 16),
    baseline: input.baseline && typeof input.baseline === 'object' ? clone(input.baseline) : {},
    checklist: ensureObjectArray(input.checklist, 64),
    commands: ensureTextArray(input.commands, 32),
    datasets: ensureTextArray(input.datasets, 32),
    environment: input.environment && typeof input.environment === 'object' ? clone(input.environment) : {},
    evidenceLinkIds: ensureTextArray(input.evidenceLinkIds, 64),
    handoff: normaliseHandoff(input.handoff),
    metrics: ensureTextArray(input.metrics, 32),
    questionId: ensureText(input.questionId),
    readingPacketId: ensureText(input.readingPacketId),
    sourceRefs: ensureObjectArray(input.sourceRefs, 64),
  };
}

export function normaliseExperimentRun(input = {}, options = {}) {
  const base = baseAsset(input, { ...options, fallbackStatus: 'draft', prefix: 'run' });

  return {
    ...base,
    artifacts: ensureObjectArray(input.artifacts, 32),
    completedAt: input.completedAt || null,
    config: input.config && typeof input.config === 'object' ? clone(input.config) : {},
    kind: ensureText(input.kind, 'manual'),
    metrics: input.metrics && typeof input.metrics === 'object' ? clone(input.metrics) : {},
    notes: ensureText(input.notes),
    reproductionPlanId: ensureText(input.reproductionPlanId),
    startedAt: input.startedAt || null,
  };
}

export function normaliseResultDossier(input = {}, options = {}) {
  const base = baseAsset(input, { ...options, fallbackStatus: 'draft', prefix: 'dossier' });

  return {
    ...base,
    agentRunIds: ensureTextArray(input.agentRunIds, 16),
    comparisons: ensureObjectArray(input.comparisons, 64),
    deltaSummary: ensureText(input.deltaSummary),
    evidenceLinkIds: ensureTextArray(input.evidenceLinkIds, 64),
    experimentRunIds: ensureTextArray(input.experimentRunIds, 32),
    failureNotes: ensureTextArray(input.failureNotes, 32),
    paperId: ensureText(input.paperId),
    questionId: ensureText(input.questionId),
  };
}

export function normaliseInsightCard(input = {}, options = {}) {
  const base = baseAsset(input, { ...options, fallbackStatus: 'draft', prefix: 'insight' });
  const type = ensureText(input.type || input.kind, 'claim').toLowerCase();

  return {
    ...base,
    claimCluster: normaliseClaimCluster(input.claimCluster),
    claim: ensureText(input.claim || input.title, 'Untitled insight'),
    confidence: ensureText(input.confidence, 'medium'),
    createdBy: ensureText(input.createdBy, 'user'),
    evidenceLinkIds: ensureTextArray(input.evidenceLinkIds, 64),
    experimentRunIds: ensureTextArray(input.experimentRunIds, 32),
    failureCause: ensureText(input.failureCause),
    followUpExperiment: ensureText(input.followUpExperiment),
    implication: ensureText(input.implication),
    nextAction: ensureText(input.nextAction),
    questionId: ensureText(input.questionId),
    qualityCriteria: normaliseInsightQualityCriteria(input.qualityCriteria),
    resultDossierIds: ensureTextArray(input.resultDossierIds, 32),
    sourceRefs: ensureObjectArray(input.sourceRefs, 64),
    type: VALID_INSIGHT_TYPES.has(type) ? type : 'claim',
  };
}

export function normaliseDraft(input = {}, options = {}) {
  const base = baseAsset(input, { ...options, fallbackStatus: 'draft', prefix: 'draft' });

  return {
    ...base,
    sectionIds: ensureTextArray(input.sectionIds, 64),
    title: ensureText(input.title, 'Untitled draft'),
  };
}

export function normaliseDraftSection(input = {}, options = {}) {
  const base = baseAsset(input, { ...options, fallbackStatus: 'draft', prefix: 'section' });

  return {
    ...base,
    body: ensureText(input.body),
    draftId: ensureText(input.draftId),
    evidenceLinkIds: ensureTextArray(input.evidenceLinkIds, 64),
    insightCardIds: ensureTextArray(input.insightCardIds, 64),
    sectionType: ensureText(input.sectionType, 'section'),
    title: ensureText(input.title, 'Untitled section'),
  };
}

export function normaliseAsset(collectionName, input = {}, options = {}) {
  switch (collectionName) {
    case 'researchQuestions':
      return normaliseResearchQuestion(input, options);
    case 'readingPackets':
      return normaliseReadingPacket(input, options);
    case 'evidenceLinks':
      return normaliseEvidenceLink(input, options);
    case 'reproductionPlans':
      return normaliseReproductionPlan(input, options);
    case 'experimentRuns':
      return normaliseExperimentRun(input, options);
    case 'resultDossiers':
      return normaliseResultDossier(input, options);
    case 'insightCards':
      return normaliseInsightCard(input, options);
    case 'drafts':
      return normaliseDraft(input, options);
    case 'draftSections':
      return normaliseDraftSection(input, options);
    default:
      return {
        ...baseAsset(input, {
          ...options,
          prefix: collectionName.replace(/s$/, '') || 'asset',
        }),
        ...clone(input),
        projectId: ensureText(input.projectId, options.projectId),
        sourceRefs: ensureObjectArray(input.sourceRefs),
      };
  }
}
