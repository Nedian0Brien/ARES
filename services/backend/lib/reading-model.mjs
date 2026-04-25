import { randomUUID } from 'node:crypto';

export const READING_PARSE_STATUSES = new Set(['idle', 'running', 'done', 'error']);
export const READING_SUMMARY_STATUSES = new Set(['idle', 'running', 'done', 'error']);
export const READING_SESSION_STATUSES = new Set(['todo', 'queue', 'running', 'done']);

const DEFAULT_SUMMARY_CARDS = {
  keyPoints: [],
  limit: '',
  method: '',
  result: '',
  sectionSummaries: [],
  tldr: '',
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function nowIso() {
  return new Date().toISOString();
}

function ensureString(value, fallback = '') {
  if (value === null || value === undefined) {
    return fallback;
  }

  return String(value);
}

function ensureTrimmedString(value, fallback = '') {
  const text = ensureString(value, fallback).trim();
  return text || fallback;
}

function ensureNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function ensureBoolean(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }

  return Boolean(value);
}

function ensureIso(value, fallback = null) {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function ensureArray(values) {
  return Array.isArray(values) ? values : [];
}

function ensureStringArray(values, { limit } = {}) {
  const next = ensureArray(values)
    .map((value) => ensureTrimmedString(value))
    .filter(Boolean);
  return typeof limit === 'number' ? next.slice(0, limit) : next;
}

function ensureObjectArray(values) {
  return ensureArray(values).filter((entry) => entry && typeof entry === 'object').map((entry) => clone(entry));
}

function normaliseParseStatus(value, fallback = 'idle') {
  const next = ensureTrimmedString(value, '').toLowerCase();
  return READING_PARSE_STATUSES.has(next) ? next : fallback;
}

function normaliseSummaryStatus(value, fallback = 'idle') {
  const next = ensureTrimmedString(value, '').toLowerCase();
  return READING_SUMMARY_STATUSES.has(next) ? next : fallback;
}

function normaliseSessionStatus(value, fallback = 'todo') {
  const next = ensureTrimmedString(value, '').toLowerCase();
  return READING_SESSION_STATUSES.has(next) ? next : fallback;
}

function ensureSessionRelativePath(value, fallback = null) {
  const text = ensureTrimmedString(value, '');
  if (!text) {
    return fallback;
  }

  return text.replaceAll('\\', '/').replace(/^\/+/, '');
}

function buildReadingId(prefix) {
  return `${prefix}-${randomUUID()}`;
}

function firstSentence(value, fallback = '') {
  const text = ensureTrimmedString(value, fallback).replace(/\s+/g, ' ').trim();
  if (!text) {
    return fallback;
  }

  const match = text.match(/^(.{0,260}?[.!?])(?:\s|$)/);
  return match ? match[1] : text;
}

function clipText(value, limit = 260) {
  const text = ensureTrimmedString(value, '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return '';
  }

  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, Math.max(limit - 1, 1)).trimEnd()}…`;
}

function normaliseSection(entry, index = 0) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const label = ensureTrimmedString(entry.label, `Section ${index + 1}`);
  const id = ensureTrimmedString(entry.id, label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
  return {
    id: id || `section-${index + 1}`,
    label,
    order: ensureNumber(entry.order, index),
    pageEnd: entry.pageEnd === undefined || entry.pageEnd === null ? null : Math.max(1, ensureNumber(entry.pageEnd, index + 1)),
    pageStart: entry.pageStart === undefined || entry.pageStart === null ? null : Math.max(1, ensureNumber(entry.pageStart, index + 1)),
    status: normaliseSessionStatus(entry.status, 'done'),
    summary: ensureTrimmedString(entry.summary, ''),
  };
}

function normaliseHighlight(entry, index = 0) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const text = clipText(entry.text || entry.quote || entry.body, 900);
  if (!text) {
    return null;
  }

  const page = Math.max(1, ensureNumber(entry.page || entry.pg, index + 1));
  return {
    id: ensureTrimmedString(entry.id, `highlight-${index + 1}`),
    page,
    quote: clipText(entry.quote || text, 900),
    sectionId: ensureTrimmedString(entry.sectionId || entry.section, ''),
    text,
    type: ensureTrimmedString(entry.type || entry.kind, 'claim').toLowerCase(),
  };
}

function normaliseNote(entry, index = 0) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const body = ensureTrimmedString(entry.body || entry.value || entry.text, '');
  const quote = clipText(entry.quote || entry.text || '', 900);
  const createdAt = ensureIso(entry.createdAt, nowIso());
  const updatedAt = ensureIso(entry.updatedAt, createdAt);

  return {
    body,
    createdAt,
    id: ensureTrimmedString(entry.id, `note-${index + 1}`),
    kind: ensureTrimmedString(entry.kind || entry.label, 'note').toLowerCase(),
    origin: ensureTrimmedString(entry.origin, entry.sourceHighlightId ? 'highlight' : 'user').toLowerCase(),
    page:
      entry.page === undefined || entry.page === null || entry.page === ''
        ? entry.pg === undefined || entry.pg === null || entry.pg === ''
          ? null
          : Math.max(1, ensureNumber(entry.pg, 1))
        : Math.max(1, ensureNumber(entry.page, 1)),
    quote,
    sectionId: ensureTrimmedString(entry.sectionId || entry.section, ''),
    sourceHighlightId: ensureTrimmedString(entry.sourceHighlightId, '') || null,
    updatedAt,
  };
}

function normaliseCitation(entry, index = 0) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  return {
    label: ensureTrimmedString(entry.label || entry.section || entry.sectionId, `Ref ${index + 1}`),
    page:
      entry.page === undefined || entry.page === null || entry.page === ''
        ? null
        : Math.max(1, ensureNumber(entry.page, 1)),
    quote: clipText(entry.quote || entry.text, 400),
    sectionId: ensureTrimmedString(entry.sectionId || entry.section, ''),
  };
}

function normaliseChatMessage(entry, index = 0) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const text = ensureTrimmedString(entry.text || entry.content, '');
  if (!text) {
    return null;
  }

  return {
    citations: ensureObjectArray(entry.citations || entry.cites).map(normaliseCitation).filter(Boolean),
    createdAt: ensureIso(entry.createdAt, nowIso()),
    fallbackReason: ensureTrimmedString(entry.fallbackReason, ''),
    generatedBy: ensureTrimmedString(entry.generatedBy, ''),
    id: ensureTrimmedString(entry.id, `chat-${index + 1}`),
    role: ensureTrimmedString(entry.role, 'assistant').toLowerCase() === 'user' ? 'user' : 'assistant',
    text,
  };
}

function normaliseAsset(entry, index = 0) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const kind = ensureTrimmedString(entry.kind, 'figure').toLowerCase();
  if (!kind) {
    return null;
  }

  return {
    caption: clipText(entry.caption || entry.title, 240),
    dataPath: ensureSessionRelativePath(entry.dataPath || entry.tablePath, null),
    id: ensureTrimmedString(entry.id, `asset-${index + 1}`),
    kind,
    number: Math.max(1, ensureNumber(entry.number, index + 1)),
    page:
      entry.page === undefined || entry.page === null || entry.page === ''
        ? entry.pg === undefined || entry.pg === null || entry.pg === ''
          ? null
          : Math.max(1, ensureNumber(entry.pg, 1))
        : Math.max(1, ensureNumber(entry.page, 1)),
    rows: kind === 'table' && Array.isArray(entry.rows) ? clone(entry.rows) : [],
    thumbPath: ensureSessionRelativePath(entry.thumbPath, null),
  };
}

function normaliseSummaryCards(input = {}, existing = DEFAULT_SUMMARY_CARDS) {
  const keyPoints = ensureStringArray(input.keyPoints ?? existing.keyPoints, { limit: 6 });
  const sectionSummaries = ensureObjectArray(input.sectionSummaries ?? existing.sectionSummaries)
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      return {
        id: ensureTrimmedString(entry.id, `section-summary-${index + 1}`),
        label: ensureTrimmedString(entry.label, `Section ${index + 1}`),
        page:
          entry.page === undefined || entry.page === null || entry.page === ''
            ? null
            : Math.max(1, ensureNumber(entry.page, 1)),
        sectionId: ensureTrimmedString(entry.sectionId, ''),
        summary: clipText(entry.summary, 320),
      };
    })
    .filter(Boolean);

  return {
    keyPoints,
    limit: clipText(input.limit ?? existing.limit, 420),
    method: clipText(input.method ?? existing.method, 420),
    result: clipText(input.result ?? existing.result, 420),
    sectionSummaries,
    tldr: clipText(input.tldr ?? existing.tldr, 420),
  };
}

export function deriveReadingSessionStatus(input = {}) {
  const summaryStatus = normaliseSummaryStatus(input.summaryStatus, 'idle');
  const parseStatus = normaliseParseStatus(input.parseStatus, 'idle');

  if (summaryStatus === 'running' || parseStatus === 'running') {
    return 'running';
  }

  if (summaryStatus === 'done') {
    return 'done';
  }

  if (parseStatus === 'done') {
    return 'done';
  }

  if (parseStatus === 'error' || summaryStatus === 'error') {
    return 'todo';
  }

  return normaliseSessionStatus(input.status, 'todo');
}

export function buildReadingSessionSeed(projectId, paper, extras = {}) {
  const timestamp = extras.createdAt || nowIso();
  return normaliseReadingSession(
    {
      abstract: paper.abstract || '',
      authors: paper.authors || [],
      citedByCount: Number(paper.citedByCount) || 0,
      createdAt: timestamp,
      keyPoints: paper.keyPoints || [],
      keywords: paper.keywords || [],
      matchedKeywords: paper.matchedKeywords || [],
      openAccess: Boolean(paper.openAccess),
      paperId: paper.paperId,
      paperUrl: paper.paperUrl || null,
      pdfUrl: paper.pdfUrl || null,
      projectId,
      relevance: Number(paper.relevance) || 0,
      runId: extras.runId || '',
      sourceName: paper.sourceName || 'ARES',
      sourceProvider: paper.sourceProvider || 'manual',
      sourceRefs: extras.sourceRefs || [{ id: paper.paperId, type: 'paper', label: paper.title }],
      startedAt: extras.startedAt || null,
      status: extras.status || 'todo',
      summary: extras.summary || paper.summary || paper.abstract || '',
      title: paper.title,
      venue: paper.venue,
      year: paper.year ?? null,
    },
    {},
  );
}

export function normaliseReadingSession(input = {}, { existing } = {}) {
  const previous = existing && typeof existing === 'object' ? existing : {};
  const createdAt = ensureIso(input.createdAt || previous.createdAt, nowIso());
  const parseStatus = normaliseParseStatus(input.parseStatus, normaliseParseStatus(previous.parseStatus, 'idle'));
  const summaryStatus = normaliseSummaryStatus(
    input.summaryStatus,
    normaliseSummaryStatus(previous.summaryStatus, 'idle'),
  );
  const sections = ensureObjectArray(input.sections !== undefined ? input.sections : previous.sections)
    .map(normaliseSection)
    .filter(Boolean);
  const highlights = ensureObjectArray(input.highlights !== undefined ? input.highlights : previous.highlights)
    .map(normaliseHighlight)
    .filter(Boolean);
  const notes = ensureObjectArray(input.notes !== undefined ? input.notes : previous.notes).map(normaliseNote).filter(Boolean);
  const summaryCards =
    input.summaryCards === null
      ? normaliseSummaryCards({}, DEFAULT_SUMMARY_CARDS)
      : normaliseSummaryCards(
          input.summaryCards || {},
          normaliseSummaryCards(previous.summaryCards || {}, DEFAULT_SUMMARY_CARDS),
        );

  const next = {
    abstract: ensureTrimmedString(input.abstract, previous.abstract || ''),
    agent: ensureTrimmedString(input.agent, previous.agent || 'Reader agent'),
    assets: ensureObjectArray(input.assets !== undefined ? input.assets : previous.assets).map(normaliseAsset).filter(Boolean),
    authors: (() => {
      const values = ensureStringArray(input.authors !== undefined ? input.authors : previous.authors, { limit: 8 });
      return values.length ? values : [];
    })(),
    chatMessages: ensureObjectArray(input.chatMessages !== undefined ? input.chatMessages : previous.chatMessages)
      .map(normaliseChatMessage)
      .filter(Boolean),
    citedByCount:
      input.citedByCount === undefined ? ensureNumber(previous.citedByCount, 0) : ensureNumber(input.citedByCount, 0),
    createdAt,
    error: ensureTrimmedString(input.error, previous.error || ''),
    finishedAt: ensureIso(input.finishedAt, ensureIso(previous.finishedAt, null)),
    highlights,
    id: ensureTrimmedString(input.id, previous.id || buildReadingId('reading')),
    keyPoints: ensureStringArray(input.keyPoints !== undefined ? input.keyPoints : previous.keyPoints, { limit: 6 }),
    keywords: ensureStringArray(input.keywords !== undefined ? input.keywords : previous.keywords, { limit: 8 }),
    matchedKeywords: ensureStringArray(
      input.matchedKeywords !== undefined ? input.matchedKeywords : previous.matchedKeywords,
      { limit: 8 },
    ),
    notes,
    openAccess: input.openAccess === undefined ? ensureBoolean(previous.openAccess, false) : ensureBoolean(input.openAccess),
    pageCount:
      input.pageCount === undefined
        ? previous.pageCount === null || previous.pageCount === undefined
          ? null
          : Math.max(1, ensureNumber(previous.pageCount, 1))
        : input.pageCount === null
          ? null
          : Math.max(1, ensureNumber(input.pageCount, 1)),
    paperId: ensureTrimmedString(input.paperId, previous.paperId || ''),
    paperUrl: input.paperUrl === undefined ? previous.paperUrl || null : ensureTrimmedString(input.paperUrl, '') || null,
    parsedArtifactPath: ensureSessionRelativePath(input.parsedArtifactPath, previous.parsedArtifactPath || null),
    parseError: ensureTrimmedString(input.parseError, previous.parseError || ''),
    parseFinishedAt: ensureIso(input.parseFinishedAt, ensureIso(previous.parseFinishedAt, null)),
    parseStartedAt: ensureIso(input.parseStartedAt, ensureIso(previous.parseStartedAt, null)),
    parseStatus,
    pdfCachePath: ensureSessionRelativePath(input.pdfCachePath, previous.pdfCachePath || null),
    pdfUrl: input.pdfUrl === undefined ? previous.pdfUrl || null : ensureTrimmedString(input.pdfUrl, '') || null,
    projectId: ensureTrimmedString(input.projectId, previous.projectId || ''),
    relevance:
      input.relevance === undefined ? ensureNumber(previous.relevance, 0) : ensureNumber(input.relevance, 0),
    reproParams: ensureObjectArray(input.reproParams !== undefined ? input.reproParams : previous.reproParams),
    runId: ensureTrimmedString(input.runId, previous.runId || ''),
    sections,
    sourceName: ensureTrimmedString(input.sourceName, previous.sourceName || 'Reading session'),
    sourceProvider: ensureTrimmedString(input.sourceProvider, previous.sourceProvider || 'reader'),
    sourceRefs: ensureObjectArray(input.sourceRefs !== undefined ? input.sourceRefs : previous.sourceRefs),
    startedAt: ensureIso(input.startedAt, ensureIso(previous.startedAt, null)),
    status: normaliseSessionStatus(input.status, normaliseSessionStatus(previous.status, 'todo')),
    summary:
      input.summary === null
        ? ''
        : ensureTrimmedString(
            input.summary,
            previous.summary || summaryCards.tldr || firstSentence(input.abstract || previous.abstract || ''),
          ),
    summaryCards,
    summaryFallbackReason:
      input.summaryFallbackReason === '' || input.summaryFallbackReason === null
        ? ''
        : ensureTrimmedString(input.summaryFallbackReason, previous.summaryFallbackReason || ''),
    summaryError:
      input.summaryError === '' || input.summaryError === null
        ? ''
        : ensureTrimmedString(input.summaryError, previous.summaryError || ''),
    summaryFinishedAt: ensureIso(input.summaryFinishedAt, ensureIso(previous.summaryFinishedAt, null)),
    summaryGeneratedBy:
      input.summaryGeneratedBy === '' || input.summaryGeneratedBy === null
        ? ''
        : ensureTrimmedString(input.summaryGeneratedBy, previous.summaryGeneratedBy || ''),
    summaryRuntimeUsed:
      input.summaryRuntimeUsed === undefined
        ? ensureBoolean(previous.summaryRuntimeUsed, false)
        : ensureBoolean(input.summaryRuntimeUsed),
    summaryStartedAt: ensureIso(input.summaryStartedAt, ensureIso(previous.summaryStartedAt, null)),
    summaryStatus,
    title: ensureTrimmedString(input.title, previous.title || 'Untitled paper'),
    updatedAt: ensureIso(input.updatedAt, nowIso()),
    venue: ensureTrimmedString(input.venue, previous.venue || 'Unknown'),
    warning: ensureTrimmedString(input.warning, previous.warning || ''),
    year:
      input.year === undefined
        ? previous.year ?? null
        : input.year === null || input.year === ''
          ? null
          : ensureNumber(input.year, null),
  };

  if (!next.paperId || !next.projectId) {
    throw new Error('Reading session requires projectId and paperId.');
  }

  next.status = deriveReadingSessionStatus(next);

  if (!next.summary && next.summaryCards.tldr) {
    next.summary = next.summaryCards.tldr;
  }

  return next;
}
