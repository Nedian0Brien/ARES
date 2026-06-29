import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { ASSET_COLLECTIONS, normaliseAsset } from '../lib/asset-model.mjs';
import { buildWikiGraph, pageBacklinks } from '../lib/wiki-model.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..');

async function readProjectFile(relativePath) {
  return readFile(path.join(rootDir, relativePath), 'utf8');
}

test('wiki pages and folders are first-class project assets', () => {
  assert.ok(ASSET_COLLECTIONS.includes('wikiPages'));
  assert.ok(ASSET_COLLECTIONS.includes('wikiFolders'));
  const folder = normaliseAsset('wikiFolders', {
    name: 'Retrieval',
    parentId: 'wiki-folder-root',
    projectId: 'demo',
  });
  const page = normaliseAsset('wikiPages', {
    body: [{ type: 'heading', text: 'Adaptive skipping' }],
    folderId: folder.id,
    links: ['wiki-other'],
    paperIds: ['paper-1'],
    projectId: 'demo',
    title: 'Adaptive skipping',
    type: 'concept',
  });

  assert.equal(folder.projectId, 'demo');
  assert.equal(folder.name, 'Retrieval');
  assert.equal(folder.parentId, 'wiki-folder-root');
  assert.equal(page.projectId, 'demo');
  assert.equal(page.title, 'Adaptive skipping');
  assert.equal(page.folderId, folder.id);
  assert.deepEqual(page.links, ['wiki-other']);
  assert.deepEqual(page.paperIds, ['paper-1']);
  assert.deepEqual(page.body, [{ type: 'heading', text: 'Adaptive skipping' }]);
});

test('wiki graph includes folder containment and backlinks are derived only from stored pages', () => {
  const folders = [{ id: 'folder-a', name: 'Retrieval', parentId: '' }];
  const pages = [
    { folderId: 'folder-a', id: 'wiki-a', links: ['wiki-b'], title: 'A', type: 'concept' },
    { folderId: '', id: 'wiki-b', links: [], title: 'B', type: 'system' },
  ];
  const graph = buildWikiGraph(pages, folders);

  assert.deepEqual(graph.nodes.map((node) => node.id), ['folder-a', 'wiki-a', 'wiki-b']);
  assert.deepEqual(graph.nodes.find((node) => node.id === 'folder-a'), {
    id: 'folder-a',
    kind: 'folder',
    label: 'Retrieval',
    parentId: '',
    type: 'folder',
  });
  assert.deepEqual(graph.edges, [
    { id: 'folder-a:wiki-a', source: 'folder-a', target: 'wiki-a', type: 'containment' },
    { id: 'wiki-a:wiki-b', source: 'wiki-a', target: 'wiki-b', type: 'semantic' },
  ]);
  assert.deepEqual(pageBacklinks('wiki-b', pages), [{ id: 'wiki-a', title: 'A', type: 'concept' }]);
});

test('wiki routes are registered without bypassing auth or storing synthesize fallbacks', async () => {
  const [index, routes, assets] = await Promise.all([
    readProjectFile('services/backend/index.mjs'),
    readProjectFile('services/backend/routes/wiki-routes.mjs'),
    readProjectFile('services/backend/routes/asset-routes.mjs'),
  ]);

  assert.match(index, /createWikiRoutes/);
  assert.match(routes, /requireProjectAccess\(request, response, route\.projectId, 'read'\)/);
  assert.match(routes, /store\.listProjectAssets\(route\.projectId, 'wikiPages'\)/);
  assert.match(routes, /store\.listProjectAssets\(route\.projectId, 'wikiFolders'\)/);
  assert.match(routes, /filterWikiPages/);
  assert.match(routes, /stored:\s*false/);
  assert.match(assets, /'wiki-pages': 'wikiPages'/);
  assert.match(assets, /'wiki-folders': 'wikiFolders'/);
});
