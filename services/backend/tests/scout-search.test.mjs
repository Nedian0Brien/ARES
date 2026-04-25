import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCodexExecArgs,
  buildScoutRuntimeEnv,
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

test('buildCodexExecArgs can pin a JSON output schema', () => {
  const args = buildCodexExecArgs({
    cwd: '/workspace',
    outputSchemaPath: '/workspace/schema.json',
    prompt: 'search prompt',
  });

  assert.ok(args.includes('--output-schema'));
  assert.equal(args[args.indexOf('--output-schema') + 1], '/workspace/schema.json');
  assert.equal(args.at(-1), 'search prompt');
});

test('buildScoutRuntimeEnv strips backend retrieval secrets from the Codex process env', () => {
  const env = buildScoutRuntimeEnv({
    ARES_DATABASE_URL: 'postgres://secret',
    DATABASE_URL: 'postgres://secret',
    HOME: '/home/demo',
    OPENALEX_API_KEY: 'openalex-secret',
    OPENALEX_MAILTO: 'person@example.com',
    OPENAI_API_KEY: 'codex-runtime-key',
    PATH: '/usr/bin',
  });

  assert.equal(env.OPENALEX_API_KEY, undefined);
  assert.equal(env.OPENALEX_MAILTO, undefined);
  assert.equal(env.ARES_DATABASE_URL, undefined);
  assert.equal(env.DATABASE_URL, undefined);
  assert.equal(env.OPENAI_API_KEY, 'codex-runtime-key');
  assert.equal(env.PATH, '/usr/bin');
});

test('Scout search uses OpenAlex as a backend tool call before agent ranking', async () => {
  const directCalls = [];
  const runtimeCalls = [];
  const progressEvents = [];
  const service = createScoutSearchService({
    agentRuntime: 'codex',
    rootDir: '/workspace',
    apiKey: 'demo-key',
    scoutRuntimeAdapter: {
      name: 'codex',
      async search(input) {
        runtimeCalls.push(input);
        return {
          rankedPaperIds: [
            { paperId: 'direct-2', rationale: 'More directly about deployment.' },
            { paperId: 'direct-1', rationale: 'Useful background.' },
          ],
        };
      },
    },
    async searchOpenAlexImpl(input) {
      directCalls.push(input);
      return { results: [demoPaper('direct-1'), demoPaper('direct-2')], total: 2, live: true, provider: 'openalex' };
    },
  });

  const payload = await service.search({
    onProgress: (event) => {
      progressEvents.push(event);
    },
    project: demoProject(),
    query: 'adaptive reranker',
    mode: 'scout',
    scopes: [],
    page: 1,
  });

  assert.equal(directCalls.length, 1);
  assert.equal(runtimeCalls.length, 1);
  assert.equal(typeof runtimeCalls[0].onProgress, 'function');
  assert.equal(runtimeCalls[0].candidates.length, 2);
  assert.ok(progressEvents.some((event) => event.type === 'tool' && /OpenAlex/.test(event.label)));
  assert.ok(progressEvents.some((event) => event.type === 'agent' && /ranking/i.test(event.label)));
  assert.equal(payload.provider, 'scout-agent');
  assert.equal(payload.agentRuntime, 'codex');
  assert.equal(payload.searchMode, 'scout');
  assert.deepEqual(
    payload.results.map((paper) => paper.paperId),
    ['direct-2', 'direct-1'],
  );
  assert.equal(payload.results[0].sourceProvider, 'openalex');
});

test('Scout search reports OpenAlex tool failure without starting the agent', async () => {
  let runtimeCalls = 0;
  const service = createScoutSearchService({
    agentRuntime: 'codex',
    rootDir: '/workspace',
    apiKey: 'demo-key',
    scoutRuntimeAdapter: {
      name: 'codex',
      async search() {
        runtimeCalls += 1;
        return { rankedPaperIds: [] };
      },
    },
    async searchOpenAlexImpl() {
      throw new Error('OpenAlex unavailable');
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
    /Scout OpenAlex tool failed: OpenAlex unavailable/,
  );

  assert.equal(runtimeCalls, 0);
});

test('Scout search reports runtime failure after successful tool retrieval', async () => {
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

  assert.equal(directCalls, 1);
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
