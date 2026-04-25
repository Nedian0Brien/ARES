import http from 'node:http';
import path from 'node:path';
import { promises as fs, watch as watchDirectory } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createAgentRunService } from './lib/agent-runs.mjs';
import { normalizeRequestPath } from './lib/path-utils.mjs';
import { createReadingService } from './lib/reading-service.mjs';
import { createScoutSearchService } from './lib/scout-search.mjs';
import { parseSearchPayload, parseSearchQuery, sanitisePaperRecord } from './lib/search-contract.mjs';
import { createStore } from './lib/store.mjs';
import { normaliseVenueLabel } from './lib/search-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DATA_ROOT_DIR = path.resolve(process.env.ARES_DATA_ROOT_DIR || ROOT_DIR);
const WEB_DIR = path.join(ROOT_DIR, 'web');
const SEED_FILE = path.join(DATA_ROOT_DIR, 'data', 'store.seed.json');
const RUNTIME_FILE = path.join(DATA_ROOT_DIR, 'data', 'runtime', 'store.json');

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function parseEnv(content) {
  return String(content || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .reduce((accumulator, line) => {
      const equalsIndex = line.indexOf('=');
      if (equalsIndex < 0) {
        return accumulator;
      }

      const key = line.slice(0, equalsIndex).trim();
      const value = line.slice(equalsIndex + 1).trim();
      accumulator[key] = value;
      return accumulator;
    }, {});
}

async function ensureEnvLoaded(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const parsed = parseEnv(content);
    for (const [key, value] of Object.entries(parsed)) {
      if (!(key in process.env) || process.env[key] === '') {
        process.env[key] = value;
      }
    }
  } catch {
    // Ignore missing .env files.
  }
}

await ensureEnvLoaded(path.join(ROOT_DIR, '.env'));

const PORT = Number(process.env.PORT || 3100);
const HOST = process.env.HOST || '0.0.0.0';
const OPENALEX_API_KEY = process.env.OPENALEX_API_KEY || '';
const OPENALEX_MAILTO = process.env.OPENALEX_MAILTO || '';
const ARES_DEPLOY_REF = process.env.ARES_DEPLOY_REF || '';
const ARES_DEPLOY_COMMIT = process.env.ARES_DEPLOY_COMMIT || '';
const STORE_BACKEND = process.env.ARES_STORE_BACKEND || '';
const DATABASE_URL = process.env.ARES_DATABASE_URL || process.env.DATABASE_URL || '';
const DATABASE_SSL = process.env.ARES_DATABASE_SSL || '';
const SCOUT_AGENT_RUNTIME = process.env.SCOUT_AGENT_RUNTIME || 'codex';
const ARES_AGENT_RUNTIME = process.env.ARES_AGENT_RUNTIME || SCOUT_AGENT_RUNTIME;
const SCOUT_AGENT_TIMEOUT_MS = Math.max(1000, Number(process.env.SCOUT_AGENT_TIMEOUT_MS) || 45000);
const LIVE_RELOAD_ENABLED = process.env.WATCH_REPORT_DEPENDENCIES === '1' || process.env.ARES_LIVE_RELOAD === '1';

const liveReloadClients = new Set();
let liveReloadTimer = null;
let lastLiveReloadAt = 0;

const store = await createStore({
  backend: STORE_BACKEND,
  databaseSsl: DATABASE_SSL,
  databaseUrl: DATABASE_URL,
  seedFile: SEED_FILE,
  runtimeFile: RUNTIME_FILE,
});
const readingService = createReadingService({
  rootDir: DATA_ROOT_DIR,
  runtimeName: ARES_AGENT_RUNTIME,
  store,
});
const agenticSearchService = createScoutSearchService({
  agentRuntime: SCOUT_AGENT_RUNTIME,
  agentTimeoutMs: SCOUT_AGENT_TIMEOUT_MS,
  apiKey: OPENALEX_API_KEY,
  mailto: OPENALEX_MAILTO,
  rootDir: ROOT_DIR,
});
const agentRunService = createAgentRunService({
  rootDir: ROOT_DIR,
  runtimeName: ARES_AGENT_RUNTIME,
  searchService: agenticSearchService,
  store,
});
const searchService = createScoutSearchService({
  agentRuntime: SCOUT_AGENT_RUNTIME,
  agentTimeoutMs: SCOUT_AGENT_TIMEOUT_MS,
  apiKey: OPENALEX_API_KEY,
  mailto: OPENALEX_MAILTO,
  rootDir: ROOT_DIR,
  runStore: store,
});

