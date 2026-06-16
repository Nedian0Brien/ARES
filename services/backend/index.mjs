import http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { promises as fs, watch as watchDirectory } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createAgentRunService } from './lib/agent-runs.mjs';
import { createAuthService } from './lib/auth.mjs';
import { contentTypeForPath } from './lib/content-types.mjs';
import { createLogger } from './lib/logger.mjs';
import { normalizeRequestPath } from './lib/path-utils.mjs';
import { createReadingService } from './lib/reading-service.mjs';
import { createScoutSearchService } from './lib/scout-search.mjs';
import { parseSearchPayload, parseSearchQuery, sanitisePaperRecord } from './lib/search-contract.mjs';
import { createStore } from './lib/store.mjs';
import { normaliseVenueLabel } from './lib/search-utils.mjs';
import { createAssetRoutes } from './routes/asset-routes.mjs';
import { createReadingRoutes } from './routes/reading-routes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DATA_ROOT_DIR = path.resolve(process.env.ARES_DATA_ROOT_DIR || ROOT_DIR);
const WEB_DIR = path.join(ROOT_DIR, 'web');
const SEED_FILE = path.join(DATA_ROOT_DIR, 'data', 'store.seed.json');
const RUNTIME_FILE = path.join(DATA_ROOT_DIR, 'data', 'runtime', 'store.json');

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
const DEMO_PDF_ENABLED = process.env.ARES_ENABLE_DEMO_PDF === '1' || process.env.ARES_ENABLE_DEMO_PDF === 'true';
const OCR_MAX_PAGES = Math.max(1, Number(process.env.ARES_OCR_MAX_PAGES) || 12);
const AUTO_MIGRATE =
  process.env.ARES_AUTO_MIGRATE === undefined
    ? process.env.NODE_ENV !== 'production'
    : process.env.ARES_AUTO_MIGRATE === '1' || process.env.ARES_AUTO_MIGRATE === 'true';

const liveReloadClients = new Set();
let liveReloadTimer = null;
let lastLiveReloadAt = 0;

const logger = createLogger({
  bindings: {
    service: 'ares-backend',
  },
});
const requestContexts = new WeakMap();
const store = await createStore({
  backend: STORE_BACKEND,
  databaseSsl: DATABASE_SSL,
  databaseUrl: DATABASE_URL,
  migrate: AUTO_MIGRATE,
  seedFile: SEED_FILE,
  runtimeFile: RUNTIME_FILE,
});
const authService = createAuthService(process.env, { store });
const readingService = createReadingService({
  enableDemoPdf: DEMO_PDF_ENABLED,
  ocrMaxPages: OCR_MAX_PAGES,
  rootDir: DATA_ROOT_DIR,
  runtimeName: ARES_AGENT_RUNTIME,
  store,
});
const handleReadingRoute = createReadingRoutes({
  json,
  notFound,
  parseProjectRoute,
  requireProjectAccess,
  readJsonBody,
  readRequestBody,
  readingService,
  sanitisePaperPayload,
  sendError,
  store,
  uploadErrorStatus,
});
const handleAssetRoute = createAssetRoutes({
  json,
  parseProjectRoute,
  requireProjectAccess,
  readJsonBody,
  sendError,
  store,
});
const scoutSearchService = createScoutSearchService({
  agentRuntime: SCOUT_AGENT_RUNTIME,
  agentTimeoutMs: SCOUT_AGENT_TIMEOUT_MS,
  apiKey: OPENALEX_API_KEY,
  mailto: OPENALEX_MAILTO,
  rootDir: ROOT_DIR,
});
const agentRunService = createAgentRunService({
  rootDir: ROOT_DIR,
  runtimeName: ARES_AGENT_RUNTIME,
  searchService: scoutSearchService,
  store,
});
const recoveredAgentRuns = await agentRunService.recoverInterruptedRuns();
if (recoveredAgentRuns.length) {
  logger.warn('Recovered interrupted agent runs after startup.', {
    recoveredAgentRunCount: recoveredAgentRuns.length,
  });
}
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

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

async function readJsonBody(request) {
  const body = await readRequestBody(request);

  if (!body.length) {
    return {};
  }

  return JSON.parse(body.toString('utf8'));
}

