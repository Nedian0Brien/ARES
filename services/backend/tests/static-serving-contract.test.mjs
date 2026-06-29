import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function createDataRoot() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'ares-static-serving-'));
  const seedFile = path.join(rootDir, 'data', 'store.seed.json');
  await mkdir(path.dirname(seedFile), { recursive: true });
  await writeFile(
    seedFile,
    JSON.stringify(
      {
        library: { demo: [] },
        projects: [{ id: 'demo', name: 'Demo', defaultQuery: 'retrieval' }],
        readingQueue: { demo: [] },
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
  throw new Error('Timed out waiting for static serving test server to boot.');
}

async function startServer(dataRootDir) {
  const port = await getFreePort();
  const child = spawn('node', ['services/backend/index.mjs'], {
    cwd: '/home/ubuntu/project/ARES',
    env: {
      ...process.env,
      ARES_AGENT_WORKER_DISABLED: '1',
      ARES_DATA_ROOT_DIR: dataRootDir,
      HOST: '127.0.0.1',
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

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

test('static serving keeps React as the default entry and exposes the legacy app separately', async (t) => {
  const dataRootDir = await createDataRoot();
  const server = await startServer(dataRootDir);
  t.after(async () => {
    await server.close();
  });

  const reactResponse = await fetch(new URL('/', server.url));
  const reactHtml = await reactResponse.text();
  assert.equal(reactResponse.status, 200);
  assert.match(reactHtml, /id="root"/);
  assert.doesNotMatch(reactHtml, /id="app"/);

  const legacyResponse = await fetch(new URL('/legacy', server.url));
  const legacyHtml = await legacyResponse.text();
  assert.equal(legacyResponse.status, 200);
  assert.match(legacyHtml, /id="app"/);
  assert.match(legacyHtml, /src="\/legacy\/app\.js(?:\?[^"]*)?"/);
  assert.match(legacyHtml, /href="\/legacy\/styles\.css(?:\?[^"]*)?"/);

  const legacyScriptResponse = await fetch(new URL('/legacy/app.js', server.url));
  const legacyScript = await legacyScriptResponse.text();
  assert.equal(legacyScriptResponse.status, 200);
  assert.match(legacyScript, /document\.querySelector\("#app"\)/);

  const legacyFeatureResponse = await fetch(new URL('/legacy/app/features/search.js', server.url));
  const legacyFeature = await legacyFeatureResponse.text();
  assert.equal(legacyFeatureResponse.status, 200);
  assert.match(legacyFeature, /createSearchFeature/);

  const legacyDeepResponse = await fetch(new URL('/legacy/projects/demo/search', server.url));
  const legacyDeepHtml = await legacyDeepResponse.text();
  assert.equal(legacyDeepResponse.status, 200);
  assert.match(legacyDeepHtml, /id="app"/);
});
