import assert from 'node:assert/strict';
import test from 'node:test';

import { filterLibraryPapers, normaliseLibraryPatch, normaliseSavedLibraryPaper } from '../lib/library-model.mjs';

test('library model normalizes shelf, tags, collections, and flag metadata', () => {
  const paper = normaliseSavedLibraryPaper(
    {
      abstract: 'A reranking paper.',
      collectionIds: ['c-rerank'],
      flag: true,
      paperId: 'paper-1',
      readingProgress: 42,
      tags: ['reranking', 'latency'],
      title: 'Adaptive Reranking',
    },
    { now: '2026-06-29T00:00:00.000Z', projectId: 'demo' },
  );

  assert.equal(paper.shelf, 'reading');
  assert.equal(paper.libraryStatus, 'reading');
  assert.equal(paper.coll, 'c-rerank');
  assert.deepEqual(paper.collectionIds, ['c-rerank']);
  assert.deepEqual(paper.tags, ['reranking', 'latency']);
  assert.equal(paper.flag, true);
  assert.equal(paper.savedAt, '2026-06-29T00:00:00.000Z');
});

test('library filters apply query, shelf, collection, tag, flag, and sort without fallback papers', () => {
  const papers = [
    normaliseSavedLibraryPaper({
      collectionIds: ['c-rerank'],
      flag: true,
      paperId: 'paper-1',
      readingProgress: 60,
      tags: ['reranking'],
      title: 'Adaptive Skipping',
      updatedAt: '2026-06-29T01:00:00.000Z',
    }),
    normaliseSavedLibraryPaper({
      collectionIds: ['c-eval'],
      paperId: 'paper-2',
      readingProgress: 100,
      tags: ['evaluation'],
      title: 'Benchmark Protocols',
      updatedAt: '2026-06-29T02:00:00.000Z',
    }),
  ];

  assert.deepEqual(filterLibraryPapers(papers, { shelf: 'reading' }).map((paper) => paper.paperId), ['paper-1']);
  assert.deepEqual(filterLibraryPapers(papers, { shelf: 'flag' }).map((paper) => paper.paperId), ['paper-1']);
  assert.deepEqual(filterLibraryPapers(papers, { collection: 'c-eval' }).map((paper) => paper.paperId), ['paper-2']);
  assert.deepEqual(filterLibraryPapers(papers, { tag: 'reranking' }).map((paper) => paper.paperId), ['paper-1']);
  assert.deepEqual(filterLibraryPapers(papers, { q: 'benchmark' }).map((paper) => paper.paperId), ['paper-2']);
  assert.deepEqual(filterLibraryPapers(papers, { sort: 'title' }).map((paper) => paper.paperId), ['paper-1', 'paper-2']);
});

test('library patch limits updates to reader metadata fields', () => {
  const patch = normaliseLibraryPatch(
    {
      collectionIds: ['c-reading'],
      flag: true,
      readingProgress: 100,
      tags: ['method'],
      title: 'Ignored title',
    },
    { paperId: 'paper-1', title: 'Original title' },
  );

  assert.deepEqual(patch, {
    coll: 'c-reading',
    collectionIds: ['c-reading'],
    flag: true,
    libraryStatus: 'done',
    progress: 100,
    readingProgress: 100,
    shelf: 'done',
    tags: ['method'],
  });
});
