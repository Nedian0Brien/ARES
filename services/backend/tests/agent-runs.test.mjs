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
