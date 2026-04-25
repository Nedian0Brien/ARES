import { createAgentRuntime } from './agent-runtime.mjs';
import { sanitiseSearchResultsPayload } from './search-contract.mjs';

const DEFAULT_TIMEOUTS = {
  insight: 25000,
  reading: 30000,
  research: 45000,
  result: 25000,
  search: 30000,
  writing: 25000,
};

const SECTION_ORDER = [
  ['abstract', 'Abstract'],
  ['introduction', 'Introduction'],
  ['method', 'Method'],
  ['experiments', 'Experiments'],
  ['analysis', 'Analysis'],
  ['conclusion', 'Conclusion'],
];

export const CAPABILITY_PROFILES = {
  analyst: {
    description: 'Result and log analysis with note writing, but no workspace mutation.',
    id: 'analyst',
    sandbox: 'read-only',
    shell: false,
    toolPolicy: 'read-only analysis',
  },
  reader: {
    description: 'Paper analysis and structured reading output without shell execution.',
    id: 'reader',
    sandbox: 'read-only',
    shell: false,
    toolPolicy: 'document analysis only',
  },
  research: {
    description: 'Repository read, limited workspace write, and shell execution for reproduction work.',
    id: 'research',
    sandbox: 'workspace-write',
    shell: true,
    toolPolicy: 'workspace-write with shell',
  },
  scout: {
    description: 'Read-only scouting. Retrieval should stay within the local OpenAlex helper workflow.',
    id: 'scout',
    sandbox: 'read-only',
    shell: false,
    toolPolicy: 'retrieval helper only',
  },
  writing: {
    description: 'Draft writing and synthesis without shell execution.',
    id: 'writing',
    sandbox: 'read-only',
    shell: false,
    toolPolicy: 'drafting only',
  },
};

const STAGE_TASKS = {
  search: {
    agent: 'Scout agent',
    buildFallback: buildSearchFallback,
    buildPrompt: buildSearchPrompt,
    defaultTaskKind: 'run-agentic-search',
    outputCollections: [],
    profileId: 'scout',
    stage: 'search',
  },
  insight: {
    agent: 'Analyst agent',
    buildFallback: buildInsightFallback,
    buildPrompt: buildInsightPrompt,
    defaultTaskKind: 'create-insight-note',
    outputCollections: ['insightNotes'],
    profileId: 'analyst',
    stage: 'insight',
  },
  reading: {
    agent: 'Reader agent',
    buildFallback: buildReadingFallback,
    buildPrompt: buildReadingPrompt,
    bootstrap: bootstrapReadingRun,
    defaultTaskKind: 'create-reading-session',
    outputCollections: ['readingSessions'],
    profileId: 'reader',
    stage: 'reading',
  },
  research: {
    agent: 'Reproduction agent',
    buildFallback: buildResearchFallback,
    buildPrompt: buildResearchPrompt,
    defaultTaskKind: 'create-repro-plan',
    outputCollections: ['reproChecklistItems', 'experimentRuns'],
    profileId: 'research',
    stage: 'research',
  },
  result: {
    agent: 'Analyst report',
    buildFallback: buildResultFallback,
    buildPrompt: buildResultPrompt,
    defaultTaskKind: 'create-result-comparison',
    outputCollections: ['resultComparisons'],
    profileId: 'analyst',
    stage: 'result',
  },
  writing: {
    agent: 'Writing agent',
    buildFallback: buildWritingFallback,
    buildPrompt: buildWritingPrompt,
    defaultTaskKind: 'create-writing-draft',
    outputCollections: ['writingDrafts'],
    profileId: 'writing',
    stage: 'writing',
  },
};

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values) {
  return Array.from(
    new Set(
      ensureArray(values)
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  );
}

function nowIso() {
  return new Date().toISOString();
}

function combineWarnings(...groups) {
  return uniqueStrings(groups.flat()).join(' / ');
}

function truncate(value, limit = 200) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }

  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

function firstSentence(text, fallback = '') {
  const match = String(text || '')
    .trim()
    .match(/(.+?[.!?])(?:\s|$)/);
  return truncate(match?.[1] || text || fallback, 180);
}

function assetRef(type, id, extras = {}) {
  return {
    id: String(id),
    type: String(type),
    ...extras,
  };
}

function serialiseJson(value) {
  return JSON.stringify(value, null, 2);
}

