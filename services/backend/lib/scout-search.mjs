import path from 'node:path';

import { buildCodexExecArgs, createAgentRuntime } from './agent-runtime.mjs';
import { searchOpenAlex } from './openalex.mjs';
import { sanitiseSearchResultsPayload } from './search-contract.mjs';
import { searchSeedPapers } from './seed-data.mjs';
const DEFAULT_RESULTS_PER_PAGE = 24;
const DEFAULT_SCOUT_TIMEOUT_MS = 45000;
const OPENALEX_API_KEY_REQUIRED_MESSAGE =
  'OPENALEX_API_KEY is missing. OpenAlex requires an API key for real traffic as of February 13, 2026.';

function uniqueStrings(values) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  );
}

function combineWarnings(...groups) {
  return uniqueStrings(groups.flat()).join(' / ');
}

function capitalise(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }

  return `${text.slice(0, 1).toUpperCase()}${text.slice(1)}`;
}

function buildPaperSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'paperId',
      'title',
      'authors',
      'venue',
      'year',
      'abstract',
      'summary',
      'keyPoints',
      'keywords',
      'matchedKeywords',
      'citedByCount',
      'openAccess',
      'paperUrl',
      'pdfUrl',
      'sourceName',
      'sourceProvider',
      'relevance',
    ],
    properties: {
      paperId: { type: 'string' },
      title: { type: 'string' },
      authors: { type: 'array', items: { type: 'string' } },
      venue: { type: 'string' },
      year: { type: ['integer', 'null'] },
      abstract: { type: 'string' },
      summary: { type: 'string' },
      keyPoints: { type: 'array', items: { type: 'string' } },
      keywords: { type: 'array', items: { type: 'string' } },
      matchedKeywords: { type: 'array', items: { type: 'string' } },
      citedByCount: { type: 'number' },
      openAccess: { type: 'boolean' },
      paperUrl: { type: ['string', 'null'] },
      pdfUrl: { type: ['string', 'null'] },
      sourceName: { type: 'string' },
      sourceProvider: { type: 'string' },
      relevance: { type: 'number' },
    },
  };
}

export function buildScoutOutputSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['results'],
    properties: {
      results: {
        type: 'array',
        items: buildPaperSchema(),
      },
      total: { type: 'number' },
      query: { type: 'string' },
      warning: { type: 'string' },
      live: { type: 'boolean' },
    },
  };
}

function buildScopeLines(scopes) {
  if (!scopes.length) {
    return ['- none'];
  }

  return scopes.map((scope) => `- ${scope.type}: ${scope.label}`);
}

function buildHelperCommandExample(helperPath, { project, query, scopes }) {
  const args = [
    'node',
    helperPath,
    '--query',
    JSON.stringify(query),
    '--project-id',
    JSON.stringify(project.id),
    '--project-focus',
    JSON.stringify(project.focus || ''),
  ];

  for (const keyword of project.keywords || []) {
    args.push('--project-keyword', JSON.stringify(keyword));
  }

  for (const scope of scopes) {
    args.push('--scope', JSON.stringify(`${scope.type}::${scope.label}`));
  }

  return args.join(' ');
}

function buildScoutPrompt({ helperPath, project, query, scopes, page, perPage }) {
  const scopeLines = buildScopeLines(scopes).join('\n');
  const keywords = (project.keywords || []).length ? project.keywords.map((keyword) => `- ${keyword}`).join('\n') : '- none';

  return `
You are the Scout search runtime for ARES.

Goal:
- Find up to ${perPage} papers that best match the user's research intent.
- Respect the active scopes as hard search guidance.
- Use the local OpenAlex helper command multiple times if needed, then deduplicate and rank the final list.

Rules:
- Only use this helper command for retrieval work: node ${helperPath}
- Do not edit files.
- Do not use web search.
- Return only JSON matching the schema.

Project:
- id: ${project.id}
- focus: ${project.focus || 'n/a'}

Project keywords:
${keywords}

User query:
- ${query}

Active scopes:
${scopeLines}

Execution hints:
- You may issue multiple helper calls with different query phrasings, but stay faithful to the user intent.
- Prefer recent, high-signal, scope-matching papers.
- Dedupe by paperId.
- Sort the final results by overall usefulness for the query.
- Keep the final result set at ${perPage} papers or fewer.

Helpful command template:
${buildHelperCommandExample(helperPath, { project, query, scopes })}

Page:
- ${page}
`.trim();
}

export function createScoutRuntimeAdapter({
  runtime = 'codex',
  rootDir,
  helperPath = path.join(rootDir, 'services', 'backend', 'bin', 'openalex-helper.mjs'),
  timeoutMs = DEFAULT_SCOUT_TIMEOUT_MS,
  spawnImpl,
} = {}) {
  const runtimeName = String(runtime || 'codex').trim().toLowerCase();

  if (!rootDir) {
    throw new Error('rootDir is required to build the Scout runtime adapter.');
  }

  if (runtimeName !== 'codex') {
    throw new Error(`Unsupported Scout runtime: ${runtimeName}`);
  }

  const runtimeAdapter = createAgentRuntime({
    cwd: rootDir,
    runtimeName,
    spawnImpl,
  });

  return {
    name: runtimeName,

    async search({ project, query, scopes = [], page = 1, perPage = DEFAULT_RESULTS_PER_PAGE }) {
      const prompt = buildScoutPrompt({
        helperPath,
        page,
        perPage,
        project,
        query,
        scopes,
      });

      const execution = await runtimeAdapter.runJsonTask({
        prompt,
        timeoutMs,
        sandbox: 'read-only',
      });

      let parsed;
      try {
        parsed = runtimeAdapter.parseJsonFromMessages(execution);
      } catch (error) {
        throw new Error(`Scout runtime returned invalid JSON: ${error.message}`);
      }

      const payload = sanitiseSearchResultsPayload(parsed);
      if (execution.rawStderr) {
        payload.warning = combineWarnings(payload.warning, execution.rawStderr);
      }

      return payload;
    },

    async checkAvailability() {
      return runtimeAdapter.checkAvailability();
    },
  };
}

