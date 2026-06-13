const DEFAULT_TIMEOUT_MS = 2500;
const MAX_CHUNK_TEXT_LENGTH = 800;

function clipText(value, maxLength = MAX_CHUNK_TEXT_LENGTH) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeEndpoint(endpoint) {
  const value = String(endpoint || '').trim();
  if (!value) {
    return '';
  }

  return new URL(value).href;
}

function buildScorerPayload({ chunks = [], message = '', queryTerms = [], selection = null, session = null } = {}) {
  return {
    chunks: chunks.map((chunk) => ({
      id: String(chunk.id || ''),
      page: chunk.page || null,
      sectionId: String(chunk.sectionId || ''),
      sectionLabel: String(chunk.sectionLabel || ''),
      text: clipText(chunk.text),
    })),
    query: String(message || '').trim(),
    queryTerms: Array.isArray(queryTerms) ? queryTerms.map((term) => String(term || '').trim()).filter(Boolean) : [],
    selection: selection
      ? {
          page: selection.page || null,
          quote: clipText(selection.quote, 400),
        }
      : null,
    session: session
      ? {
          id: String(session.id || ''),
          title: String(session.title || ''),
        }
      : null,
  };
}

function normalizeScorerResponse(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.scores)) {
    return payload.scores;
  }

  if (Array.isArray(payload?.results)) {
    return payload.results;
  }

  return [];
}

export function createHttpRetrievalScorer({
  apiKey = '',
  endpoint,
  fetchImpl = globalThis.fetch,
  provider = 'http-reranker',
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const endpointUrl = normalizeEndpoint(endpoint);
  if (!endpointUrl) {
    throw new Error('endpoint is required to create an HTTP retrieval scorer.');
  }

  if (typeof fetchImpl !== 'function') {
    throw new Error('fetchImpl is required to create an HTTP retrieval scorer.');
  }

  const safeTimeoutMs = positiveNumber(timeoutMs, DEFAULT_TIMEOUT_MS);
  const providerName = String(provider || 'http-reranker').trim() || 'http-reranker';

  return {
    provider: providerName,
    async scoreChunks(input) {
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, safeTimeoutMs);

      try {
        const headers = {
          'content-type': 'application/json',
        };
        if (apiKey) {
          headers.authorization = `Bearer ${apiKey}`;
        }

        const response = await fetchImpl(endpointUrl, {
          body: JSON.stringify(buildScorerPayload(input)),
          headers,
          method: 'POST',
          signal: controller.signal,
        });
        if (!response.ok) {
          const detail = typeof response.text === 'function' ? await response.text() : '';
          throw new Error(`Retrieval scorer request failed (${response.status}): ${clipText(detail, 180)}`);
        }

        return normalizeScorerResponse(await response.json());
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function createConfiguredRetrievalScorer(env = process.env, { fetchImpl = globalThis.fetch } = {}) {
  const endpoint = env.ARES_RETRIEVAL_SCORER_URL || '';
  if (!String(endpoint).trim()) {
    return null;
  }

  return createHttpRetrievalScorer({
    apiKey: env.ARES_RETRIEVAL_SCORER_API_KEY || '',
    endpoint,
    fetchImpl,
    provider: env.ARES_RETRIEVAL_SCORER_PROVIDER || 'http-reranker',
    timeoutMs: env.ARES_RETRIEVAL_SCORER_TIMEOUT_MS || DEFAULT_TIMEOUT_MS,
  });
}
