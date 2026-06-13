import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { promises as fs } from 'node:fs';

async function createWorkerDataRoot() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ares-agent-worker-'));
  const seedFile = path.join(rootDir, 'data', 'store.seed.json');
  await fs.mkdir(path.dirname(seedFile), { recursive: true });
  await fs.writeFile(
    seedFile,
    JSON.stringify(
      {
        agentRuns: [],
        library: { demo: [] },
        projects: [
          {
            defaultQuery: 'worker smoke',
            id: 'demo',
            keywords: [],
            name: 'Demo',
          },
        ],
        readingQueue: { demo: [] },
      },
      null,
      2,
    ),
  );
  return rootDir;
}

test('agent worker entrypoint boots in dry-run mode', async () => {
  const dataRootDir = await createWorkerDataRoot();
  const child = spawn('node', ['services/backend/bin/agent-worker.mjs', '--dry-run'], {
    cwd: '/home/ubuntu/project/ARES',
    env: {
      ...process.env,
      ARES_DATA_ROOT_DIR: dataRootDir,
      ARES_STORE_BACKEND: 'file',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const [code] = await once(child, 'exit');
  assert.equal(code, 0, stderr);

  const report = JSON.parse(stdout);
  assert.equal(report.worker, 'agent-worker');
  assert.equal(report.dryRun, true);
  assert.equal(report.ok, true);
  assert.equal(report.recoveredRunCount, 0);
});