function ensureOpenAlexConfigured(apiKey) {
  if (!apiKey) {
    throw new Error(OPENALEX_API_KEY_REQUIRED_MESSAGE);
  }
}

function withSearchMeta(payload, { agentRuntime = '', searchMode = 'keyword', warning = '', provider, query = '' } = {}) {
  const resultsPayload = sanitiseSearchResultsPayload({
    ...payload,
    provider: provider || payload.provider,
    query: query || payload.query,
    warning: combineWarnings(payload.warning, warning),
    searchMode,
    agentRuntime,
  });

  return {
    ...resultsPayload,
    provider: provider || resultsPayload.provider,
    searchMode,
    agentRuntime,
  };
}

export function createScoutSearchService({
  agentRuntime = 'codex',
  agentTimeoutMs = DEFAULT_SCOUT_TIMEOUT_MS,
  apiKey = '',
  mailto = '',
  rootDir,
  runStore,
  scoutRuntimeAdapter,
  searchOpenAlexImpl = searchOpenAlex,
  searchSeedPapersImpl = searchSeedPapers,
} = {}) {
  const runtimeAdapter =
    scoutRuntimeAdapter ||
    createScoutRuntimeAdapter({
      runtime: agentRuntime,
      rootDir,
      timeoutMs: agentTimeoutMs,
    });

  return {
    async search({ project, query, mode = 'keyword', scopes = [], page = 1 }) {
      const warnings = [];
      const runtimeLabel = runtimeAdapter?.name || String(agentRuntime || '').trim().toLowerCase();
      const perPage = DEFAULT_RESULTS_PER_PAGE;
      let searchRun = null;

      if (mode === 'scout') {
        if (runStore) {
          searchRun = await runStore.createAgentRun({
            agent: describeScoutRuntime(runtimeLabel),
            assetRefs: [],
            input: {
              page,
              query,
              scopes,
            },
            outputSummary: '',
            profileId: 'scout',
            projectId: project.id,
            stage: 'search',
            startedAt: new Date().toISOString(),
            status: 'running',
            taskKind: 'scout-search',
          });
        }

        try {
          const runtimePayload = await runtimeAdapter.search({
            project,
            query,
            scopes,
            page,
            perPage,
          });

          const payload = withSearchMeta(runtimePayload, {
            provider: 'scout-agent',
            query,
            searchMode: mode,
            agentRuntime: runtimeLabel,
          });

          if (searchRun) {
            await runStore.updateAgentRun(searchRun.id, {
              finishedAt: new Date().toISOString(),
              outputSummary: `Scout returned ${payload.results.length} result(s).`,
              status: 'done',
              warning: payload.warning || '',
            });
          }

          return payload;
        } catch (error) {
          warnings.push(`Scout agent fallback: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      try {
        ensureOpenAlexConfigured(apiKey);

        const directPayload = await searchOpenAlexImpl({
          apiKey,
          mailto,
          page,
          perPage,
          project,
          query,
          scopes,
        });

        const payload = withSearchMeta(directPayload, {
          query,
          searchMode: mode,
          agentRuntime: mode === 'scout' ? runtimeLabel : '',
          warning: warnings,
        });

        if (searchRun) {
          await runStore.updateAgentRun(searchRun.id, {
            finishedAt: new Date().toISOString(),
            outputSummary: `Scout fell back to OpenAlex with ${payload.results.length} result(s).`,
            status: 'done',
            warning: payload.warning || '',
          });
        }

        return payload;
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : String(error));
      }

      const seedPayload = searchSeedPapersImpl({
        page,
        perPage,
        project,
        query,
        scopes,
      });

      const payload = withSearchMeta(seedPayload, {
        query,
        searchMode: mode,
        agentRuntime: mode === 'scout' ? runtimeLabel : '',
        warning: warnings,
      });

      if (searchRun) {
        await runStore.updateAgentRun(searchRun.id, {
          finishedAt: new Date().toISOString(),
          outputSummary: `Scout fell back to ${payload.provider || 'seed'}.`,
          status: 'done',
          warning: payload.warning || '',
        });
      }

      return payload;
    },
  };
}

export function describeScoutRuntime(agentRuntime) {
  const runtime = String(agentRuntime || '').trim();
  return runtime ? `${capitalise(runtime)} Scout` : 'Scout agent';
}

export { buildCodexExecArgs, DEFAULT_RESULTS_PER_PAGE, DEFAULT_SCOUT_TIMEOUT_MS };
