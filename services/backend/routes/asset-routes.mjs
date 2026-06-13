const PROJECT_ASSET_PATHS = {
  'draft-sections': 'draftSections',
  drafts: 'drafts',
  'evidence-links': 'evidenceLinks',
  'experiment-runs': 'experimentRuns',
  'insight-cards': 'insightCards',
  'insight-notes': 'insightNotes',
  'reading-packets': 'readingPackets',
  'reading-sessions': 'readingSessions',
  'reproduction-plans': 'reproductionPlans',
  'repro-checklist': 'reproChecklistItems',
  'research-questions': 'researchQuestions',
  'result-dossiers': 'resultDossiers',
  'result-comparisons': 'resultComparisons',
  'writing-drafts': 'writingDrafts',
};

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

function parseProjectAssetItemRoute(requestPath) {
  const parts = requestPath.split('/').filter(Boolean);
  if (parts.length !== 5 || parts[0] !== 'api' || parts[1] !== 'projects') {
    return null;
  }

  const collection = PROJECT_ASSET_PATHS[parts[3]];
  if (!collection) {
    return null;
  }

  return {
    collection,
    id: decodeURIComponent(parts[4]),
    projectId: decodeURIComponent(parts[2]),
  };
}

export function createAssetRoutes({ json, parseProjectRoute, readJsonBody, sendError, store }) {
  return async function handleAssetRoute(request, response, { requestPath }) {
    if (request.method === 'GET' && /^\/api\/projects\/[^/]+\/graph$/.test(requestPath)) {
      const projectId = parseProjectRoute(requestPath, 'graph');
      json(response, 200, store.getProjectGraph(projectId));
      return true;
    }

    if (request.method === 'GET' && /^\/api\/projects\/[^/]+\/[a-z-]+$/.test(requestPath)) {
      const assetRoute = parseProjectAssetRoute(requestPath);
      if (assetRoute && assetRoute.collection !== 'readingSessions') {
        json(response, 200, {
          results: store.listProjectAssets(assetRoute.projectId, assetRoute.collection),
        });
        return true;
      }
    }

    if (request.method === 'POST' && /^\/api\/projects\/[^/]+\/[a-z-]+$/.test(requestPath)) {
      const assetRoute = parseProjectAssetRoute(requestPath);
      if (assetRoute && assetRoute.collection !== 'readingSessions') {
        const body = await readJsonBody(request);
        const asset = await store.upsertProjectAsset(assetRoute.collection, {
          ...body,
          projectId: assetRoute.projectId,
        });

        json(response, 201, {
          asset,
        });
        return true;
      }
    }

    if (request.method === 'DELETE' && /^\/api\/projects\/[^/]+\/[a-z-]+\/[^/]+$/.test(requestPath)) {
      const assetRoute = parseProjectAssetItemRoute(requestPath);
      if (assetRoute && assetRoute.collection !== 'readingSessions') {
        if (typeof store.deleteProjectAsset !== 'function') {
          sendError(response, new Error('Asset deletion is not supported by this store.'), 501);
          return true;
        }

        const body = await readJsonBody(request);
        const reason = String(body.reason || '').trim();
        if (body.confirmDelete !== true || !reason) {
          sendError(response, new Error('confirmDelete=true and reason are required to delete project assets.'), 409);
          return true;
        }

        const deleted = await store.deleteProjectAsset(assetRoute.collection, assetRoute.id, {
          projectId: assetRoute.projectId,
        });
        json(response, 200, {
          ...deleted,
          audit: {
            action: 'deleteProjectAsset',
            collection: assetRoute.collection,
            confirmed: true,
            id: assetRoute.id,
            projectId: assetRoute.projectId,
            reason,
            recordedAt: new Date().toISOString(),
          },
        });
        return true;
      }
    }

    return false;
  };
}
