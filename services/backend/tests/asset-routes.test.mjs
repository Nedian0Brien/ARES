import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { promises as fs } from 'node:fs';

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function createDataRoot() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ares-asset-routes-'));
  const seedFile = path.join(rootDir, 'data', 'store.seed.json');
  await fs.mkdir(path.dirname(seedFile), { recursive: true });
  await fs.writeFile(
    seedFile,
    JSON.stringify(
      {
        library: {
          demo: [
            {
              paperId: 'paper-1',
              savedAt: '2026-05-29T00:00:00.000Z',
              title: 'Paper 1',
              venue: 'ACL',
              year: 2026,
            },
          ],
        },
        projects: [
          {
            color: '#5e6ad2',
            defaultQuery: 'adaptive reranker',
            focus: 'Demo focus',
            id: 'demo',
            keywords: ['rag', 'reranker'],
            name: 'Demo',
          },
        ],
        readingQueue: {
          demo: [],
        },
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

  throw new Error('Timed out waiting for asset route test server to boot.');
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
    getStderr() {
      return stderr;
    },
    url: baseUrl,
  };
}

test('asset graph routes expose project graph and create graph assets', async (t) => {
  const dataRootDir = await createDataRoot();
  const server = await startServer(dataRootDir);
  t.after(async () => {
    await server.close();
  });

  const graphResponse = await fetch(new URL('/api/projects/demo/graph', server.url));
  const graph = await graphResponse.json();
  assert.equal(graphResponse.status, 200);
  assert.equal(graph.graphVersion, 1);
  assert.equal(graph.papers[0].paperId, 'paper-1');

  const createResponse = await fetch(new URL('/api/projects/demo/insight-cards', server.url), {
    body: JSON.stringify({
      claim: 'Calibration controls adaptive reranking risk.',
      confidence: 'medium',
      evidenceLinkIds: [],
      type: 'claim',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const created = await createResponse.json();
  assert.equal(createResponse.status, 201);
  assert.equal(created.asset.projectId, 'demo');
  assert.equal(created.asset.claim, 'Calibration controls adaptive reranking risk.');

  const listResponse = await fetch(new URL('/api/projects/demo/insight-cards', server.url));
  const listed = await listResponse.json();
  assert.equal(listResponse.status, 200);
  assert.equal(listed.results[0].id, created.asset.id);

  const draftResponse = await fetch(new URL('/api/projects/demo/drafts', server.url), {
    body: JSON.stringify({
      title: 'Demo draft',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const draft = await draftResponse.json();
  assert.equal(draftResponse.status, 201);

  const sectionResponse = await fetch(new URL('/api/projects/demo/draft-sections', server.url), {
    body: JSON.stringify({
      body: 'Calibration controls adaptive reranking risk.',
      draftId: draft.asset.id,
      evidenceLinkIds: ['evidence-1'],
      insightCardIds: [created.asset.id],
      title: 'Method',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const section = await sectionResponse.json();
  assert.equal(sectionResponse.status, 201);
  assert.equal(section.asset.draftId, draft.asset.id);
  assert.deepEqual(section.asset.insightCardIds, [created.asset.id]);
});
