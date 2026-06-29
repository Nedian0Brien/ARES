const VALID_LIBRARY_SHELVES = new Set(['unread', 'reading', 'done']);
const SORTERS = new Set(['recent', 'saved', 'oldest', 'title', 'year']);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function ensureText(value, fallback = '') {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
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

function normaliseBoolean(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }

  return Boolean(value);
}

function clampProgress(value, fallback = 0) {
  const next = Number(value);
  if (!Number.isFinite(next)) {
    return fallback;
  }

  return Math.max(0, Math.min(100, next));
}

function normaliseShelf(value, progress) {
  const next = ensureText(value).toLowerCase();
  if (VALID_LIBRARY_SHELVES.has(next)) {
    return next;
  }

  if (progress >= 100) {
    return 'done';
  }

  return progress > 0 ? 'reading' : 'unread';
}

function normaliseLibraryCollections(input = {}) {
  const direct = ensureTextArray(input.collectionIds || input.collections, 16);
  if (direct.length) {
    return direct;
  }

  return ensureTextArray([input.collectionId || input.collection || input.coll], 16);
}

function timestampValue(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareUpdatedDesc(left, right) {
  return timestampValue(right.updatedAt || right.savedAt) - timestampValue(left.updatedAt || left.savedAt);
}

function includesText(value, needle) {
  return ensureText(value).toLowerCase().includes(needle);
}

function matchesQuery(paper, query) {
  const needle = ensureText(query).toLowerCase();
  if (!needle) {
    return true;
  }

  return [
    paper.title,
    paper.abstract,
    paper.summary,
    paper.venue,
    paper.year,
    ...(Array.isArray(paper.authors) ? paper.authors : []),
    ...(Array.isArray(paper.keywords) ? paper.keywords : []),
    ...(Array.isArray(paper.tags) ? paper.tags : []),
  ].some((value) => includesText(value, needle));
}

export function normaliseSavedLibraryPaper(input = {}, { existing = null, now = nowIso(), projectId = '' } = {}) {
  const base = existing && typeof existing === 'object' ? clone(existing) : {};
  const value = input && typeof input === 'object' ? input : {};
  const next = {
    ...base,
    ...clone(value),
  };

  const paperId = ensureText(next.paperId || next.id);
  const title = ensureText(next.title);
  if (!paperId || !title) {
    throw new Error('Library paper requires paperId and title.');
  }

  const previousProgress = clampProgress(base.readingProgress ?? base.progress, 0);
  let progress = clampProgress(next.readingProgress ?? next.progress, previousProgress);
  const requestedShelf = next.shelf || next.libraryStatus || next.readingStatus || next.status;
  const shelf = normaliseShelf(requestedShelf, progress);
  if (shelf === 'done' && next.readingProgress === undefined && next.progress === undefined) {
    progress = 100;
  }

  const collectionIds = normaliseLibraryCollections(next);
  const savedAt = ensureText(next.savedAt || base.savedAt, now);
  const updatedAt = ensureText(next.updatedAt, now);

  return {
    ...next,
    coll: collectionIds[0] || '',
    collectionIds,
    flag: normaliseBoolean(next.flag ?? next.important ?? next.starred, Boolean(base.flag)),
    libraryStatus: shelf,
    paperId,
    progress,
    projectId: ensureText(next.projectId, projectId),
    readingProgress: progress,
    savedAt,
    shelf,
    tags: ensureTextArray(next.tags || next.libraryTags, 32),
    title,
    updatedAt,
  };
}

export function normaliseLibraryPatch(input = {}, existing = {}) {
  const patch = {};

  if ('flag' in input || 'important' in input || 'starred' in input) {
    patch.flag = normaliseBoolean(input.flag ?? input.important ?? input.starred, Boolean(existing.flag));
  }

  if ('tags' in input || 'libraryTags' in input) {
    patch.tags = ensureTextArray(input.tags || input.libraryTags, 32);
  }

  if ('collectionIds' in input || 'collections' in input || 'collectionId' in input || 'collection' in input || 'coll' in input) {
    const collectionIds = normaliseLibraryCollections(input);
    patch.collectionIds = collectionIds;
    patch.coll = collectionIds[0] || '';
  }

  if ('readingProgress' in input || 'progress' in input) {
    patch.readingProgress = clampProgress(input.readingProgress ?? input.progress, existing.readingProgress ?? existing.progress ?? 0);
    patch.progress = patch.readingProgress;
  }

  if ('shelf' in input || 'libraryStatus' in input || 'readingStatus' in input || 'status' in input || 'readingProgress' in input || 'progress' in input) {
    const progress = patch.readingProgress ?? existing.readingProgress ?? existing.progress ?? 0;
    const shelf = normaliseShelf(input.shelf || input.libraryStatus || input.readingStatus || input.status, progress);
    patch.libraryStatus = shelf;
    patch.shelf = shelf;
    if (shelf === 'done' && !('readingProgress' in input) && !('progress' in input)) {
      patch.readingProgress = 100;
      patch.progress = 100;
    }
  }

  return patch;
}

export function filterLibraryPapers(papers = [], filters = {}) {
  const shelf = ensureText(filters.shelf || 'all').toLowerCase();
  const collection = ensureText(filters.collection);
  const tag = ensureText(filters.tag).toLowerCase();
  const sort = SORTERS.has(ensureText(filters.sort).toLowerCase()) ? ensureText(filters.sort).toLowerCase() : 'recent';

  let values = ensureArray(papers).map((paper) => normaliseSavedLibraryPaper(paper));

  values = values.filter((paper) => matchesQuery(paper, filters.q));

  if (shelf && shelf !== 'all') {
    values = values.filter((paper) => (shelf === 'flag' ? paper.flag : paper.shelf === shelf || paper.libraryStatus === shelf));
  }

  if (collection) {
    values = values.filter((paper) => ensureArray(paper.collectionIds).includes(collection) || paper.coll === collection);
  }

  if (tag) {
    values = values.filter((paper) => ensureArray(paper.tags).some((value) => ensureText(value).toLowerCase() === tag));
  }

  values.sort((left, right) => {
    if (sort === 'oldest') {
      return timestampValue(left.savedAt || left.updatedAt) - timestampValue(right.savedAt || right.updatedAt);
    }
    if (sort === 'saved') {
      return timestampValue(right.savedAt) - timestampValue(left.savedAt);
    }
    if (sort === 'title') {
      return left.title.localeCompare(right.title);
    }
    if (sort === 'year') {
      return (Number(right.year) || 0) - (Number(left.year) || 0) || compareUpdatedDesc(left, right);
    }

    return compareUpdatedDesc(left, right);
  });

  return values;
}
