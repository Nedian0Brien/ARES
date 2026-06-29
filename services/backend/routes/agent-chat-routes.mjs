function parseAgentRoute(requestPath) {
  const parts = requestPath.split('/').filter(Boolean);
  if (parts.length < 5 || parts[0] !== 'api' || parts[1] !== 'projects' || parts[3] !== 'agent') {
    return null;
  }

  return {
    messageId: parts[8] === 'save' ? decodeURIComponent(parts[7] || '') : '',
    projectId: decodeURIComponent(parts[2]),
    threadId: parts[5] ? decodeURIComponent(parts[5]) : '',
    type: parts[4] || '',
    verb: parts[6] || '',
  };
}

function messagesForThread(store, projectId, threadId) {
  return store
    .listProjectAssets(projectId, 'agentMessages')
    .filter((message) => message.threadId === threadId)
    .sort((left, right) => Date.parse(left.createdAt || '') - Date.parse(right.createdAt || ''));
}

const TERMINAL_RUN_STATUSES = new Set(['canceled', 'done', 'error']);

function runStatus(runPayload) {
  return String(runPayload?.run?.status || runPayload?.status || '').trim().toLowerCase();
}

function isTerminalRun(runPayload) {
  return TERMINAL_RUN_STATUSES.has(runStatus(runPayload));
}

function clipTitle(value, fallback = 'Saved agent answer') {
  const text = String(value || '').trim() || fallback;
  return text.length > 90 ? `${text.slice(0, 87)}...` : text;
}

function sourceRefsForMessage(thread, message) {
  return [
    {
      id: message.id,
      label: clipTitle(message.text, 'Agent message'),
      type: 'agentMessage',
    },
    {
      id: thread.id,
      label: clipTitle(thread.title, 'Agent thread'),
      type: 'agentThread',
    },
  ];
}

function existingAssistantForRun(store, projectId, threadId, runId) {
  return messagesForThread(store, projectId, threadId).find((message) =>
    message.role === 'assistant' &&
    Array.isArray(message.trace) &&
    message.trace.some((trace) => trace?.runId === runId)
  );
}

async function waitForAgentRunResult(agentRunService, runId, timeoutMs) {
  const first = agentRunService.getRun?.(runId);
  if (isTerminalRun(first) || !agentRunService.subscribeRun || timeoutMs <= 0) {
    return first;
  }

  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe = () => {};
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(payload || agentRunService.getRun?.(runId) || first);
    };
    const timer = setTimeout(() => finish(agentRunService.getRun?.(runId) || first), timeoutMs);
    unsubscribe = agentRunService.subscribeRun(runId, (payload) => {
      if (isTerminalRun(payload)) {
        finish(payload);
      }
    });
    const next = agentRunService.getRun?.(runId);
    if (isTerminalRun(next)) {
      finish(next);
    }
  });
}

async function persistAssistantFromRun({ runPayload, store, projectId, threadId }) {
  if (runStatus(runPayload) !== 'done') {
    return null;
  }
  const run = runPayload.run;
  const answer = String(run.outputPayload?.answer || '').trim();
  if (!answer) {
    return null;
  }
  const existing = existingAssistantForRun(store, projectId, threadId, run.id);
  if (existing) {
    return {
      assistantMessage: existing,
      thread: store.getProjectAsset('agentThreads', threadId),
    };
  }

  const citations = Array.isArray(run.outputPayload?.citations) ? run.outputPayload.citations : [];
  const assistantMessage = await store.upsertProjectAsset('agentMessages', {
    citations,
    projectId,
    role: 'assistant',
    text: answer,
    threadId,
    title: clipTitle(answer, 'Agent answer'),
    trace: [
      {
        outputSummary: run.outputSummary || '',
        runId: run.id,
        stage: run.stage,
        type: 'agentRun',
      },
    ],
  });
  const thread = store.getProjectAsset('agentThreads', threadId);
  const messageIds = Array.from(new Set([...(thread?.messageIds || []), assistantMessage.id]));
  const updatedThread = await store.upsertProjectAsset('agentThreads', {
    ...thread,
    messageIds,
    updatedAt: assistantMessage.createdAt || assistantMessage.updatedAt,
  });
  return {
    assistantMessage,
    thread: updatedThread,
  };
}

