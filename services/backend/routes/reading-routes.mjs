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

export function createReadingRoutes({
  json,
  notFound,
  parseProjectRoute,
  readJsonBody,
  readRequestBody,
  readingService,
  sanitisePaperPayload,
  sendError,
  store,
  uploadErrorStatus,
}) {
  return async function handleReadingRoute(request, response, { requestPath, url }) {
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
      return true;
    }

    if (request.method === 'GET' && /^\/api\/reading-sessions\/[^/]+\/assets\/[^/]+\/file$/.test(requestPath)) {
      const route = parseReadingSessionAssetFileRoute(requestPath);
      if (!route) {
        notFound(response);
        return true;
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
      return true;
    }

    if (request.method === 'POST' && /^\/api\/reading-sessions\/[^/]+\/parse$/.test(requestPath)) {
      const sessionId = parseReadingSessionId(requestPath);
      json(response, 200, await readingService.parseSession(sessionId));
      return true;
    }

    if (request.method === 'POST' && /^\/api\/reading-sessions\/[^/]+\/import-text$/.test(requestPath)) {
      const sessionId = parseReadingSessionId(requestPath);
      const body = await readJsonBody(request);
      try {
        json(response, 200, await readingService.importTextSession(sessionId, body));
      } catch (error) {
        sendError(response, error, 409);
      }
      return true;
    }

    if (request.method === 'POST' && /^\/api\/reading-sessions\/[^/]+\/summarize$/.test(requestPath)) {
      const sessionId = parseReadingSessionId(requestPath);
      try {
        json(response, 200, await readingService.summarizeSession(sessionId));
      } catch (error) {
        sendError(response, error, 409);
      }
      return true;
    }

    if (request.method === 'POST' && /^\/api\/reading-sessions\/[^/]+\/extract-assets$/.test(requestPath)) {
      const sessionId = parseReadingSessionId(requestPath);
      try {
        json(response, 200, await readingService.extractAssets(sessionId));
      } catch (error) {
        sendError(response, error, 409);
      }
      return true;
    }

    if (request.method === 'POST' && /^\/api\/reading-sessions\/[^/]+\/chat$/.test(requestPath)) {
      const sessionId = parseReadingSessionId(requestPath);
      const body = await readJsonBody(request);
      try {
        json(response, 200, await readingService.chat(sessionId, body));
      } catch (error) {
        sendError(response, error, 409);
      }
      return true;
    }

    if (
      (request.method === 'POST' || request.method === 'PATCH' || request.method === 'DELETE') &&
      /^\/api\/reading-sessions\/[^/]+\/notes(?:\/[^/]+)?$/.test(requestPath)
    ) {
      const route = parseReadingSessionNoteRoute(requestPath);
      if (!route) {
        notFound(response);
        return true;
      }

      if (request.method === 'POST') {
        const body = await readJsonBody(request);
        json(response, 200, await readingService.createNote(route.sessionId, body));
        return true;
      }

      if (!route.noteId) {
        sendError(response, new Error('noteId is required.'), 400);
        return true;
      }

      if (request.method === 'PATCH') {
        const body = await readJsonBody(request);
        json(response, 200, await readingService.updateNote(route.sessionId, route.noteId, body));
        return true;
      }

      json(response, 200, await readingService.deleteNote(route.sessionId, route.noteId));
      return true;
    }

    if (request.method === 'GET' && /^\/api\/projects\/[^/]+\/reading-sessions$/.test(requestPath)) {
      const projectId = parseProjectRoute(requestPath, 'reading-sessions');
      json(response, 200, {
        results: await readingService.listProjectSessions(projectId),
      });
      return true;
    }

    if (request.method === 'POST' && /^\/api\/projects\/[^/]+\/reading-sessions$/.test(requestPath)) {
      const projectId = parseProjectRoute(requestPath, 'reading-sessions');
      const body = await readJsonBody(request);
      const paper = body.paper
        ? sanitisePaperPayload(body.paper)
        : store.getPaper(projectId, String(body.paperId || '').trim());
      if (!paper) {
        sendError(response, new Error('paper or paperId is required.'), 400);
        return true;
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
      return true;
    }

    if (request.method === 'POST' && /^\/api\/projects\/[^/]+\/reading-sessions\/upload$/.test(requestPath)) {
      const projectId = parseProjectRoute(requestPath, 'reading-sessions/upload');
      try {
        const contentType = String(request.headers['content-type'] || '');
        const fileNameHeader = String(request.headers['x-file-name'] || '');
        const decodedFileName = fileNameHeader ? decodeURIComponent(fileNameHeader) : '';
        const body = contentType.includes('application/json') ? await readJsonBody(request) : {};
        const payload = await readingService.createUploadedSession({
          contentBase64: body.contentBase64,
          contentBuffer: contentType.includes('application/json') ? null : await readRequestBody(request),
          fileName: body.fileName || decodedFileName,
          projectId,
          title: body.title,
        });

        json(response, 200, {
          paper: payload.paper,
          project: store.getProject(projectId),
          readingSession: payload.session,
        });
      } catch (error) {
        sendError(response, error, uploadErrorStatus(error));
      }
      return true;
    }

    return false;
  };
}
