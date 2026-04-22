import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';

import { decodeAbstract } from '../lib/search-utils.mjs';
import { normalizeRequestPath } from '../lib/path-utils.mjs';
import { parseSearchPayload } from '../lib/search-contract.mjs';
import { searchSeedPapers } from '../lib/seed-data.mjs';
import { createStore, resolveStoreBackend } from '../lib/store.mjs';

test('decodeAbstract rebuilds text from OpenAlex inverted index', () => {
  const abstract = decodeAbstract({
    Adaptive: [0],
    skipping: [1],
    reduces: [2],
    latency: [3],
  });

  assert.equal(abstract, 'Adaptive skipping reduces latency');
});

test('searchSeedPapers returns project-relevant ranked results', () => {
  const payload = searchSeedPapers({
    project: {
      id: 'rag-reranker',
      keywords: ['rag', 'reranker', 'adaptive skipping'],
    },
    query: 'adaptive reranker',
  });

  assert.ok(payload.results.length > 0);
  assert.equal(payload.provider, 'seed');
  assert.equal(payload.results[0].paperId, 'seed-rag-adaptive-skip');
  assert.ok(payload.results[0].relevance >= 80);
});

test('searchSeedPapers narrows results by active scopes', () => {
  const payload = searchSeedPapers({
    project: {
      id: 'rag-reranker',
      keywords: ['rag', 'reranker', 'adaptive skipping'],
    },
    query: 'adaptive reranker',
    scopes: [{ id: 'acl24', type: 'conference', label: 'ACL 2024', meta: { venue: 'ACL' } }],
  });

  assert.ok(payload.results.length > 0);
  assert.ok(payload.results.every((paper) => paper.venue.toLowerCase().includes('acl')));
});

test('parseSearchPayload normalises the POST search contract', () => {
  const payload = parseSearchPayload({
    projectId: ' demo ',
    q: ' adaptive reranker ',
    mode: 'scout',
    page: '3',
    scopes: [
      { id: 'acl24', type: 'conference', label: 'ACL 2024', meta: { venue: 'ACL' } },
      { id: '', type: 'conference', label: '', meta: {} },
    ],
  });

  assert.equal(payload.projectId, 'demo');
  assert.equal(payload.q, 'adaptive reranker');
  assert.equal(payload.mode, 'scout');
  assert.equal(payload.page, 3);
  assert.deepEqual(payload.scopes, [{ id: 'acl24', type: 'conference', label: 'ACL 2024', meta: { venue: 'ACL' } }]);
});

test('normalizeRequestPath strips proxy path prefixes', () => {
  assert.equal(normalizeRequestPath('/proxy/3100/'), '/');
  assert.equal(normalizeRequestPath('/proxy/3100/api/projects'), '/api/projects');
  assert.equal(normalizeRequestPath('/proxy/3100/styles.css'), '/styles.css');
  assert.equal(normalizeRequestPath('/api/projects'), '/api/projects');
});

test('resolveStoreBackend prefers explicit backend and otherwise infers postgres from database url', () => {
  assert.equal(resolveStoreBackend({ backend: 'postgres' }), 'postgres');
  assert.equal(resolveStoreBackend({ backend: 'pg' }), 'postgres');
  assert.equal(resolveStoreBackend({ backend: 'file', databaseUrl: 'postgres://demo:demo@localhost:5432/ares' }), 'file');
  assert.equal(resolveStoreBackend({ databaseUrl: 'postgres://demo:demo@localhost:5432/ares' }), 'postgres');
  assert.equal(resolveStoreBackend({}), 'file');
});

test('createStore rejects postgres backend without a database url', async () => {
  await assert.rejects(
    () =>
      createStore({
        backend: 'postgres',
        runtimeFile: '/tmp/unused-runtime.json',
        seedFile: '/tmp/unused-seed.json',
      }),
    /DATABASE_URL or ARES_DATABASE_URL/i,
  );
});

test('createStore persists saved papers and queue entries', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ares-store-'));
  const seedFile = path.join(tempDir, 'seed.json');
  const runtimeFile = path.join(tempDir, 'runtime', 'store.json');

  await fs.writeFile(
    seedFile,
    JSON.stringify(
      {
        projects: [
          {
            id: 'demo',
            name: 'Demo',
            color: '#000000',
            focus: 'Demo focus',
            defaultQuery: 'demo query',
            keywords: ['demo'],
          },
        ],
        library: {
          demo: [],
        },
        readingQueue: {
          demo: [],
        },
      },
      null,
      2,
    ),
  );

  const store = await createStore({ seedFile, runtimeFile });
  assert.equal(store.backend, 'file');
  await store.savePaper('demo', {
    paperId: 'paper-1',
    title: 'Paper 1',
    authors: [],
    venue: 'TestConf',
    year: 2026,
    abstract: 'A test paper.',
    summary: 'A test paper.',
    keyPoints: [],
    keywords: ['demo'],
    matchedKeywords: ['demo'],
    citedByCount: 0,
    openAccess: true,
    paperUrl: null,
    pdfUrl: null,
    sourceName: 'seed',
    sourceProvider: 'seed',
    relevance: 88,
  });
  await store.queuePaper('demo', {
    paperId: 'paper-1',
    title: 'Paper 1',
    paperUrl: 'https://example.org',
  });

  const savedProject = store.getProject('demo');
  assert.equal(savedProject.libraryCount, 1);
  assert.equal(savedProject.queueCount, 1);
  assert.deepEqual(store.getLibrary('demo').map((paper) => paper.paperId), ['paper-1']);
});

test('createStore migrates and persists reading sessions plus agent runs', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ares-store-'));
  const seedFile = path.join(tempDir, 'seed.json');
  const runtimeFile = path.join(tempDir, 'runtime', 'store.json');

  await fs.writeFile(
    seedFile,
    JSON.stringify(
      {
        projects: [
          {
            id: 'demo',
            name: 'Demo',
            color: '#000000',
            focus: 'Demo focus',
            defaultQuery: 'demo query',
            keywords: ['demo'],
          },
        ],
        library: {
          demo: [],
        },
        readingQueue: {
          demo: [],
        },
      },
      null,
      2,
    ),
  );

  const store = await createStore({ seedFile, runtimeFile });
  await store.upsertReadingSession({
    paperId: 'paper-2',
    projectId: 'demo',
    sections: [{ id: 'abstract', label: 'Abstract', status: 'done', summary: 'Summary' }],
    status: 'queue',
    summary: 'Reader summary',
    title: 'Paper 2',
  });
  const run = await store.createAgentRun({
    agent: 'Reader agent',
    input: { paperId: 'paper-2' },
    projectId: 'demo',
    stage: 'reading',
    status: 'running',
    taskKind: 'create-reading-session',
  });
  await store.updateAgentRun(run.id, {
    finishedAt: '2026-04-22T00:00:00.000Z',
    outputSummary: 'Reading session ready.',
    status: 'done',
  });

  assert.equal(store.getReadingSessions('demo').length, 1);
  assert.equal(store.listAgentRuns({ projectId: 'demo' }).length, 1);
  assert.equal(store.getProject('demo').readingSessionCount, 1);
});
