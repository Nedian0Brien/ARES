import {
  conferenceScopeVenue,
  computeRelevance,
  decodeAbstract,
  detectMatchedKeywords,
  extractKeyPoints,
  normaliseVenueLabel,
  scopeYear,
  stripYearTokens,
  summariseAbstract,
  tokenize,
  unique,
} from './search-utils.mjs';

const OPENALEX_URL = 'https://api.openalex.org/works';
const OPENALEX_AUTHOR_URL = 'https://api.openalex.org/authors';
const OPENALEX_INSTITUTION_URL = 'https://api.openalex.org/institutions';
const OPENALEX_SOURCE_URL = 'https://api.openalex.org/sources';
const OPENALEX_TIMEOUT_MS = 12000;

function buildHeaders() {
  return {
    accept: 'application/json',
    'user-agent': 'ARES/0.1 (+https://github.com/openai/ares)',
  };
}

function comparableText(value) {
  return tokenize(stripYearTokens(value)).join(' ');
}

function applyOpenAlexAuth(url, { apiKey, mailto }) {
  if (apiKey) {
    url.searchParams.set('api_key', apiKey);
  }

  if (mailto) {
    url.searchParams.set('mailto', mailto);
  }
}

async function fetchOpenAlexJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENALEX_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: buildHeaders(),
      signal: controller.signal,
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`OpenAlex request failed with ${response.status}: ${message.slice(0, 240)}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function buildEntityMatchScore(fields, needle) {
  if (!needle) {
    return 0;
  }

  const tokens = needle.split(/\s+/).filter(Boolean);
  let bestScore = 0;

  for (const field of fields) {
    const value = comparableText(field);
    if (!value) {
      continue;
    }

    if (value === needle) {
      bestScore = Math.max(bestScore, 100);
      continue;
    }

    if (value.startsWith(needle)) {
      bestScore = Math.max(bestScore, 92);
      continue;
    }

    if (value.includes(needle)) {
      bestScore = Math.max(bestScore, 82);
      continue;
    }

    if (tokens.length && tokens.every((token) => value.includes(token))) {
      bestScore = Math.max(bestScore, 72);
    }
  }

  return bestScore;
}

function selectBestEntityIds(results, label, fieldsForEntity, limit = 1) {
  const needle = comparableText(label);
  if (!needle) {
    return [];
  }

  const scored = results
    .map((result) => ({
      id: result?.id,
      score: buildEntityMatchScore(fieldsForEntity(result), needle),
      citedByCount: Number(result?.cited_by_count) || 0,
      worksCount: Number(result?.works_count) || 0,
    }))
    .filter((entry) => entry.id)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.worksCount - left.worksCount ||
        right.citedByCount - left.citedByCount,
    );

  if (!scored.length) {
    return [];
  }

  const filtered = scored.filter((entry) => entry.score > 0);
  const resolved = filtered.length ? filtered : scored.slice(0, 1);
  return resolved.slice(0, limit).map((entry) => String(entry.id));
}

async function searchEntities(urlString, { query, select, apiKey, mailto, perPage = 5 }) {
  const url = new URL(urlString);
  url.searchParams.set('search', query);
  url.searchParams.set('per-page', String(perPage));
  url.searchParams.set('select', select.join(','));
  applyOpenAlexAuth(url, { apiKey, mailto });

  const payload = await fetchOpenAlexJson(url);
  return payload?.results || [];
}

function uniqueByKey(values, keyForValue) {
  const seen = new Set();
  const results = [];

  for (const value of values) {
    const key = keyForValue(value);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    results.push(value);
  }

  return results;
}

function bestPaperUrl(work) {
  return (
    work?.best_oa_location?.landing_page_url ||
    work?.primary_location?.landing_page_url ||
    work?.doi ||
    work?.id ||
    null
  );
}

function bestPdfUrl(work) {
  return (
    work?.best_oa_location?.pdf_url ||
    work?.open_access?.oa_url ||
    null
  );
}

function buildMatchedKeywords(work, project, query, abstract) {
  const keywords = [
    ...(work?.keywords || []).map((keyword) => keyword.display_name),
    work?.primary_topic?.display_name,
  ].filter(Boolean);

  return detectMatchedKeywords(
    {
      title: work.display_name,
      abstract,
      keywords,
    },
    unique([...(project?.keywords || []), ...String(query || '').split(/\s+/), ...keywords]),
  );
}

function normaliseWork(work, { project, query }) {
  const abstract = decodeAbstract(work.abstract_inverted_index);
  const keywords = unique([
    ...(work?.keywords || []).map((keyword) => keyword.display_name),
    work?.primary_topic?.display_name,
    work?.primary_topic?.subfield?.display_name,
  ]).slice(0, 6);
  const venue = normaliseVenueLabel(
    work?.primary_location?.source?.display_name || work?.primary_topic?.display_name || 'Unknown venue',
  );
  const citedByCount = Number(work?.cited_by_count) || 0;
  const year = Number(work?.publication_year) || null;
  const openAccess = Boolean(work?.open_access?.is_oa || work?.best_oa_location?.pdf_url);
  const matchedKeywords = buildMatchedKeywords(work, project, query, abstract);
  const rawRelevance = Number(work?.relevance_score) || 0;

  return {
    paperId: String(work?.id || work?.doi || work?.display_name || Math.random()),
    title: work?.display_name || 'Untitled paper',
    authors: (work?.authorships || [])
      .map((authorship) => authorship?.author?.display_name)
      .filter(Boolean)
      .slice(0, 6),
    venue,
    year,
    abstract,
    summary: summariseAbstract(abstract),
    keyPoints: extractKeyPoints({
      abstract,
      keywords,
      citedByCount,
      venue,
      year,
      openAccess,
    }),
    keywords,
    matchedKeywords,
    citedByCount,
    openAccess,
    paperUrl: bestPaperUrl(work),
    pdfUrl: bestPdfUrl(work),
    sourceName: 'OpenAlex',
    sourceProvider: 'openalex',
    relevance: computeRelevance({
      rawRelevance,
      title: work?.display_name,
      abstract,
      keywords,
      citedByCount,
      year,
      project,
      query,
    }),
  };
}

function conferenceWorkMatches(work, scope) {
  const venueNeedle = comparableText(conferenceScopeVenue(scope) || scope.label);
  const year = scopeYear(scope.label);
  const sourceNames = unique([
    work?.primary_location?.source?.display_name,
    work?.primary_location?.source?.abbreviated_title,
    work?.best_oa_location?.source?.display_name,
    work?.best_oa_location?.source?.abbreviated_title,
  ])
    .map((value) => comparableText(value))
    .filter(Boolean);

  const yearMatches = !year || Number(work?.publication_year) === year;
  const venueMatches = venueNeedle ? sourceNames.some((value) => value.includes(venueNeedle)) : true;
  return yearMatches && venueMatches;
}

function authorWorkMatches(work, scope) {
  const needle = comparableText(scope.label);
  const authors = (work?.authorships || [])
    .map((authorship) => authorship?.author?.display_name)
    .map((value) => comparableText(value))
    .filter(Boolean);

  return Boolean(needle) && authors.some((author) => author.includes(needle));
}

function institutionWorkMatches(work, scope) {
  const needle = comparableText(scope.label);
  const institutions = (work?.authorships || [])
    .flatMap((authorship) => [
      ...(authorship?.institutions || []).map((institution) => institution?.display_name),
      ...(authorship?.raw_affiliation_strings || []),
    ])
    .map((value) => comparableText(value))
    .filter(Boolean);

  return Boolean(needle) && institutions.some((value) => value.includes(needle));
}

async function resolveConferencePlan(scope, context) {
  const venueQuery = conferenceScopeVenue(scope) || scope.label;
  const year = scopeYear(scope.label);
  const sources = await searchEntities(OPENALEX_SOURCE_URL, {
    query: venueQuery,
    select: ['id', 'display_name', 'abbreviated_title', 'works_count', 'cited_by_count'],
    apiKey: context.apiKey,
    mailto: context.mailto,
  });
  const sourceIds = selectBestEntityIds(
    sources,
    venueQuery,
    (source) => [source?.display_name, source?.abbreviated_title],
  );
  const filters = [];

  if (sourceIds.length) {
    filters.push(`primary_location.source.id:${sourceIds.join('|')}`);
  }

  if (year) {
    filters.push(`publication_year:${year}`);
  }

  return {
    filters,
    postFilter: (work) => conferenceWorkMatches(work, scope),
  };
}

async function resolveAuthorPlan(scope, context) {
  const authors = await searchEntities(OPENALEX_AUTHOR_URL, {
    query: scope.label,
    select: ['id', 'display_name', 'works_count', 'cited_by_count'],
    apiKey: context.apiKey,
    mailto: context.mailto,
  });
  const authorIds = selectBestEntityIds(authors, scope.label, (author) => [author?.display_name]);

  return {
    filters: authorIds.length ? [`authorships.author.id:${authorIds.join('|')}`] : [],
    postFilter: (work) => authorWorkMatches(work, scope),
  };
}

async function resolveInstitutionPlan(scope, context) {
  const institutions = await searchEntities(OPENALEX_INSTITUTION_URL, {
    query: scope.label,
    select: ['id', 'display_name', 'works_count', 'cited_by_count'],
    apiKey: context.apiKey,
    mailto: context.mailto,
  });
  const institutionIds = selectBestEntityIds(institutions, scope.label, (institution) => [institution?.display_name]);

  return {
    filters: institutionIds.length ? [`institutions.id:${institutionIds.join('|')}`] : [`raw_affiliation_strings.search:${scope.label}`],
    postFilter: (work) => institutionWorkMatches(work, scope),
  };
}

async function buildScopePlan(scope, context) {
  if (scope.type === 'conference') {
    return resolveConferencePlan(scope, context);
  }

  if (scope.type === 'author') {
    return resolveAuthorPlan(scope, context);
  }

  return resolveInstitutionPlan(scope, context);
}

async function fetchWorksForPlan({ filters = [], postFilter }, { project, query, page, perPage, apiKey, mailto }) {
  const url = new URL(OPENALEX_URL);
  url.searchParams.set('search', query);
  url.searchParams.set('page', String(page));
  url.searchParams.set('per-page', String(perPage));
  url.searchParams.set(
    'select',
    'id,doi,display_name,publication_year,publication_date,authorships,primary_location,best_oa_location,open_access,cited_by_count,abstract_inverted_index,relevance_score,primary_topic,keywords',
  );

  if (filters.length) {
    url.searchParams.set('filter', filters.join(','));
  }

  applyOpenAlexAuth(url, { apiKey, mailto });

  const payload = await fetchOpenAlexJson(url);
  const rawResults = payload?.results || [];
  const filteredResults = postFilter ? rawResults.filter((work) => postFilter(work)) : rawResults;

  return {
    provider: 'openalex',
    live: true,
    total: Number(payload?.meta?.count) || filteredResults.length,
    results: filteredResults.map((work) => normaliseWork(work, { project, query })),
  };
}

export async function searchOpenAlex({ project, query, page = 1, perPage = 20, apiKey, mailto, scopes = [] }) {
  const activeScopes = Array.isArray(scopes) ? scopes.filter(Boolean) : [];
  const context = { apiKey, mailto };

  if (!activeScopes.length) {
    return fetchWorksForPlan(
      { filters: [], postFilter: null },
      { project, query, page, perPage, apiKey, mailto },
    );
  }

  const fetchPerScope = Math.min(Math.max(perPage, 24), 50);
  const plans = await Promise.all(activeScopes.map((scope) => buildScopePlan(scope, context)));
  const responses = await Promise.all(
    plans.map((plan) =>
      fetchWorksForPlan(plan, {
        project,
        query,
        page,
        perPage: fetchPerScope,
        apiKey,
        mailto,
      }),
    ),
  );

  const results = uniqueByKey(
    responses.flatMap((response) => response.results),
    (paper) => paper.paperId,
  )
    .sort((left, right) => right.relevance - left.relevance || right.citedByCount - left.citedByCount)
    .slice(0, perPage);

  return {
    provider: 'openalex',
    live: true,
    total: results.length,
    results,
  };
}
