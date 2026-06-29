import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..');

async function readProjectFile(relativePath) {
  return readFile(path.join(rootDir, relativePath), 'utf8');
}

test('React API client preserves legacy base URL handling and auth headers', async () => {
  const apiClient = await readProjectFile('web/src/lib/api.js');

  assert.match(apiClient, /PROXY_DEV_PATH_PATTERN/);
  assert.match(apiClient, /current\.pathname\.endsWith\('\/index\.html'\)/);
  assert.match(apiClient, /credentials:\s*'same-origin'/);
  assert.match(apiClient, /'x-csrf-token'/);
  assert.match(apiClient, /options\.body instanceof Blob/);
  assert.match(apiClient, /ArrayBuffer\.isView\(options\.body\)/);
  assert.match(apiClient, /Upload a PDF up to/);
});

test('React data layer exposes cache, SSE, and auth session hooks', async () => {
  const [serverState, sseHook, authHook, app] = await Promise.all([
    readProjectFile('web/src/lib/serverState.js'),
    readProjectFile('web/src/lib/sse.js'),
    readProjectFile('web/src/lib/auth.js'),
    readProjectFile('web/src/App.jsx'),
  ]);

  assert.match(serverState, /function useServerResource/);
  assert.match(serverState, /invalidateServerResource/);
  assert.match(sseHook, /new EventSource\(appUrl\(path\)\.href\)/);
  assert.match(sseHook, /source\.close\(\)/);
  assert.match(authHook, /api\('api\/auth\/me'\)/);
  assert.match(authHook, /setCsrfToken/);
  assert.match(app, /useAuthSession\(\)/);
});

test('React SSE layer exposes an agent-run event hook over the backend stream contract', async () => {
  const sseHook = await readProjectFile('web/src/lib/sse.js');

  assert.match(sseHook, /function useAgentRunEvents\(runId/);
  assert.match(sseHook, /api\/agent-runs\/\$\{encodeURIComponent\(runId\)\}\/events/);
  assert.match(sseHook, /progress\(payload/);
  assert.match(sseHook, /run\(payload/);
  assert.match(sseHook, /error\(payload/);
  assert.match(sseHook, /progressEvents/);
  assert.match(sseHook, /latestRun/);
  assert.match(sseHook, /lastError/);
  assert.match(sseHook, /export \{ useAgentRunEvents, useEventSource \}/);
});