function attachAgentRunCompletion({ agentRunService, projectId, runId, store, threadId }) {
  if (!agentRunService?.subscribeRun) {
    return;
  }

  let unsubscribe = () => {};
  const finish = async (payload) => {
    if (!isTerminalRun(payload)) {
      return;
    }
    unsubscribe();
    await persistAssistantFromRun({
      projectId,
      runPayload: payload,
      store,
      threadId,
    });
  };
  unsubscribe = agentRunService.subscribeRun(runId, (payload) => {
    void finish(payload);
  });
  const current = agentRunService.getRun?.(runId);
  if (isTerminalRun(current)) {
    void finish(current);
  }
}

function savedAssetInput(target, { message, projectId, thread, title }) {
  const sourceRefs = sourceRefsForMessage(thread, message);
  if (target === 'idea') {
    return {
      collection: 'insightCards',
      dest: 'Idea',
      input: {
        claim: message.text,
        createdBy: 'user',
        projectId,
        sourceRefs,
        status: 'candidate',
        title,
        type: 'hypothesis',
      },
      kind: 'bulb',
    };
  }

  if (target === 'lab') {
    return {
      collection: 'reproductionPlans',
      dest: 'Lab',
      input: {
        projectId,
        sourceRefs,
        status: 'draft',
        title,
      },
      kind: 'flask',
    };
  }

  if (target === 'wiki') {
    return {
      collection: 'wikiPages',
      dest: 'Wiki',
      input: {
        body: [{ type: 'paragraph', text: message.text }],
        projectId,
        properties: {
          sourceMessageId: message.id,
          sourceRefs,
          threadId: thread.id,
        },
        status: 'draft',
        tags: ['agent'],
        title,
        type: 'concept',
      },
      kind: 'wiki',
    };
  }

  return {
    collection: 'insightNotes',
    dest: 'Note',
    input: {
      projectId,
      properties: {
        sourceMessageId: message.id,
        threadId: thread.id,
      },
      sourceRefs,
      status: 'done',
      summary: message.text,
      tags: ['agent'],
      title,
    },
    kind: 'note',
  };
}

