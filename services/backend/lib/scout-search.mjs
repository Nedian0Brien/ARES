import path from 'node:path';

import { buildCodexExecArgs, createAgentRuntime } from './agent-runtime.mjs';
import { searchOpenAlex } from './openalex.mjs';
import { sanitiseSearchResultsPayload } from './search-contract.mjs';
import { searchSeedPapers } from './seed-data.mjs';
const DEFAULT_RESULTS_PER_PAGE = 24;
const DEFAULT_SCOUT_TIMEOUT_MS = 45000;
const OPENALEX_API_KEY_REQUIRED_MESSAGE =
  'OPENALEX_API_KEY is missing. OpenAlex requires an API key for real traffic as of February 13, 2026.';
const SCOUT_ENV_STRIP_KEYS = [
  'ARES_DATABASE_URL',
  'DATABASE_URL',
  'OPENALEX_API_KEY',
  'OPENALEX_MAILTO',
  'PGPASSWORD',
];

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

async function emitProgress(onProgress, event) {
  if (typeof onProgress !== 'function') {
    return;
  }

  await onProgress(event);
}

function capitalise(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }

  return `${text.slice(0, 1).toUpperCase()}${text.slice(1)}`;
}

export function buildScoutRuntimeEnv(sourceEnv = process.env) {
  const env = { ...sourceEnv };
  for (const key of SCOUT_ENV_STRIP_KEYS) {
    delete env[key];
  }
  return env;
}

export function buildScoutOutputSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['rankedPaperIds', 'warning'],
    properties: {
      rankedPaperIds: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['paperId', 'rationale'],
          properties: {
            paperId: { type: 'string' },
            rationale: { type: 'string' },
          },
        },
      },
      warning: { type: 'string' },
    },
  };
}

function buildScopeLines(scopes) {
  if (!scopes.length) {
    return ['- none'];
  }

  return scopes.map((scope) => `- ${scope.type}: ${scope.label}`);
}

function truncateText(value, maxLength = 520) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3).trim()}...`;
}

function candidateForPrompt(paper, index) {
  return {
    index: index + 1,
    paperId: paper.paperId,
    title: paper.title,
    authors: paper.authors.slice(0, 4),
    venue: paper.venue,
    year: paper.year,
    summary: truncateText(paper.summary || paper.abstract),
    keyPoints: paper.keyPoints.slice(0, 3).map((point) => truncateText(point, 160)),
    keywords: paper.keywords.slice(0, 6),
    matchedKeywords: paper.matchedKeywords.slice(0, 6),
    citedByCount: paper.citedByCount,
    openAccess: paper.openAccess,
    sourceProvider: paper.sourceProvider,
    relevance: paper.relevance,
  };
}

function buildScoutRankPrompt({ candidates = [], project, query, scopes, page, perPage }) {
  const scopeLines = buildScopeLines(scopes).join('\n');
  const keywords = (project.keywords || []).length ? project.keywords.map((keyword) => `- ${keyword}`).join('\n') : '- none';
  const candidateJson = JSON.stringify(candidates.map((paper, index) => candidateForPrompt(paper, index)), null, 2);

  return `
You are the Scout search runtime for ARES.

Goal:
- Rank and select up to ${perPage} papers that best match the user's research intent.
- Respect the active scopes as hard search guidance.
- ARES already executed the backend OpenAlex tool call and supplied candidate papers below.

Rules:
- Do not run shell commands.
- Do not edit files.
- Do not use web search or any external network.
- Only choose paperId values that appear in the candidate list.
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
- Prefer recent, high-signal, scope-matching papers.
- Dedupe by paperId.
- Sort selected papers by overall usefulness for the query.
- Keep the selected set at ${perPage} papers or fewer.

Candidate papers from the OpenAlex tool:
${candidateJson}

Page:
- ${page}

