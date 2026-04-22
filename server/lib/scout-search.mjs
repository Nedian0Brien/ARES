import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { searchOpenAlex } from './openalex.mjs';
import { sanitiseSearchResultsPayload } from './search-contract.mjs';
import { searchSeedPapers } from './seed-data.mjs';

const execFileAsync = promisify(execFile);
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

function buildCodexExecArgs({ cwd, schemaPath, outputPath, prompt }) {
  return [
    'exec',
    '--ephemeral',
    '--skip-git-repo-check',
    '-s',
    'read-only',
    '-C',
    cwd,
    '--color',
    'never',
    '--output-schema',
    schemaPath,
    '-o',
    outputPath,
    prompt,
  ];
}

async function runCodexRuntime({ runtimeName, cwd, prompt, timeoutMs, execFileImpl }) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ares-scout-'));
  const schemaPath = path.join(tempDir, 'scout-output-schema.json');
  const outputPath = path.join(tempDir, 'scout-output.json');

  await fs.writeFile(schemaPath, JSON.stringify(buildScoutOutputSchema(), null, 2), 'utf8');

  try {
    const { stderr } = await execFileImpl(runtimeName, buildCodexExecArgs({ cwd, schemaPath, outputPath, prompt }), {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
    });

    const rawOutput = await fs.readFile(outputPath, 'utf8');
    if (!rawOutput.trim()) {
      throw new Error('Scout runtime returned an empty response.');
    }

    const parsed = JSON.parse(rawOutput);
    const payload = sanitiseSearchResultsPayload(parsed);

    if (stderr && stderr.trim()) {
      payload.warning = combineWarnings(payload.warning, stderr.trim());
    }

    return payload;
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.code === 'ETIMEDOUT' || error?.killed) {
      throw new Error(`Scout runtime timed out after ${timeoutMs}ms.`);
    }

    if (error instanceof SyntaxError) {
      throw new Error(`Scout runtime returned invalid JSON: ${error.message}`);
    }

    throw new Error(error instanceof Error ? error.message : String(error));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export function createScoutRuntimeAdapter({
  runtime = 'codex',
  rootDir,
  helperPath = path.join(rootDir, 'server', 'bin', 'openalex-helper.mjs'),
  timeoutMs = DEFAULT_SCOUT_TIMEOUT_MS,
  execFileImpl = execFileAsync,
} = {}) {
  const runtimeName = String(runtime || 'codex').trim().toLowerCase();

  if (!rootDir) {
    throw new Error('rootDir is required to build the Scout runtime adapter.');
  }

  if (runtimeName !== 'codex') {
    throw new Error(`Unsupported Scout runtime: ${runtimeName}`);
  }

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

      return runCodexRuntime({
        runtimeName,
        cwd: rootDir,
        prompt,
        timeoutMs,
        execFileImpl,
      });
    },
  };
}

function ensureOpenAlexConfigured(apiKey) {
  if (!apiKey) {
    throw new Error(OPENALEX_API_KEY_REQUIRED_MESSAGE);
  }
}

function withSearchMeta(payload, { agentRuntime = '', searchMode = 'keyword', warning = '', provider } = {}) {
  const resultsPayload = sanitiseSearchResultsPayload({
    ...payload,
    provider: provider || payload.provider,
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

      if (mode === 'scout') {
        try {
          const runtimePayload = await runtimeAdapter.search({
            project,
            query,
            scopes,
            page,
            perPage,
          });

          return withSearchMeta(runtimePayload, {
            provider: 'scout-agent',
            searchMode: mode,
            agentRuntime: runtimeLabel,
          });
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

        return withSearchMeta(directPayload, {
          searchMode: mode,
          agentRuntime: mode === 'scout' ? runtimeLabel : '',
          warning: warnings,
        });
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

      return withSearchMeta(seedPayload, {
        searchMode: mode,
        agentRuntime: mode === 'scout' ? runtimeLabel : '',
        warning: warnings,
      });
    },
  };
}

export function describeScoutRuntime(agentRuntime) {
  const runtime = String(agentRuntime || '').trim();
  return runtime ? `${capitalise(runtime)} Scout` : 'Scout agent';
}

export { buildCodexExecArgs, DEFAULT_RESULTS_PER_PAGE, DEFAULT_SCOUT_TIMEOUT_MS };