function sendError(response, error, statusCode = 500) {
  json(response, statusCode, {
    error: error instanceof Error ? error.message : String(error),
    requestId: response.getHeader('x-request-id') || undefined,
  });
}

function normalizeRequestId(value) {
  const requestId = String(value || '').trim();
  return /^[A-Za-z0-9._:-]{8,128}$/.test(requestId) ? requestId : randomUUID();
}

function createRequestContext(request) {
  const requestId = normalizeRequestId(request.headers['x-request-id']);
  const bindings = {
    method: request.method || 'GET',
    requestId,
  };
  return {
    bind(nextBindings = {}) {
      for (const [key, value] of Object.entries(nextBindings)) {
        if (value !== undefined && value !== null && value !== '') {
          bindings[key] = value;
        }
      }
    },
    bindings,
    requestId,
  };
}

function bindRequestLogContext(request, bindings) {
  const requestContext = requestContexts.get(request);
  if (requestContext) {
    requestContext.bind(bindings);
  }
}

function uploadErrorStatus(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/100MB|between 1 byte/i.test(message)) {
    return 413;
  }
  if (/PDF upload content|must be a PDF|PDF 파일|업로드할 PDF/i.test(message)) {
    return 400;
  }
  return 500;
}

function projectErrorStatus(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/project name is required/i.test(message)) {
    return 400;
  }
  return 500;
}

function requireAuthenticatedUser(request, response) {
  const authContext = authService.resolveRequest(request);
  if (authContext.error) {
    sendError(response, new Error(authContext.error), authContext.statusCode);
    return null;
  }

  const csrfError = authService.csrfError(request, authContext);
  if (csrfError) {
    sendError(response, new Error(csrfError), 403);
    return null;
  }

  bindRequestLogContext(request, { userId: authContext.user.id });
  return authContext.user;
}

