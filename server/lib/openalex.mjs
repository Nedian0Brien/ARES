import {
  computeRelevance,
  decodeAbstract,
  detectMatchedKeywords,
  extractKeyPoints,
  normaliseVenueLabel,
  summariseAbstract,
  unique,
} from './search-utils.mjs';

const OPENALEX_URL = 'https://api.openalex.org/works';

function buildHeaders() {
  return {
    accept: 'application/json',
    'user-agent': 'ARES/0.1 (+https://github.com/openai/ares)',
  };
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

export async function searchOpenAlex({ project, query, page = 1, perPage = 20, apiKey, mailto }) {
  const url = new URL(OPENALEX_URL);
  url.searchParams.set('search', query);
  url.searchParams.set('page', String(page));
  url.searchParams.set('per-page', String(perPage));
  url.searchParams.set(
    'select',
    'id,doi,display_name,publication_year,publication_date,authorships,primary_location,best_oa_location,open_access,cited_by_count,abstract_inverted_index,relevance_score,primary_topic,keywords',
  );

  if (apiKey) {
    url.searchParams.set('api_key', apiKey);
  }

  if (mailto) {
    url.searchParams.set('mailto', mailto);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      headers: buildHeaders(),
      signal: controller.signal,
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`OpenAlex request failed with ${response.status}: ${message.slice(0, 240)}`);
    }

    const payload = await response.json();
    const results = (payload?.results || []).map((work) => normaliseWork(work, { project, query }));

    return {
      provider: 'openalex',
      live: true,
      total: Number(payload?.meta?.count) || results.length,
      results,
    };
  } finally {
    clearTimeout(timeout);
  }
}