function sectionSummaryFromPaper(sectionId, project, paper) {
  const abstract = String(paper.abstract || paper.summary || '').trim();
  const keyPoints = uniqueStrings(paper.keyPoints || []);
  const keywords = uniqueStrings([...(paper.keywords || []), ...(paper.matchedKeywords || [])]);

  if (sectionId === 'abstract') {
    return firstSentence(paper.summary || abstract || `${paper.title} is relevant to ${project.name}.`);
  }

  if (sectionId === 'introduction') {
    return firstSentence(
      `${paper.title} aligns with the project focus on ${project.focus || project.name}.`,
      `${paper.title} introduces a direction relevant to ${project.name}.`,
    );
  }

  if (sectionId === 'method') {
    return firstSentence(
      keyPoints[0] || `${paper.title} appears to center on ${keywords.slice(0, 3).join(', ') || 'its core method'}.`,
      'Method details require a deeper read.',
    );
  }

  if (sectionId === 'experiments') {
    return firstSentence(
      keyPoints[1] || `${paper.title} reports evaluation outcomes around ${keywords.slice(0, 2).join(', ') || 'the target benchmarks'}.`,
      'Experiment details should be validated in the full paper.',
    );
  }

  if (sectionId === 'analysis') {
    return firstSentence(
      keyPoints[2] || `${paper.title} still leaves open questions around robustness, efficiency, or reproducibility.`,
      'Analysis notes can be expanded after a closer pass.',
    );
  }

  return firstSentence(
    `${paper.title} looks worth carrying into reproduction if the project prioritises ${keywords[0] || 'this topic'}.`,
    'Conclusion notes will be refined as the reading progresses.',
  );
}

function buildReadingSections(project, paper) {
  return SECTION_ORDER.map(([id, label], index) => ({
    id,
    label,
    status: index < 2 ? 'done' : index < 4 ? 'queue' : 'todo',
    summary: sectionSummaryFromPaper(id, project, paper),
  }));
}

function buildHighlights(paper) {
  const keyPoints = uniqueStrings(paper.keyPoints || []);
  const summary = String(paper.summary || paper.abstract || '').trim();
  const fallbackPoints = summary ? summary.split(/[.!?]\s+/).filter(Boolean).slice(0, 3) : [];
  const candidates = [...keyPoints, ...fallbackPoints].slice(0, 4);
  const types = ['claim', 'method', 'result', 'limit'];
  const sections = ['abstract', 'method', 'experiments', 'analysis'];

  return candidates.map((text, index) => ({
    id: `${paper.paperId}-highlight-${index + 1}`,
    section: sections[index] || 'analysis',
    text: truncate(text, 180),
    type: types[index] || 'claim',
  }));
}

function buildReproParams(project, paper) {
  const keywords = uniqueStrings([...(paper.keywords || []), ...(paper.matchedKeywords || [])]);
  return [
    {
      label: 'Primary topic',
      value: keywords.slice(0, 3).join(', ') || project.name,
    },
    {
      label: 'Venue / year',
      value: `${paper.venue || 'Unknown'}${paper.year ? ` · ${paper.year}` : ''}`.trim(),
    },
    {
      label: 'Access path',
      value: paper.pdfUrl || paper.paperUrl || 'Metadata only',
    },
    {
      label: 'Replication focus',
      value: keywords[0] || firstSentence(project.focus || paper.summary || paper.abstract || project.name),
    },
    {
      label: 'Compute note',
      value: paper.openAccess ? 'Likely reproducible with public resources' : 'Expect manual environment validation',
    },
  ];
}

function buildReadingFallback({ context, error }) {
  const { paper, project } = context;
  const sections = buildReadingSections(project, paper);

  return {
    outputSummary: `Reading session prepared for ${paper.title}.`,
    readingSessions: [
      {
        abstract: paper.abstract || '',
        authors: ensureArray(paper.authors).slice(0, 8),
        citedByCount: Number(paper.citedByCount) || 0,
        highlights: buildHighlights(paper),
        keyPoints: ensureArray(paper.keyPoints).slice(0, 6),
        keywords: ensureArray(paper.keywords).slice(0, 8),
        matchedKeywords: ensureArray(paper.matchedKeywords).slice(0, 8),
        notes: [
          {
            id: `${paper.paperId}-reader-note`,
            label: 'Reader summary',
            value: firstSentence(paper.summary || paper.abstract || `${paper.title} is queued for deeper reading.`),
          },
        ],
        openAccess: Boolean(paper.openAccess),
        paperId: paper.paperId,
        paperUrl: paper.paperUrl || null,
        pdfUrl: paper.pdfUrl || null,
        relevance: Number(paper.relevance) || 0,
        reproParams: buildReproParams(project, paper),
        sections,
        sourceName: paper.sourceName || 'ARES',
        sourceProvider: paper.sourceProvider || 'reader-fallback',
        status: 'done',
        summary: firstSentence(paper.summary || paper.abstract || `${paper.title} is ready for structured reading.`),
        title: paper.title,
        venue: paper.venue || 'Unknown',
        warning: error ? `Reader fallback used: ${error.message}` : '',
        year: paper.year ?? null,
      },
    ],
  };
}

