import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { promises as fs } from 'node:fs';

import { ASSET_COLLECTIONS, normaliseAsset } from '../lib/asset-model.mjs';
import { createStore } from '../lib/store.mjs';
import { createAgentChatRoutes } from '../routes/agent-chat-routes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..');

async function readProjectFile(relativePath) {
  return readFile(path.join(rootDir, relativePath), 'utf8');
}

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function createDataRoot() {
  const dataRootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ares-agent-routes-'));
  const seedFile = path.join(dataRootDir, 'data', 'store.seed.json');
  await fs.mkdir(path.dirname(seedFile), { recursive: true });
  await fs.writeFile(
    seedFile,
    JSON.stringify(
      {
        library: { demo: [] },
        projects: [{ defaultQuery: 'agent route e2e', id: 'demo', keywords: ['agent'], name: 'Demo' }],
        readingQueue: { demo: [] },
      },
      null,
      2,
    ),
  );
  return dataRootDir;
}

async function createRouteStore(dataRootDir) {
  return createStore({
    runtimeFile: path.join(dataRootDir, 'data', 'store.runtime.json'),
    seedFile: path.join(dataRootDir, 'data', 'store.seed.json'),
  });
}

function createRouteResponse() {
  return {
    payload: null,
    statusCode: 0,
  };
}

async function waitForServer(baseUrl, attempts = 50) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(new URL('/api/health', baseUrl));
      if (response.ok) return;
    } catch {
      // Retry while the child process starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for Agent route test server to boot.');
}

