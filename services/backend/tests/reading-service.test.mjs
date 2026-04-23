import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import { createReadingService } from '../lib/reading-service.mjs';
import { createStore } from '../lib/store.mjs';

function createStubRuntime() {
  return {
    async checkAvailability() {
      return false;
    },
    async runJsonTask() {
      throw new Error('runtime unavailable');
    },
    parseJsonFromMessages() {
      return {};
    },
  };
}

function buildDemoPaper({ pdfUrl = 'https://example.org/papers/demo.pdf' } = {}) {
  return {
    abstract:
      'Adaptive skipping reduces reranker latency while preserving answer quality by routing expensive scoring only when uncertainty is high.',
    authors: ['Demo Author', 'Second Author'],
    citedByCount: 12,
    keyPoints: [
      'Confidence-aware gating reduces reranker cost.',
      'The method keeps quality nearly flat on evaluation sets.',
      'Calibration quality determines the failure mode on hard queries.',
    ],
    keywords: ['rag', 'reranker', 'adaptive skipping'],
    matchedKeywords: ['adaptive skipping', 'reranker'],
    openAccess: true,
    paperId: 'demo-paper',
    paperUrl: 'https://example.org/papers/demo',
    pdfUrl,
    relevance: 96,
    sourceName: 'ARES seed library',
    sourceProvider: 'seed',
    summary: 'Adaptive skipping reduces reranker latency while keeping answer quality nearly unchanged.',
    title: 'Adaptive Skipping for Efficient Reranking',
    venue: 'ACL 2026',
    year: 2026,
  };
}

async function createHarness({ readingSessions = [] } = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ares-reading-service-'));
  const seedFile = path.join(tempDir, 'data', 'store.seed.json');
  const runtimeFile = path.join(tempDir, 'data', 'runtime', 'store.json');
  await fs.mkdir(path.dirname(seedFile), { recursive: true });
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
            color: '#5e6ad2',
            focus: 'Demo focus',
            defaultQuery: 'adaptive reranker',
            keywords: ['rag', 'reranker'],
          },
        ],
        readingQueue: {
          demo: [],
        },
        readingSessions,
        reproChecklistItems: [],
        resultComparisons: [],
        writingDrafts: [],
      },
      null,
      2,
    ),
  );

  const store = await createStore({ seedFile, runtimeFile });
  const service = createReadingService({
    agentRuntime: createStubRuntime(),
    rootDir: tempDir,
    store,
  });

  return {
    rootDir: tempDir,
    service,
    store,
  };
}

test('reading service parses cached PDF and seeds sections, notes, and assets', async (t) => {
  const { rootDir, service, store } = await createHarness();
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper(),
    projectId: 'demo',
  });
  const payload = await service.parseSession(session.id);

  assert.equal(payload.session.parseStatus, 'done');
  assert.ok(payload.session.pageCount >= 1);
  assert.ok(payload.session.pdfCachePath);
  assert.ok(payload.session.parsedArtifactPath);
  assert.ok(payload.session.sections.length >= 3);
  assert.ok(payload.session.highlights.length >= 2);
  assert.ok(payload.session.notes.length >= 1);
  assert.ok(payload.session.assets.length >= 1);

  await fs.access(path.join(rootDir, payload.session.pdfCachePath));
  await fs.access(path.join(rootDir, payload.session.parsedArtifactPath));
});

test('reading service marks metadata-only sessions as parse errors when pdf is missing', async (t) => {
  const { service, store } = await createHarness();
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper({ pdfUrl: null }),
    projectId: 'demo',
  });
  const payload = await service.parseSession(session.id);

  assert.equal(payload.session.parseStatus, 'error');
  assert.match(payload.session.parseError, /PDF URL/i);
});

test('reading summarize enforces parse prerequisite and persists summary cards after parse', async (t) => {
  const { service, store } = await createHarness();
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper(),
    projectId: 'demo',
  });

  await assert.rejects(() => service.summarizeSession(session.id), /Parse paper/i);

  await service.parseSession(session.id);
  const payload = await service.summarizeSession(session.id);

  assert.equal(payload.session.summaryStatus, 'done');
  assert.ok(payload.session.summaryCards.tldr);
  assert.ok(payload.session.summaryCards.method);
  assert.ok(payload.session.summaryCards.result);
  assert.ok(payload.session.summaryCards.limit);
  assert.ok(payload.session.summaryCards.keyPoints.length >= 2);
});

test('reading chat stores turns with citations after parse', async (t) => {
  const { service, store } = await createHarness();
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper(),
    projectId: 'demo',
  });
  await service.parseSession(session.id);
  const payload = await service.chat(session.id, {
    message: 'What is the main method?',
  });

  assert.equal(payload.messages.length, 2);
  assert.equal(payload.messages[0].role, 'user');
  assert.equal(payload.messages[1].role, 'assistant');
  assert.ok(payload.messages[1].citations.length >= 1);
  assert.equal(payload.session.chatMessages.length, 2);
});

test('reading note CRUD persists inline note edits', async (t) => {
  const { service, store } = await createHarness();
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper(),
    projectId: 'demo',
  });
  await service.parseSession(session.id);

  const created = await service.createNote(session.id, {
    body: 'Need to validate calibration data split.',
    kind: 'note',
    page: 2,
    quote: 'Calibration quality determines the failure mode on hard queries.',
  });
  assert.ok(created.note.id);

  const updated = await service.updateNote(session.id, created.note.id, {
    body: 'Need to validate calibration data split before the next run.',
  });
  assert.match(updated.note.body, /before the next run/);

  const removed = await service.deleteNote(session.id, created.note.id);
  assert.equal(removed.ok, true);
  assert.ok(!removed.session.notes.some((note) => note.id === created.note.id));
});

test('reading asset extraction can be rerun from cached parsed artifact', async (t) => {
  const { service, store } = await createHarness();
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper(),
    projectId: 'demo',
  });
  await service.parseSession(session.id);
  const extracted = await service.extractAssets(session.id);

  assert.ok(extracted.assets.length >= 1);
  assert.equal(extracted.session.assets.length, extracted.assets.length);
});
