import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { promises as fs } from 'node:fs';

function buildDemoPaper() {
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
    pdfUrl: 'https://example.org/papers/demo.pdf',
    relevance: 96,
    sourceName: 'ARES seed library',
    sourceProvider: 'seed',
    summary: 'Adaptive skipping reduces reranker latency while keeping answer quality nearly unchanged.',
    title: 'Adaptive Skipping for Efficient Reranking',
    venue: 'ACL 2026',
    year: 2026,
  };
}

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function createDataRoot({ readingSessions = [], library = [] } = {}) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ares-reading-routes-'));
  const seedFile = path.join(rootDir, 'data', 'store.seed.json');
  await fs.mkdir(path.dirname(seedFile), { recursive: true });
  await fs.writeFile(
    seedFile,
    JSON.stringify(
      {
        agentRuns: [],
        experimentRuns: [],
        insightNotes: [],
        library: {
          demo: library,
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

  return rootDir;
}

async function waitForServer(baseUrl, attempts = 50) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(new URL('/api/health', baseUrl));
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the server is up.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error('Timed out waiting for reading test server to boot.');
}

async function startServer(dataRootDir) {
  const port = await getFreePort();
  const child = spawn('node', ['services/backend/index.mjs'], {
    cwd: '/home/ubuntu/project/ARES',
    env: {
      ...process.env,
      ARES_DATA_ROOT_DIR: dataRootDir,
      HOST: '127.0.0.1',
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(baseUrl);

  return {
    async close() {
      child.kill('SIGTERM');
      await once(child, 'exit');
    },
    child,
    getStderr() {
      return stderr;
    },
    port,
    url: baseUrl,
  };
}

test('GET reading sessions normalizes legacy note and highlight shapes', async (t) => {
  const dataRootDir = await createDataRoot({
    readingSessions: [
      {
        abstract: 'Legacy abstract',
        authors: ['Legacy Author'],
        createdAt: '2026-04-20T00:00:00.000Z',
        highlights: [{ type: 'claim', text: 'Legacy highlight text', section: 'Introduction' }],
        id: 'reading-legacy',
        notes: [{ label: 'note', value: 'Legacy note body' }],
        paperId: 'legacy-paper',
        projectId: 'demo',
        status: 'todo',
        summary: 'Legacy summary',
        title: 'Legacy Reading Session',
        updatedAt: '2026-04-20T00:00:00.000Z',
        venue: 'ACL 2025',
        year: 2025,
      },
    ],
  });
  const server = await startServer(dataRootDir);
  t.after(async () => {
    await server.close();
  });

  const response = await fetch(new URL('/api/projects/demo/reading-sessions', server.url));
  const payload = await response.json();
  const session = payload.results[0];

  assert.equal(response.status, 200);
  assert.equal(session.parseStatus, 'idle');
  assert.equal(session.summaryStatus, 'idle');
  assert.equal(session.notes[0].body, 'Legacy note body');
  assert.equal(session.highlights[0].quote, 'Legacy highlight text');
});

test('reading routes deliver binary PDF, enforce summarize prerequisite, and parse successfully', async (t) => {
  const dataRootDir = await createDataRoot();
  const server = await startServer(dataRootDir);
  t.after(async () => {
    await server.close();
  });

  const createResponse = await fetch(new URL('/api/projects/demo/reading-sessions', server.url), {
    body: JSON.stringify({ paper: buildDemoPaper() }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const created = await createResponse.json();
  const sessionId = created.readingSession.id;

  const summarizeResponse = await fetch(new URL(`/api/reading-sessions/${sessionId}/summarize`, server.url), {
    body: JSON.stringify({}),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const summarizePayload = await summarizeResponse.json();
  assert.equal(summarizeResponse.status, 409);
  assert.match(summarizePayload.error, /Parse paper/i);

  const pdfResponse = await fetch(new URL(`/api/reading-sessions/${sessionId}/pdf`, server.url));
  const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
  assert.equal(pdfResponse.status, 200);
  assert.match(pdfResponse.headers.get('content-type') || '', /application\/pdf/i);
  assert.ok(pdfBytes.length > 200);

  const parseResponse = await fetch(new URL(`/api/reading-sessions/${sessionId}/parse`, server.url), {
    body: JSON.stringify({}),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const parsed = await parseResponse.json();
  assert.equal(parseResponse.status, 200);
  assert.equal(parsed.session.parseStatus, 'done');
  assert.ok(parsed.session.pageCount >= 1);
  assert.ok(parsed.session.assets.length >= 1);
});
