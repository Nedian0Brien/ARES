const CURRENT_YEAR = new Date().getUTCFullYear();

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function decodeAbstract(invertedIndex) {
  if (!invertedIndex || typeof invertedIndex !== 'object') {
    return '';
  }

  const words = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const position of positions) {
      words[position] = word;
    }
  }

  return words.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

export function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function buildSearchTerms(project, query) {
  return unique([...(project?.keywords || []), ...tokenize(query)]);
}

export function summariseAbstract(abstract) {
  const clean = String(abstract || '').trim();
  if (!clean) {
    return 'Abstract metadata is not available for this paper yet.';
  }

  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length <= 2) {
    return clean;
  }

  return sentences.slice(0, 2).join(' ');
}

export function extractKeyPoints({ abstract, keywords = [], citedByCount, venue, year, openAccess }) {
  const points = [];
  const sentences = String(abstract || '')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (keywords.length) {
    points.push(...keywords.slice(0, 2).map((keyword) => `${keyword} is central to this paper.`));
  }

  if (sentences.length) {
    points.push(sentences[0]);
  }

  if (sentences.length > 1) {
    points.push(sentences[1]);
  }

  if (venue || year) {
    points.push(`${venue || 'Publication venue'}${year ? `, ${year}` : ''}.`);
  }

  if (Number.isFinite(citedByCount)) {
    points.push(`Cited by ${citedByCount} other works.`);
  }

  points.push(openAccess ? 'Open-access version is available.' : 'Open-access PDF is not confirmed.');

  return unique(points).slice(0, 4);
}

export function detectMatchedKeywords({ title, abstract, keywords = [] }, searchTerms) {
  const haystack = `${title || ''} ${abstract || ''} ${(keywords || []).join(' ')}`.toLowerCase();
  return searchTerms.filter((term) => haystack.includes(term.toLowerCase())).slice(0, 6);
}

export function computeRelevance({ rawRelevance = 0, title, abstract, keywords = [], citedByCount = 0, year, project, query }) {
  const terms = buildSearchTerms(project, query);
  const matchedKeywords = detectMatchedKeywords({ title, abstract, keywords }, terms);

  const exactTitleHits = matchedKeywords.filter((term) => String(title || '').toLowerCase().includes(term.toLowerCase())).length;
  const abstractHits = matchedKeywords.length - exactTitleHits;
  const citationBoost = Math.min(12, Math.log10(citedByCount + 1) * 5);
  const yearBoost = year ? clamp(10 - Math.max(0, CURRENT_YEAR - year) * 2, 0, 10) : 0;
  const rawBoost = clamp((rawRelevance || 0) * 38, 0, 38);
  const matchBoost = exactTitleHits * 10 + abstractHits * 4;

  return clamp(Math.round(38 + rawBoost + matchBoost + citationBoost + yearBoost), 0, 100);
}

export function yearBucket(year) {
  if (!year) {
    return 'unknown';
  }

  if (year >= 2024) {
    return '2024';
  }

  if (year >= 2021) {
    return '2023';
  }

  return 'earlier';
}

export function normaliseVenueLabel(venue) {
  const value = String(venue || '').trim();
  if (!value) {
    return 'Unknown';
  }

  if (/arxiv/i.test(value)) {
    return 'arXiv';
  }

  return value;
}