export function createAgentChatRoutes({
  agentChatAutogenerate = true,
  agentRunService,
  agentRunWaitMs = 750,
  json,
  requireProjectAccess,
  readJsonBody,
  sendError,
  store,
}) {
  return async function handleAgentChatRoute(request, response, { requestPath }) {
    const route = parseAgentRoute(requestPath);
    if (!route || route.type !== 'threads') {
      return false;
    }

    if (request.method === 'GET' && !route.threadId) {
      if (!requireProjectAccess(request, response, route.projectId, 'read')) {
        return true;
      }
      json(response, 200, {
        results: store.listProjectAssets(route.projectId, 'agentThreads'),
      });
      return true;
    }

    if (request.method === 'POST' && !route.threadId) {
      if (!requireProjectAccess(request, response, route.projectId, 'write')) {
        return true;
      }
      const body = await readJsonBody(request);
      const thread = await store.upsertProjectAsset('agentThreads', {
        ...body,
        projectId: route.projectId,
      });
      json(response, 201, { thread });
      return true;
    }

    if (route.threadId && route.verb === 'messages' && request.method === 'GET') {
      if (!requireProjectAccess(request, response, route.projectId, 'read')) {
        return true;
      }
      const thread = store.getProjectAsset('agentThreads', route.threadId);
      if (!thread || thread.projectId !== route.projectId) {
        sendError(response, new Error('Agent thread not found.'), 404);
        return true;
      }
      json(response, 200, {
        messages: messagesForThread(store, route.projectId, route.threadId),
        thread,
      });
      return true;
    }

    if (route.messageId && route.verb === 'messages' && request.method === 'POST') {
      if (!requireProjectAccess(request, response, route.projectId, 'write')) {
        return true;
      }
      const thread = store.getProjectAsset('agentThreads', route.threadId);
      if (!thread || thread.projectId !== route.projectId) {
        sendError(response, new Error('Agent thread not found.'), 404);
        return true;
      }
      const message = store.getProjectAsset('agentMessages', route.messageId);
      if (!message || message.projectId !== route.projectId || message.threadId !== route.threadId) {
        sendError(response, new Error('Agent message not found.'), 404);
        return true;
      }

      const body = await readJsonBody(request);
      const target = String(body.target || 'note').trim().toLowerCase();
      if (!['note', 'idea', 'lab', 'wiki'].includes(target)) {
        sendError(response, new Error('Unsupported agent save target.'), 400);
        return true;
      }

      const title = clipTitle(body.title || message.title || message.text);
      const asset = savedAssetInput(target, {
        message,
        projectId: route.projectId,
        thread,
        title,
      });
      const record = await store.upsertProjectAsset(asset.collection, asset.input);
      const artifact = {
        collection: asset.collection,
        dest: asset.dest,
        id: record.id,
        kind: asset.kind,
        target,
        title,
      };
      const updatedMessage = await store.upsertProjectAsset('agentMessages', {
        ...message,
        artifacts: [...(message.artifacts || []), artifact],
      });
      const savedMessageIds = Array.from(new Set([...(thread.savedMessageIds || []), message.id]));
      const updatedThread = await store.upsertProjectAsset('agentThreads', {
        ...thread,
        savedMessageIds,
        updatedAt: updatedMessage.updatedAt,
      });
      json(response, 201, {
        asset: {
          collection: asset.collection,
          record,
        },
        message: updatedMessage,
        saved: true,
        target,
        thread: updatedThread,
      });
      return true;
    }

    if (route.threadId && route.verb === 'messages' && request.method === 'POST') {
      if (!requireProjectAccess(request, response, route.projectId, 'write')) {
        return true;
      }
      const thread = store.getProjectAsset('agentThreads', route.threadId);
      if (!thread || thread.projectId !== route.projectId) {
        sendError(response, new Error('Agent thread not found.'), 404);
        return true;
      }
      const body = await readJsonBody(request);
      const message = await store.upsertProjectAsset('agentMessages', {
        ...body,
        projectId: route.projectId,
        role: body.role || 'user',
        threadId: route.threadId,
      });
      const messageIds = Array.from(new Set([...(thread.messageIds || []), message.id]));
      const nextThread = await store.upsertProjectAsset('agentThreads', {
        ...thread,
        messageIds,
        updatedAt: message.createdAt,
      });

      if (agentChatAutogenerate && message.role === 'user' && agentRunService?.createRun) {
        const run = await agentRunService.createRun({
          input: {
            messages: messagesForThread(store, route.projectId, route.threadId),
            thread: nextThread,
          },
          projectId: route.projectId,
          stage: 'chat',
        });
        const runPayload = await waitForAgentRunResult(agentRunService, run.id, agentRunWaitMs);
        const generated = await persistAssistantFromRun({
          projectId: route.projectId,
          runPayload,
          store,
          threadId: route.threadId,
        });

        if (generated?.assistantMessage) {
          json(response, 202, {
            agentRun: runPayload?.run || run,
            assistantGenerated: true,
            assistantMessage: generated.assistantMessage,
            message,
            status: 'assistant-generated',
            thread: generated.thread,
          });
          return true;
        }

        if (!isTerminalRun(runPayload)) {
          attachAgentRunCompletion({
            agentRunService,
            projectId: route.projectId,
            runId: run.id,
            store,
            threadId: route.threadId,
          });
        }

        json(response, 202, {
          agentRun: runPayload?.run || run,
          assistantGenerated: false,
          assistantQueued: !isTerminalRun(runPayload),
          generationStatus: runStatus(runPayload) || 'queue',
          message,
          status: isTerminalRun(runPayload) ? 'stored-user-message' : 'assistant-queued',
          thread: nextThread,
        });
        return true;
      }

      json(response, 202, {
        assistantGenerated: false,
        message,
        status: 'stored-user-message',
        thread: nextThread,
      });
      return true;
    }

    return false;
  };
}