const PROJECT_ASSET_PATHS = {
  'experiment-runs': 'experimentRuns',
  'insight-notes': 'insightNotes',
  'reading-sessions': 'readingSessions',
  'repro-checklist': 'reproChecklistItems',
  'result-comparisons': 'resultComparisons',
  'writing-drafts': 'writingDrafts',
};

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

function notFound(response) {
  json(response, 404, { error: 'Not found' });
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendError(response, error, statusCode = 500) {
  json(response, statusCode, {
    error: error instanceof Error ? error.message : String(error),
  });
}

function sendSseEvent(response, event, payload) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcastLiveReload(filePath) {
  if (!LIVE_RELOAD_ENABLED) {
    return;
  }

  const now = Date.now();
  if (now - lastLiveReloadAt < 300) {
    return;
  }

  lastLiveReloadAt = now;

  const payload = {
    path: filePath ? path.relative(ROOT_DIR, filePath) : 'unknown',
    changedAt: now,
  };

  for (const client of liveReloadClients) {
    sendSseEvent(client.response, 'reload', payload);
  }
}

function scheduleLiveReload(filePath) {
  if (!LIVE_RELOAD_ENABLED) {
    return;
  }

  if (liveReloadTimer) {
    clearTimeout(liveReloadTimer);
  }

  liveReloadTimer = setTimeout(() => {
    broadcastLiveReload(filePath);
    liveReloadTimer = null;
  }, 80);
}

function createLiveReloadClientScript() {
  return `
const endpoint = new URL('./__dev/reload', window.location.href);
const source = new EventSource(endpoint);

source.addEventListener('reload', () => {
  window.location.reload();
});

source.onerror = () => {
  console.debug('[ARES] Live reload disconnected. Waiting to reconnect...');
};
`.trimStart();
}

function injectLiveReloadScript(html) {
  if (!LIVE_RELOAD_ENABLED || html.includes('__dev/reload-client.js')) {
    return html;
  }

  return html.replace(
    '</body>',
    '    <script type="module" src="./__dev/reload-client.js"></script>\n  </body>',
  );
}

function registerLiveReloadClient(request, response) {
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  response.write('retry: 1000\n');
  response.write(': connected\n\n');

  const heartbeat = setInterval(() => {
    response.write(': keep-alive\n\n');
  }, 15000);
  heartbeat.unref?.();

  const client = {
    heartbeat,
    response,
  };
  liveReloadClients.add(client);

  request.on('close', () => {
    clearInterval(heartbeat);
    liveReloadClients.delete(client);
  });
}

async function collectDirectories(rootDir) {
  const directories = [rootDir];
  const entries = await fs.readdir(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    directories.push(...(await collectDirectories(path.join(rootDir, entry.name))));
  }

  return directories;
}

async function startLiveReloadWatcher() {
  if (!LIVE_RELOAD_ENABLED) {
    return () => {};
  }

  const directories = await collectDirectories(WEB_DIR);
  const watchers = directories.map((directory) =>
    watchDirectory(directory, (eventType, filename) => {
      if (eventType !== 'change' && eventType !== 'rename') {
        return;
      }

      const changedPath =
        filename && String(filename).length
          ? path.join(directory, String(filename))
          : directory;

      scheduleLiveReload(changedPath);
    }),
  );

  return () => {
    for (const watcher of watchers) {
      watcher.close();
    }
  };
}

function decoratePapers(projectId, papers) {
  const saved = store.getSavedPaperIds(projectId);
  const queued = store.getQueuedPaperIds(projectId);

  return papers.map((paper) => ({
    ...paper,
    venue: normaliseVenueLabel(paper.venue),
    saved: saved.has(paper.paperId),
    queued: queued.has(paper.paperId),
  }));
}

function enrichSearchResponse(projectId, payload) {
  const results = decoratePapers(projectId, payload.results);
  const availableVenues = Array.from(new Set(results.map((paper) => paper.venue))).slice(0, 8);

  return {
    ...payload,
    results,
    availableVenues,
    totalSaved: store.getLibrary(projectId).length,
    totalQueued: store.getQueuedPaperIds(projectId).size,
  };
}

function parseProjectRoute(requestPath, tail) {
  const parts = requestPath.split('/').filter(Boolean);
  if (parts.length < 4) {
    return null;
  }

  if (parts[0] !== 'api' || parts[1] !== 'projects') {
    return null;
  }

  if (parts.slice(3).join('/') !== tail) {
    return null;
  }

  return decodeURIComponent(parts[2]);
}

function parseProjectAssetRoute(requestPath) {
  const parts = requestPath.split('/').filter(Boolean);
  if (parts.length !== 4 || parts[0] !== 'api' || parts[1] !== 'projects') {
    return null;
  }

  const assetPath = parts[3];
  const collection = PROJECT_ASSET_PATHS[assetPath];
  if (!collection) {
    return null;
  }

  return {
    collection,
    projectId: decodeURIComponent(parts[2]),
  };
}

function parseAgentRunId(requestPath) {
  const match = requestPath.match(/^\/api\/agent-runs\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : '';
}

function parseAgentRunActionId(requestPath) {
  const match = requestPath.match(/^\/api\/agent-runs\/([^/]+)\/actions$/);
  return match ? decodeURIComponent(match[1]) : '';
}

function parseReadingSessionId(requestPath) {
  const match = requestPath.match(/^\/api\/reading-sessions\/([^/]+)(?:\/|$)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function parseReadingSessionNoteRoute(requestPath) {
  const match = requestPath.match(/^\/api\/reading-sessions\/([^/]+)\/notes(?:\/([^/]+))?$/);
  if (!match) {
    return null;
  }

  return {
    noteId: match[2] ? decodeURIComponent(match[2]) : '',
    sessionId: decodeURIComponent(match[1]),
  };
}

function parseReadingSessionAssetFileRoute(requestPath) {
  const match = requestPath.match(/^\/api\/reading-sessions\/([^/]+)\/assets\/([^/]+)\/file$/);
  if (!match) {
    return null;
  }

  return {
    assetId: decodeURIComponent(match[2]),
    sessionId: decodeURIComponent(match[1]),
  };
}

function resolveVendorAsset(requestPath) {
  if (requestPath === '/__vendor/pdfjs/pdf.mjs') {
    return path.join(ROOT_DIR, 'node_modules', 'pdfjs-dist', 'build', 'pdf.mjs');
  }

  if (requestPath === '/__vendor/pdfjs/pdf.worker.mjs') {
    return path.join(ROOT_DIR, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.mjs');
  }

  return '';
}

function filterSavedLibrary(projectId, query) {
  const library = store.getLibrary(projectId);
  if (!query) {
    return library;
  }

  const lowered = query.toLowerCase();
  return library.filter((paper) =>
    `${paper.title} ${paper.abstract} ${(paper.keywords || []).join(' ')}`.toLowerCase().includes(lowered),
  );
}

function sanitisePaperPayload(payload) {
  return sanitisePaperRecord(payload);
}

async function serveStatic(requestPath, response) {
  const vendorPath = resolveVendorAsset(requestPath);
  if (vendorPath) {
    try {
      const content = await fs.readFile(vendorPath);
      response.writeHead(200, {
        'cache-control': 'public, max-age=300',
        'content-type': CONTENT_TYPES[path.extname(vendorPath)] || 'application/octet-stream',
      });
      response.end(content);
      return;
    } catch {
      notFound(response);
      return;
    }
  }

  const cleanPath = requestPath === '/' ? '/index.html' : requestPath;
  const filePath = path.join(WEB_DIR, cleanPath);
  const resolved = path.resolve(filePath);

  if (!resolved.startsWith(WEB_DIR)) {
    notFound(response);
    return;
  }

  try {
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) {
      notFound(response);
      return;
    }

    const extension = path.extname(resolved);
    const content =
      extension === '.html'
        ? injectLiveReloadScript(await fs.readFile(resolved, 'utf8'))
        : await fs.readFile(resolved);
    response.writeHead(200, {
      'content-type': CONTENT_TYPES[extension] || 'application/octet-stream',
      'cache-control':
        extension === '.html' || extension === '.css' || extension === '.js'
          ? 'no-store'
          : 'public, max-age=300',
    });
    response.end(content);
  } catch {
    notFound(response);
  }
}

const stopLiveReloadWatcher = await startLiveReloadWatcher();

async function handleSearchRequest(response, searchInput) {
  if (!searchInput.projectId) {
    sendError(response, new Error('projectId is required.'), 400);
    return;
  }

  const project = store.getProject(searchInput.projectId);
  const query = searchInput.q || project.defaultQuery;
  const providerPayload = await searchService.search({
    project,
    query,
    mode: searchInput.mode,
    scopes: searchInput.scopes,
    page: searchInput.page,
  });

  json(response, 200, {
    project,
    query,
    ...enrichSearchResponse(searchInput.projectId, providerPayload),
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host}`);
  const requestPath = normalizeRequestPath(url.pathname);

  try {
    if ((request.method === 'GET' || request.method === 'HEAD') && resolveVendorAsset(requestPath)) {
      const vendorPath = resolveVendorAsset(requestPath);
      try {
        const content = request.method === 'HEAD' ? null : await fs.readFile(vendorPath);
        response.writeHead(200, {
          'cache-control': 'public, max-age=300',
          'content-type': CONTENT_TYPES[path.extname(vendorPath)] || 'application/octet-stream',
        });
        response.end(content);
      } catch {
        notFound(response);
      }
      return;
    }

    if (request.method === 'GET' && LIVE_RELOAD_ENABLED && requestPath === '/__dev/reload') {
      registerLiveReloadClient(request, response);
      return;
    }

    if (request.method === 'GET' && LIVE_RELOAD_ENABLED && requestPath === '/__dev/reload-client.js') {
      response.writeHead(200, {
        'content-type': 'application/javascript; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end(createLiveReloadClientScript());
      return;
    }

    if (request.method === 'GET' && requestPath === '/api/health') {
      const codexAvailable = await agentRunService.checkAvailability();
      const profiles = agentRunService.getProfiles();
      const storage = typeof store.getBackendInfo === 'function' ? store.getBackendInfo() : { backend: store.backend || 'unknown' };
      json(response, 200, {
        codexAvailable,
        deploy: {
          commit: ARES_DEPLOY_COMMIT,
          ref: ARES_DEPLOY_REF,
        },
        ok: true,
        profileDetails: profiles,
        profiles: profiles.map((profile) => profile.id),
        providerConfigured: Boolean(OPENALEX_API_KEY),
        storage,
      });
      return;
    }

    if (request.method === 'GET' && requestPath === '/api/projects') {
      json(response, 200, {
        projects: store.getProjects(),
      });
      return;
    }

    if (request.method === 'GET' && requestPath === '/api/search') {
      await handleSearchRequest(response, parseSearchQuery(url.searchParams));
      return;
    }

    if (request.method === 'POST' && requestPath === '/api/search') {
      const body = await readJsonBody(request);
      await handleSearchRequest(response, parseSearchPayload(body));
      return;
    }

    if (request.method === 'POST' && requestPath === '/api/agent-runs') {
      const body = await readJsonBody(request);
      const projectId = String(body.projectId || '').trim();
      const stage = String(body.stage || '').trim();
      if (!projectId || !stage) {
        sendError(response, new Error('projectId and stage are required.'), 400);
        return;
      }

      const run = await agentRunService.createRun({
        assetRefs: Array.isArray(body.assetRefs) ? body.assetRefs : [],
        input: body.input && typeof body.input === 'object' ? body.input : {},
        projectId,
        stage,
        taskKind: String(body.taskKind || '').trim() || undefined,
      });

      json(response, 202, {
        run,
      });
      return;
    }

    if (request.method === 'GET' && /^\/api\/agent-runs\/[^/]+$/.test(requestPath)) {
      const runId = parseAgentRunId(requestPath);
      const payload = agentRunService.getRun(runId);
      if (!payload) {
        notFound(response);
        return;
      }

      json(response, 200, payload);
      return;
    }

    if (request.method === 'POST' && /^\/api\/agent-runs\/[^/]+\/actions$/.test(requestPath)) {
      const runId = parseAgentRunActionId(requestPath);
      const body = await readJsonBody(request);
      const action = String(body.action || '').trim().toLowerCase();

      if (action !== 'abort' && action !== 'retry') {
        sendError(response, new Error('Unsupported action. Use abort or retry.'), 400);
        return;
      }

      const payload =
        action === 'abort' ? await agentRunService.abortRun(runId) : await agentRunService.retryRun(runId);
      json(response, 200, payload);
      return;
    }

    if (request.method === 'GET' && requestPath === '/api/library') {
      const projectId = url.searchParams.get('projectId');
      const query = (url.searchParams.get('q') || '').trim();
      if (!projectId) {
        sendError(response, new Error('projectId is required.'), 400);
        return;
      }

      json(response, 200, {
        results: filterSavedLibrary(projectId, query),
      });
      return;
    }

    if (request.method === 'GET' && /^\/api\/projects\/[^/]+\/library$/.test(requestPath)) {
      const projectId = parseProjectRoute(requestPath, 'library');
      json(response, 200, {
        results: store.getLibrary(projectId),
      });
      return;
    }

    if (request.method === 'GET' && requestPath === '/api/agent-runs') {
      const projectId = String(url.searchParams.get('projectId') || '').trim();
      const stage = String(url.searchParams.get('stage') || '').trim();
      json(response, 200, {
        runs: store.listAgentRuns({
          projectId: projectId || undefined,
          stage: stage || undefined,
        }),
      });
      return;
    }

    if (request.method === 'GET' && /^\/api\/reading-sessions\/[^/]+\/pdf$/.test(requestPath)) {
      const sessionId = parseReadingSessionId(requestPath);
      try {
        const { buffer } = await readingService.getSessionPdf(sessionId);
        response.writeHead(200, {
          'cache-control': 'no-store',
          'content-type': 'application/pdf',
        });
        response.end(buffer);
      } catch (error) {
        sendError(response, error, 409);
      }
      return;
    }

    if (request.method === 'GET' && /^\/api\/reading-sessions\/[^/]+\/assets\/[^/]+\/file$/.test(requestPath)) {
      const route = parseReadingSessionAssetFileRoute(requestPath);
      if (!route) {
        notFound(response);
        return;
      }

      try {
        const payload = await readingService.getSessionAssetFile(route.sessionId, {
          assetId: route.assetId,
          kind: String(url.searchParams.get('kind') || 'thumb').trim(),
        });
        response.writeHead(200, {
          'cache-control': 'no-store',
          'content-type': payload.contentType,
        });
        response.end(payload.buffer);
      } catch (error) {
        sendError(response, error, 404);
      }
      return;
    }

    if (request.method === 'POST' && /^\/api\/reading-sessions\/[^/]+\/parse$/.test(requestPath)) {
      const sessionId = parseReadingSessionId(requestPath);
      json(response, 200, await readingService.parseSession(sessionId));
      return;
    }

    if (request.method === 'POST' && /^\/api\/reading-sessions\/[^/]+\/summarize$/.test(requestPath)) {
      const sessionId = parseReadingSessionId(requestPath);
      try {
        json(response, 200, await readingService.summarizeSession(sessionId));
      } catch (error) {
        sendError(response, error, 409);
      }
      return;
    }

    if (request.method === 'POST' && /^\/api\/reading-sessions\/[^/]+\/extract-assets$/.test(requestPath)) {
      const sessionId = parseReadingSessionId(requestPath);
      try {
        json(response, 200, await readingService.extractAssets(sessionId));
      } catch (error) {
        sendError(response, error, 409);
      }
      return;
    }

    if (request.method === 'POST' && /^\/api\/reading-sessions\/[^/]+\/chat$/.test(requestPath)) {
      const sessionId = parseReadingSessionId(requestPath);
      const body = await readJsonBody(request);
      try {
        json(response, 200, await readingService.chat(sessionId, body));
      } catch (error) {
        sendError(response, error, 409);
      }
      return;
    }

    if (
      (request.method === 'POST' || request.method === 'PATCH' || request.method === 'DELETE') &&
      /^\/api\/reading-sessions\/[^/]+\/notes(?:\/[^/]+)?$/.test(requestPath)
    ) {
      const route = parseReadingSessionNoteRoute(requestPath);
      if (!route) {
        notFound(response);
        return;
      }

      if (request.method === 'POST') {
        const body = await readJsonBody(request);
        json(response, 200, await readingService.createNote(route.sessionId, body));
        return;
      }

      if (!route.noteId) {
        sendError(response, new Error('noteId is required.'), 400);
        return;
      }

      if (request.method === 'PATCH') {
        const body = await readJsonBody(request);
        json(response, 200, await readingService.updateNote(route.sessionId, route.noteId, body));
        return;
      }

      json(response, 200, await readingService.deleteNote(route.sessionId, route.noteId));
      return;
    }

    if (request.method === 'GET' && /^\/api\/projects\/[^/]+\/reading-sessions$/.test(requestPath)) {
      const projectId = parseProjectRoute(requestPath, 'reading-sessions');
      json(response, 200, {
        results: await readingService.listProjectSessions(projectId),
      });
      return;
    }

    if (request.method === 'GET' && /^\/api\/projects\/[^/]+\/[a-z-]+$/.test(requestPath)) {
      const assetRoute = parseProjectAssetRoute(requestPath);
      if (assetRoute) {
        json(response, 200, {
          results:
            assetRoute.collection === 'readingSessions'
              ? await readingService.listProjectSessions(assetRoute.projectId)
              : store.listProjectAssets(assetRoute.projectId, assetRoute.collection),
        });
        return;
      }
    }

    if (request.method === 'POST' && /^\/api\/projects\/[^/]+\/reading-sessions$/.test(requestPath)) {
      const projectId = parseProjectRoute(requestPath, 'reading-sessions');
      const body = await readJsonBody(request);
      const paper = body.paper
        ? sanitisePaperPayload(body.paper)
        : store.getPaper(projectId, String(body.paperId || '').trim());
      if (!paper) {
        sendError(response, new Error('paper or paperId is required.'), 400);
        return;
      }

      const session = await readingService.createSession({
        paper,
        projectId,
        runId: String(body.runId || '').trim(),
        status: String(body.status || 'todo'),
        summary: String(body.summary || paper.summary || ''),
      });
      const queued = await store.queuePaper(projectId, paper, {
        runId: session.runId,
        sessionId: session.id,
        status: session.status,
      });

      json(response, 200, {
        project: store.getProject(projectId),
        queued,
        readingSession: session,
      });
      return;
    }

    if (request.method === 'POST' && /^\/api\/projects\/[^/]+\/library$/.test(requestPath)) {
      const [, , , projectId] = requestPath.split('/');
      const body = await readJsonBody(request);
      const paper = sanitisePaperPayload(body.paper);
      const saved = await store.savePaper(projectId, paper);

      json(response, 200, {
        paper: saved,
        project: store.getProject(projectId),
      });
      return;
    }

    if (request.method === 'DELETE' && /^\/api\/projects\/[^/]+\/library\/.+/.test(requestPath)) {
      const parts = requestPath.split('/');
      const projectId = parts[3];
      const paperId = decodeURIComponent(parts.slice(5).join('/'));
      await store.removePaper(projectId, paperId);

      json(response, 200, {
        ok: true,
        project: store.getProject(projectId),
      });
      return;
    }

    if (request.method === 'POST' && /^\/api\/projects\/[^/]+\/queue$/.test(requestPath)) {
      const [, , , projectId] = requestPath.split('/');
      const body = await readJsonBody(request);
      const paper = sanitisePaperPayload(body.paper);
      const session =
        (await store.getReadingSessionByPaper(projectId, paper.paperId)) ||
        (await readingService.createSession({
          paper,
          projectId,
          runId: String(body.runId || '').trim(),
          status: String(body.status || 'todo'),
        }));
      const queued = await store.queuePaper(projectId, paper, {
        runId: String(body.runId || '').trim(),
        sessionId: session.id,
        status: body.status || session.status,
      });

      json(response, 200, {
        project: store.getProject(projectId),
        queued,
        readingSession: session,
      });
      return;
    }

    if (requestPath.startsWith('/api/')) {
      notFound(response);
      return;
    }

    await serveStatic(requestPath, response);
  } catch (error) {
    sendError(response, error, 500);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`ARES service listening on http://${HOST}:${PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopLiveReloadWatcher();
    server.close(() => {
      process.exit(0);
    });

    setTimeout(() => {
      process.exit(0);
    }, 250).unref?.();
  });
}
