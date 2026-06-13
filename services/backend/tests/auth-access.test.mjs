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
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ares-auth-access-'));
  const seedFile = path.join(rootDir, 'data', 'store.seed.json');
  await fs.mkdir(path.dirname(seedFile), { recursive: true });
  await fs.writeFile(
    seedFile,
    JSON.stringify(
      {
        agentRuns: [
          {
            id: 'run-owned',
            projectId: 'owned',
            stage: 'reading',
            status: 'done',
          },
          {
            id: 'run-private',
            projectId: 'private',
            stage: 'reading',
            status: 'done',
          },
        ],
        library: {
          owned: [],
          private: [],
        },
        projects: [
          {
            color: '#5e6ad2',
            defaultQuery: 'adaptive reranker',
            focus: 'Owned focus',
            id: 'owned',
            keywords: ['rag'],
            members: [
              { role: 'editor', userId: 'editor-user' },
              { role: 'viewer', userId: 'viewer-user' },
            ],
            name: 'Owned',
            ownerId: 'owner-user',
          },
          {
            color: '#111111',
            defaultQuery: 'private',
            focus: 'Private focus',
            id: 'private',
            keywords: ['private'],
            name: 'Private',
            ownerId: 'private-owner',
          },
        ],
        readingQueue: {
          owned: [],
          private: [],
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

  throw new Error('Timed out waiting for auth access test server to boot.');
}

async function startServer(dataRootDir) {
  const port = await getFreePort();
  const child = spawn('node', ['services/backend/index.mjs'], {
    cwd: '/home/ubuntu/project/ARES',
    env: {
      ...process.env,
      ARES_AUTH_MODE: 'required',
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

function userHeaders(userId, role = 'viewer') {
  return {
    'x-ares-user-id': userId,
    'x-ares-user-role': role,
  };
}

test('required auth mode rejects anonymous API access and filters project lists', async (t) => {
  const dataRootDir = await createDataRoot();
  const server = await startServer(dataRootDir);
  t.after(async () => {
    await server.close();
  });

  const anonymousResponse = await fetch(new URL('/api/projects', server.url));
  assert.equal(anonymousResponse.status, 401);

  const ownerResponse = await fetch(new URL('/api/projects', server.url), {
    headers: userHeaders('owner-user'),
  });
  const ownerPayload = await ownerResponse.json();
  assert.equal(ownerResponse.status, 200);
  assert.deepEqual(
    ownerPayload.projects.map((project) => project.id),
    ['owned'],
  );

  const runsResponse = await fetch(new URL('/api/agent-runs', server.url), {
    headers: userHeaders('owner-user'),
  });
  const runsPayload = await runsResponse.json();
  assert.equal(runsResponse.status, 200);
  assert.deepEqual(
    runsPayload.runs.map((run) => run.id),
    ['run-owned'],
  );
});

test('project access guard separates read, write, and destructive permissions', async (t) => {
  const dataRootDir = await createDataRoot();
  const server = await startServer(dataRootDir);
  t.after(async () => {
    await server.close();
  });

  const ownerGraphResponse = await fetch(new URL('/api/projects/owned/graph', server.url), {
    headers: userHeaders('owner-user'),
  });
  assert.equal(ownerGraphResponse.status, 200);

  const intruderGraphResponse = await fetch(new URL('/api/projects/owned/graph', server.url), {
    headers: userHeaders('intruder-user'),
  });
  assert.equal(intruderGraphResponse.status, 403);

  const viewerGraphResponse = await fetch(new URL('/api/projects/owned/graph', server.url), {
    headers: userHeaders('viewer-user'),
  });
  assert.equal(viewerGraphResponse.status, 200);

  const viewerCreateResponse = await fetch(new URL('/api/projects/owned/insight-cards', server.url), {
    body: JSON.stringify({
      claim: 'Viewers cannot create insights.',
      type: 'claim',
    }),
    headers: {
      ...userHeaders('viewer-user'),
      'content-type': 'application/json',
    },
    method: 'POST',
  });
  assert.equal(viewerCreateResponse.status, 403);

  const ownerCreateResponse = await fetch(new URL('/api/projects/owned/insight-cards', server.url), {
    body: JSON.stringify({
      claim: 'Owners can create insights.',
      type: 'claim',
    }),
    headers: {
      ...userHeaders('owner-user'),
      'content-type': 'application/json',
    },
    method: 'POST',
  });
  const created = await ownerCreateResponse.json();
  assert.equal(ownerCreateResponse.status, 201);

  const editorCreateResponse = await fetch(new URL('/api/projects/owned/insight-cards', server.url), {
    body: JSON.stringify({
      claim: 'Editors can create insights.',
      type: 'claim',
    }),
    headers: {
      ...userHeaders('editor-user'),
      'content-type': 'application/json',
    },
    method: 'POST',
  });
  assert.equal(editorCreateResponse.status, 201);

  const viewerDeleteResponse = await fetch(
    new URL(`/api/projects/owned/insight-cards/${created.asset.id}`, server.url),
    {
      body: JSON.stringify({
        confirmDelete: true,
        reason: 'Viewer destructive access should be denied.',
      }),
      headers: {
        ...userHeaders('viewer-user'),
        'content-type': 'application/json',
      },
      method: 'DELETE',
    },
  );
  assert.equal(viewerDeleteResponse.status, 403);

  const editorDeleteResponse = await fetch(
    new URL(`/api/projects/owned/insight-cards/${created.asset.id}`, server.url),
    {
      body: JSON.stringify({
        confirmDelete: true,
        reason: 'Editor destructive access should be denied.',
      }),
      headers: {
        ...userHeaders('editor-user'),
        'content-type': 'application/json',
      },
      method: 'DELETE',
    },
  );
  assert.equal(editorDeleteResponse.status, 403);
});
