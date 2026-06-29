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
      ARES_ENABLE_DEMO_PDF: 'true',
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
        sections: [{ active: true, id: 'method', label: '3. Method', status: 'done' }],
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
  assert.equal(session.sections[0].active, true);
});

test('project library routes filter and patch shelf metadata without synthetic rows', async (t) => {
  const dataRootDir = await createDataRoot({
    library: [
      {
        ...buildDemoPaper(),
        collectionIds: ['c-rerank'],
        flag: false,
        readingProgress: 35,
        tags: ['reranking', 'latency'],
      },
      {
        ...buildDemoPaper(),
        paperId: 'benchmark-paper',
        title: 'Benchmark Protocols for RAG',
        collectionIds: ['c-eval'],
        readingProgress: 100,
        tags: ['evaluation'],
      },
    ],
  });
  const server = await startServer(dataRootDir);
  t.after(async () => {
    await server.close();
  });

  const filteredResponse = await fetch(
    new URL('/api/projects/demo/library?shelf=reading&collection=c-rerank&tag=reranking&q=adaptive', server.url),
  );
  const filtered = await filteredResponse.json();
  assert.equal(filteredResponse.status, 200);
  assert.deepEqual(
    filtered.results.map((paper) => paper.paperId),
    ['demo-paper'],
  );

  const patchResponse = await fetch(new URL('/api/projects/demo/library/demo-paper', server.url), {
    body: JSON.stringify({
      collectionIds: ['c-eval'],
      flag: true,
      shelf: 'done',
      tags: ['reviewed'],
    }),
    headers: { 'content-type': 'application/json' },
    method: 'PATCH',
  });
  const patched = await patchResponse.json();
  assert.equal(patchResponse.status, 200);
  assert.equal(patched.paper.flag, true);
  assert.equal(patched.paper.shelf, 'done');
  assert.equal(patched.paper.readingProgress, 100);
  assert.deepEqual(patched.paper.collectionIds, ['c-eval']);
  assert.deepEqual(patched.paper.tags, ['reviewed']);

  const flaggedResponse = await fetch(new URL('/api/projects/demo/library?shelf=flag&tag=reviewed', server.url));
  const flagged = await flaggedResponse.json();
  assert.equal(flaggedResponse.status, 200);
  assert.deepEqual(
    flagged.results.map((paper) => paper.paperId),
    ['demo-paper'],
  );
});

