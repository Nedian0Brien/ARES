import assert from 'node:assert/strict';
import test from 'node:test';

import { normaliseAsset } from '../lib/asset-model.mjs';
import { buildWikiGraph, filterWikiPages } from '../lib/wiki-model.mjs';

test('wiki model normalizes folders and pages with graph-facing fields', () => {
  const folder = normaliseAsset(
    'wikiFolders',
    {
      color: 'green',
      name: 'Retrieval',
      parentFolderId: 'folder-root',
      projectId: 'demo',
    },
    { now: '2026-06-29T00:00:00.000Z' },
  );
  const page = normaliseAsset(
    'wikiPages',
    {
      blocks: [{ text: 'Adaptive skipping', type: 'heading' }],
      evidenceLinkIds: ['evidence-1'],
      folderId: folder.id,
      linkedPageIds: ['wiki-neighbor'],
      paperIds: ['paper-1'],
      properties: { confidence: 'high' },
      tags: ['retrieval'],
      title: 'Adaptive skipping',
      type: 'concept',
    },
    { now: '2026-06-29T00:00:00.000Z', projectId: 'demo' },
  );

  assert.equal(folder.projectId, 'demo');
  assert.equal(folder.parentId, 'folder-root');
  assert.equal(folder.title, 'Retrieval');
  assert.equal(folder.color, 'green');

  assert.equal(page.projectId, 'demo');
  assert.equal(page.folderId, folder.id);
  assert.deepEqual(page.body, [{ text: 'Adaptive skipping', type: 'heading' }]);
  assert.deepEqual(page.links, ['wiki-neighbor']);
  assert.deepEqual(page.evidenceLinkIds, ['evidence-1']);
  assert.deepEqual(page.paperIds, ['paper-1']);
  assert.deepEqual(page.properties, { confidence: 'high' });
});

test('wiki model filters by selected folder and descendant folders', () => {
  const folders = [
    { id: 'folder-root', parentId: '' },
    { id: 'folder-child', parentId: 'folder-root' },
    { id: 'folder-other', parentId: '' },
  ];
  const pages = [
    { folderId: 'folder-root', id: 'wiki-root' },
    { folderId: 'folder-child', id: 'wiki-child' },
    { folderId: 'folder-other', id: 'wiki-other' },
  ];

  assert.deepEqual(
    filterWikiPages(pages, { folder: 'folder-root', folders }).map((page) => page.id),
    ['wiki-root', 'wiki-child'],
  );
  assert.deepEqual(
    filterWikiPages(pages, { folder: 'all', folders }).map((page) => page.id),
    ['wiki-root', 'wiki-child', 'wiki-other'],
  );
});

test('wiki graph emits folder containment and semantic edges at the model boundary', () => {
  const graph = buildWikiGraph(
    [
      { folderId: 'folder-child', id: 'wiki-a', links: ['wiki-b', 'wiki-missing'], title: 'A', type: 'concept' },
      { folderId: '', id: 'wiki-b', links: ['wiki-a'], name: 'B' },
    ],
    [
      { id: 'folder-root', name: 'Root', parentId: '' },
      { id: 'folder-child', name: 'Child', parentId: 'folder-root' },
    ],
  );

  assert.deepEqual(graph.nodes.map((node) => node.id), ['folder-root', 'folder-child', 'wiki-a', 'wiki-b']);
  assert.deepEqual(graph.edges, [
    { id: 'folder-root:folder-child', source: 'folder-root', target: 'folder-child', type: 'containment' },
    { id: 'folder-child:wiki-a', source: 'folder-child', target: 'wiki-a', type: 'containment' },
    { id: 'wiki-a:wiki-b', source: 'wiki-a', target: 'wiki-b', type: 'semantic' },
  ]);
});
