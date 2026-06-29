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
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ares-lab-routes-'));
  const seedFile = path.join(rootDir, 'data', 'store.seed.json');
  await fs.mkdir(path.dirname(seedFile), { recursive: true });
  await fs.writeFile(
    seedFile,
    JSON.stringify(
      {
        library: {
          demo: [],
        },
        projects: [
          {
            color: '#8957c9',
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

  throw new Error('Timed out waiting for Lab route test server to boot.');
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

test('Lab execute route runs a low-risk command and stores a result dossier', async (t) => {
  const dataRootDir = await createDataRoot();
  const server = await startServer(dataRootDir);
  t.after(async () => {
    await server.close();
  });

  const planResponse = await fetch(new URL('/api/projects/demo/reproduction-plans', server.url), {
    body: JSON.stringify({
      baseline: {
        accuracy: '0.90',
      },
      id: 'plan-exec',
      metrics: ['accuracy'],
      title: 'Execute route plan',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  assert.equal(planResponse.status, 201);

  const runResponse = await fetch(new URL('/api/projects/demo/experiment-runs', server.url), {
    body: JSON.stringify({
      id: 'run-exec',
      reproductionPlanId: 'plan-exec',
      title: 'Execute route run',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  assert.equal(runResponse.status, 201);

  const executeResponse = await fetch(new URL('/api/projects/demo/experiment-runs/run-exec/execute', server.url), {
    body: JSON.stringify({
      command: {
        args: ['-e', 'console.log("accuracy: 0.94")'],
        command: 'node',
        cwd: '.',
        expectedMetrics: ['accuracy'],
        timeoutMs: 5000,
      },
      reason: 'route contract test',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const executed = await executeResponse.json();

  assert.equal(executeResponse.status, 200);
  assert.equal(executed.runnerResult.status, 'done');
  assert.equal(executed.experimentRun.status, 'done');
  assert.equal(executed.experimentRun.metrics.accuracy, '0.94');
  assert.equal(executed.resultDossier.status, 'done');
  assert.equal(executed.resultDossier.comparisons[0].delta, '+0.04');
  assert.equal(executed.audit.action, 'executeExperimentRun');

  const graph = await (await fetch(new URL('/api/projects/demo/graph', server.url))).json();
  assert.ok(graph.resultDossiers.some((dossier) => dossier.id === executed.resultDossier.id));
});

test('Lab execute route can run the first linked reproduction plan command string', async (t) => {
  const dataRootDir = await createDataRoot();
  const server = await startServer(dataRootDir);
  t.after(async () => {
    await server.close();
  });

  const planResponse = await fetch(new URL('/api/projects/demo/reproduction-plans', server.url), {
    body: JSON.stringify({
      baseline: {
        accuracy: '0.90',
      },
      commands: ['node -e "console.log(\\"accuracy: 0.95\\")"'],
      id: 'plan-string-command',
      metrics: ['accuracy'],
      title: 'String command plan',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  assert.equal(planResponse.status, 201);

  const runResponse = await fetch(new URL('/api/projects/demo/experiment-runs', server.url), {
    body: JSON.stringify({
      id: 'run-string-command',
      reproductionPlanId: 'plan-string-command',
      title: 'String command run',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  assert.equal(runResponse.status, 201);

  const executeResponse = await fetch(new URL('/api/projects/demo/experiment-runs/run-string-command/execute', server.url), {
    body: JSON.stringify({
      reason: 'route string command contract test',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const executed = await executeResponse.json();

  assert.equal(executeResponse.status, 200);
  assert.equal(executed.runnerResult.status, 'done');
  assert.equal(executed.runnerResult.command.command, 'node');
  assert.deepEqual(executed.runnerResult.command.args, ['-e', 'console.log("accuracy: 0.95")']);
  assert.equal(executed.experimentRun.metrics.accuracy, '0.95');
  assert.equal(executed.resultDossier.comparisons[0].delta, '+0.05');
});

test('Lab execute route preserves approval-required runner state without a fake dossier', async (t) => {
  const dataRootDir = await createDataRoot();
  const server = await startServer(dataRootDir);
  t.after(async () => {
    await server.close();
  });

  const runResponse = await fetch(new URL('/api/projects/demo/experiment-runs', server.url), {
    body: JSON.stringify({
      id: 'run-approval',
      title: 'Approval route run',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  assert.equal(runResponse.status, 201);

  const executeResponse = await fetch(new URL('/api/projects/demo/experiment-runs/run-approval/execute', server.url), {
    body: JSON.stringify({
      command: {
        args: ['-e', 'console.log("accuracy: 0.94")'],
        command: 'node',
        cwd: '.',
        network: 'enabled',
        timeoutMs: 5000,
      },
      reason: 'route approval contract test',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const executed = await executeResponse.json();

  assert.equal(executeResponse.status, 200);
  assert.equal(executed.runnerResult.status, 'blocked');
  assert.equal(executed.runnerResult.failure.type, 'approval_required');
  assert.equal(executed.experimentRun.status, 'draft');
  assert.equal(executed.resultDossier, null);
});