function requireProjectAccess(request, response, projectId, action = 'read') {
  const user = requireAuthenticatedUser(request, response);
  if (!user) {
    return null;
  }

  let project;
  try {
    project = store.getProject(projectId);
  } catch {
    notFound(response);
    return null;
  }

  const projectAccess =
    typeof store.listProjectAccess === 'function' ? store.listProjectAccess({ projectId }) : project.projectAccess || [];
  if (!authService.canAccessProject(user, { ...project, projectAccess }, action)) {
    bindRequestLogContext(request, { projectId });
    sendError(response, new Error('Project access is forbidden.'), 403);
    return null;
  }

  bindRequestLogContext(request, { projectId });
  return {
    project,
    user,
  };
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

function registerAgentRunEventClient(request, response, runId) {
  const initialPayload = agentRunService.getRun(runId);
  if (!initialPayload) {
    notFound(response);
    return;
  }

  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  response.write('retry: 2500\n');

  const sendRun = (payload) => {
    sendSseEvent(response, 'run', payload);
  };
  for (const event of Array.isArray(initialPayload.run?.progressEvents) ? initialPayload.run.progressEvents : []) {
    sendSseEvent(response, 'progress', {
      event,
      runId,
    });
  }
  sendRun(initialPayload);

  const heartbeat = setInterval(() => {
    response.write(': keep-alive\n\n');
  }, 15000);
  heartbeat.unref?.();

  const unsubscribe = agentRunService.subscribeRun(runId, sendRun);
  request.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
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

function parseAgentRunId(requestPath) {
  const match = requestPath.match(/^\/api\/agent-runs\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : '';
}

function parseAgentRunActionId(requestPath) {
  const match = requestPath.match(/^\/api\/agent-runs\/([^/]+)\/actions$/);
  return match ? decodeURIComponent(match[1]) : '';
}

function parseAgentRunEventsId(requestPath) {
  const match = requestPath.match(/^\/api\/agent-runs\/([^/]+)\/events$/);
  return match ? decodeURIComponent(match[1]) : '';
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
        'content-type': contentTypeForPath(vendorPath),
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
      'content-type': contentTypeForPath(filePath),
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

async function handleSearchRequest(request, response, searchInput) {
  if (!searchInput.projectId) {
    sendError(response, new Error('projectId is required.'), 400);
    return;
  }

  const access = requireProjectAccess(request, response, searchInput.projectId, 'read');
  if (!access) {
    return;
  }

  const project = access.project;
  const query = searchInput.q || project.defaultQuery;
  const providerPayload = await scoutSearchService.search({
    project,
    query,
    mode: searchInput.mode,
    scopes: searchInput.scopes,
    page: searchInput.page,
  });

  json(response, 200, {
    project,
    questionId: searchInput.questionId || '',
    query,
    ...enrichSearchResponse(searchInput.projectId, providerPayload),
  });
}

const server = http.createServer(async (request, response) => {
  const requestContext = createRequestContext(request);
  requestContexts.set(request, requestContext);
  response.setHeader('x-request-id', requestContext.requestId);
  const url = new URL(request.url || '/', `http://${request.headers.host}`);
  const requestPath = normalizeRequestPath(url.pathname);
  requestContext.bind({ path: requestPath });
  response.on('finish', () => {
    logger.child(requestContext.bindings).info('HTTP request completed.', {
      statusCode: response.statusCode,
    });
    requestContexts.delete(request);
  });

  try {
    if ((request.method === 'GET' || request.method === 'HEAD') && resolveVendorAsset(requestPath)) {
      const vendorPath = resolveVendorAsset(requestPath);
      try {
        const content = request.method === 'HEAD' ? null : await fs.readFile(vendorPath);
        response.writeHead(200, {
          'cache-control': 'public, max-age=300',
          'content-type': contentTypeForPath(vendorPath),
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
        auth: {
          mode: authService.mode,
        },
        profileDetails: profiles,
        profiles: profiles.map((profile) => profile.id),
        providerConfigured: Boolean(OPENALEX_API_KEY),
        storage,
      });
      return;
    }

    if (request.method === 'GET' && requestPath === '/api/auth/me') {
      const user = requireAuthenticatedUser(request, response);
      if (!user) {
        return;
      }

      json(response, 200, {
        auth: {
          mode: authService.mode,
        },
        csrfToken: authService.resolveRequest(request).csrfToken || '',
        user,
      });
      return;
    }

    if (request.method === 'POST' && requestPath === '/api/auth/login') {
      const body = await readJsonBody(request);
      const userId = String(body.userId || body.email || '').trim();
      const user = store.getUser ? store.getUser(userId) : null;
      if (!user || user.status !== 'active') {
        sendError(response, new Error('Invalid login user.'), 401);
        return;
      }

      const session = await authService.createSession(user.id);
      response.setHeader('set-cookie', session.cookie);
      json(response, 200, {
        csrfToken: session.csrfToken,
        expiresAt: session.expiresAt,
        user,
      });
      return;
    }

    if (request.method === 'POST' && requestPath === '/api/auth/logout') {
      const revoked = await authService.revokeRequestSession(request);
      response.setHeader('set-cookie', revoked.cookie);
      json(response, 200, {
        ok: true,
      });
      return;
    }

    if (request.method === 'GET' && requestPath === '/api/projects') {
      const user = requireAuthenticatedUser(request, response);
      if (!user) {
        return;
      }

      json(response, 200, {
        projects: store.getProjects().filter((project) =>
          authService.canAccessProject(
            user,
            {
              ...project,
              projectAccess:
                typeof store.listProjectAccess === 'function'
                  ? store.listProjectAccess({ projectId: project.id })
                  : project.projectAccess || [],
            },
            'read',
          ),
        ),
      });
      return;
    }

    if (request.method === 'POST' && requestPath === '/api/projects') {
      const user = requireAuthenticatedUser(request, response);
      if (!user) {
        return;
      }
      if (typeof store.createProject !== 'function') {
        sendError(response, new Error('Project creation is not supported by this store.'), 501);
        return;
      }

      try {
        const body = await readJsonBody(request);
        const project = await store.createProject(body);
        const projectAccess =
          typeof store.upsertProjectAccess === 'function'
            ? await store.upsertProjectAccess({
                projectId: project.id,
                role: 'owner',
                userId: user.id,
              })
            : null;
        bindRequestLogContext(request, { projectId: project.id });
        json(response, 201, {
          project,
          projectAccess,
        });
      } catch (error) {
        sendError(response, error, projectErrorStatus(error));
      }
      return;
    }

    if (request.method === 'GET' && requestPath === '/api/search') {
      await handleSearchRequest(request, response, parseSearchQuery(url.searchParams));
      return;
    }

    if (request.method === 'POST' && requestPath === '/api/search') {
      const body = await readJsonBody(request);
      await handleSearchRequest(request, response, parseSearchPayload(body));
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
      if (!requireProjectAccess(request, response, projectId, 'write')) {
        return;
      }

      const run = await agentRunService.createRun({
        assetRefs: Array.isArray(body.assetRefs) ? body.assetRefs : [],
        candidateAssetIds: Array.isArray(body.candidateAssetIds) ? body.candidateAssetIds : [],
        createdAssetIds: Array.isArray(body.createdAssetIds) ? body.createdAssetIds : [],
        input: body.input && typeof body.input === 'object' ? body.input : {},
        projectId,
        sourceAssetIds: Array.isArray(body.sourceAssetIds) ? body.sourceAssetIds : [],
        stage,
        taskKind: String(body.taskKind || '').trim() || undefined,
      });
      bindRequestLogContext(request, { runId: run.id });

      json(response, 202, {
        run,
      });
      return;
    }

    if (request.method === 'GET' && /^\/api\/agent-runs\/[^/]+$/.test(requestPath)) {
      const runId = parseAgentRunId(requestPath);
      bindRequestLogContext(request, { runId });
      const payload = agentRunService.getRun(runId);
      if (!payload) {
        notFound(response);
        return;
      }
      if (!requireProjectAccess(request, response, payload.run.projectId, 'read')) {
        return;
      }

      json(response, 200, payload);
      return;
    }

    if (request.method === 'GET' && /^\/api\/agent-runs\/[^/]+\/events$/.test(requestPath)) {
      const runId = parseAgentRunEventsId(requestPath);
      bindRequestLogContext(request, { runId });
      const payload = agentRunService.getRun(runId);
      if (!payload) {
        notFound(response);
        return;
      }
      if (!requireProjectAccess(request, response, payload.run.projectId, 'read')) {
        return;
      }

      registerAgentRunEventClient(request, response, runId);
      return;
    }

    if (request.method === 'POST' && /^\/api\/agent-runs\/[^/]+\/actions$/.test(requestPath)) {
      const runId = parseAgentRunActionId(requestPath);
      bindRequestLogContext(request, { runId });
      const body = await readJsonBody(request);
      const action = String(body.action || '').trim().toLowerCase();

      if (action !== 'abort' && action !== 'retry') {
        sendError(response, new Error('Unsupported action. Use abort or retry.'), 400);
        return;
      }
      const currentRun = agentRunService.getRun(runId);
      if (!currentRun) {
        notFound(response);
        return;
      }
      const access = requireProjectAccess(request, response, currentRun.run.projectId, action === 'abort' ? 'destructive' : 'write');
      if (!access) {
        return;
      }

      const payload =
        action === 'abort' ? await agentRunService.abortRun(runId) : await agentRunService.retryRun(runId);
      const audit =
        action === 'abort' && typeof store.recordAuditEvent === 'function'
          ? await store.recordAuditEvent({
              action: 'abortAgentRun',
              actorUserId: access.user.id,
              metadata: {
                stage: currentRun.run.stage,
                status: payload.run.status,
              },
              projectId: currentRun.run.projectId,
              reason: String(body.reason || 'User requested abort.'),
              targetId: runId,
              targetType: 'agentRun',
            })
          : null;
      json(response, 200, audit ? { ...payload, audit } : payload);
      return;
    }

    if (request.method === 'GET' && requestPath === '/api/library') {
      const projectId = url.searchParams.get('projectId');
      const query = (url.searchParams.get('q') || '').trim();
      if (!projectId) {
        sendError(response, new Error('projectId is required.'), 400);
        return;
      }
      if (!requireProjectAccess(request, response, projectId, 'read')) {
        return;
      }

      json(response, 200, {
        results: filterSavedLibrary(projectId, query),
      });
      return;
    }

    if (request.method === 'GET' && /^\/api\/projects\/[^/]+\/library$/.test(requestPath)) {
      const projectId = parseProjectRoute(requestPath, 'library');
      if (!requireProjectAccess(request, response, projectId, 'read')) {
        return;
      }
      json(response, 200, {
        results: store.getLibrary(projectId),
      });
      return;
    }

    if (request.method === 'GET' && requestPath === '/api/agent-runs') {
      const projectId = String(url.searchParams.get('projectId') || '').trim();
      const stage = String(url.searchParams.get('stage') || '').trim();
      if (projectId && !requireProjectAccess(request, response, projectId, 'read')) {
        return;
      }
      const user = projectId ? null : requireAuthenticatedUser(request, response);
      if (!projectId && !user) {
        return;
      }
      const accessibleProjectIds = projectId
        ? null
        : new Set(
            store
              .getProjects()
              .filter((project) =>
                authService.canAccessProject(
                  user,
                  {
                    ...project,
                    projectAccess:
                      typeof store.listProjectAccess === 'function'
                        ? store.listProjectAccess({ projectId: project.id })
                        : project.projectAccess || [],
                  },
                  'read',
                ),
              )
              .map((project) => project.id),
          );
      const runs = store.listAgentRuns({
        projectId: projectId || undefined,
        stage: stage || undefined,
      });
      json(response, 200, {
        runs: accessibleProjectIds ? runs.filter((run) => accessibleProjectIds.has(run.projectId)) : runs,
      });
      return;
    }

    if (request.method === 'GET' && /^\/api\/projects\/[^/]+\/project-access$/.test(requestPath)) {
      const projectId = parseProjectRoute(requestPath, 'project-access');
      if (!requireProjectAccess(request, response, projectId, 'read')) {
        return;
      }
      json(response, 200, {
        results: typeof store.listProjectAccess === 'function' ? store.listProjectAccess({ projectId }) : [],
      });
      return;
    }

    if (request.method === 'POST' && /^\/api\/projects\/[^/]+\/project-access$/.test(requestPath)) {
      const projectId = parseProjectRoute(requestPath, 'project-access');
      const access = requireProjectAccess(request, response, projectId, 'destructive');
      if (!access) {
        return;
      }
      if (typeof store.upsertProjectAccess !== 'function') {
        sendError(response, new Error('Project access updates are not supported by this store.'), 501);
        return;
      }
      const body = await readJsonBody(request);
      const userId = String(body.userId || '').trim();
      const reason = String(body.reason || '').trim();
      if (!userId || !reason) {
        sendError(response, new Error('userId and reason are required to update project access.'), 400);
        return;
      }
      const projectAccess = await store.upsertProjectAccess({
        projectId,
        role: body.role,
        status: body.status,
        userId,
      });
      const audit =
        typeof store.recordAuditEvent === 'function'
          ? await store.recordAuditEvent({
              action: 'updateProjectAccess',
              actorUserId: access.user.id,
              metadata: {
                role: projectAccess.role,
                status: projectAccess.status,
              },
              projectId,
              reason,
              targetId: projectAccess.id,
              targetType: 'projectAccess',
            })
          : null;
      json(response, 200, {
        audit,
        projectAccess,
      });
      return;
    }

    if (await handleReadingRoute(request, response, { requestPath, url })) {
      return;
    }

    if (await handleAssetRoute(request, response, { requestPath })) {
      return;
    }

    if (request.method === 'POST' && /^\/api\/projects\/[^/]+\/library$/.test(requestPath)) {
      const [, , , projectId] = requestPath.split('/');
      if (!requireProjectAccess(request, response, projectId, 'write')) {
        return;
      }
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
      if (!requireProjectAccess(request, response, projectId, 'destructive')) {
        return;
      }
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
      if (!requireProjectAccess(request, response, projectId, 'write')) {
        return;
      }
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
    logger.child(requestContext.bindings).error('Unhandled request error.', {
      error: error instanceof Error ? error.message : String(error),
    });
    sendError(response, error, 500);
  }
});

server.listen(PORT, HOST, () => {
  logger.info('ARES service listening.', {
    host: HOST,
    port: PORT,
  });
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
