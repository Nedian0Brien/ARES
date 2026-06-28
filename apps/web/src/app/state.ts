import { PROJECT_COLOR_OPTIONS, normalizeWorkflowStage, type WorkflowStageId } from './workflow';
import { parseAresRoute, type ReadingDocumentTab, type ReadingWorkbenchTab } from './router';

export const STORAGE_KEYS = {
  stage: 'ares.stage',
  project: 'ares.project',
  sidebarCollapsed: 'ares.sidebar.collapsed',
  themeMode: 'ares.theme.mode',
} as const;

export const THEME_MODES = ['light', 'dark', 'system'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const SEARCH_LAYOUT_BREAKPOINTS = {
  mobileMax: 900,
  tabletMax: 1279,
} as const;

export const READING_ORIENTATION_BREAKPOINT = 1180;

export type SearchLayout = 'desktop' | 'mobile' | 'tablet';
export type ReadingOrientation = 'horizontal' | 'vertical';

export type AresAppState = {
  booting: boolean;
  hasSearched: boolean;
  loading: boolean;
  readingLoading: boolean;
  readingUploading: boolean;
  readingUploadModalOpen: boolean;
  readingUploadModalFileName: string;
  readingUploadModalFileSizeLabel: string;
  readingPdfDropActive: boolean;
  savingPaperId: string;
  readingStartingPaperId: string;
  error: string;
  activeStage: WorkflowStageId;
  activeProjectId: string;
  activeQuestionId: string;
  searchInput: string;
  projects: unknown[];
  projectModalOpen: boolean;
  projectModalColor: string;
  projectSaving: boolean;
  projectGraph: unknown | null;
  projectLibrary: unknown[];
  results: unknown[];
  availableVenues: unknown[];
  readingSessions: unknown[];
  activeReadingSessionId: string;
  activeReadingRunId: string;
  labSavingRunId: string;
  labImporting: boolean;
  activeInsightCardId: string;
  insightSavingCardId: string;
  activeDraftSectionId: string;
  draftSavingSectionId: string;
  readingView: 'detail' | 'home';
  readingDocumentTab: ReadingDocumentTab;
  readingPdfTargetPage: number | null;
  readingPdfDockPanel: string;
  readingPdfDockSelectionActive: boolean;
  readingPdfSearchQuery: string;
  readingPdfSelection: unknown | null;
  readingPdfSourceHighlight: unknown | null;
  readingPdfZoom: number;
  readingContextMenuOpen: boolean;
  readingWorkbenchTab: ReadingWorkbenchTab;
  readingRailOpen: string;
  readingWorkbenchCollapsed: boolean;
  readingOrientation: ReadingOrientation;
  readingSplitHorizontal: number;
  readingSplitVertical: number;
  readingRailQuery: string;
  readingAssetsFilter: string;
  readingAssetDetailId: string;
  readingRequest: unknown | null;
  readingOptimisticChatMessages: unknown[];
  readingHomeFilter: string;
  readingHomeSelectedPaperId: string;
  readingHomePreviewOpen: boolean;
  readingHomePreviewMenuOpen: boolean;
  readingHomePreviewWidth: number;
  readingHomeLayout: SearchLayout;
  selectedPaperId: string;
  sort: string;
  searchMode: 'keyword' | 'scout';
  searchLayout: SearchLayout;
  searchAgentRun: unknown | null;
  searchAgentTransitioning: boolean;
  filterPanelOpen: boolean;
  previewPanelOpen: boolean;
  scopePicker: string | null;
  scopePickerQuery: string;
  searchScopes: unknown[];
  filterSections: {
    scope: boolean;
    venue: boolean;
    year: boolean;
    rel: boolean;
  };
  workflowOpen: boolean;
  sidebarCollapsed: boolean;
  themeMode: ThemeMode;
  openWorkflowMenu: string;
  mobileActionMenuOpen: boolean;
  searchMeta: {
    provider: string;
    live: boolean;
    total: number;
    query: string;
    warning: string;
    searchMode: 'keyword' | 'scout';
    agentRuntime: string;
  };
  filters: {
    venues: Set<string>;
    years: Set<string>;
    minRelevance: number;
    openAccessOnly: boolean;
    savedOnly: boolean;
  };
};

export function detectSearchLayout(width = globalThis.innerWidth): SearchLayout {
  if (width <= SEARCH_LAYOUT_BREAKPOINTS.mobileMax) {
    return 'mobile';
  }
  if (width <= SEARCH_LAYOUT_BREAKPOINTS.tabletMax) {
    return 'tablet';
  }
  return 'desktop';
}

export function detectReadingHomeLayout(width = globalThis.innerWidth): SearchLayout {
  return detectSearchLayout(width);
}

export function defaultReadingOrientation(width = globalThis.innerWidth): ReadingOrientation {
  return width <= READING_ORIENTATION_BREAKPOINT ? 'vertical' : 'horizontal';
}

export function normalizeThemeMode(mode: string | null | undefined): ThemeMode {
  return THEME_MODES.includes(mode as ThemeMode) ? (mode as ThemeMode) : 'system';
}

export function loadStorage(key: string, fallback: string): string {
  try {
    return globalThis.localStorage?.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

export function defaultReadingRailOpen(): string {
  return '';
}

export function createInitialAresState(): AresAppState {
  const initialRoute = parseAresRoute();
  const searchLayout = detectSearchLayout();
  const readingHomeLayout = detectReadingHomeLayout();
  const readingWorkbenchCollapsed =
    initialRoute.readingView === 'detail' && searchLayout === 'mobile' && !initialRoute.readingWorkbenchRequested;

  return {
    booting: true,
    hasSearched: false,
    loading: false,
    readingLoading: false,
    readingUploading: false,
    readingUploadModalOpen: false,
    readingUploadModalFileName: '',
    readingUploadModalFileSizeLabel: '',
    readingPdfDropActive: false,
    savingPaperId: '',
    readingStartingPaperId: '',
    error: '',
    activeStage: normalizeWorkflowStage(initialRoute.activeStage || loadStorage(STORAGE_KEYS.stage, 'search')),
    activeProjectId: initialRoute.projectId || loadStorage(STORAGE_KEYS.project, ''),
    activeQuestionId: '',
    searchInput: '',
    projects: [],
    projectModalOpen: false,
    projectModalColor: PROJECT_COLOR_OPTIONS[0],
    projectSaving: false,
    projectGraph: null,
    projectLibrary: [],
    results: [],
    availableVenues: [],
    readingSessions: [],
    activeReadingSessionId: initialRoute.activeReadingSessionId || '',
    activeReadingRunId: '',
    labSavingRunId: '',
    labImporting: false,
    activeInsightCardId: '',
    insightSavingCardId: '',
    activeDraftSectionId: '',
    draftSavingSectionId: '',
    readingView: initialRoute.readingView || 'home',
    readingDocumentTab: initialRoute.readingDocumentTab || 'pdf',
    readingPdfTargetPage: null,
    readingPdfDockPanel: '',
    readingPdfDockSelectionActive: false,
    readingPdfSearchQuery: '',
    readingPdfSelection: null,
    readingPdfSourceHighlight: null,
    readingPdfZoom: 100,
    readingContextMenuOpen: false,
    readingWorkbenchTab: initialRoute.readingWorkbenchTab || 'chat',
    readingRailOpen: defaultReadingRailOpen(),
    readingWorkbenchCollapsed,
    readingOrientation: defaultReadingOrientation(),
    readingSplitHorizontal: 62,
    readingSplitVertical: 62,
    readingRailQuery: '',
    readingAssetsFilter: initialRoute.readingAssetsFilter || 'all',
    readingAssetDetailId: initialRoute.readingAssetDetailId || '',
    readingRequest: null,
    readingOptimisticChatMessages: [],
    readingHomeFilter: 'all',
    readingHomeSelectedPaperId: '',
    readingHomePreviewOpen: false,
    readingHomePreviewMenuOpen: false,
    readingHomePreviewWidth: 420,
    readingHomeLayout,
    selectedPaperId: '',
    sort: 'relevance',
    searchMode: 'scout',
    searchLayout,
    searchAgentRun: null,
    searchAgentTransitioning: false,
    filterPanelOpen: searchLayout === 'desktop',
    previewPanelOpen: false,
    scopePicker: null,
    scopePickerQuery: '',
    searchScopes: [],
    filterSections: {
      scope: true,
      venue: true,
      year: false,
      rel: false,
    },
    workflowOpen: true,
    sidebarCollapsed: loadStorage(STORAGE_KEYS.sidebarCollapsed, 'false') === 'true',
    themeMode: normalizeThemeMode(loadStorage(STORAGE_KEYS.themeMode, 'system')),
    openWorkflowMenu: '',
    mobileActionMenuOpen: false,
    searchMeta: {
      provider: 'seed',
      live: false,
      total: 0,
      query: '',
      warning: '',
      searchMode: 'scout',
      agentRuntime: '',
    },
    filters: {
      venues: new Set(),
      years: new Set(['2025', '2024', '2023', 'earlier', 'unknown']),
      minRelevance: 60,
      openAccessOnly: false,
      savedOnly: false,
    },
  };
}
