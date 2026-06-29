import assert from 'node:assert/strict';
import test from 'node:test';

import { buildWikiGraph, pageBacklinks } from '../lib/wiki-model.mjs';

test('backlink index derives reverse links from persisted wiki page links', () => {
  const pages = [
    { id: 'wiki-source-a', links: ['wiki-target'], title: 'Source A', type: 'concept' },
    { id: 'wiki-source-b', links: ['wiki-target', 'wiki-other'], name: 'Source B' },
    { id: 'wiki-unrelated', links: ['wiki-other'], title: 'Unrelated', type: 'method' },
  ];

  assert.deepEqual(pageBacklinks('wiki-target', pages), [
    { id: 'wiki-source-a', title: 'Source A', type: 'concept' },
    { id: 'wiki-source-b', title: 'Source B', type: 'concept' },
  ]);
});

test('backlink graph contract ignores dangling semantic links', () => {
  const graph = buildWikiGraph([
    { id: 'wiki-a', links: ['wiki-b', 'wiki-missing'], title: 'A' },
    { id: 'wiki-b', links: [], title: 'B' },
  ]);

  assert.deepEqual(graph.edges, [{ id: 'wiki-a:wiki-b', source: 'wiki-a', target: 'wiki-b', type: 'semantic' }]);
  assert.deepEqual(pageBacklinks('wiki-missing', [{ id: 'wiki-a', links: ['wiki-missing'], title: 'A' }]), [
    { id: 'wiki-a', title: 'A', type: 'concept' },
  ]);
});
