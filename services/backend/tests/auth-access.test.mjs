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
        users: [
          { email: 'owner@example.test', id: 'owner-user', name: 'Owner User', role: 'viewer' },
          { email: 'editor@example.test', id: 'editor-user', name: 'Editor User', role: 'viewer' },
          { email: 'viewer@example.test', id: 'viewer-user', name: 'Viewer User', role: 'viewer' },
          { email: 'intruder@example.test', id: 'intruder-user', name: 'Intruder User', role: 'viewer' },
        ],
        organizations: [{ id: 'org-demo', name: 'Demo Org', slug: 'demo' }],
        memberships: [
          { organizationId: 'org-demo', role: 'owner', userId: 'owner-user' },
          { organizationId: 'org-demo', role: 'editor', userId: 'editor-user' },
          { organizationId: 'org-demo', role: 'viewer', userId: 'viewer-user' },
        ],
        projects: [
          {
            color: '#5e6ad2',
            defaultQuery: 'adaptive reranker',
            focus: 'Owned focus',
            id: 'owned',
            keywords: ['rag'],
            name: 'Owned',
          },
          {
            color: '#111111',
            defaultQuery: 'private',
            focus: 'Private focus',
            id: 'private',
            keywords: ['private'],
            name: 'Private',
          },
        ],
        projectAccess: [
          { projectId: 'owned', role: 'owner', userId: 'owner-user' },
          { projectId: 'owned', role: 'editor', userId: 'editor-user' },
          { projectId: 'owned', role: 'viewer', userId: 'viewer-user' },
          { projectId: 'private', role: 'owner', userId: 'private-owner' },
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

  const healthResponse = await fetch(new URL('/api/health', server.url), {
    headers: {
      'x-request-id': 'req-auth-test-0001',
    },
  });
  assert.equal(healthResponse.status, 200);
  assert.equal(healthResponse.headers.get('x-request-id'), 'req-auth-test-0001');

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

  const abortResponse = await fetch(new URL('/api/agent-runs/run-owned/actions', server.url), {
    body: JSON.stringify({
      action: 'abort',
      reason: 'Audit abort from test.',
    }),
    headers: {
      ...userHeaders('owner-user'),
      'content-type': 'application/json',
    },
    method: 'POST',
  });
  assert.equal(abortResponse.status, 200);

  const auditResponse = await fetch(new URL('/api/projects/owned/audit-events', server.url), {
    headers: userHeaders('owner-user'),
  });
  const auditPayload = await auditResponse.json();
  assert.equal(auditResponse.status, 200);
  assert.equal(auditPayload.results[0].action, 'abortAgentRun');
  assert.equal(auditPayload.results[0].actorUserId, 'owner-user');
  assert.equal(auditPayload.results[0].targetId, 'run-owned');
});

test('cookie login exposes current user and enforces CSRF on mutating requests', async (t) => {
  const dataRootDir = await createDataRoot();
  const server = await startServer(dataRootDir);
  t.after(async () => {
    await server.close();
  });

  const loginResponse = await fetch(new URL('/api/auth/login', server.url), {
    body: JSON.stringify({ userId: 'owner-user' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const loginPayload = await loginResponse.json();
  const cookie = loginResponse.headers.get('set-cookie');
  assert.equal(loginResponse.status, 200);
  assert.equal(loginPayload.user.id, 'owner-user');
  assert.match(loginPayload.csrfToken, /^csrf-/);
  assert.match(cookie, /ares_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);

  const meResponse = await fetch(new URL('/api/auth/me', server.url), {
    headers: { cookie },
  });
  const mePayload = await meResponse.json();
  assert.equal(meResponse.status, 200);
  assert.equal(mePayload.user.id, 'owner-user');
  assert.equal(mePayload.csrfToken, loginPayload.csrfToken);

  const blockedCreateResponse = await fetch(new URL('/api/projects/owned/insight-cards', server.url), {
    body: JSON.stringify({
      claim: 'Missing CSRF should block cookie writes.',
      type: 'claim',
    }),
    headers: {
      'content-type': 'application/json',
      cookie,
    },
    method: 'POST',
  });
  assert.equal(blockedCreateResponse.status, 403);

  const createResponse = await fetch(new URL('/api/projects/owned/insight-cards', server.url), {
    body: JSON.stringify({
      claim: 'CSRF token allows cookie writes.',
      type: 'claim',
    }),
    headers: {
      'content-type': 'application/json',
      cookie,
      'x-csrf-token': loginPayload.csrfToken,
    },
    method: 'POST',
  });
  assert.equal(createResponse.status, 201);

  const logoutResponse = await fetch(new URL('/api/auth/logout', server.url), {
    headers: { cookie },
    method: 'POST',
  });
  assert.equal(logoutResponse.status, 200);

  const revokedMeResponse = await fetch(new URL('/api/auth/me', server.url), {
    headers: { cookie },
  });
  assert.equal(revokedMeResponse.status, 401);
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

  const updateAccessResponse = await fetch(new URL('/api/projects/owned/project-access', server.url), {
    body: JSON.stringify({
      reason: 'Promote viewer for audit coverage.',
      role: 'editor',
      userId: 'viewer-user',
    }),
    headers: {
      ...userHeaders('owner-user'),
      'content-type': 'application/json',
    },
    method: 'POST',
  });
  const updateAccessPayload = await updateAccessResponse.json();
  assert.equal(updateAccessResponse.status, 200);
  assert.equal(updateAccessPayload.projectAccess.role, 'editor');
  assert.equal(updateAccessPayload.audit.action, 'updateProjectAccess');

  const projectAccessResponse = await fetch(new URL('/api/projects/owned/project-access', server.url), {
    headers: userHeaders('owner-user'),
  });
  const projectAccessPayload = await projectAccessResponse.json();
  assert.equal(projectAccessResponse.status, 200);
  assert.equal(projectAccessPayload.results.find((entry) => entry.userId === 'viewer-user').role, 'editor');
});
