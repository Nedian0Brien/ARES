import { normalizeWorkflowStage, stageById, workflowTabByStageId, WORKFLOW_TABS, type WorkflowStageId, type WorkflowTabId } from './workflow';

export type AresRoute = {
  projectId: string;
  activeStage: WorkflowStageId;
  stageId: WorkflowStageId;
  tabId: WorkflowTabId;
  searchAgentRunId?: string;
  readingView?: 'detail' | 'home';
  activeReadingSessionId?: string;
  readingDocumentTab?: ReadingDocumentTab;
  readingWorkbenchRequested?: boolean;
  readingWorkbenchTab?: ReadingWorkbenchTab;
  readingAssetsFilter?: string;
  readingAssetDetailId?: string;
};

export type ReadingDocumentTab = 'assets' | 'pdf' | 'summary';
export type ReadingWorkbenchTab = 'chat' | 'notes';

type LocationLike = {
  hash?: string;
};

function decodeRouteSegment(value: string): string {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    return String(value || '');
  }
}

function normalizeReadingDocumentTab(tabId: string | null | undefined): ReadingDocumentTab {
  return tabId === 'summary' || tabId === 'assets' ? tabId : 'pdf';
}

function normalizeReadingWorkbenchTab(tabId: string | null | undefined): ReadingWorkbenchTab {
  return tabId === 'notes' ? 'notes' : 'chat';
}

export function parseAresRoute(locationLike: LocationLike = globalThis.location ?? { hash: '' }): AresRoute {
  const rawHash = String(locationLike.hash || '').replace(/^#\/?/, '');
  const [pathPart, queryPart = ''] = rawHash.split('?');
  const segments = pathPart.split('/').map(decodeRouteSegment).filter(Boolean);
  const params = new URLSearchParams(queryPart);
  let index = 0;
  let projectId = '';

  if (segments[index] === 'projects') {
    projectId = segments[index + 1] || '';
    index += 2;
  }

  const activeStage = normalizeWorkflowStage(segments[index] || params.get('stage') || 'search');
  index += 1;
  const tab = workflowTabByStageId(activeStage);

  const route: AresRoute = {
    activeStage,
    projectId,
    stageId: activeStage,
    tabId: tab.id,
  };

  if (activeStage === 'search') {
    if (segments[index] === 'agent' && segments[index + 1]) {
      route.searchAgentRunId = segments[index + 1];
    }
    return route;
  }

  if (activeStage !== 'reading') {
    return route;
  }

  if (segments[index] === 'sessions' && segments[index + 1]) {
    route.readingView = 'detail';
    route.activeReadingSessionId = segments[index + 1];
    route.readingDocumentTab = normalizeReadingDocumentTab(segments[index + 2] || params.get('doc') || 'pdf');
  } else {
    route.readingView = segments[index] === 'detail' || params.get('view') === 'detail' ? 'detail' : 'home';
    route.activeReadingSessionId = params.get('session') || '';
    route.readingDocumentTab = normalizeReadingDocumentTab(params.get('doc') || 'pdf');
  }

  route.readingWorkbenchRequested = params.has('workbench');
  route.readingWorkbenchTab = normalizeReadingWorkbenchTab(params.get('workbench') || 'chat');
  route.readingAssetsFilter = params.get('assets') || 'all';
  route.readingAssetDetailId = params.get('asset') || '';

  return {
    ...route,
  };
}

export function parseAresHash(hash = globalThis.location?.hash || ''): AresRoute {
  return parseAresRoute({ hash });
}

export function routeHashForTab(projectId: string, tabId: WorkflowTabId): string {
  const tab = WORKFLOW_TABS.find((item) => item.id === tabId) ?? WORKFLOW_TABS[0];
  return `#/projects/${encodeURIComponent(projectId || 'rag-reranker')}/${tab.defaultStage}`;
}

export function routeHashForStage(projectId: string, stageId: WorkflowStageId): string {
  const stage = stageById(stageId);
  return `#/projects/${encodeURIComponent(projectId || 'rag-reranker')}/${stage.id}`;
}
