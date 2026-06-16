import { randomUUID } from 'node:crypto';

const SUPPORTED_CITATION_STYLES = new Set(['apa', 'ieee']);

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

function ensureTextArray(value, limit = 32) {
  return (Array.isArray(value) ? value : [])
    .map((entry) => ensureText(entry))
    .filter(Boolean)
    .slice(0, limit);
}

function normaliseStyleName(value, fallback = 'ieee') {
  const style = ensureText(value, fallback).toLowerCase();
  return SUPPORTED_CITATION_STYLES.has(style) ? style : fallback;
}

function citationSlug(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function buildCitationKey(input = {}) {
  const authors = ensureTextArray(input.authors, 16);
  const firstAuthor = citationSlug((authors[0] || 'source').split(/\s+/).slice(-1)[0]) || 'source';
  const year = ensureNumber(input.year) || 'nd';
  const titleTerm = citationSlug(ensureText(input.title, 'untitled').split(/\s+/).find((term) => term.length >= 4) || 'untitled');
  return [firstAuthor, year, titleTerm].filter(Boolean).join('-');
}

export function normaliseBibliographyItem(input = {}, options = {}) {
  const createdAt = ensureText(input.createdAt, nowIso());
  const authors = ensureTextArray(input.authors, 32);
  const title = ensureText(input.title, 'Untitled source');

  return {
    accessedAt: ensureText(input.accessedAt),
    authors,
    citationKey: ensureText(input.citationKey, buildCitationKey({ ...input, authors, title })),
    createdAt,
    doi: ensureText(input.doi),
    id: ensureText(input.id, createId('bib')),
    projectId: ensureText(input.projectId, options.projectId),
    publisher: ensureText(input.publisher),
    sourceId: ensureText(input.sourceId),
    sourceType: ensureText(input.sourceType, 'paper'),
    style: {
      defaultStyle: normaliseStyleName(input.style?.defaultStyle || input.defaultStyle),
      metadata: input.style?.metadata && typeof input.style.metadata === 'object' ? { ...input.style.metadata } : {},
    },
    title,
    type: ensureText(input.type, 'paper'),
    updatedAt: ensureText(input.updatedAt, createdAt),
    url: input.url ? String(input.url) : '',
    venue: ensureText(input.venue),
    year: ensureNumber(input.year),
  };
}

export function normaliseCitation(input = {}, options = {}) {
  const createdAt = ensureText(input.createdAt, nowIso());
  const locator = input.locator && typeof input.locator === 'object' ? input.locator : {};

  return {
    bibliographyItemId: ensureText(input.bibliographyItemId),
    citationKey: ensureText(input.citationKey),
    createdAt,
    evidenceLinkId: ensureText(input.evidenceLinkId),
    id: ensureText(input.id, createId('cite')),
    locator: {
      label: ensureText(locator.label || input.locatorLabel),
      page: ensureNumber(locator.page ?? input.page),
      quote: ensureText(locator.quote || input.quote),
      sectionId: ensureText(locator.sectionId || input.sectionId),
    },
    projectId: ensureText(input.projectId, options.projectId),
    sourceId: ensureText(input.sourceId),
    style: {
      marker: ensureText(input.style?.marker || input.marker),
      name: normaliseStyleName(input.style?.name || input.styleName),
    },
    updatedAt: ensureText(input.updatedAt, createdAt),
  };
}

function compactSentence(parts = []) {
  return parts.map((part) => ensureText(part)).filter(Boolean).join(' ');
}

function formatIeeeAuthors(authors = []) {
  return authors.length ? authors.join(', ') : '저자 정보 없음';
}

function apaAuthorName(name) {
  const parts = ensureText(name).split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return '';
  }

  const family = parts.at(-1);
  const initials = parts
    .slice(0, -1)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join(' ');
  return initials ? `${family}, ${initials}` : family;
}

function formatApaAuthors(authors = []) {
  const names = authors.map(apaAuthorName).filter(Boolean);
  if (!names.length) {
    return '저자 정보 없음';
  }
  if (names.length === 1) {
    return names[0];
  }
  return `${names.slice(0, -1).join(', ')}, & ${names.at(-1)}`;
}

export function formatBibliographyItem(input = {}, { index = 1, style } = {}) {
  const item = normaliseBibliographyItem(input);
  const styleName = normaliseStyleName(style || item.style.defaultStyle);
  if (styleName === 'apa') {
    const year = item.year || 'n.d.';
    return compactSentence([
      `${formatApaAuthors(item.authors)} (${year}).`,
      `${item.title}.`,
      item.venue ? `${item.venue}.` : '',
      item.doi ? `https://doi.org/${item.doi.replace(/^https?:\/\/doi\.org\//i, '')}` : item.url,
    ]);
  }

  const year = item.year ? `, ${item.year}` : '';
  return compactSentence([
    `[${index}]`,
    `${formatIeeeAuthors(item.authors)},`,
    `"${item.title},"`,
    item.venue ? `${item.venue}${year}.` : `${year.replace(/^, /, '')}.`,
    item.doi ? `doi: ${item.doi.replace(/^https?:\/\/doi\.org\//i, '')}.` : item.url,
  ]);
}

export function formatCitationMarker(citation = {}, { index = 1, style } = {}) {
  const styleName = normaliseStyleName(style || citation.style?.name);
  const locator = citation.locator || {};
  if (styleName === 'apa') {
    const page = locator.page ? `, p. ${locator.page}` : '';
    return `(${ensureText(citation.citationKey, 'source')}${page})`;
  }

  const page = locator.page ? `, p. ${locator.page}` : '';
  return `[${index}${page}]`;
}
