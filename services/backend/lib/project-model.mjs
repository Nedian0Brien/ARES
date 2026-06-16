const DEFAULT_PROJECT_COLOR = '#5e6ad2';
const MAX_PROJECT_ID_LENGTH = 60;

function ensureText(value, fallback = '') {
  return value === null || value === undefined ? fallback : String(value);
}

function slugifyProjectId(value) {
  const slug = ensureText(value)
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_PROJECT_ID_LENGTH)
    .replace(/-+$/g, '');

  return slug || 'project';
}

function uniqueProjectId(baseId, existingIds) {
  if (!existingIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  let nextId = `${baseId}-${suffix}`;
  while (existingIds.has(nextId)) {
    suffix += 1;
    nextId = `${baseId}-${suffix}`;
  }
  return nextId;
}

function normalizeKeywords(values) {
  const source = Array.isArray(values) ? values : ensureText(values).split(',');
  return Array.from(
    new Set(
      source
        .map((value) => ensureText(value).trim())
        .filter(Boolean),
    ),
  ).slice(0, 16);
}

function normalizeColor(value) {
  const color = ensureText(value).trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_PROJECT_COLOR;
}

export function normalizeNewProject(input = {}, { existingIds = new Set(), now = new Date().toISOString() } = {}) {
  const name = ensureText(input.name).trim();
  if (!name) {
    throw new Error('Project name is required.');
  }

  const baseId = slugifyProjectId(input.id || name);
  return {
    color: normalizeColor(input.color),
    createdAt: now,
    defaultQuery: ensureText(input.defaultQuery || input.default_query).trim(),
    focus: ensureText(input.focus).trim(),
    id: uniqueProjectId(baseId, existingIds),
    keywords: normalizeKeywords(input.keywords),
    name,
    updatedAt: now,
  };
}