test('project library route preserves caller supplied library timestamps', async (t) => {
  const dataRootDir = await createDataRoot();
  const server = await startServer(dataRootDir);
  t.after(async () => {
    await server.close();
  });

  const savedAt = '2026-06-27T00:00:00.000Z';
  const updatedAt = '2026-06-24T00:00:00.000Z';
  const saveResponse = await fetch(new URL('/api/projects/demo/library', server.url), {
    body: JSON.stringify({
      paper: {
        ...buildDemoPaper(),
        savedAt,
        updatedAt,
      },
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const saved = await saveResponse.json();

  assert.equal(saveResponse.status, 200);
  assert.equal(saved.paper.savedAt, savedAt);
  assert.equal(saved.paper.updatedAt, updatedAt);

  const libraryResponse = await fetch(new URL('/api/projects/demo/library', server.url));
  const library = await libraryResponse.json();
  assert.equal(libraryResponse.status, 200);
  assert.equal(library.results[0].savedAt, savedAt);
  assert.equal(library.results[0].updatedAt, updatedAt);
});

test('project library route includes user note counts from reading sessions', async (t) => {
  const dataRootDir = await createDataRoot({
    library: [
      {
        ...buildDemoPaper(),
        collectionIds: ['c-rerank'],
        readingProgress: 35,
        tags: ['reranking'],
      },
    ],
    readingSessions: [
      {
        id: 'reading-demo-notes',
        notes: [
          { body: 'First note', id: 'note-1', kind: 'claim' },
          { body: 'Second note', id: 'note-2', kind: 'limit' },
        ],
        paperId: 'demo-paper',
        projectId: 'demo',
        status: 'done',
        title: 'Adaptive Skipping for Efficient Reranking',
      },
      {
        id: 'reading-other-project',
        notes: [{ body: 'Should not count', id: 'note-3' }],
        paperId: 'demo-paper',
        projectId: 'other-project',
        status: 'done',
        title: 'Other Project Paper',
      },
      {
        id: 'reading-other-paper',
        notes: [{ body: 'Should not count either', id: 'note-4' }],
        paperId: 'other-paper',
        projectId: 'demo',
        status: 'done',
        title: 'Other Paper',
      },
    ],
  });
  const server = await startServer(dataRootDir);
  t.after(async () => {
    await server.close();
  });

  const response = await fetch(new URL('/api/projects/demo/library', server.url));
  const payload = await response.json();
  const paper = payload.results.find((entry) => entry.paperId === 'demo-paper');

  assert.equal(response.status, 200);
  assert.ok(paper);
  assert.equal(paper.noteCount, 2);
  assert.equal(paper.notes.length, 2);
  assert.deepEqual(paper.notes.map((note) => note.id), ['note-1', 'note-2']);
});

test('reading routes deliver binary PDF, enforce summarize prerequisite, and parse successfully', async (t) => {
  const dataRootDir = await createDataRoot();
  const server = await startServer(dataRootDir);
  t.after(async () => {
    await server.close();
  });

  const createResponse = await fetch(new URL('/api/projects/demo/reading-sessions', server.url), {
    body: JSON.stringify({
      display: { labMeta: "Kim · ACL '24", labOrder: 1, labTitle: 'Adaptive Skipping' },
      paper: buildDemoPaper(),
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const created = await createResponse.json();
  const sessionId = created.readingSession.id;
  assert.deepEqual(created.readingSession.display, {
    labMeta: "Kim · ACL '24",
    labOrder: 1,
    labTitle: 'Adaptive Skipping',
  });

  const summarizeResponse = await fetch(new URL(`/api/reading-sessions/${sessionId}/summarize`, server.url), {
    body: JSON.stringify({}),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const summarizePayload = await summarizeResponse.json();
  assert.equal(summarizeResponse.status, 409);
  assert.match(summarizePayload.error, /Analyze the paper/i);

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

test('reading routes expose the combined analyze action', async (t) => {
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

  const importResponse = await fetch(new URL(`/api/reading-sessions/${sessionId}/import-text`, server.url), {
    body: JSON.stringify({
      sourceLabel: 'Manual OCR text',
      text: [
        'Abstract',
        'Manual OCR text prepares a parsed reading session.',
        'Method',
        'The system checks one combined analyze action after import.',
        'Figure 1: Combined analysis pipeline.',
      ].join('\n'),
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  assert.equal(importResponse.status, 200);

  const analyzeResponse = await fetch(new URL(`/api/reading-sessions/${sessionId}/analyze`, server.url), {
    body: JSON.stringify({}),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const analyzed = await analyzeResponse.json();

  assert.equal(analyzeResponse.status, 200);
  assert.equal(analyzed.session.parseStatus, 'done');
  assert.equal(analyzed.session.summaryStatus, 'done');
  assert.ok(analyzed.session.parsedArtifactPath);
  assert.ok(analyzed.session.assets.length >= 1);
});

test('reading routes import external OCR text for parse recovery', async (t) => {
  const dataRootDir = await createDataRoot();
  const server = await startServer(dataRootDir);
  t.after(async () => {
    await server.close();
  });

  const createResponse = await fetch(new URL('/api/projects/demo/reading-sessions', server.url), {
    body: JSON.stringify({ paper: buildDemoPaper({ pdfUrl: null }) }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const created = await createResponse.json();
  const sessionId = created.readingSession.id;

  const importResponse = await fetch(new URL(`/api/reading-sessions/${sessionId}/import-text`, server.url), {
    body: JSON.stringify({
      generatedAt: '2026-06-12T08:30:00.000Z',
      sourceLabel: 'Manual OCR text',
      text: 'Abstract\nManual OCR text restores Reader parsing.\nMethod\nPaste extracted text from an external OCR tool.',
      tool: 'OCRmyPDF',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const imported = await importResponse.json();

  assert.equal(importResponse.status, 200);
  assert.equal(imported.session.parseStatus, 'done');
  assert.equal(imported.session.sourceProvider, 'external-ocr');
  assert.equal(imported.session.ocrProvenance.generatedAt, '2026-06-12T08:30:00.000Z');
  assert.equal(imported.session.ocrProvenance.sourceLabel, 'Manual OCR text');
  assert.equal(imported.session.ocrProvenance.tool, 'OCRmyPDF');
  assert.ok(imported.session.parsedArtifactPath);
});

test('reading routes create sessions from uploaded PDFs', async (t) => {
  const dataRootDir = await createDataRoot();
  const server = await startServer(dataRootDir);
  t.after(async () => {
    await server.close();
  });

  const uploadResponse = await fetch(new URL('/api/projects/demo/reading-sessions/upload', server.url), {
    body: JSON.stringify({
      contentBase64: Buffer.from('%PDF-1.4\n%%EOF').toString('base64'),
      fileName: 'uploaded-paper.pdf',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const uploaded = await uploadResponse.json();

  assert.equal(uploadResponse.status, 200);
  assert.equal(uploaded.paper.sourceProvider, 'upload');
  assert.equal(uploaded.readingSession.title, 'uploaded-paper');
  assert.match(uploaded.readingSession.pdfUrl, /^uploaded:\/\//);

  const sessionsResponse = await fetch(new URL('/api/projects/demo/reading-sessions', server.url));
  const sessions = await sessionsResponse.json();
  assert.ok(sessions.results.some((session) => session.id === uploaded.readingSession.id));

  const libraryResponse = await fetch(new URL('/api/projects/demo/library', server.url));
  const library = await libraryResponse.json();
  assert.ok(library.results.some((paper) => paper.paperId === uploaded.paper.paperId));

  const pdfResponse = await fetch(new URL(`/api/reading-sessions/${uploaded.readingSession.id}/pdf`, server.url));
  const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
  assert.equal(pdfResponse.status, 200);
  assert.equal(new TextDecoder().decode(pdfBytes.slice(0, 5)), '%PDF-');
});

test('reading routes create sessions from binary PDF uploads', async (t) => {
  const dataRootDir = await createDataRoot();
  const server = await startServer(dataRootDir);
  t.after(async () => {
    await server.close();
  });

  const uploadResponse = await fetch(new URL('/api/projects/demo/reading-sessions/upload', server.url), {
    body: Buffer.from('%PDF-1.4\n%%EOF'),
    headers: {
      'content-type': 'application/pdf',
      'x-file-name': encodeURIComponent('binary-upload.pdf'),
    },
    method: 'POST',
  });
  const uploaded = await uploadResponse.json();

  assert.equal(uploadResponse.status, 200);
  assert.equal(uploaded.paper.sourceName, 'binary-upload.pdf');
  assert.equal(uploaded.readingSession.title, 'binary-upload');
});
