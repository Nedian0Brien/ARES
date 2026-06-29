import { buildWikiGraph, filterWikiPages, pageBacklinks } from '../lib/wiki-model.mjs';

function parseProjectWikiRoute(requestPath) {
  const parts = requestPath.split('/').filter(Boolean);
  if (parts.length < 4 || parts[0] !== 'api' || parts[1] !== 'projects' || parts[3] !== 'wiki') {
    return null;
  }

  return {
    action: parts[4] || '',
    id: parts[4] && parts[4] !== 'graph' && parts[4] !== 'synthesize' ? decodeURIComponent(parts[4]) : '',
    projectId: decodeURIComponent(parts[2]),
  };
}

export function createWikiRoutes({ json, requireProjectAccess, readJsonBody, sendError, store }) {
  return async function handleWikiRoute(request, response, { requestPath, url }) {
    const route = parseProjectWikiRoute(requestPath);
    if (!route) {
      return false;
    }

    if (request.method === 'GET' && route.action === 'graph') {
      if (!requireProjectAccess(request, response, route.projectId, 'read')) {
        return true;
      }
      const folders = store.listProjectAssets(route.projectId, 'wikiFolders');
      const pages = filterWikiPages(store.listProjectAssets(route.projectId, 'wikiPages'), {
        folder: url?.searchParams?.get('folder'),
        folders,
      });
      json(response, 200, buildWikiGraph(pages, folders));
      return true;
    }

    if (request.method === 'GET' && !route.action) {
      if (!requireProjectAccess(request, response, route.projectId, 'read')) {
        return true;
      }
      const folders = store.listProjectAssets(route.projectId, 'wikiFolders');
      json(response, 200, {
        folders,
        results: filterWikiPages(store.listProjectAssets(route.projectId, 'wikiPages'), {
          folder: url?.searchParams?.get('folder'),
          folders,
        }),
      });
      return true;
    }

    if (request.method === 'GET' && route.id) {
      if (!requireProjectAccess(request, response, route.projectId, 'read')) {
        return true;
      }
      const pages = store.listProjectAssets(route.projectId, 'wikiPages');
      const page = pages.find((entry) => entry.id === route.id);
      if (!page) {
        sendError(response, new Error('Wiki page not found.'), 404);
        return true;
      }
      json(response, 200, {
        backlinks: pageBacklinks(route.id, pages),
        page,
      });
      return true;
    }

    if (request.method === 'POST' && !route.action) {
      if (!requireProjectAccess(request, response, route.projectId, 'write')) {
        return true;
      }
      const body = await readJsonBody(request);
      const page = await store.upsertProjectAsset('wikiPages', {
        ...body,
        projectId: route.projectId,
      });
      json(response, 201, { page });
      return true;
    }

    if (request.method === 'POST' && route.action === 'synthesize') {
      if (!requireProjectAccess(request, response, route.projectId, 'write')) {
        return true;
      }
      json(response, 202, {
        derived: true,
        message: 'Wiki synthesis is not connected yet. No page was saved.',
        stored: false,
      });
      return true;
    }

    return false;
  };
}
