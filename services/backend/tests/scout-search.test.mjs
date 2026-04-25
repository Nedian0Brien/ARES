import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCodexExecArgs,
  createScoutSearchService,
} from '../lib/scout-search.mjs';

function demoProject() {
  return {
    id: 'demo',
    name: 'Demo',
    focus: 'Adaptive retrieval research',
    keywords: ['rag', 'reranker'],
  };
}

function demoPaper(id) {
  return {
    paperId: id,
    title: `Paper ${id}`,
    authors: ['Demo Author'],
    venue: 'ACL 2024',
    year: 2024,
    abstract: 'Demo abstract.',
    summary: 'Demo abstract.',
    keyPoints: ['Demo point'],
    keywords: ['rag'],
    matchedKeywords: ['rag'],
    citedByCount: 5,
    openAccess: true,
    paperUrl: 'https://example.org/paper',
    pdfUrl: 'https://example.org/paper.pdf',
    sourceName: 'OpenAlex',
    sourceProvider: 'openalex',
    relevance: 87,
  };
}

test('buildCodexExecArgs pins required non-interactive Scout flags', () => {
  const args = buildCodexExecArgs({
    cwd: '/workspace',
    prompt: 'search prompt',
  });

  assert.deepEqual(args.slice(0, 8), ['exec', '--json', '--ephemeral', '--skip-git-repo-check', '-s', 'read-only', '-C', '/workspace']);
  assert.ok(args.includes('--color'));
  assert.ok(args.includes('never'));
  assert.equal(args.at(-1), 'search prompt');
});

test('Scout search returns agent payload without falling back when runtime succeeds', async () => {
  let directCalls = 0;
  const service = createScoutSearchService({
    agentRuntime: 'codex',
    rootDir: '/workspace',
    apiKey: 'demo-key',
    scoutRuntimeAdapter: {
      name: 'codex',
      async search() {
        return {
          results: [demoPaper('agent-1')],
          total: 1,
          live: true,
        };
      },
    },
    async searchOpenAlexImpl() {
      directCalls += 1;
      return { results: [demoPaper('direct-1')], total: 1, live: true, provider: 'openalex' };
    },
  });

  const payload = await service.search({
    project: demoProject(),
    query: 'adaptive reranker',
    mode: 'scout',
    scopes: [],
    page: 1,
  });

  assert.equal(directCalls, 0);
  assert.equal(payload.provider, 'scout-agent');
  assert.equal(payload.agentRuntime, 'codex');
  assert.equal(payload.searchMode, 'scout');
  assert.equal(payload.results[0].paperId, 'agent-1');
});

test('Scout search reports runtime failure without direct OpenAlex fallback', async () => {
  let directCalls = 0;
  const service = createScoutSearchService({
    agentRuntime: 'codex',
    rootDir: '/workspace',
    apiKey: 'demo-key',
    scoutRuntimeAdapter: {
      name: 'codex',
      async search() {
        throw new Error('runtime timeout');
      },
    },
    async searchOpenAlexImpl() {
      directCalls += 1;
      return {
        provider: 'openalex',
        live: true,
        total: 1,
        results: [demoPaper('direct-1')],
      };
    },
  });

  await assert.rejects(
    () =>
      service.search({
        project: demoProject(),
        query: 'adaptive reranker',
        mode: 'scout',
        scopes: [{ id: 'acl24', type: 'conference', label: 'ACL 2024', meta: { venue: 'ACL' } }],
        page: 1,
      }),
    /Scout agent failed: runtime timeout/,
  );

  assert.equal(directCalls, 0);
});

test('Keyword search still falls back to seed when OpenAlex is unavailable', async () => {
  let seedCalls = 0;
  const service = createScoutSearchService({
    rootDir: '/workspace',
    apiKey: '',
    scoutRuntimeAdapter: {
      name: 'codex',
      async search() {
        throw new Error('runtime unavailable');
      },
    },
    searchSeedPapersImpl({ scopes }) {
      seedCalls += 1;
      assert.equal(scopes[0].type, 'author');
      return {
        provider: 'seed',
        live: false,
        total: 1,
        results: [demoPaper('seed-1')],
      };
    },
  });

  const payload = await service.search({
    project: demoProject(),
    query: 'adaptive reranker',
    mode: 'keyword',
    scopes: [{ id: 'manning', type: 'author', label: 'Christopher Manning', meta: {} }],
    page: 1,
  });

  assert.equal(seedCalls, 1);
  assert.equal(payload.provider, 'seed');
  assert.equal(payload.live, false);
  assert.match(payload.warning, /OPENALEX_API_KEY is missing/);
});
