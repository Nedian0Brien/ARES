function pageTitle(page) {
  return page.title || page.name || page.id;
}

function folderName(folder) {
  return folder.name || folder.title || folder.id;
}

function descendantFolderIds(folders = [], folderId = '') {
  const selected = String(folderId || '').trim();
  if (!selected || selected === 'all') {
    return null;
  }

  const ids = new Set([selected]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (!ids.has(folder.id) && ids.has(folder.parentId || '')) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}

function filterWikiPages(pages = [], { folder = '', folders = [] } = {}) {
  const folderIds = descendantFolderIds(folders, folder);
  if (!folderIds) {
    return pages;
  }

  return pages.filter((page) => folderIds.has(page.folderId || ''));
}

function buildWikiGraph(pages = [], folders = []) {
  const folderNodes = folders.map((folder) => ({
    id: folder.id,
    kind: 'folder',
    label: folderName(folder),
    parentId: folder.parentId || '',
    type: 'folder',
  }));
  const nodes = pages.map((page) => ({
    folderId: page.folderId || '',
    id: page.id,
    kind: 'page',
    label: pageTitle(page),
    paperIds: Array.isArray(page.paperIds) ? page.paperIds : [],
    tags: Array.isArray(page.tags) ? page.tags : [],
    type: page.type || 'concept',
  }));
  const pageIds = new Set(nodes.map((node) => node.id));
  const folderIds = new Set(folderNodes.map((node) => node.id));
  const containmentEdges = [
    ...folders
      .filter((folder) => folder.parentId && folderIds.has(folder.parentId))
      .map((folder) => ({
        id: `${folder.parentId}:${folder.id}`,
        source: folder.parentId,
        target: folder.id,
        type: 'containment',
      })),
    ...pages
      .filter((page) => page.folderId && folderIds.has(page.folderId))
      .map((page) => ({
        id: `${page.folderId}:${page.id}`,
        source: page.folderId,
        target: page.id,
        type: 'containment',
      })),
  ];
  const semanticSeen = new Set();
  const semanticEdges = pages.flatMap((page) =>
    (Array.isArray(page.links) ? page.links : [])
      .filter((targetId) => pageIds.has(targetId))
      .map((targetId) => {
        const key = [page.id, targetId].sort().join(':');
        if (semanticSeen.has(key)) {
          return null;
        }
        semanticSeen.add(key);
        return {
          id: `${page.id}:${targetId}`,
          source: page.id,
          target: targetId,
          type: 'semantic',
        };
      })
      .filter(Boolean),
  );

  return { edges: [...containmentEdges, ...semanticEdges], nodes: [...folderNodes, ...nodes] };
}

function pageBacklinks(pageId, pages = []) {
  return pages
    .filter((page) => Array.isArray(page.links) && page.links.includes(pageId))
    .map((page) => ({
      id: page.id,
      title: pageTitle(page),
      type: page.type || 'concept',
    }));
}

export { buildWikiGraph, filterWikiPages, pageBacklinks };
