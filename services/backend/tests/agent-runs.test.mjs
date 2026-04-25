import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { createAgentRunService } from '../lib/agent-runs.mjs';
import { createStore } from '../lib/store.mjs';

function createFailingSpawn() {
  return function spawnImpl(_command, args) {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.kill = () => {
      child.exitCode = 0;
      child.emit('close', 0, null);
    };

    process.nextTick(() => {
      if (args.includes('--version')) {
        child.exitCode = 0;
        child.emit('close', 0, null);
        return;
      }

      child.emit('error', new Error('runtime unavailable'));
    });

    return child;
  };
}

function paperFixture(overrides = {}) {
  return {
    abstract: 'A paper about local inference serving.',
    authors: ['A. Researcher'],
    citedByCount: 7,
    keyPoints: ['Quantized local serving can reduce deployment cost.'],
    keywords: ['local inference', 'quantization'],
    matchedKeywords: ['local inference'],
    openAccess: true,
    paperId: 'paper-local-serving',
    paperUrl: 'https://example.org/paper-local-serving',
    pdfUrl: null,
    relevance: 91,
    sourceName: 'OpenAlex',
    sourceProvider: 'openalex',
    summary: 'Local inference serving benefits from quantization.',
    title: 'Local Inference Serving with Quantized LLMs',
    venue: 'DemoConf',
    year: 2026,
    ...overrides,
  };
}

async function createDemoStore() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ares-agent-runs-'));
  const seedFile = path.join(tempDir, 'seed.json');
  const runtimeFile = path.join(tempDir, 'runtime', 'store.json');

  await fs.writeFile(
    seedFile,
    JSON.stringify(
      {
        agentRuns: [],
        experimentRuns: [],
        insightNotes: [],
        library: {
          demo: [],
        },
        projects: [
          {
            id: 'demo',
            name: 'Demo',
            color: '#000000',
            focus: 'Demo focus',
            defaultQuery: 'demo query',
            keywords: ['demo', 'retrieval'],
          },
        ],
        readingQueue: {
          demo: [],
        },
        readingSessions: [],
        reproChecklistItems: [],
        resultComparisons: [],
        writingDrafts: [],
      },
      null,
      2,
    ),
  );

  return createStore({ seedFile, runtimeFile });
}

async function waitForRun(store, runId, timeoutMs = 1000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const run = store.getAgentRun(runId);
    if (run?.status === 'done') {
      return run;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error(`Timed out waiting for run ${runId}`);
}

test('reading agent run falls back locally and creates a reading session', async () => {
  const store = await createDemoStore();
  const service = createAgentRunService({
    rootDir: '/workspace',
    spawnImpl: createFailingSpawn(),
    store,
  });

  const run = await service.createRun({
    input: {
      paper: {
        abstract: 'Adaptive retrieval reduces latency while preserving quality.',
        authors: ['Demo Author'],
        citedByCount: 7,
        keyPoints: ['Confidence-aware skipping', 'Lower reranker cost'],
        keywords: ['retrieval', 'efficiency'],
        matchedKeywords: ['retrieval'],
        openAccess: true,
        paperId: 'paper-42',
        paperUrl: 'https://example.org/paper-42',
        pdfUrl: null,
        relevance: 93,
        sourceName: 'Seed',
        sourceProvider: 'seed',
        summary: 'Adaptive retrieval reduces latency while preserving quality.',
        title: 'Adaptive Retrieval',
        venue: 'ACL 2026',
        year: 2026,
      },
    },
    projectId: 'demo',
    stage: 'reading',
  });

  const finalRun = await waitForRun(store, run.id);
  const sessions = store.getReadingSessions('demo');

  assert.equal(finalRun.status, 'done');
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].paperId, 'paper-42');
  assert.equal(sessions[0].status, 'done');
  assert.ok(sessions[0].sections.length > 0);
});

test('search agent run falls back locally without requiring a paper reference', async () => {
  const store = await createDemoStore();
  const service = createAgentRunService({
    rootDir: '/workspace',
    spawnImpl: createFailingSpawn(),
    store,
  });

  const run = await service.createRun({
    input: {
      query: 'LoRA forgetting diffusion personalization',
      scopes: [
        { id: 'iclr24', label: 'ICLR 2024', type: 'conference' },
      ],
    },
    projectId: 'demo',
    stage: 'search',
  });

  const finalRun = await waitForRun(store, run.id);

  assert.equal(finalRun.stage, 'search');
  assert.equal(finalRun.status, 'done');
  assert.match(finalRun.outputSummary, /LoRA forgetting diffusion personalization/);
  assert.equal(store.getReadingSessions('demo').length, 0);
});

test('search agent run executes scout search and checkpoints results into reading queue', async () => {
  const store = await createDemoStore();
  const calls = [];
  const service = createAgentRunService({
    rootDir: '/workspace',
    searchService: {
      async search(input) {
        calls.push(input);
        return {
          agentRuntime: 'codex',
          live: true,
          provider: 'scout-agent',
          query: input.query,
          results: [
            paperFixture(),
            paperFixture({
              paperId: 'paper-quant-cache',
              relevance: 88,
              summary: 'Quantized cache serving improves throughput.',
              title: 'Quantized Cache Serving for LLM Inference',
            }),
          ],
          searchMode: 'scout',
          total: 2,
          warning: 'seed checkpoint',
        };
      },
    },
    spawnImpl: createFailingSpawn(),
    store,
  });

  const run = await service.createRun({
    input: {
      query: '"local inference" llm quantization serving',
      scopes: [{ id: 'project', label: 'Project-wide', type: 'institution' }],
    },
    projectId: 'demo',
    stage: 'search',
  });

  const finalRun = await waitForRun(store, run.id);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].mode, 'scout');
  assert.equal(calls[0].query, '"local inference" llm quantization serving');
  assert.equal(finalRun.stage, 'search');
  assert.equal(finalRun.status, 'done');
  assert.equal(finalRun.outputPayload.results.length, 2);
  assert.equal(finalRun.outputPayload.results[0].queued, true);
  assert.equal(finalRun.outputPayload.totalQueued, 2);
  assert.equal(store.getProject('demo').queueCount, 2);
  assert.match(finalRun.outputSummary, /2 result/);
  assert.match(finalRun.warning, /seed checkpoint/);
});