function buildResearchFallback({ context, error }) {
  const paper = context.paper;
  const readingSession = context.readingSession;
  const sourceRefs = uniqueSourceRefs([
    assetRef('paper', paper.paperId, { label: paper.title }),
    readingSession ? assetRef('readingSession', readingSession.id, { label: readingSession.title }) : null,
  ]);
  const focus = firstSentence(
    readingSession?.summary || paper.summary || paper.abstract || `${paper.title} reproduction plan`,
    `${paper.title} reproduction plan`,
  );

  return {
    experimentRuns: [
      {
        title: `${paper.title} baseline reproduction`,
        kind: 'baseline',
        metricTarget: truncate(focus, 120),
        sourceRefs,
        status: 'queue',
        summary: 'Establish the original paper setting and verify that the reported setup can run locally.',
      },
      {
        title: `${paper.title} scoped ablation`,
        kind: 'ablation',
        metricTarget: 'Validate one controllable simplification before broader experimentation.',
        sourceRefs,
        status: 'todo',
        summary: 'After the baseline, isolate a single parameter or component change to measure sensitivity.',
      },
    ],
    outputSummary: `Research plan drafted for ${paper.title}.`,
    reproChecklistItems: [
      {
        category: 'repo',
        detail: 'Locate the reference implementation or closest public baseline.',
        sourceRefs,
        status: 'queue',
        title: 'Confirm code availability',
      },
      {
        category: 'env',
        detail: 'Capture package versions, runtime requirements, and any GPU assumptions.',
        sourceRefs,
        status: 'todo',
        title: 'Validate environment setup',
      },
      {
        category: 'data',
        detail: 'Confirm the datasets, splits, and preprocessing steps implied by the paper.',
        sourceRefs,
        status: 'todo',
        title: 'Reconstruct data recipe',
      },
      {
        category: 'eval',
        detail: 'List the primary metrics and expected variance before running experiments.',
        sourceRefs,
        status: 'todo',
        title: 'Lock evaluation protocol',
        warning: error ? `Runtime fallback used: ${error.message}` : '',
      },
    ],
  };
}

function searchContextSummary(context) {
  const query = String(context.searchQuery || '').trim() || context.project?.defaultQuery || 'untitled search';
  const scopes = ensureArray(context.searchScopes)
    .map((scope) => String(scope?.label || '').trim())
    .filter(Boolean);

  return {
    query,
    scopeLabel: scopes.length ? scopes.join(', ') : 'project-wide',
  };
}

function buildSearchFallback({ context, error }) {
  const { query, scopeLabel } = searchContextSummary(context);
  const suffix = error?.message ? ` Runtime fallback: ${error.message}` : '';

  return {
    outputSummary: `Agentic search prepared for "${truncate(query, 120)}" across ${scopeLabel}.${suffix}`,
  };
}