async function startServer(dataRootDir) {
  const port = await getFreePort();
  const child = spawn('node', ['services/backend/index.mjs'], {
    cwd: rootDir,
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
  const url = `http://127.0.0.1:${port}`;
  await waitForServer(url);
  return {
    async close() {
      child.kill('SIGTERM');
      await once(child, 'exit');
    },
    getStderr() {
      return stderr;
    },
    url,
  };
}

test('agent thread and message assets are normalized without provider-specific SDK state', () => {
  assert.ok(ASSET_COLLECTIONS.includes('agentThreads'));
  assert.ok(ASSET_COLLECTIONS.includes('agentMessages'));

  const thread = normaliseAsset('agentThreads', {
    projectId: 'demo',
    title: 'Cross-paper question',
  });
  const message = normaliseAsset('agentMessages', {
    citations: [{ evidenceLinkId: 'e-1' }],
    projectId: 'demo',
    role: 'assistant',
    text: 'Grounded answer',
    threadId: thread.id,
  });

  assert.equal(thread.projectId, 'demo');
  assert.equal(thread.title, 'Cross-paper question');
  assert.equal(message.role, 'assistant');
  assert.equal(message.threadId, thread.id);
  assert.deepEqual(message.citations, [{ evidenceLinkId: 'e-1' }]);
});

test('agent chat routes persist user messages and only save assets through explicit export', async () => {
  const [index, routes, assets] = await Promise.all([
    readProjectFile('services/backend/index.mjs'),
    readProjectFile('services/backend/routes/agent-chat-routes.mjs'),
    readProjectFile('services/backend/routes/asset-routes.mjs'),
  ]);

  assert.match(index, /createAgentChatRoutes/);
  assert.match(routes, /store\.listProjectAssets\(route\.projectId, 'agentThreads'\)/);
  assert.match(routes, /store\.upsertProjectAsset\('agentMessages'/);
  assert.match(routes, /assistantGenerated:\s*false/);
  assert.match(routes, /saved:\s*true/);
  assert.match(routes, /savedAssetInput\(target/);
  assert.match(assets, /'agent-threads': 'agentThreads'/);
  assert.match(assets, /'agent-messages': 'agentMessages'/);
});

test('Agent chat route generates assistant messages through the chat stage without saving assets', async () => {
  const dataRootDir = await createDataRoot();
  const store = await createRouteStore(dataRootDir);
  const thread = await store.upsertProjectAsset('agentThreads', {
    id: 'thread-auto',
    projectId: 'demo',
    title: 'Cross-paper answer',
  });
  let capturedRunInput = null;
  const finalRun = {
    id: 'run-chat-auto',
    outputPayload: {
      answer: 'Use adaptive reranking only when the confidence gate is low.',
      citations: [{ evidenceLinkId: 'evidence-1', label: 'Reranking note', locator: { page: 4 } }],
    },
    outputSummary: 'Answered with one citation.',
    projectId: 'demo',
    stage: 'chat',
    status: 'done',
  };
  const agentRunService = {
    async createRun(input) {
      capturedRunInput = input;
      return { ...finalRun, status: 'queue' };
    },
    getRun(runId) {
      assert.equal(runId, finalRun.id);
      return { assets: [], run: finalRun };
    },
    subscribeRun() {
      return () => {};
    },
  };
  const handleRoute = createAgentChatRoutes({
    agentRunService,
    agentRunWaitMs: 25,
    json(response, statusCode, payload) {
      response.statusCode = statusCode;
      response.payload = payload;
    },
    readJsonBody: async () => ({
      id: 'message-user-auto',
      role: 'user',
      text: 'When should we rerank?',
    }),
    requireProjectAccess: () => true,
    sendError(response, error, statusCode = 500) {
      response.statusCode = statusCode;
      response.payload = { error: error.message };
    },
    store,
  });
  const response = createRouteResponse();

  const handled = await handleRoute(
    { method: 'POST' },
    response,
    { requestPath: '/api/projects/demo/agent/threads/thread-auto/messages' },
  );

  assert.equal(handled, true);
  assert.equal(response.statusCode, 202);
  assert.equal(response.payload.assistantGenerated, true);
  assert.equal(response.payload.status, 'assistant-generated');
  assert.equal(response.payload.message.id, 'message-user-auto');
  assert.equal(response.payload.assistantMessage.role, 'assistant');
  assert.equal(response.payload.assistantMessage.text, finalRun.outputPayload.answer);
  assert.deepEqual(response.payload.assistantMessage.citations, finalRun.outputPayload.citations);
  assert.equal(response.payload.agentRun.id, finalRun.id);
  assert.equal(capturedRunInput.stage, 'chat');
  assert.equal(capturedRunInput.projectId, 'demo');
  assert.equal(capturedRunInput.input.thread.id, thread.id);
  assert.deepEqual(capturedRunInput.input.thread.messageIds, ['message-user-auto']);
  assert.equal(capturedRunInput.input.messages.at(-1).text, 'When should we rerank?');

  const storedThread = store.getProjectAsset('agentThreads', 'thread-auto');
  const messages = storedThread.messageIds.map((messageId) => store.getProjectAsset('agentMessages', messageId));
  assert.equal(messages.length, 2);
  assert.deepEqual(messages.map((message) => message.role), ['user', 'assistant']);
  assert.deepEqual(storedThread.messageIds, [
    'message-user-auto',
    response.payload.assistantMessage.id,
  ]);
  assert.deepEqual(store.listProjectAssets('demo', 'insightNotes'), []);
  assert.deepEqual(store.listProjectAssets('demo', 'wikiPages'), []);
});

test('agent save route stores explicit message exports as graph assets', async (t) => {
  const dataRootDir = await createDataRoot();
  const server = await startServer(dataRootDir);
  t.after(async () => {
    await server.close();
  });
  const healthResponse = await fetch(new URL('/api/health', server.url));
  const health = await healthResponse.json();

  assert.equal(healthResponse.status, 200);
  assert.deepEqual(health.grounding, {
    mode: 'local',
    ok: true,
    scorer: 'local-lexical',
  });

  const threadResponse = await fetch(new URL('/api/projects/demo/agent/threads', server.url), {
    body: JSON.stringify({ id: 'thread-save', title: 'Save thread' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  assert.equal(threadResponse.status, 201);

  const messageResponse = await fetch(new URL('/api/projects/demo/agent/threads/thread-save/messages', server.url), {
    body: JSON.stringify({
      id: 'message-save',
      role: 'assistant',
      text: 'Use domain-specific tau calibration for weak retrieval domains.',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  assert.equal(messageResponse.status, 202);

  const saveResponse = await fetch(new URL('/api/projects/demo/agent/threads/thread-save/messages/message-save/save', server.url), {
    body: JSON.stringify({ target: 'idea', title: 'Domain tau calibration' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const saved = await saveResponse.json();

  assert.equal(saveResponse.status, 201);
  assert.equal(saved.saved, true);
  assert.equal(saved.target, 'idea');
  assert.equal(saved.asset.collection, 'insightCards');
  assert.equal(saved.asset.record.claim, 'Use domain-specific tau calibration for weak retrieval domains.');
  assert.deepEqual(saved.message.artifacts, [
    {
      collection: 'insightCards',
      dest: 'Idea',
      id: saved.asset.record.id,
      kind: 'bulb',
      target: 'idea',
      title: 'Domain tau calibration',
    },
  ]);
  assert.deepEqual(saved.thread.savedMessageIds, ['message-save']);

  const graph = await (await fetch(new URL('/api/projects/demo/graph', server.url))).json();
  assert.ok(graph.insightCards.some((card) => card.id === saved.asset.record.id));

  const noteMessageResponse = await fetch(new URL('/api/projects/demo/agent/threads/thread-save/messages', server.url), {
    body: JSON.stringify({
      id: 'message-note',
      role: 'assistant',
      text: 'Keep notes separate from wiki page promotion.',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  assert.equal(noteMessageResponse.status, 202);

  const noteSaveResponse = await fetch(new URL('/api/projects/demo/agent/threads/thread-save/messages/message-note/save', server.url), {
    body: JSON.stringify({ target: 'note', title: 'Agent saved note' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const noteSaved = await noteSaveResponse.json();

  assert.equal(noteSaveResponse.status, 201);
  assert.equal(noteSaved.saved, true);
  assert.equal(noteSaved.target, 'note');
  assert.equal(noteSaved.asset.collection, 'insightNotes');
  assert.equal(noteSaved.asset.record.title, 'Agent saved note');
  assert.equal(noteSaved.asset.record.summary, 'Keep notes separate from wiki page promotion.');

  const wikiMessageResponse = await fetch(new URL('/api/projects/demo/agent/threads/thread-save/messages', server.url), {
    body: JSON.stringify({
      id: 'message-wiki',
      role: 'assistant',
      text: 'Promote agent answers to explicit wiki pages only when the user asks.',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  assert.equal(wikiMessageResponse.status, 202);

  const wikiSaveResponse = await fetch(new URL('/api/projects/demo/agent/threads/thread-save/messages/message-wiki/save', server.url), {
    body: JSON.stringify({ target: 'wiki', title: 'Agent promoted wiki page' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const wikiSaved = await wikiSaveResponse.json();

  assert.equal(wikiSaveResponse.status, 201);
  assert.equal(wikiSaved.saved, true);
  assert.equal(wikiSaved.target, 'wiki');
  assert.equal(wikiSaved.asset.collection, 'wikiPages');
  assert.equal(wikiSaved.asset.record.title, 'Agent promoted wiki page');
  assert.deepEqual(wikiSaved.asset.record.body, [
    { type: 'paragraph', text: 'Promote agent answers to explicit wiki pages only when the user asks.' },
  ]);
  assert.deepEqual(wikiSaved.message.artifacts.at(-1), {
    collection: 'wikiPages',
    dest: 'Wiki',
    id: wikiSaved.asset.record.id,
    kind: 'wiki',
    target: 'wiki',
    title: 'Agent promoted wiki page',
  });
});
