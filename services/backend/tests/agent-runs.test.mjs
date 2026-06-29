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

function createDelayedFailingSpawn(delayMs = 30) {
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

      setTimeout(() => {
        child.emit('error', new Error('runtime unavailable'));
      }, delayMs);
    });

    return child;
  };
}

function createHangingSpawn(onTaskStart = () => {}) {
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

      onTaskStart(child);
    });

    return child;
  };
}

function createSuccessfulJsonSpawn(payload, calls = []) {
  return function spawnImpl(_command, args, options = {}) {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.kill = () => {
      child.exitCode = 0;
      child.emit('close', 0, null);
    };
    calls.push({ args, options });

    process.nextTick(() => {
      if (args.includes('--version')) {
        child.exitCode = 0;
        child.emit('close', 0, null);
        return;
      }

      child.stdout.write(`${JSON.stringify({
        item: {
          content: [{ text: JSON.stringify(payload) }],
          type: 'agent_message',
        },
        type: 'item.completed.agent_message',
      })}\n`);
      child.exitCode = 0;
      child.emit('close', 0, null);
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
    if (run?.status === 'done' || run?.status === 'error') {
      return run;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error(`Timed out waiting for run ${runId}`);
}

async function waitForEvent(events, predicate, timeoutMs = 1000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (events.some(predicate)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error('Timed out waiting for agent run event.');
}

test('reading agent run reports runtime failure without creating fallback output', async () => {
  const store = await createDemoStore();
  const service = createAgentRunService({
    rootDir: '/workspace',
    spawnImpl: createFailingSpawn(),
    store,
  });

  const run = await service.createRun({
    assetRefs: [{ id: 'paper-42', type: 'paper', label: 'Adaptive Retrieval' }],
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

  assert.equal(finalRun.status, 'error');
  assert.match(finalRun.error, /runtime unavailable/);
  assert.equal(finalRun.outputPayload, undefined);
  assert.deepEqual(finalRun.outputRef, []);
  assert.deepEqual(finalRun.createdAssetIds, []);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].paperId, 'paper-42');
  assert.equal(sessions[0].status, 'queue');
  assert.deepEqual(sessions[0].sections, []);
  assert.deepEqual(finalRun.sourceAssetIds, ['paper-42']);
});

test('agent run service notifies subscribers when run state changes', async () => {
  const store = await createDemoStore();
  const service = createAgentRunService({
    rootDir: '/workspace',
    spawnImpl: createDelayedFailingSpawn(),
    store,
  });

  const run = await service.createRun({
    input: {
      paper: paperFixture(),
      paperId: 'paper-local-serving',
    },
    projectId: 'demo',
    stage: 'reading',
    taskKind: 'create-reading-session',
  });
  const events = [];
  const unsubscribe = service.subscribeRun(run.id, (payload) => {
    events.push(payload.run.status);
  });

  await waitForRun(store, run.id);
  await waitForEvent(events, (status) => status === 'error');
  unsubscribe();

  assert.ok(events.includes('running'));
  assert.ok(events.includes('error'));
});

test('agent run service marks persisted active runs as interrupted on startup', async () => {
  const store = await createDemoStore();
  const queued = await store.createAgentRun({
    agent: 'Reader agent',
    input: { paper: paperFixture() },
    projectId: 'demo',
    stage: 'reading',
    status: 'queue',
    taskKind: 'create-reading-session',
  });
  const running = await store.createAgentRun({
    agent: 'Writing agent',
    input: { draftId: 'draft-1' },
    projectId: 'demo',
    stage: 'writing',
    startedAt: '2026-06-12T00:00:00.000Z',
    status: 'running',
    taskKind: 'create-writing-draft',
  });
  const done = await store.createAgentRun({
    agent: 'Reader agent',
    finishedAt: '2026-06-12T00:02:00.000Z',
    input: { paper: paperFixture({ paperId: 'done-paper' }) },
    projectId: 'demo',
    stage: 'reading',
    status: 'done',
    taskKind: 'create-reading-session',
  });

  const service = createAgentRunService({
    rootDir: '/workspace',
    spawnImpl: createFailingSpawn(),
    store,
  });
  const recovered = await service.recoverInterruptedRuns();

  assert.deepEqual(recovered.map((run) => run.id).sort(), [queued.id, running.id].sort());
  assert.equal(store.getAgentRun(queued.id).status, 'error');
  assert.equal(store.getAgentRun(running.id).status, 'error');
  assert.equal(store.getAgentRun(done.id).status, 'done');
  assert.match(store.getAgentRun(queued.id).error, /interrupted by server restart/i);
  assert.match(store.getAgentRun(running.id).error, /interrupted by server restart/i);
  assert.ok(store.getAgentRun(queued.id).finishedAt);
  assert.ok(store.getAgentRun(running.id).finishedAt);
});

test('agent run service persists abort requests and recovers them as canceled after restart', async () => {
  const store = await createDemoStore();
  const queued = await store.createAgentRun({
    agent: 'Reader agent',
    input: { paper: paperFixture() },
    projectId: 'demo',
    stage: 'reading',
    status: 'queue',
    taskKind: 'create-reading-session',
  });

  const service = createAgentRunService({
    rootDir: '/workspace',
    spawnImpl: createFailingSpawn(),
    store,
  });

  const aborted = await service.abortRun(queued.id);
  const persisted = store.getAgentRun(queued.id);

  assert.equal(aborted.run.status, 'canceled');
  assert.equal(persisted.status, 'canceled');
  assert.match(persisted.error, /canceled by user/i);
  assert.ok(persisted.cancelRequestedAt);
  assert.equal(persisted.cancelReason, 'user');

  const recovered = await service.recoverInterruptedRuns();

  assert.deepEqual(recovered, []);
  assert.equal(store.getAgentRun(queued.id).status, 'canceled');
});

test('agent run service recovers stale running leases without touching fresh or queued runs', async () => {
  const store = await createDemoStore();
  const stale = await store.createAgentRun({
    agent: 'Reader agent',
    heartbeatAt: '2026-06-14T01:00:00.000Z',
    input: { paper: paperFixture({ paperId: 'stale-paper' }) },
    leaseExpiresAt: '2026-06-14T01:01:00.000Z',
    leaseOwner: 'worker-stale',
    projectId: 'demo',
    stage: 'reading',
    status: 'running',
    taskKind: 'create-reading-session',
  });
  const fresh = await store.createAgentRun({
    agent: 'Reader agent',
    heartbeatAt: '2026-06-14T01:04:30.000Z',
    input: { paper: paperFixture({ paperId: 'fresh-paper' }) },
    leaseExpiresAt: '2026-06-14T01:06:00.000Z',
    leaseOwner: 'worker-fresh',
    projectId: 'demo',
    stage: 'reading',
    status: 'running',
    taskKind: 'create-reading-session',
  });
  const queued = await store.createAgentRun({
    agent: 'Reader agent',
    input: { paper: paperFixture({ paperId: 'queued-paper' }) },
    projectId: 'demo',
    stage: 'reading',
    status: 'queue',
    taskKind: 'create-reading-session',
  });
  const service = createAgentRunService({
    rootDir: '/workspace',
    spawnImpl: createFailingSpawn(),
    store,
  });

  const recovered = await service.recoverStaleRuns({
    now: '2026-06-14T01:05:00.000Z',
    staleMs: 60_000,
  });
  const staleRun = store.getAgentRun(stale.id);

  assert.deepEqual(recovered.map((run) => run.id), [stale.id]);
  assert.equal(staleRun.status, 'error');
  assert.equal(staleRun.leaseOwner, '');
  assert.equal(staleRun.leaseExpiresAt, null);
  assert.equal(staleRun.heartbeatAt, null);
  assert.match(staleRun.warning, /stale worker heartbeat/);
  assert.equal(store.getAgentRun(fresh.id).status, 'running');
  assert.equal(store.getAgentRun(queued.id).status, 'queue');
});

test('agent run runtime failure does not persist stage fallback assets', async () => {
  const store = await createDemoStore();
  const service = createAgentRunService({
    rootDir: '/workspace',
    spawnImpl: createFailingSpawn(),
    store,
  });
  const run = await service.createRun({
    input: {
      paper: paperFixture({ paperId: 'idempotent-retry-paper' }),
    },
    projectId: 'demo',
    stage: 'research',
  });
  const finalRun = await waitForRun(store, run.id);

  assert.equal(finalRun.status, 'error');
  assert.match(finalRun.error, /runtime unavailable/);
  assert.deepEqual(finalRun.outputRef, []);
  assert.deepEqual(finalRun.createdAssetIds, []);
  assert.deepEqual(store.listProjectAssets('demo', 'experimentRuns'), []);
  assert.deepEqual(store.listProjectAssets('demo', 'reproChecklistItems'), []);
});

test('agent run context failures are errors rather than completed runs', async () => {
  const store = await createDemoStore();
  const service = createAgentRunService({
    rootDir: '/workspace',
    spawnImpl: createFailingSpawn(),
    store,
  });

  const run = await service.createRun({
    input: {},
    projectId: 'demo',
    stage: 'research',
  });
  const finalRun = await waitForRun(store, run.id);

  assert.equal(finalRun.status, 'error');
  assert.match(finalRun.error, /missing a paper reference/);
  assert.deepEqual(finalRun.outputRef, []);
  assert.deepEqual(finalRun.createdAssetIds, []);
  assert.deepEqual(store.listProjectAssets('demo', 'experimentRuns'), []);
  assert.deepEqual(store.listProjectAssets('demo', 'reproChecklistItems'), []);
});

test('research agent runs create graph lab assets instead of legacy checklist assets', async () => {
  const store = await createDemoStore();
  const calls = [];
  const service = createAgentRunService({
    rootDir: '/workspace',
    spawnImpl: createSuccessfulJsonSpawn({
      experimentRuns: [
        {
          config: {
            command: {
              args: ['scripts/run_baseline.py'],
              command: 'python',
              expectedMetrics: ['accuracy'],
            },
          },
          kind: 'baseline',
          status: 'draft',
          title: 'Baseline reproduction',
        },
      ],
      outputSummary: 'Prepared a graph reproduction plan and baseline run.',
      reproductionPlans: [
        {
          checklist: [{ detail: 'Verify dataset split', status: 'todo', title: 'Dataset split' }],
          commands: ['python scripts/run_baseline.py'],
          metrics: ['accuracy'],
          status: 'draft',
          title: 'Reproduce adaptive skipping',
        },
      ],
      resultDossiers: [
        {
          comparisons: [{ metric: 'accuracy', target: 'paper value' }],
          deltaSummary: 'Awaiting first run.',
          status: 'draft',
          title: 'Adaptive skipping result dossier',
        },
      ],
    }, calls),
    store,
  });

  const run = await service.createRun({
    input: {
      handoffSource: 'reading',
      paper: paperFixture({ paperId: 'paper-research-graph' }),
    },
    projectId: 'demo',
    stage: 'research',
  });
  const finalRun = await waitForRun(store, run.id);
  const runtimeCall = calls.find((call) => call.args.includes('exec'));
  const plans = store.listProjectAssets('demo', 'reproductionPlans');
  const runs = store.listProjectAssets('demo', 'experimentRuns');
  const dossiers = store.listProjectAssets('demo', 'resultDossiers');

  assert.equal(finalRun.status, 'done');
  assert.deepEqual(finalRun.outputRef.map((entry) => entry.collection), [
    'reproductionPlans',
    'experimentRuns',
    'resultDossiers',
  ]);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].title, 'Reproduce adaptive skipping');
  assert.deepEqual(plans[0].commands, ['python scripts/run_baseline.py']);
  assert.deepEqual(plans[0].agentRunIds, [run.id]);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].title, 'Baseline reproduction');
  assert.equal(runs[0].reproductionPlanId, plans[0].id);
  assert.equal(dossiers.length, 1);
  assert.deepEqual(dossiers[0].experimentRunIds, [runs[0].id]);
  assert.deepEqual(dossiers[0].agentRunIds, [run.id]);
  assert.deepEqual(store.listProjectAssets('demo', 'reproChecklistItems'), []);
  assert.match(runtimeCall.args.at(-1), /"reproductionPlans"/);
  assert.match(runtimeCall.args.at(-1), /"commands"/);
  assert.match(runtimeCall.args.at(-1), /"resultDossiers"/);
});

test('chat agent runs use a read-only runtime profile and keep answers derived', async () => {
  const store = await createDemoStore();
  const calls = [];
  const service = createAgentRunService({
    rootDir: '/workspace',
    spawnImpl: createSuccessfulJsonSpawn({
      answer: 'Use adaptive skipping when retriever confidence is high.',
      citations: [{ evidenceLinkId: 'evidence-1', label: 'Adaptive skipping note', locator: { page: 4 }, quote: 'confidence gate' }],
      outputSummary: 'Answered with one grounded citation.',
    }, calls),
    store,
  });

  const run = await service.createRun({
    input: {
      messages: [{ role: 'user', text: 'When should we skip reranking?' }],
      thread: { id: 'thread-1', title: 'Reranking strategy' },
    },
    projectId: 'demo',
    stage: 'chat',
  });
  const finalRun = await waitForRun(store, run.id);
  const runtimeCall = calls.find((call) => call.args.includes('exec'));

  assert.equal(finalRun.stage, 'chat');
  assert.equal(finalRun.taskKind, 'answer-agent-chat');
  assert.equal(finalRun.profileId, 'chat');
  assert.equal(finalRun.status, 'done');
  assert.equal(finalRun.outputSummary, 'Answered with one grounded citation.');
  assert.equal(finalRun.outputPayload.answer, 'Use adaptive skipping when retriever confidence is high.');
  assert.deepEqual(finalRun.outputPayload.citations, [{ evidenceLinkId: 'evidence-1', label: 'Adaptive skipping note', locator: { page: 4 }, quote: 'confidence gate' }]);
  assert.deepEqual(finalRun.outputRef, []);
  assert.deepEqual(finalRun.createdAssetIds, []);
  assert.deepEqual(store.listProjectAssets('demo', 'agentMessages'), []);
  assert.ok(runtimeCall.args.includes('-s'));
  assert.equal(runtimeCall.args[runtimeCall.args.indexOf('-s') + 1], 'read-only');
  assert.match(runtimeCall.args.at(-1), /Return only JSON/i);
  assert.match(runtimeCall.args.at(-1), /"citations"/);
});

test('chat agent runs include selected grounding candidates in the runtime prompt', async () => {
  const store = await createDemoStore();
  const calls = [];
  const groundingCalls = [];
  const service = createAgentRunService({
    groundingScorer: {
      async checkHealth() {
        return { mode: 'test', ok: true, scorer: 'test-grounding' };
      },
      async score(context) {
        groundingCalls.push(context);
        return {
          candidates: [
            {
              evidenceLinkId: 'evidence-1',
              id: 'evidence-1',
              label: 'Adaptive reranking note',
              locator: { page: 4 },
              quote: 'Adaptive reranking reduces latency.',
              score: 4,
              type: 'evidenceLink',
            },
          ],
          mode: 'test',
          ok: true,
          scorer: 'test-grounding',
        };
      },
    },
    rootDir: '/workspace',
    spawnImpl: createSuccessfulJsonSpawn({
      answer: 'Adaptive reranking is supported by the selected evidence.',
      citations: [{ evidenceLinkId: 'evidence-1', label: 'Adaptive reranking note', locator: { page: 4 } }],
      outputSummary: 'Answered with selected grounding evidence.',
    }, calls),
    store,
  });

  const run = await service.createRun({
    input: {
      messages: [{ role: 'user', text: 'What supports adaptive reranking?' }],
      thread: { id: 'thread-grounding', title: 'Grounding test' },
    },
    projectId: 'demo',
    stage: 'chat',
  });
  const finalRun = await waitForRun(store, run.id);
  const runtimeCall = calls.find((call) => call.args.includes('exec'));

  assert.equal(finalRun.status, 'done');
  assert.equal(groundingCalls.length, 1);
  assert.equal(groundingCalls[0].chatMessages.at(-1).text, 'What supports adaptive reranking?');
  assert.deepEqual(await service.getGroundingHealth(), { mode: 'test', ok: true, scorer: 'test-grounding' });
  assert.match(runtimeCall.args.at(-1), /Grounding:/);
  assert.match(runtimeCall.args.at(-1), /"scorer": "test-grounding"/);
  assert.match(runtimeCall.args.at(-1), /"evidenceLinkId": "evidence-1"/);
});

test('agent run service keeps canceled search runs from queueing late results', async () => {
  const store = await createDemoStore();
  let resolveSearch;
  const searchFinished = new Promise((resolve) => {
    resolveSearch = resolve;
  });
  const service = createAgentRunService({
    rootDir: '/workspace',
    searchService: {
      async search() {
        await searchFinished;
        return {
          provider: 'delayed-scout',
          query: 'local inference',
          results: [paperFixture({ paperId: 'late-paper' })],
          total: 1,
        };
      },
    },
    spawnImpl: createFailingSpawn(),
    store,
  });

  const run = await service.createRun({
    input: {
      query: 'local inference',
      scopes: [],
    },
    projectId: 'demo',
    stage: 'search',
  });

  await service.abortRun(run.id);
  resolveSearch();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(store.getAgentRun(run.id).status, 'canceled');
  assert.equal(store.getProject('demo').queueCount, 0);
});

test('agent run service stops queued reading side effects when cancellation wins the start race', async () => {
  const store = await createDemoStore();
  let runtimeCallCount = 0;
  const service = createAgentRunService({
    rootDir: '/workspace',
    spawnImpl(command, args = [], options = {}) {
      const child = createDelayedFailingSpawn()(command, args, options);
      if (!args.includes('--version')) {
        runtimeCallCount += 1;
      }
      return child;
    },
    store,
  });

  const run = await service.createRun({
    input: {
      paper: paperFixture({ paperId: 'cancel-race-paper' }),
    },
    projectId: 'demo',
    stage: 'reading',
    taskKind: 'create-reading-session',
  });

  await service.abortRun(run.id);
  await new Promise((resolve) => setTimeout(resolve, 80));

  assert.equal(store.getAgentRun(run.id).status, 'canceled');
  assert.equal(store.getReadingSessions('demo').length, 0);
  assert.equal(store.getProject('demo').queueCount, 0);
  assert.equal(runtimeCallCount, 0);
});

test('agent run worker processing aborts subprocess after durable cancel request', async () => {
  const store = await createDemoStore();
  let runtimeChild;
  let runtimeStarted;
  const runtimeReady = new Promise((resolve) => {
    runtimeStarted = resolve;
  });
  const service = createAgentRunService({
    cancelPollMs: 5,
    rootDir: '/workspace',
    spawnImpl: createHangingSpawn((child) => {
      runtimeChild = child;
      runtimeStarted();
    }),
    store,
  });
  const run = await store.createAgentRun({
    agent: 'Reader agent',
    input: {
      paper: paperFixture({ paperId: 'durable-cancel-paper' }),
    },
    projectId: 'demo',
    stage: 'reading',
    status: 'queue',
    taskKind: 'create-reading-session',
  });

  const processing = service.processNextQueuedRun({
    leaseMs: 30_000,
    workerId: 'worker-a',
  });
  await runtimeReady;
  await store.updateAgentRun(run.id, {
    cancelReason: 'user',
    cancelRequestedAt: '2026-06-14T02:00:00.000Z',
  });

  const result = await processing;
  const finalRun = store.getAgentRun(run.id);

  assert.equal(runtimeChild.exitCode, 0);
  assert.equal(result.run.status, 'canceled');
  assert.equal(finalRun.status, 'canceled');
  assert.equal(finalRun.leaseOwner, '');
  assert.equal(finalRun.leaseExpiresAt, null);
  assert.equal(finalRun.heartbeatAt, null);
  assert.match(finalRun.error, /canceled by user/i);
});

test('agent run creation can queue work for durable lease workers without request-time execution', async () => {
  const store = await createDemoStore();
  const calls = [];
  const service = createAgentRunService({
    autoExecuteRuns: false,
    rootDir: '/workspace',
    spawnImpl: createSuccessfulJsonSpawn(
      {
        answer: 'Graph reproduction plans should stay linked to their experiment runs.',
        citations: [],
        outputSummary: 'Answered from project context.',
      },
      calls,
    ),
    store,
  });

  const run = await service.createRun({
    input: {
      question: 'How should graph lab assets be linked?',
    },
    projectId: 'demo',
    stage: 'chat',
  });
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(store.getAgentRun(run.id).status, 'queue');
  assert.equal(calls.length, 0);

  const result = await service.processNextQueuedRun({
    leaseMs: 30_000,
    workerId: 'worker-durable',
  });
  const finalRun = store.getAgentRun(run.id);

  assert.equal(result.run.status, 'done');
  assert.equal(finalRun.status, 'done');
  assert.equal(finalRun.leaseOwner, '');
  assert.equal(finalRun.leaseExpiresAt, null);
  assert.equal(finalRun.outputPayload.answer, 'Graph reproduction plans should stay linked to their experiment runs.');
  assert.equal(calls.length, 1);
});

test('agent run service worker loop drains queued runs through durable leases', async () => {
  const store = await createDemoStore();
  const calls = [];
  const service = createAgentRunService({
    autoExecuteRuns: false,
    rootDir: '/workspace',
    spawnImpl: createSuccessfulJsonSpawn(
      {
        answer: 'Queued agent work is processed by the durable lease worker.',
        citations: [],
        outputSummary: 'Answered from project context.',
      },
      calls,
    ),
    store,
  });
  const worker = service.startWorkerLoop({
    idleMs: 5,
    leaseMs: 30_000,
    workerId: 'worker-loop',
  });

  try {
    const run = await service.createRun({
      input: {
        question: 'Who executes queued agent runs?',
      },
      projectId: 'demo',
      stage: 'chat',
    });
    const finalRun = await waitForRun(store, run.id);

    assert.equal(finalRun.status, 'done');
    assert.equal(finalRun.leaseOwner, '');
    assert.equal(finalRun.outputPayload.answer, 'Queued agent work is processed by the durable lease worker.');
    assert.equal(calls.length, 1);
  } finally {
    worker.stop();
  }
});

test('search agent run reports an error when Scout service is unavailable', async () => {
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
  assert.equal(finalRun.status, 'error');
  assert.match(finalRun.error, /Search service is not configured/);
  assert.match(finalRun.outputSummary, /Search did not finish/);
  assert.equal(finalRun.outputPayload, undefined);
  assert.equal(store.getProject('demo').queueCount, 0);
  assert.equal(store.getReadingSessions('demo').length, 0);
});

test('search agent run reports Scout failure without queueing fallback results', async () => {
  const store = await createDemoStore();
  const calls = [];
  const service = createAgentRunService({
    rootDir: '/workspace',
    searchService: {
      async search(input) {
        calls.push(input);
        throw new Error('runtime timeout');
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
  assert.equal(finalRun.stage, 'search');
  assert.equal(finalRun.status, 'error');
  assert.match(finalRun.error, /runtime timeout/);
  assert.match(finalRun.outputSummary, /Search did not finish/);
  assert.equal(finalRun.outputPayload, undefined);
  assert.equal(store.getProject('demo').queueCount, 0);
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
  assert.match(finalRun.outputSummary, /Found 2 papers/);
  assert.match(finalRun.warning, /seed checkpoint/);
});

test('search agent run checkpoints Scout progress before final results', async () => {
  const store = await createDemoStore();
  const service = createAgentRunService({
    rootDir: '/workspace',
    searchService: {
      async search(input) {
        assert.equal(typeof input.onProgress, 'function');
        await input.onProgress({
          detail: 'Fetching OpenAlex candidates for local inference serving.',
          label: 'OpenAlex tool call',
          status: 'running',
          type: 'tool',
        });
        await input.onProgress({
          detail: 'Scout selected quantized serving papers from the candidates.',
          label: 'Agent response',
          status: 'done',
          type: 'agent_message',
        });
        return {
          agentRuntime: 'codex',
          live: true,
          provider: 'scout-agent',
          query: input.query,
          results: [paperFixture()],
          searchMode: 'scout',
          total: 1,
          warning: '',
        };
      },
    },
    spawnImpl: createFailingSpawn(),
    store,
  });

  const run = await service.createRun({
    input: {
      query: '"local inference" llm quantization serving',
      scopes: [],
    },
    projectId: 'demo',
    stage: 'search',
  });

  const finalRun = await waitForRun(store, run.id);

  assert.equal(finalRun.status, 'done');
  assert.equal(finalRun.progressEvents.length, 2);
  assert.equal(finalRun.progressEvents[0].type, 'tool');
  assert.match(finalRun.progressEvents[0].detail, /OpenAlex candidates/);
  assert.equal(finalRun.progressEvents[1].type, 'agent_message');
  assert.match(finalRun.progressEvents[1].detail, /Scout selected/);
});
