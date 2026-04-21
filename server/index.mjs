import http from 'node:http';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { searchOpenAlex } from './lib/openalex.mjs';
import { searchSeedPapers } from './lib/seed-data.mjs';
import { createStore } from './lib/store.mjs';
import { normaliseVenueLabel } from './lib/search-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const WEB_DIR = path.join(ROOT_DIR, 'web');
const SEED_FILE = path.join(ROOT_DIR, 'data', 'store.seed.json');
const RUNTIME_FILE = path.join(ROOT_DIR, 'data', 'runtime', 'store.json');

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
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
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // Ignore missing .env files.
  }
}

await ensureEnvLoaded(path.join(ROOT_DIR, '.env'));

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const OPENALEX_API_KEY = process.env.OPENALEX_API_KEY || '';
const OPENALEX_MAILTO = process.env.OPENALEX_MAILTO || '';

const store = await createStore({
  seedFile: SEED_FILE,
  runtimeFile: RUNTIME_FILE,
});

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

async function resolveSearch(project, query, page) {
  try {
    if (!OPENALEX_API_KEY) {
      throw new Error(
        'OPENALEX_API_KEY is missing. OpenAlex requires an API key for real traffic as of February 13, 2026.',
      );
    }

    return await searchOpenAlex({
      project,
      query,
      page,
      perPage: 24,
      apiKey: OPENALEX_API_KEY,
      mailto: OPENALEX_MAILTO,
    });
  } catch (error) {
    const fallback = searchSeedPapers({
      project,
      query,
      page,
      perPage: 24,
    });

    return {
      ...fallback,
      warning: error instanceof Error ? error.message : String(error),
    };
  }
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
  if (!payload || typeof payload !== 'object') {
    throw new Error('Paper payload is required.');
  }

  if (!payload.paperId || !payload.title) {
    throw new Error('Paper payload must include paperId and title.');
  }

  return {
    paperId: String(payload.paperId),
    title: String(payload.title),
    authors: Array.isArray(payload.authors) ? payload.authors.slice(0, 8).map(String) : [],
    venue: String(payload.venue || 'Unknown'),
    year: payload.year ? Number(payload.year) : null,
    abstract: String(payload.abstract || ''),
    summary: String(payload.summary || ''),
    keyPoints: Array.isArray(payload.keyPoints) ? payload.keyPoints.slice(0, 6).map(String) : [],
    keywords: Array.isArray(payload.keywords) ? payload.keywords.slice(0, 8).map(String) : [],
    matchedKeywords: Array.isArray(payload.matchedKeywords) ? payload.matchedKeywords.slice(0, 8).map(String) : [],
    citedByCount: Number(payload.citedByCount) || 0,
    openAccess: Boolean(payload.openAccess),
    paperUrl: payload.paperUrl ? String(payload.paperUrl) : null,
    pdfUrl: payload.pdfUrl ? String(payload.pdfUrl) : null,
    sourceName: String(payload.sourceName || 'Unknown provider'),
    sourceProvider: String(payload.sourceProvider || 'manual'),
    relevance: Number(payload.relevance) || 0,
  };
}

async function serveStatic(requestPath, response) {
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
    const content = await fs.readFile(resolved);
    response.writeHead(200, {
      'content-type': CONTENT_TYPES[extension] || 'application/octet-stream',
      'cache-control': extension === '.html' ? 'no-store' : 'public, max-age=300',
    });
    response.end(content);
  } catch {
    notFound(response);
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host}`);

  try {
    if (request.method === 'GET' && url.pathname === '/api/health') {
      json(response, 200, {
        ok: true,
        providerConfigured: Boolean(OPENALEX_API_KEY),
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/projects') {
      json(response, 200, {
        projects: store.getProjects(),
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/search') {
      const projectId = url.searchParams.get('projectId');
      const page = Math.max(1, Number(url.searchParams.get('page') || 1));

      if (!projectId) {
        sendError(response, new Error('projectId is required.'), 400);
        return;
      }

      const project = store.getProject(projectId);
      const query = (url.searchParams.get('q') || '').trim() || project.defaultQuery;
      const providerPayload = await resolveSearch(project, query, page);

      json(response, 200, {
        project,
        query,
        ...enrichSearchResponse(projectId, providerPayload),
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/library') {
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

    if (request.method === 'POST' && /^\/api\/projects\/[^/]+\/library$/.test(url.pathname)) {
      const [, , , projectId] = url.pathname.split('/');
      const body = await readJsonBody(request);
      const paper = sanitisePaperPayload(body.paper);
      const saved = await store.savePaper(projectId, paper);

      json(response, 200, {
        paper: saved,
        project: store.getProject(projectId),
      });
      return;
    }

    if (request.method === 'DELETE' && /^\/api\/projects\/[^/]+\/library\/.+/.test(url.pathname)) {
      const parts = url.pathname.split('/');
      const projectId = parts[3];
      const paperId = decodeURIComponent(parts.slice(5).join('/'));
      await store.removePaper(projectId, paperId);

      json(response, 200, {
        ok: true,
        project: store.getProject(projectId),
      });
      return;
    }

    if (request.method === 'POST' && /^\/api\/projects\/[^/]+\/queue$/.test(url.pathname)) {
      const [, , , projectId] = url.pathname.split('/');
      const body = await readJsonBody(request);
      const paper = sanitisePaperPayload(body.paper);
      const queued = await store.queuePaper(projectId, paper);

      json(response, 200, {
        queued,
        project: store.getProject(projectId),
      });
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      notFound(response);
      return;
    }

    await serveStatic(url.pathname, response);
  } catch (error) {
    sendError(response, error, 500);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`ARES service listening on http://${HOST}:${PORT}`);
});
