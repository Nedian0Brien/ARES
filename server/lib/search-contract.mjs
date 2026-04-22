import { normaliseVenueLabel } from './search-utils.mjs';

const SEARCH_SCOPE_TYPES = new Set(['conference', 'author', 'institution']);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function toPage(value) {
  const page = Number(value);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

export function normaliseSearchMode(value) {
  return String(value || '').trim().toLowerCase() === 'scout' ? 'scout' : 'keyword';
}

export function normaliseSearchScope(scope) {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) {
    return null;
  }

  const type = String(scope.type || '').trim().toLowerCase();
  const label = String(scope.label || '').trim();
  const id = String(scope.id || label).trim();

  if (!SEARCH_SCOPE_TYPES.has(type) || !label || !id) {
    return null;
  }

  const meta =
    scope.meta && typeof scope.meta === 'object' && !Array.isArray(scope.meta) ? cloneJson(scope.meta) : {};

  return {
    id,
    type,
    label,
    meta,
  };
}

export function normaliseSearchScopes(scopes) {
  if (!Array.isArray(scopes)) {
    return [];
  }

  return scopes.map((scope) => normaliseSearchScope(scope)).filter(Boolean);
}

export function parseSearchPayload(payload = {}) {
  return {
    projectId: String(payload.projectId || '').trim(),
    q: String(payload.q || '').trim(),
    mode: normaliseSearchMode(payload.mode),
    scopes: normaliseSearchScopes(payload.scopes),
    page: toPage(payload.page),
  };
}

export function parseSearchQuery(searchParams) {
  let scopes = [];
  const rawScopes = searchParams.get('scopes');

  if (rawScopes) {
    try {
      scopes = JSON.parse(rawScopes);
    } catch {
      scopes = [];
    }
  }

  return parseSearchPayload({
    projectId: searchParams.get('projectId'),
    q: searchParams.get('q'),
    mode: searchParams.get('mode'),
    scopes,
    page: searchParams.get('page'),
  });
}

export function sanitisePaperRecord(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Paper payload is required.');
  }

  if (!payload.paperId || !payload.title) {
    throw new Error('Paper payload must include paperId and title.');
  }

  const yearValue = payload.year === null || payload.year === undefined || payload.year === '' ? null : Number(payload.year);

  return {
    paperId: String(payload.paperId),
    title: String(payload.title),
    authors: Array.isArray(payload.authors) ? payload.authors.slice(0, 8).map(String) : [],
    venue: normaliseVenueLabel(payload.venue),
    year: Number.isFinite(yearValue) ? yearValue : null,
    abstract: String(payload.abstract || ''),
    summary: String(payload.summary || ''),
    keyPoints: Array.isArray(payload.keyPoints) ? payload.keyPoints.slice(0, 6).map(String) : [],
    keywords: Array.isArray(payload.keywords) ? payload.keywords.slice(0, 8).map(String) : [],
    matchedKeywords: Array.isArray(payload.matchedKeywords) ? payload.matchedKeywords.slice(0, 8).map(String) : [],
    citedByCount: Number(payload.citedByCount) || 0,
    openAccess: Boolean(payload.openAccess),
    paperUrl: payload.paperUrl ? String(payload.paperUrl) : null,
    pdfUrl: payload.pdfUrl ? String(payload.pdfUrl) : null,
    sourceName: String(payload.sourceName || 'Unknown provider'),
    sourceProvider: String(payload.sourceProvider || 'manual'),
    relevance: Math.max(0, Math.min(100, Number(payload.relevance) || 0)),
  };
}

export function sanitiseSearchResultsPayload(payload = {}) {
  const results = Array.isArray(payload.results) ? payload.results.map((paper) => sanitisePaperRecord(paper)) : [];
  const total = Number(payload.total);

  return {
    provider: payload.provider ? String(payload.provider) : '',
    live: payload.live !== false,
    total: Number.isFinite(total) ? total : results.length,
    query: String(payload.query || ''),
    warning: payload.warning ? String(payload.warning) : '',
    searchMode: normaliseSearchMode(payload.searchMode),
    agentRuntime: payload.agentRuntime ? String(payload.agentRuntime) : '',
    results,
  };
}
