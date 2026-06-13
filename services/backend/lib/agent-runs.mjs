import { createAgentRuntime } from './agent-runtime.mjs';
import {
  buildInsightFallback,
  buildReadingFallback,
  buildResearchFallback,
  buildResultFallback,
  buildSearchFallback,
  buildWritingFallback,
} from './agent-run-fallbacks.mjs';
import {
  buildInsightPrompt,
  buildReadingPrompt,
  buildResearchPrompt,
  buildResultPrompt,
  buildSearchPrompt,
  buildWritingPrompt,
} from './agent-run-prompts.mjs';
import { sanitiseSearchResultsPayload } from './search-contract.mjs';

const DEFAULT_TIMEOUTS = {
  insight: 25000,
  reading: 30000,
  research: 45000,
  result: 25000,
  search: 30000,
  writing: 25000,
};
const MAX_PROGRESS_EVENTS = 80;

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

function toTimestamp(value) {
  const stamp = Date.parse(value || '');
  return Number.isFinite(stamp) ? stamp : 0;
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

function assetIdsFromRefs(refs) {
  return uniqueStrings(ensureArray(refs).map((ref) => ref?.id));
}

function assetIdsFromOutputRefs(refs) {
  return uniqueStrings(ensureArray(refs).flatMap((ref) => ensureArray(ref?.ids)));
}

function runIdempotencyScope(context, run) {
  return uniqueStrings([
    run.projectId,
    run.stage,
    run.taskKind,
    context.paper?.paperId,
    context.readingSession?.id,
    context.searchQuery,
    ...(run.sourceAssetIds || []),
    ...assetIdsFromRefs(run.assetRefs || []),
  ]).join(':');
}

function outputIdempotencyKey({ collectionName, context, index, run }) {
  return [runIdempotencyScope(context, run), collectionName, String(index)].filter(Boolean).join(':');
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

function isRunCancelRequested(store, runId) {
  const run = store.getAgentRun(runId);
  return run?.status === 'canceled' || Boolean(run?.cancelRequestedAt);
}

async function executeSearchRun({ context, run, searchService, store }) {
  if (!searchService || typeof searchService.search !== 'function') {
    throw new Error('Search service is not configured.');
  }

  const query = context.searchQuery || context.project?.defaultQuery || '';
  const payload = sanitiseSearchResultsPayload(
    await searchService.search({
      mode: 'scout',
      onProgress: (event) => appendRunProgressEvent(store, run.id, event),
      page: toSearchPage(run.input?.page),
      project: context.project,
      query,
      scopes: context.searchScopes,
    }),
  );
  if (isRunCancelRequested(store, run.id)) {
    return;
  }

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
    candidateAssetIds: uniqueStrings([
      ...(run.candidateAssetIds || []),
      ...payload.results.map((paper) => paper.paperId),
    ]),
    finishedAt: nowIso(),
    heartbeatAt: null,
    leaseExpiresAt: null,
    leaseOwner: '',
    outputPayload,
    outputRef: [],
    outputSummary: searchOutputSummary(payload, query),
    status: 'done',
    warning: combineWarnings(payload.warning),
  });
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

function truncateProgressDetail(value, maxLength = 720) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3).trim()}...`;
}

function normaliseProgressEvent(event = {}) {
  const type = String(event.type || 'status').trim().toLowerCase() || 'status';
  const status = String(event.status || 'running').trim().toLowerCase() || 'running';

  return {
    at: event.at || nowIso(),
    detail: truncateProgressDetail(event.detail),
    label: String(event.label || 'Agent update').trim(),
    source: String(event.source || '').trim(),
    status,
    type,
    ...(event.command ? { command: truncateProgressDetail(event.command, 360) } : {}),
    ...(event.exitCode === null || event.exitCode === undefined ? {} : { exitCode: Number(event.exitCode) }),
  };
}

async function appendRunProgressEvent(store, runId, event) {
  const existing = store.getAgentRun(runId);
  if (!existing) {
    return;
  }

  const progressEvents = Array.isArray(existing.progressEvents) ? existing.progressEvents : [];
  await store.updateAgentRun(runId, {
    progressEvents: [...progressEvents, normaliseProgressEvent(event)].slice(-MAX_PROGRESS_EVENTS),
  });
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
      createdAssetIds: assetIdsFromOutputRefs(outputRefs),
      outputRef: outputRefs,
      outputSummary: output.outputSummary || `Reading session created for ${paper.title}.`,
    };
  }

  for (const collectionName of definition.outputCollections) {
    const items = ensureArray(output[collectionName]);
    const ids = [];

    for (const [index, item] of items.entries()) {
      const stored = await store.upsertProjectAsset(collectionName, {
        ...item,
        idempotencyKey: item.idempotencyKey || outputIdempotencyKey({ collectionName, context, index, run }),
        projectId: run.projectId,
        runId: run.id,
        sourceRefs: uniqueSourceRefs(item.sourceRefs || run.assetRefs || []),
      }, {
        matchBy: 'idempotencyKey',
        prefix: collectionName.replace(/s$/, ''),
      });
      ids.push(stored.id);
    }

    if (ids.length) {
      outputRefs.push({ collection: collectionName, ids });
    }
  }

  return {
    createdAssetIds: assetIdsFromOutputRefs(outputRefs),
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
  cancelPollMs = 500,
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
  const runSubscribers = new Map();

  function notifyRun(runId) {
    const listeners = runSubscribers.get(runId);
    if (!listeners?.size) {
      return;
    }

    const payload = getRun(runId);
    if (!payload) {
      return;
    }

    for (const listener of listeners) {
      try {
        listener(payload);
      } catch {
        // Broken subscribers are cleaned up by their request close handlers.
      }
    }
  }

  const notifyingStore = Object.create(store);
  notifyingStore.updateAgentRun = async (runId, patch = {}) => {
    const updated = await store.updateAgentRun(runId, patch);
    notifyRun(runId);
    return updated;
  };
  if (typeof store.claimNextAgentRun === 'function') {
    notifyingStore.claimNextAgentRun = async (options = {}) => {
      const claimed = await store.claimNextAgentRun(options);
      if (claimed) {
        notifyRun(claimed.id);
      }
      return claimed;
    };
  }
  if (typeof store.releaseAgentRun === 'function') {
    notifyingStore.releaseAgentRun = async (runId, options = {}) => {
      const released = await store.releaseAgentRun(runId, options);
      notifyRun(runId);
      return released;
    };
  }

  async function markRunCanceled(runId, patch = {}) {
    return notifyingStore.updateAgentRun(runId, {
      cancelReason: 'user',
      cancelRequestedAt: patch.cancelRequestedAt || nowIso(),
      error: 'Canceled by user.',
      finishedAt: nowIso(),
      heartbeatAt: null,
      leaseExpiresAt: null,
      leaseOwner: '',
      status: 'canceled',
      ...patch,
    });
  }

  async function executeRun(runId) {
    const run = notifyingStore.getAgentRun(runId);
    if (!run) {
      return;
    }
    if (isRunCancelRequested(notifyingStore, runId)) {
      await markRunCanceled(runId, { cancelRequestedAt: run.cancelRequestedAt || nowIso() });
      return;
    }

    const definition = resolveTask(run.stage, run.taskKind);
    let context;
    try {
      context = buildRunContext(notifyingStore, run);
    } catch (error) {
      await notifyingStore.updateAgentRun(runId, {
        error: error.message,
        finishedAt: nowIso(),
        heartbeatAt: null,
        leaseExpiresAt: null,
        leaseOwner: '',
        status: 'done',
      });
      return;
    }

    try {
      await notifyingStore.updateAgentRun(runId, {
        startedAt: nowIso(),
        status: 'running',
      });

      if (isRunCancelRequested(notifyingStore, runId)) {
        await markRunCanceled(runId);
        return;
      }

      if (definition.bootstrap) {
        await definition.bootstrap({ context, run, store: notifyingStore });
      }

      if (isRunCancelRequested(notifyingStore, runId)) {
        await markRunCanceled(runId);
        return;
      }

      if (definition.stage === 'search') {
        await executeSearchRun({ context, run, searchService, store: notifyingStore });
        return;
      }

      const prompt = definition.buildPrompt({ context, run });
      const profile = CAPABILITY_PROFILES[definition.profileId];
      const task = runtime.startJsonTask({
        prompt,
        sandbox: profile.sandbox,
        timeoutMs: DEFAULT_TIMEOUTS[definition.stage],
      });
      let cancelPoll = null;

      activeRuns.set(runId, task.abort);
      if (cancelPollMs > 0) {
        cancelPoll = setInterval(() => {
          if (isRunCancelRequested(notifyingStore, runId)) {
            task.abort();
          }
        }, cancelPollMs);
      }

      const summary = await task.promise.finally(() => {
        if (cancelPoll) {
          clearInterval(cancelPoll);
        }
      });
      const payload = runtime.parseJsonFromMessages(summary);
      const output = normaliseAgentPayload(payload, definition);

      if (isRunCancelRequested(notifyingStore, runId)) {
        await markRunCanceled(runId);
        return;
      }

      const persisted = await persistTaskOutputs({
        context,
        definition,
        output,
        run,
        store: notifyingStore,
      });

      await notifyingStore.updateAgentRun(runId, {
        createdAssetIds: uniqueStrings([...(run.createdAssetIds || []), ...persisted.createdAssetIds]),
        finishedAt: nowIso(),
        heartbeatAt: null,
        leaseExpiresAt: null,
        leaseOwner: '',
        outputRef: persisted.outputRef,
        outputSummary: persisted.outputSummary,
        status: 'done',
        warning: combineWarnings(summary.rawStderr),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (/aborted/i.test(message)) {
        await markRunCanceled(runId);
        return;
      }

      if (definition.stage === 'search') {
        await notifyingStore.updateAgentRun(runId, {
          error: message,
          finishedAt: nowIso(),
          heartbeatAt: null,
          leaseExpiresAt: null,
          leaseOwner: '',
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
        store: notifyingStore,
      });

      await notifyingStore.updateAgentRun(runId, {
        createdAssetIds: uniqueStrings([...(run.createdAssetIds || []), ...persisted.createdAssetIds]),
        finishedAt: nowIso(),
        heartbeatAt: null,
        leaseExpiresAt: null,
        leaseOwner: '',
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
      candidateAssetIds: uniqueStrings(input.candidateAssetIds || []),
      createdAssetIds: uniqueStrings(input.createdAssetIds || []),
      input: input.input || {},
      outputSummary: '',
      profileId: definition.profileId,
      projectId: input.projectId,
      sourceAssetIds: uniqueStrings([...(input.sourceAssetIds || []), ...assetIdsFromRefs(input.assetRefs || [])]),
      stage,
      status: 'queue',
      taskKind: definition.defaultTaskKind,
    });

    notifyRun(run.id);
    void executeRun(run.id);
    return store.getAgentRun(run.id);
  }

  async function abortRun(runId) {
    const run = store.getAgentRun(runId);
    if (!run) {
      throw new Error(`Unknown agent run: ${runId}`);
    }

    const cancelRequestedAt = nowIso();
    await notifyingStore.updateAgentRun(runId, {
      cancelReason: 'user',
      cancelRequestedAt,
    });

    const abort = activeRuns.get(runId);
    if (abort) {
      abort();
    } else {
      await markRunCanceled(runId, { cancelRequestedAt });
    }

    return getRun(runId);
  }

  function subscribeRun(runId, listener) {
    const normalizedRunId = String(runId || '').trim();
    if (!normalizedRunId || typeof listener !== 'function') {
      return () => {};
    }

    const listeners = runSubscribers.get(normalizedRunId) || new Set();
    listeners.add(listener);
    runSubscribers.set(normalizedRunId, listeners);

    return () => {
      listeners.delete(listener);
      if (!listeners.size) {
        runSubscribers.delete(normalizedRunId);
      }
    };
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

  async function processNextQueuedRun({ leaseMs = 60_000, stages = [], workerId = 'agent-worker' } = {}) {
    if (typeof notifyingStore.claimNextAgentRun !== 'function') {
      throw new Error('Store does not support agent run claiming.');
    }

    const claimed = await notifyingStore.claimNextAgentRun({ leaseMs, stages, workerId });
    if (!claimed) {
      return null;
    }

    await executeRun(claimed.id);
    return getRun(claimed.id);
  }

  async function recoverInterruptedRuns() {
    const activeStatuses = new Set(['queue', 'running']);
    const interrupted = store
      .listAgentRuns()
      .filter((run) => activeStatuses.has(String(run.status || '').toLowerCase()));
    const recovered = [];

    for (const run of interrupted) {
      const updated = await notifyingStore.updateAgentRun(run.id, {
        error: 'Agent run was interrupted by server restart. Retry the run to continue.',
        finishedAt: nowIso(),
        heartbeatAt: null,
        leaseExpiresAt: null,
        leaseOwner: '',
        status: 'error',
        warning: combineWarnings(run.warning, 'interrupted by server restart'),
      });
      recovered.push(updated);
    }

    return recovered;
  }

  async function recoverStaleRuns({ now = new Date(), staleMs = 60_000 } = {}) {
    const nowValue = now instanceof Date ? now.toISOString() : String(now || nowIso());
    const nowStamp = Date.parse(nowValue) || Date.now();
    const staleWindow = Number.isFinite(Number(staleMs)) && Number(staleMs) > 0 ? Number(staleMs) : 60_000;
    const staleRuns = store.listAgentRuns().filter((run) => {
      if (String(run.status || '').toLowerCase() !== 'running') {
        return false;
      }

      const leaseExpired = run.leaseExpiresAt && toTimestamp(run.leaseExpiresAt) <= nowStamp;
      const heartbeatExpired = run.heartbeatAt && toTimestamp(run.heartbeatAt) + staleWindow <= nowStamp;
      return Boolean(leaseExpired || heartbeatExpired);
    });
    const recovered = [];

    for (const run of staleRuns) {
      const canceled = isRunCancelRequested(store, run.id);
      const updated = await notifyingStore.updateAgentRun(run.id, {
        error: canceled ? 'Canceled by user.' : 'Agent run heartbeat expired before completion. Retry the run to continue.',
        finishedAt: nowValue,
        heartbeatAt: null,
        leaseExpiresAt: null,
        leaseOwner: '',
        status: canceled ? 'canceled' : 'error',
        warning: canceled ? run.warning : combineWarnings(run.warning, 'stale worker heartbeat'),
      });
      recovered.push(updated);
    }

    return recovered;
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
    processNextQueuedRun,
    recoverInterruptedRuns,
    recoverStaleRuns,
    retryRun,
    subscribeRun,
  };
}
