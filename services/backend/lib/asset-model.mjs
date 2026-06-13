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
  'draftRevisions',
  'commentThreads',
];

export const ASSET_COLLECTIONS = Array.from(new Set([...LEGACY_ASSET_COLLECTIONS, ...GRAPH_ASSET_COLLECTIONS]));

const VALID_GENERIC_STATUSES = new Set(['todo', 'queue', 'running', 'done', 'error', 'draft', 'archived']);
const VALID_QUESTION_STATUSES = new Set(['active', 'paused', 'done', 'archived']);
const VALID_INSIGHT_REVIEW_STATUSES = new Set(['candidate', 'needs-review', 'accepted', 'rejected', 'archived']);
const VALID_INSIGHT_TYPES = new Set(['claim', 'hypothesis', 'decision', 'observation']);
const VALID_COMMENT_THREAD_STATUSES = new Set(['open', 'resolved', 'reopened']);

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

export function buildInsightQualityReport(card = {}) {
  const evidenceLinkCount = ensureTextArray(card.evidenceLinkIds, 64).length;
  const sourceTypes = Array.from(
    new Set(
      ensureObjectArray(card.sourceRefs, 64)
        .map((sourceRef) => ensureText(sourceRef.type))
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
  const unresolvedContradictionCount = ensureObjectArray(card.contradictionTraces, 64).filter(
    (trace) => !ensureText(trace.dismissReason),
  ).length;
  const explicitCoverage = ensureText(card.qualityCriteria?.evidenceCoverage);
  const evidenceCoverage =
    explicitCoverage && explicitCoverage !== 'unrated'
      ? explicitCoverage
      : evidenceLinkCount >= 2
        ? 'strong'
        : evidenceLinkCount === 1
          ? 'partial'
          : 'weak';

  return {
    evidenceCoverage,
    evidenceLinkCount,
    sourceDiversity: sourceTypes.length,
    sourceTypes,
    unresolvedContradictionCount,
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
  const base = baseAsset(input, { ...options, fallbackStatus: 'candidate', prefix: 'insight' });
  const status = ensureText(input.status, base.status).toLowerCase();
  const type = ensureText(input.type || input.kind, 'claim').toLowerCase();
  const draft = {
    ...input,
    contradictionTraces: ensureObjectArray(input.contradictionTraces, 32),
    evidenceLinkIds: ensureTextArray(input.evidenceLinkIds, 64),
    qualityCriteria: normaliseInsightQualityCriteria(input.qualityCriteria),
    sourceRefs: ensureObjectArray(input.sourceRefs, 64),
  };

  return {
    ...base,
    claimCluster: normaliseClaimCluster(input.claimCluster),
    claim: ensureText(input.claim || input.title, 'Untitled insight'),
    confidence: ensureText(input.confidence, 'medium'),
    contradictionTraces: draft.contradictionTraces,
    createdBy: ensureText(input.createdBy, 'user'),
    evidenceLinkIds: draft.evidenceLinkIds,
    experimentRunIds: ensureTextArray(input.experimentRunIds, 32),
    failureCause: ensureText(input.failureCause),
    followUpExperiment: ensureText(input.followUpExperiment),
    implication: ensureText(input.implication),
    nextAction: ensureText(input.nextAction),
    questionId: ensureText(input.questionId),
    qualityCriteria: draft.qualityCriteria,
    qualityReport: buildInsightQualityReport(draft),
    resultDossierIds: ensureTextArray(input.resultDossierIds, 32),
    reviewDueAt: ensureText(input.reviewDueAt),
    reviewer: ensureText(input.reviewer),
    reviewNote: ensureText(input.reviewNote),
    sourceRefs: draft.sourceRefs,
    status: VALID_INSIGHT_REVIEW_STATUSES.has(status) ? status : 'candidate',
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

function normaliseRevisionSection(input = {}) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};

  return {
    body: ensureText(value.body),
    evidenceLinkIds: ensureTextArray(value.evidenceLinkIds, 64),
    id: ensureText(value.id),
    insightCardIds: ensureTextArray(value.insightCardIds, 64),
    title: ensureText(value.title, 'Untitled section'),
  };
}

export function diffDraftRevisionSections(previousSections = [], nextSections = []) {
  const previousById = new Map(ensureArray(previousSections).map((section) => [ensureText(section?.id), normaliseRevisionSection(section)]));
  const nextById = new Map(ensureArray(nextSections).map((section) => [ensureText(section?.id), normaliseRevisionSection(section)]));
  const ids = Array.from(new Set([...previousById.keys(), ...nextById.keys()])).filter(Boolean);

  return ids
    .map((id) => {
      const previous = previousById.get(id);
      const next = nextById.get(id);
      if (!previous) {
        return { id, nextTitle: next.title, type: 'added' };
      }
      if (!next) {
        return { id, previousTitle: previous.title, type: 'removed' };
      }

      const changedFields = ['title', 'body', 'evidenceLinkIds', 'insightCardIds'].filter(
        (field) => JSON.stringify(previous[field]) !== JSON.stringify(next[field]),
      );
      if (!changedFields.length) {
        return null;
      }

      return {
        changedFields,
        id,
        nextTitle: next.title,
        previousTitle: previous.title,
        type: 'changed',
      };
    })
    .filter(Boolean);
}

export function normaliseDraftRevision(input = {}, options = {}) {
  const base = baseAsset(input, { ...options, fallbackStatus: 'done', prefix: 'revision' });
  const previousSections = ensureArray(input.previousSections).map(normaliseRevisionSection);
  const sections = ensureArray(input.sections).map(normaliseRevisionSection);
  const explicitDiff = ensureObjectArray(input.diff, 128);

  return {
    ...base,
    authorId: ensureText(input.authorId),
    changeSummary: ensureText(input.changeSummary),
    diff: explicitDiff.length ? explicitDiff : diffDraftRevisionSections(previousSections, sections),
    draftId: ensureText(input.draftId),
    previousRevisionId: ensureText(input.previousRevisionId),
    sections,
    version: Math.max(1, ensureNumber(input.version, 1) || 1),
  };
}

function normaliseCommentMessage(input = {}) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const createdAt = ensureText(value.createdAt, nowIso());

  return {
    authorId: ensureText(value.authorId, 'user'),
    body: ensureText(value.body),
    createdAt,
    id: ensureText(value.id, createId('comment')),
  };
}

export function normaliseCommentThread(input = {}, options = {}) {
  const base = baseAsset(input, { ...options, fallbackStatus: 'open', prefix: 'thread' });
  const status = ensureText(input.status, base.status).toLowerCase();

  return {
    ...base,
    assigneeIds: ensureTextArray(input.assigneeIds, 16),
    messages: ensureArray(input.messages).map(normaliseCommentMessage).filter((message) => message.body),
    requestedReview: Boolean(input.requestedReview),
    resolvedAt: ensureText(input.resolvedAt),
    resolvedBy: ensureText(input.resolvedBy),
    status: VALID_COMMENT_THREAD_STATUSES.has(status) ? status : 'open',
    targetId: ensureText(input.targetId),
    targetType: ensureText(input.targetType, 'draftSection'),
    title: ensureText(input.title, 'Review comment'),
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
    case 'draftRevisions':
      return normaliseDraftRevision(input, options);
    case 'commentThreads':
      return normaliseCommentThread(input, options);
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