function toSearchPage(value) {
  const page = Number(value);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function searchOutputSummary(payload, query) {
  const count = payload.results.length;
  const provider = payload.provider || 'search provider';
  const suffix = count === 1 ? 'result' : 'results';
  return `Scout returned ${count} ${suffix} for "${truncate(query, 120)}" via ${provider}.`;
}

async function executeSearchRun({ context, run, searchService, store }) {
  if (!searchService || typeof searchService.search !== 'function') {
    throw new Error('Search service is not configured.');
  }

  const query = context.searchQuery || context.project?.defaultQuery || '';
  const payload = sanitiseSearchResultsPayload(
    await searchService.search({
      mode: 'scout',
      page: toSearchPage(run.input?.page),
      project: context.project,
      query,
      scopes: context.searchScopes,
    }),
  );
  const queuedIds = new Set();

  for (const paper of payload.results) {
    const queued = await store.queuePaper(run.projectId, paper, {
      runId: run.id,
      status: 'queue',
    });
    queuedIds.add(queued.paperId);
  }

  const outputPayload = {
    ...payload,
    availableVenues: Array.from(new Set(payload.results.map((paper) => paper.venue))).slice(0, 8),
    results: payload.results.map((paper) => ({
      ...paper,
      queued: queuedIds.has(paper.paperId),
    })),
    totalQueued: queuedIds.size,
  };

  await store.updateAgentRun(run.id, {
    assetRefs: uniqueSourceRefs([
      ...(run.assetRefs || []),
      ...payload.results.map((paper) => assetRef('paper', paper.paperId, { label: paper.title })),
    ]),
    finishedAt: nowIso(),
    outputPayload,
    outputRef: [],
    outputSummary: searchOutputSummary(payload, query),
    status: 'done',
    warning: combineWarnings(payload.warning),
  });
}

function buildResultFallback({ context, error }) {
  const paper = context.paper;
  const experimentRuns = ensureArray(context.experimentRuns);
  const baseline = experimentRuns[0];
  const sourceRefs = uniqueSourceRefs([
    assetRef('paper', paper.paperId, { label: paper.title }),
    ...experimentRuns.map((run) => assetRef('experimentRun', run.id, { label: run.title })),
  ]);

  return {
    outputSummary: `Result comparison prepared for ${paper.title}.`,
    resultComparisons: [
      {
        metric: 'Primary outcome',
        paperValue: 'Reported in paper',
        reproducedValue: baseline?.observedValue || 'Pending run',
        delta: baseline?.observedValue ? 'Compare against paper claim' : 'Awaiting experiment output',
        sourceRefs,
        status: baseline?.observedValue ? 'done' : 'queue',
        summary: error
          ? `Fallback comparison created after runtime failure: ${error.message}`
          : 'Use this comparison record to log reproduction deltas once the first baseline completes.',
        title: `${paper.title} comparison`,
      },
    ],
  };
}

function buildInsightFallback({ context, error }) {
  const paper = context.paper;
  const comparisons = ensureArray(context.resultComparisons);
  const firstComparison = comparisons[0];

  return {
    insightNotes: [
      {
        hypothesis: 'The strongest follow-up direction is likely to come from the first unstable assumption in the pipeline.',
        sourceRefs: uniqueSourceRefs([
          assetRef('paper', paper.paperId, { label: paper.title }),
          ...comparisons.map((comparison) => assetRef('resultComparison', comparison.id, { label: comparison.title })),
        ]),
        status: firstComparison?.status === 'done' ? 'done' : 'queue',
        summary: firstComparison?.summary || firstSentence(paper.summary || paper.abstract || `${paper.title} remains promising.`),
        title: `${paper.title} insight note`,
        validationState: firstComparison?.status === 'done' ? 'supported-by-results' : 'needs-results',
        warning: error ? `Runtime fallback used: ${error.message}` : '',
      },
    ],
    outputSummary: `Insight note drafted for ${paper.title}.`,
  };
}

function buildWritingFallback({ context, error }) {
  const paper = context.paper;
  const insights = ensureArray(context.insightNotes);
  const comparisons = ensureArray(context.resultComparisons);
  const summary = firstSentence(paper.summary || paper.abstract || `${paper.title} draft`);
  const paragraphs = [
    `## Motivation\n${summary}`,
    `## Reading Notes\n${firstSentence(context.readingSession?.summary || summary)}`,
    `## Result Snapshot\n${firstSentence(comparisons[0]?.summary || 'Result comparison is still being filled in.')}`,
    `## Insight\n${firstSentence(insights[0]?.summary || 'The next step is to validate the first unstable assumption.')}`,
  ];

  return {
    outputSummary: `Writing draft created for ${paper.title}.`,
    writingDrafts: [
      {
        sections: [
          { id: 'motivation', label: 'Motivation', text: paragraphs[0] },
          { id: 'reading-notes', label: 'Reading Notes', text: paragraphs[1] },
          { id: 'result-snapshot', label: 'Result Snapshot', text: paragraphs[2] },
          { id: 'insight', label: 'Insight', text: paragraphs[3] },
        ],
        sourceRefs: uniqueSourceRefs([
          assetRef('paper', paper.paperId, { label: paper.title }),
          ...insights.map((note) => assetRef('insightNote', note.id, { label: note.title })),
          ...comparisons.map((comparison) => assetRef('resultComparison', comparison.id, { label: comparison.title })),
        ]),
        status: 'done',
        summary,
        title: `${paper.title} draft`,
        warning: error ? `Runtime fallback used: ${error.message}` : '',
      },
    ],
  };
}

function uniqueSourceRefs(refs) {
  const seen = new Set();
  const next = [];

  for (const ref of refs.filter(Boolean)) {
    const key = `${ref.type}:${ref.id}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    next.push(ref);
  }

  return next;
}

function buildSearchPrompt({ context }) {
  const { query, scopeLabel } = searchContextSummary(context);
  const keywords = (context.project?.keywords || []).length
    ? context.project.keywords.map((keyword) => `- ${keyword}`).join('\n')
    : '- none';
  const scopes = ensureArray(context.searchScopes).length
    ? context.searchScopes.map((scope) => `- ${scope.type || 'scope'}: ${scope.label || scope.id}`).join('\n')
    : '- none';

  return `
You are the Scout agentic search planner for ARES.

Return only JSON:
{
  "outputSummary": "one concise sentence describing the live search plan"
}

Project:
- id: ${context.project?.id || 'unknown'}
- focus: ${context.project?.focus || 'n/a'}

Project keywords:
${keywords}

User query:
- ${query}

Active scopes:
${scopes}

Plan requirements:
- Treat this as an agentic literature-search run, not a keyword-only lookup.
- Mention the first live phase: Reader.
- Scope summary: ${scopeLabel}
- Keep the sentence short enough for a status badge or run header.
`.trim();
}

function buildReadingPrompt({ context }) {
  const { paper, project } = context;

  return `
You are the Reader agent for ARES.

Task:
- Build a structured reading session for the paper below.
- Do not use shell commands.
- Return JSON only.

Project:
${serialiseJson({
    focus: project.focus,
    id: project.id,
    keywords: project.keywords,
    name: project.name,
  })}

Paper:
${serialiseJson(paper)}

Return shape:
{
  "readingSessions": [
    {
      "summary": "string",
      "sections": [{ "id": "abstract", "label": "Abstract", "status": "done|queue|todo", "summary": "string" }],
      "highlights": [{ "id": "string", "type": "claim|method|result|limit", "section": "string", "text": "string" }],
      "reproParams": [{ "label": "string", "value": "string" }],
      "notes": [{ "id": "string", "label": "string", "value": "string" }]
    }
  ],
  "outputSummary": "string"
}
`.trim();
}

function buildResearchPrompt({ context }) {
  const { handoff, paper, project, readingSession } = context;

  return `
You are the Reproduction agent for ARES.

Task:
- Produce a reproduction checklist and initial experiment plan.
- Shell access is allowed if needed, but keep the response as JSON only.

Project:
${serialiseJson({
    focus: project.focus,
    id: project.id,
    keywords: project.keywords,
    name: project.name,
  })}

Paper:
${serialiseJson(paper)}

Reading session:
${serialiseJson(readingSession || {})}

Reading handoff:
${serialiseJson(handoff || {})}

Return shape:
{
  "reproChecklistItems": [{ "title": "string", "category": "string", "detail": "string", "status": "todo|queue|running|done" }],
  "experimentRuns": [{ "title": "string", "kind": "baseline|ablation|sweep", "summary": "string", "status": "todo|queue|running|done" }],
  "outputSummary": "string"
}
`.trim();
}

function buildResultPrompt({ context }) {
  return `
You are the Analyst report agent for ARES.

Task:
- Compare reproduced evidence with the original paper claims.
- Return JSON only.

Context:
${serialiseJson({
    experimentRuns: context.experimentRuns || [],
    paper: context.paper,
    readingSession: context.readingSession || null,
  })}

Return shape:
{
  "resultComparisons": [{ "title": "string", "metric": "string", "paperValue": "string", "reproducedValue": "string", "delta": "string", "summary": "string", "status": "todo|queue|running|done" }],
  "outputSummary": "string"
}
`.trim();
}

function buildInsightPrompt({ context }) {
  return `
You are the Analyst agent for ARES.

Task:
- Write a concise insight note grounded in the available comparisons.
- Return JSON only.

Context:
${serialiseJson({
    paper: context.paper,
    resultComparisons: context.resultComparisons || [],
  })}

Return shape:
{
  "insightNotes": [{ "title": "string", "summary": "string", "hypothesis": "string", "validationState": "string", "status": "todo|queue|running|done" }],
  "outputSummary": "string"
}
`.trim();
}

function buildWritingPrompt({ context }) {
  return `
You are the Writing agent for ARES.

Task:
- Create a concise research draft from the upstream assets.
- Return JSON only.

Context:
${serialiseJson({
    insightNotes: context.insightNotes || [],
    paper: context.paper,
    readingSession: context.readingSession || null,
    resultComparisons: context.resultComparisons || [],
  })}

Return shape:
{
  "writingDrafts": [{
    "title": "string",
    "summary": "string",
    "status": "todo|queue|running|done",
    "sections": [{ "id": "string", "label": "string", "text": "string" }]
  }],
  "outputSummary": "string"
}
`.trim();
}

async function bootstrapReadingRun({ context, run, store }) {
  const paper = context.paper;
  if (!paper) {
    return null;
  }

  const session = await store.upsertReadingSession({
    abstract: paper.abstract || '',
    authors: paper.authors || [],
    citedByCount: Number(paper.citedByCount) || 0,
    keyPoints: paper.keyPoints || [],
    keywords: paper.keywords || [],
    matchedKeywords: paper.matchedKeywords || [],
    openAccess: Boolean(paper.openAccess),
    paperId: paper.paperId,
    paperUrl: paper.paperUrl || null,
    pdfUrl: paper.pdfUrl || null,
    projectId: run.projectId,
    relevance: Number(paper.relevance) || 0,
    runId: run.id,
    sections: [],
    sourceName: paper.sourceName || 'Queued paper',
    sourceProvider: paper.sourceProvider || 'queue',
    sourceRefs: uniqueSourceRefs([assetRef('paper', paper.paperId, { label: paper.title })]),
    startedAt: null,
    status: 'queue',
    summary: firstSentence(paper.summary || paper.abstract || `${paper.title} is queued for reading.`),
    title: paper.title,
    venue: paper.venue || 'Unknown',
    year: paper.year ?? null,
  });

  await store.queuePaper(run.projectId, paper, {
    runId: run.id,
    sessionId: session.id,
    status: 'queue',
  });

  await store.updateAgentRun(run.id, {
    assetRefs: uniqueSourceRefs([
      ...(run.assetRefs || []),
      assetRef('paper', paper.paperId, { label: paper.title }),
      assetRef('readingSession', session.id, { label: session.title }),
    ]),
  });

  return session;
}

function resolveTask(stage, taskKind) {
  const definition = STAGE_TASKS[String(stage || '').trim().toLowerCase()];
  if (!definition) {
    throw new Error(`Unsupported agent stage: ${stage}`);
  }

  if (taskKind && String(taskKind).trim() !== definition.defaultTaskKind) {
    throw new Error(`Unsupported taskKind for ${stage}: ${taskKind}`);
  }

  return definition;
}

function resolvePaper(store, run, input) {
  const directPaper = input?.paper && typeof input.paper === 'object' ? input.paper : null;
  if (directPaper?.paperId) {
    return directPaper;
  }

  const paperId =
    String(input?.paperId || '').trim() ||
    ensureArray(run.assetRefs).find((ref) => ref?.type === 'paper')?.id ||
    ensureArray(input?.assetRefs).find((ref) => ref?.type === 'paper')?.id ||
    '';

  return paperId ? store.getPaper(run.projectId, paperId) : null;
}

function resolveReadingSession(store, run, input) {
  const sessionId =
    String(input?.readingSessionId || '').trim() ||
    ensureArray(run.assetRefs).find((ref) => ref?.type === 'readingSession')?.id ||
    '';
  if (sessionId) {
    return store.getReadingSession(sessionId);
  }

  const paperId =
    String(input?.paperId || '').trim() ||
    ensureArray(run.assetRefs).find((ref) => ref?.type === 'paper')?.id ||
    '';

  return paperId ? store.getReadingSessionByPaper(run.projectId, paperId) : null;
}

function resolveProjectContext(store, run) {
  return store.getProject(run.projectId);
}

function resolveSupportCollections(store, run) {
  return {
    experimentRuns: store.listProjectAssets(run.projectId, 'experimentRuns'),
    insightNotes: store.listProjectAssets(run.projectId, 'insightNotes'),
    readingSessions: store.getReadingSessions(run.projectId),
    reproChecklistItems: store.listProjectAssets(run.projectId, 'reproChecklistItems'),
    resultComparisons: store.listProjectAssets(run.projectId, 'resultComparisons'),
    writingDrafts: store.listProjectAssets(run.projectId, 'writingDrafts'),
  };
}

function buildRunContext(store, run) {
  const input = run.input || {};
  const project = resolveProjectContext(store, run);
  const definition = STAGE_TASKS[String(run.stage || '').trim().toLowerCase()];
  const paper = resolvePaper(store, run, input);
  if (!paper && definition?.stage !== 'search') {
    throw new Error(`Run ${run.id} is missing a paper reference.`);
  }

  const readingSession = resolveReadingSession(store, run, input);
  const collections = resolveSupportCollections(store, run);
  const handoff = {
    assetIds: ensureArray(input?.assetIds).map((entry) => String(entry || '').trim()).filter(Boolean),
    noteIds: ensureArray(input?.noteIds).map((entry) => String(entry || '').trim()).filter(Boolean),
    sectionIds: ensureArray(input?.sectionIds).map((entry) => String(entry || '').trim()).filter(Boolean),
    source: String(input?.handoffSource || '').trim(),
  };

  return {
    collections,
    experimentRuns: collections.experimentRuns,
    handoff,
    insightNotes: collections.insightNotes,
    paper,
    project,
    readingSession,
    reproChecklistItems: collections.reproChecklistItems,
    resultComparisons: collections.resultComparisons,
    searchQuery: String(input?.query || input?.q || project?.defaultQuery || '').trim(),
    searchScopes: ensureArray(input?.scopes).map((scope) => ({
      id: String(scope?.id || '').trim(),
      label: String(scope?.label || scope?.id || '').trim(),
      type: String(scope?.type || 'scope').trim(),
    })),
    writingDrafts: collections.writingDrafts,
  };
}

function normaliseAgentPayload(payload, definition) {
  const next = payload && typeof payload === 'object' ? payload : {};
  const result = {
    outputSummary: String(next.outputSummary || '').trim(),
  };

  for (const collectionName of definition.outputCollections) {
    result[collectionName] = ensureArray(next[collectionName]);
  }

  return result;
}

async function persistTaskOutputs({ context, definition, output, run, store }) {
  const outputRefs = [];

  if (definition.stage === 'reading') {
    const paper = context.paper;
    const sessionPayload = output.readingSessions[0] || buildReadingFallback({ context }).readingSessions[0];
    const session = await store.upsertReadingSession({
      ...sessionPayload,
      abstract: paper.abstract || sessionPayload.abstract || '',
      authors: paper.authors || sessionPayload.authors || [],
      citedByCount: Number(paper.citedByCount) || Number(sessionPayload.citedByCount) || 0,
      finishedAt: nowIso(),
      keyPoints: paper.keyPoints || sessionPayload.keyPoints || [],
      keywords: paper.keywords || sessionPayload.keywords || [],
      matchedKeywords: paper.matchedKeywords || sessionPayload.matchedKeywords || [],
      openAccess: Boolean(paper.openAccess),
      paperId: paper.paperId,
      paperUrl: paper.paperUrl || null,
      pdfUrl: paper.pdfUrl || null,
      projectId: run.projectId,
      relevance: Number(paper.relevance) || 0,
      runId: run.id,
      sourceName: paper.sourceName || sessionPayload.sourceName || 'ARES',
      sourceProvider: paper.sourceProvider || sessionPayload.sourceProvider || 'reader',
      sourceRefs: uniqueSourceRefs([
        assetRef('paper', paper.paperId, { label: paper.title }),
        ...(sessionPayload.sourceRefs || []),
      ]),
      startedAt: run.startedAt || nowIso(),
      status: 'done',
      title: paper.title,
      venue: paper.venue || 'Unknown',
      warning: combineWarnings(sessionPayload.warning),
      year: paper.year ?? null,
    });

    await store.queuePaper(run.projectId, paper, {
      runId: run.id,
      sessionId: session.id,
      status: session.status,
    });

    outputRefs.push({ collection: 'readingSessions', ids: [session.id] });
    return {
      outputRef: outputRefs,
      outputSummary: output.outputSummary || `Reading session created for ${paper.title}.`,
    };
  }

  for (const collectionName of definition.outputCollections) {
    const items = ensureArray(output[collectionName]);
    const ids = [];

    for (const item of items) {
      const stored = await store.upsertProjectAsset(collectionName, {
        ...item,
        projectId: run.projectId,
        runId: run.id,
        sourceRefs: uniqueSourceRefs(item.sourceRefs || run.assetRefs || []),
      }, {
        prefix: collectionName.replace(/s$/, ''),
      });
      ids.push(stored.id);
    }

    if (ids.length) {
      outputRefs.push({ collection: collectionName, ids });
    }
  }

  return {
    outputRef: outputRefs,
    outputSummary:
      output.outputSummary ||
      `${definition.agent} created ${outputRefs.reduce((count, entry) => count + entry.ids.length, 0)} asset(s).`,
  };
}

function hydrateOutputRef(store, outputRef) {
  const refs = Array.isArray(outputRef) ? outputRef : outputRef ? [outputRef] : [];
  const assets = [];

  for (const ref of refs) {
    const collection = ref.collection;
    for (const id of ensureArray(ref.ids)) {
      if (collection === 'readingSessions') {
        const asset = store.getReadingSession(id);
        if (asset) {
          assets.push({ collection, item: asset });
        }
        continue;
      }

      const asset = store.getProjectAsset(collection, id);
      if (asset) {
        assets.push({ collection, item: asset });
      }
    }
  }

  return assets;
}

export function createAgentRunService({
  rootDir,
  runtimeName = 'codex',
  searchService,
  spawnImpl,
  store,
} = {}) {
  if (!store) {
    throw new Error('store is required to create the agent run service.');
  }

  const runtime = createAgentRuntime({
    cwd: rootDir,
    runtimeName,
    spawnImpl,
  });
  const activeRuns = new Map();

  async function executeRun(runId) {
    const run = store.getAgentRun(runId);
    if (!run) {
      return;
    }

    const definition = resolveTask(run.stage, run.taskKind);
    let context;
    try {
      context = buildRunContext(store, run);
    } catch (error) {
      await store.updateAgentRun(runId, {
        error: error.message,
        finishedAt: nowIso(),
        status: 'done',
      });
      return;
    }

    try {
      await store.updateAgentRun(runId, {
        startedAt: nowIso(),
        status: 'running',
      });

      if (definition.bootstrap) {
        await definition.bootstrap({ context, run, store });
      }

      if (definition.stage === 'search') {
        await executeSearchRun({ context, run, searchService, store });
        return;
      }

      const prompt = definition.buildPrompt({ context, run });
      const profile = CAPABILITY_PROFILES[definition.profileId];
      const task = runtime.startJsonTask({
        prompt,
        sandbox: profile.sandbox,
        timeoutMs: DEFAULT_TIMEOUTS[definition.stage],
      });

      activeRuns.set(runId, task.abort);
      const summary = await task.promise;
      const payload = runtime.parseJsonFromMessages(summary);
      const output = normaliseAgentPayload(payload, definition);
      const persisted = await persistTaskOutputs({
        context,
        definition,
        output,
        run,
        store,
      });

      await store.updateAgentRun(runId, {
        finishedAt: nowIso(),
        outputRef: persisted.outputRef,
        outputSummary: persisted.outputSummary,
        status: 'done',
        warning: combineWarnings(summary.rawStderr),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (/aborted/i.test(message)) {
        await store.updateAgentRun(runId, {
          error: 'Aborted by user.',
          finishedAt: nowIso(),
          status: definition.stage === 'search' ? 'error' : 'done',
        });
        return;
      }

      if (definition.stage === 'search') {
        await store.updateAgentRun(runId, {
          error: message,
          finishedAt: nowIso(),
          outputRef: [],
          outputSummary: `Agentic search failed: ${message}`,
          status: 'error',
          warning: '',
        });
        return;
      }

      const fallback = definition.buildFallback({ context, error });
      const persisted = await persistTaskOutputs({
        context,
        definition,
        output: normaliseAgentPayload(fallback, definition),
        run,
        store,
      });

      await store.updateAgentRun(runId, {
        finishedAt: nowIso(),
        outputRef: persisted.outputRef,
        outputSummary: persisted.outputSummary,
        status: 'done',
        warning: combineWarnings(message),
      });
    } finally {
      activeRuns.delete(runId);
    }
  }

  function getRun(runId) {
    const run = store.getAgentRun(runId);
    if (!run) {
      return null;
    }

    return {
      assets: hydrateOutputRef(store, run.outputRef),
      run,
    };
  }

  async function createRun(input) {
    const stage = String(input.stage || '').trim().toLowerCase();
    const definition = resolveTask(stage, input.taskKind || STAGE_TASKS[stage]?.defaultTaskKind);
    const run = await store.createAgentRun({
      agent: input.agent || definition.agent,
      assetRefs: uniqueSourceRefs(input.assetRefs || []),
      input: input.input || {},
      outputSummary: '',
      profileId: definition.profileId,
      projectId: input.projectId,
      stage,
      status: 'queue',
      taskKind: definition.defaultTaskKind,
    });

    void executeRun(run.id);
    return store.getAgentRun(run.id);
  }

  async function abortRun(runId) {
    const abort = activeRuns.get(runId);
    if (abort) {
      abort();
    } else {
      await store.updateAgentRun(runId, {
        error: 'Aborted by user.',
        finishedAt: nowIso(),
        status: 'done',
      });
    }

    return getRun(runId);
  }

  async function retryRun(runId) {
    const run = store.getAgentRun(runId);
    if (!run) {
      throw new Error(`Unknown agent run: ${runId}`);
    }

    const nextRun = await createRun({
      assetRefs: run.assetRefs,
      input: run.input,
      projectId: run.projectId,
      stage: run.stage,
      taskKind: run.taskKind,
    });

    return {
      retriedFrom: runId,
      run: nextRun,
    };
  }

  return {
    async checkAvailability() {
      return runtime.checkAvailability();
    },

    getProfiles() {
      return Object.values(CAPABILITY_PROFILES).map((profile) => ({ ...profile }));
    },

    abortRun,
    createRun,
    getRun,
    retryRun,
  };
}