Return shape:
{
  "rankedPaperIds": [
    { "paperId": "exact candidate paperId", "rationale": "short reason" }
  ],
  "warning": ""
}
`.trim();
}

function normaliseRankEntries(payload, perPage) {
  const rankedPaperIds = Array.isArray(payload?.rankedPaperIds) ? payload.rankedPaperIds : [];
  const paperIds = Array.isArray(payload?.paperIds) ? payload.paperIds : [];
  const resultIds = Array.isArray(payload?.results) ? payload.results.map((paper) => paper?.paperId) : [];
  const rawEntries = rankedPaperIds.length
    ? rankedPaperIds
    : paperIds.length
      ? paperIds.map((paperId) => ({ paperId }))
      : resultIds.map((paperId) => ({ paperId }));
  const seen = new Set();
  const entries = [];

  for (const entry of rawEntries) {
    const paperId = String(entry?.paperId || entry || '').trim();
    if (!paperId || seen.has(paperId)) {
      continue;
    }

    seen.add(paperId);
    entries.push({
      paperId,
      rationale: String(entry?.rationale || '').trim(),
    });
  }

  return entries.slice(0, perPage);
}

function selectRankedCandidates(candidates, rankPayload, perPage) {
  if (!candidates.length) {
    return [];
  }

  const entries = normaliseRankEntries(rankPayload, perPage);
  if (!entries.length) {
    throw new Error('Scout runtime did not rank any OpenAlex candidates.');
  }

  const candidateById = new Map(candidates.map((paper) => [paper.paperId, paper]));
  const ranked = entries.map((entry) => candidateById.get(entry.paperId)).filter(Boolean);

  if (!ranked.length) {
    throw new Error('Scout runtime ranked no known OpenAlex candidates.');
  }

  return ranked.slice(0, perPage);
}

export function createScoutRuntimeAdapter({
  runtime = 'codex',
  rootDir,
  rankSchemaPath = path.join(rootDir, 'services', 'backend', 'schemas', 'scout-rank-output.schema.json'),
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
    env: buildScoutRuntimeEnv(process.env),
    runtimeName,
    spawnImpl,
  });

  return {
    name: runtimeName,

    async search({ candidates = [], onProgress, project, query, scopes = [], page = 1, perPage = DEFAULT_RESULTS_PER_PAGE }) {
      const prompt = buildScoutRankPrompt({
        candidates,
        page,
        perPage,
        project,
        query,
        scopes,
      });

      const execution = await runtimeAdapter.runJsonTask({
        onEvent: onProgress,
        outputSchemaPath: rankSchemaPath,
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

      const payload = {
        rankedPaperIds: normaliseRankEntries(parsed, perPage),
        warning: parsed?.warning ? String(parsed.warning) : '',
      };
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
    async search({ onProgress, project, query, mode = 'keyword', scopes = [], page = 1 }) {
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

        let toolPayload;
        try {
          ensureOpenAlexConfigured(apiKey);
          await emitProgress(onProgress, {
            detail: `Fetching candidate papers for "${query}"`,
            label: 'OpenAlex tool call',
            source: 'backend',
            status: 'running',
            type: 'tool',
          });
          toolPayload = sanitiseSearchResultsPayload(
            await searchOpenAlexImpl({
              apiKey,
              mailto,
              page,
              perPage,
              project,
              query,
              scopes,
            }),
          );
          await emitProgress(onProgress, {
            detail: `${toolPayload.results.length} OpenAlex candidate paper(s) returned.`,
            label: 'OpenAlex tool result',
            source: 'backend',
            status: 'done',
            type: 'tool',
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (searchRun) {
            await runStore.updateAgentRun(searchRun.id, {
              error: `Scout OpenAlex tool failed: ${message}`,
              finishedAt: new Date().toISOString(),
              outputSummary: `Scout OpenAlex tool failed: ${message}`,
              status: 'error',
              warning: '',
            });
          }

          throw new Error(`Scout OpenAlex tool failed: ${message}`);
        }

        try {
          await emitProgress(onProgress, {
            detail: `Ranking ${toolPayload.results.length} candidate paper(s) with ${runtimeLabel || 'Scout'}.`,
            label: 'Scout ranking started',
            source: 'backend',
            status: 'running',
            type: 'agent',
          });
          const rankPayload = await runtimeAdapter.search({
            candidates: toolPayload.results,
            onProgress,
            project,
            query,
            scopes,
            page,
            perPage,
          });
          const rankedResults = selectRankedCandidates(toolPayload.results, rankPayload, perPage);
          await emitProgress(onProgress, {
            detail: `Selected ${rankedResults.length} paper(s) for the live result set.`,
            label: 'Scout ranking complete',
            source: 'backend',
            status: 'done',
            type: 'agent',
          });

          const payload = withSearchMeta({
            ...toolPayload,
            results: rankedResults,
            total: rankedResults.length,
            warning: combineWarnings(toolPayload.warning, rankPayload.warning),
          }, {
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
          const message = error instanceof Error ? error.message : String(error);
          if (searchRun) {
            await runStore.updateAgentRun(searchRun.id, {
              error: `Scout agent failed: ${message}`,
              finishedAt: new Date().toISOString(),
              outputSummary: `Scout agent failed: ${message}`,
              status: 'error',
              warning: '',
            });
          }

          throw new Error(`Scout agent failed: ${message}`);
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
