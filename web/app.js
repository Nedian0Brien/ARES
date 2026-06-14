import { createSearchFeature } from "./app/features/search.js";
import { createReadingFeature } from "./app/features/reading.js";
import { buildDraftExportBundle, createDraftFeatureModel } from "./app/features/draft.js";
import { graphEvidenceItems } from "./app/features/evidence.js";
import { createLabFeatureModel } from "./app/features/lab.js";
import { parseLabImportPayload as parseLabImportPayloadValue } from "./app/features/lab-import.js";
import { createReadingViewHelpers } from "./app/features/reading-view-helpers.js";
import {
  captureStableReadingPdfHost,
  restoreStableReadingPdfHost,
} from "./app/features/reading-dom-patch.js";
import { createReadingPdfController } from "./app/features/reading-pdf-controller.js";
import { createReadingStagePatchController } from "./app/features/reading-stage-patch.js";
import { SURFACE_ROUTE_ALIASES, createSurfaceRouteNormalizer } from "./app/features/surface-router.js";
import { primeAutoHideScrollState, reduceAutoHideScrollState } from "./app/lib/mobile-scroll-auto-hide.js";

const TOKENS = {
  bg: "var(--bg)",
  sb: "var(--sb)",
  s1: "var(--s1)",
  s2: "var(--s2)",
  s3: "var(--s3)",
  b1: "var(--b1)",
  b2: "var(--b2)",
  tx: "var(--tx)",
  t2: "var(--t2)",
  t3: "var(--t3)",
  t4: "var(--t4)",
  search: "#5e9c6f",
  read: "#5e6ad2",
  research: "#8957c9",
  result: "#c07b3a",
  insight: "#c04e68",
  writing: "#3aa3a3",
};

const {
  clampValue,
  readingCategoryMeta,
  readingExcerpt,
  readingMatchSectionIndex,
  readingSectionPage,
  readingSentence,
  readingText,
} = createReadingViewHelpers({ TOKENS });

const SEARCH_MODES = {
  scout: {
    label: "Agent",
    ctaLabel: "Agent Search",
    compactLabel: "Agent",
    icon: "compass",
    color: TOKENS.search,
    desc: "AI 에이전트가 의미 기반으로 탐색",
  },
  keyword: {
    label: "Keyword",
    ctaLabel: "Keyword Search",
    compactLabel: "Keyword",
    icon: "keywordBook",
    color: TOKENS.read,
    desc: "키워드 중심으로 빠르게 탐색",
  },
};

const SEARCH_TARGET_TYPES = {
  conference: { label: "Conference", icon: "building", color: TOKENS.read },
  institution: { label: "Institution", icon: "cap", color: TOKENS.research },
  author: { label: "Author", icon: "user", color: TOKENS.insight },
};

const SEARCH_TARGET_CATALOG = {
  conference: {
    popular: [
      { id: "acl24", label: "ACL 2024", venue: "ACL" },
      { id: "emnlp24", label: "EMNLP 2024", venue: "EMNLP" },
      { id: "neurips24", label: "NeurIPS 2024", venue: "NeurIPS" },
      { id: "iclr24", label: "ICLR 2024", venue: "ICLR" },
      { id: "icml24", label: "ICML 2024", venue: "ICML" },
      { id: "naacl24", label: "NAACL 2024", venue: "NAACL" },
      { id: "cikm24", label: "CIKM 2024", venue: "CIKM" },
      { id: "sigir24", label: "SIGIR 2024", venue: "SIGIR" },
    ],
    recent: [{ id: "icml23", label: "ICML 2023", venue: "ICML" }],
  },
  institution: {
    popular: [
      { id: "stanford_nlp", label: "Stanford NLP Group", kind: "lab" },
      { id: "mit_csail", label: "MIT CSAIL", kind: "lab" },
      { id: "cmu_lti", label: "CMU LTI", kind: "lab" },
      { id: "berkeley_bair", label: "Berkeley AI Research", kind: "lab" },
      { id: "kaist_ai", label: "KAIST AI", kind: "lab" },
      { id: "snu_cs", label: "SNU CSE", kind: "lab" },
      { id: "google_research", label: "Google Research", kind: "corp" },
      { id: "deepmind", label: "Google DeepMind", kind: "corp" },
      { id: "openai", label: "OpenAI", kind: "corp" },
      { id: "anthropic", label: "Anthropic", kind: "corp" },
      { id: "fair", label: "Meta FAIR", kind: "corp" },
      { id: "msr", label: "Microsoft Research", kind: "corp" },
    ],
  },
  author: {
    popular: [
      { id: "cmanning", label: "Christopher Manning", inst: "Stanford" },
      { id: "pliang", label: "Percy Liang", inst: "Stanford" },
      { id: "jason_wei", label: "Jason Wei", inst: "Anthropic" },
      { id: "lukez", label: "Luke Zettlemoyer", inst: "UW · FAIR" },
      { id: "dan_j", label: "Dan Jurafsky", inst: "Stanford" },
    ],
  },
};

const WORKFLOW_TABS = [
  {
    id: "papers",
    label: "Search + Reading",
    shortLabel: "Read",
    sub: "논문 수집과 이해",
    color: TOKENS.read,
    icon: "book",
    kbd: "1",
    defaultStage: "reading",
  },
  {
    id: "lab",
    label: "Research + Result",
    shortLabel: "Lab",
    sub: "재현 설계와 결과 비교",
    color: TOKENS.research,
    icon: "flask",
    kbd: "2",
    defaultStage: "research",
  },
  {
    id: "insight",
    label: "Insight",
    shortLabel: "Insight",
    sub: "해석, 가설, 결정",
    color: TOKENS.insight,
    icon: "sparkles",
    kbd: "3",
    defaultStage: "insight",
  },
  {
    id: "writing",
    label: "Writing",
    shortLabel: "Write",
    sub: "문서 조립과 초안화",
    color: TOKENS.writing,
    icon: "pen",
    kbd: "4",
    defaultStage: "writing",
  },
];

const WORKFLOW_STAGES = [
  {
    id: "search",
    tabId: "papers",
    modeLabel: "Discover",
    label: "Search",
    sub: "논문 서치 및 수집",
    color: TOKENS.search,
    icon: "search",
    kbd: "1",
  },
  {
    id: "reading",
    tabId: "papers",
    modeLabel: "Library",
    label: "Reading",
    sub: "AI 논문 리딩",
    color: TOKENS.read,
    icon: "book",
    kbd: "2",
  },
  {
    id: "research",
    tabId: "lab",
    modeLabel: "Plan",
    label: "Research",
    sub: "재현연구 및 실험",
    color: TOKENS.research,
    icon: "flask",
    kbd: "3",
  },
  {
    id: "result",
    tabId: "lab",
    modeLabel: "Compare",
    label: "Result",
    sub: "결과 도출 및 정리",
    color: TOKENS.result,
    icon: "chart",
    kbd: "4",
  },
  {
    id: "insight",
    tabId: "insight",
    modeLabel: "Claims",
    label: "Insight",
    sub: "인사이트 취합",
    color: TOKENS.insight,
    icon: "sparkles",
    kbd: "5",
  },
  {
    id: "writing",
    tabId: "writing",
    modeLabel: "Draft",
    label: "Writing",
    sub: "논문 작성 보조",
    color: TOKENS.writing,
    icon: "pen",
    kbd: "6",
  },
];

const STAGE_ALIASES = SURFACE_ROUTE_ALIASES;
const normalizeSurfaceStage = createSurfaceRouteNormalizer({
  aliases: STAGE_ALIASES,
  fallback: "search",
  stages: WORKFLOW_STAGES,
});

const STORAGE_KEYS = {
  stage: "ares.stage",
  project: "ares.project",
  sidebarCollapsed: "ares.sidebar.collapsed",
  themeMode: "ares.theme.mode",
};
const THEME_MODES = ["light", "dark", "system"];

const SEARCH_MODE_TRANSITION_MS = 280;
const AGENTIC_SEARCH_PRESS_MS = 780;
const AGENTIC_SEARCH_FOCUS_DELAY_MS = 460;
const AUTO_HIDE_RESUME_GUARD_MS = 240;
const BOTTOM_NAV_AUTO_HIDE_THRESHOLDS = {
  nearTopThreshold: 32,
  hideAfterScrollY: 72,
  hideDeltaThreshold: 8,
  revealDeltaThreshold: 8,
};
const BOTTOM_NAV_SCROLL_SOURCE_SELECTORS = [
  ".workspace",
  ".stage-wrap",
  ".results-list",
  ".search-dashboard",
  ".reading-home-table",
  ".reading-home-preview-scroll",
  ".search-preview-body",
  ".reading-pane .pane-body",
];
const SEARCH_LAYOUT_BREAKPOINTS = {
  mobileMax: 900,
  tabletMax: 1279,
};
const IOS_BROWSER_CHROME_FALLBACK_MIN = 56;
const IOS_BROWSER_CHROME_FALLBACK_MAX = 82;
const IOS_BROWSER_CHROME_FALLBACK_RATIO = 0.096;
const READING_ORIENTATION_BREAKPOINT = 1180;

function defaultReadingOrientation(width = window.innerWidth) {
  return width <= READING_ORIENTATION_BREAKPOINT ? "vertical" : "horizontal";
}

function detectReadingHomeLayout(width = window.innerWidth) {
  if (width <= SEARCH_LAYOUT_BREAKPOINTS.mobileMax) {
    return "mobile";
  }

  if (width <= SEARCH_LAYOUT_BREAKPOINTS.tabletMax) {
    return "tablet";
  }

  return "desktop";
}

const LOCAL_GRAB_HOSTS = new Set(["127.0.0.1", "localhost"]);
const PROXY_DEV_PATH_PATTERN = /^\/proxy\/\d+(?:\/|$)/;

function resolveAppBaseUrl(locationLike = window.location) {
  const current = new URL(locationLike.href);
  const proxyPath = current.pathname.match(PROXY_DEV_PATH_PATTERN)?.[0];

  if (proxyPath) {
    const normalizedProxyPath = proxyPath.endsWith("/") ? proxyPath : `${proxyPath}/`;
    return new URL(normalizedProxyPath, current.origin);
  }

  if (current.pathname.endsWith("/index.html")) {
    const basePath = current.pathname.replace(/index\.html$/, "") || "/";
    return new URL(basePath, current.origin);
  }

  const hasFileExtension = /\.[a-z0-9]+$/i.test(current.pathname);
  if (
    LOCAL_GRAB_HOSTS.has(current.hostname) &&
    current.pathname !== "/" &&
    !current.pathname.endsWith("/") &&
    !hasFileExtension
  ) {
    return new URL(`${current.pathname}/`, current.origin);
  }

  return new URL("./", current);
}

const APP_BASE_URL = resolveAppBaseUrl();
const INITIAL_ROUTE_STATE = parseAresRoute();
const INITIAL_SEARCH_LAYOUT = detectSearchLayout();
const INITIAL_FILTER_PANEL_OPEN = INITIAL_SEARCH_LAYOUT === "desktop";
const INITIAL_PREVIEW_PANEL_OPEN = false;
const INITIAL_READING_HOME_LAYOUT = detectReadingHomeLayout();
const MAX_READING_PDF_UPLOAD_BYTES = 100 * 1024 * 1024;
const MAX_READING_PDF_UPLOAD_LABEL = "100MB";

function defaultReadingRailOpen(layout = detectSearchLayout()) {
  return layout === "desktop" ? "overview" : "";
}

const state = {
  booting: true,
  hasSearched: false,
  loading: false,
  readingLoading: false,
  readingUploading: false,
  readingUploadModalOpen: false,
  readingUploadModalFileName: "",
  readingUploadModalFileSizeLabel: "",
  readingPdfDropActive: false,
  savingPaperId: "",
  readingStartingPaperId: "",
  error: "",
  activeStage: normalizeStage(INITIAL_ROUTE_STATE.activeStage || loadStorage(STORAGE_KEYS.stage, "search")),
  activeProjectId: INITIAL_ROUTE_STATE.projectId || loadStorage(STORAGE_KEYS.project, ""),
  activeQuestionId: "",
  searchInput: "",
  projects: [],
  projectGraph: null,
  projectLibrary: [],
  results: [],
  availableVenues: [],
  readingSessions: [],
  activeReadingSessionId: INITIAL_ROUTE_STATE.activeReadingSessionId || "",
  activeReadingRunId: "",
  labSavingRunId: "",
  labImporting: false,
  activeInsightCardId: "",
  insightSavingCardId: "",
  activeDraftSectionId: "",
  draftSavingSectionId: "",
  readingView: INITIAL_ROUTE_STATE.readingView || "home",
  readingDocumentTab: normalizeReadingDocumentTab(INITIAL_ROUTE_STATE.readingDocumentTab || "pdf"),
  readingPdfTargetPage: null,
  readingPdfDockPanel: "",
  readingPdfDockSelectionActive: false,
  readingPdfSearchQuery: "",
  readingPdfSelection: null,
  readingPdfSourceHighlight: null,
  readingPdfZoom: 100,
  readingContextMenuOpen: false,
  readingWorkbenchTab: normalizeReadingWorkbenchTab(INITIAL_ROUTE_STATE.readingWorkbenchTab || "chat"),
  readingRailOpen: defaultReadingRailOpen(INITIAL_SEARCH_LAYOUT),
  readingWorkbenchCollapsed: false,
  readingOrientation: defaultReadingOrientation(),
  readingSplitHorizontal: 62,
  readingSplitVertical: 62,
  readingRailQuery: "",
  readingAssetsFilter: INITIAL_ROUTE_STATE.readingAssetsFilter || "all",
  readingAssetDetailId: INITIAL_ROUTE_STATE.readingAssetDetailId || "",
  readingRequest: null,
  readingOptimisticChatMessages: [],
  readingHomeFilter: "all",
  readingHomeSelectedPaperId: "",
  readingHomePreviewOpen: false,
  readingHomePreviewMenuOpen: false,
  readingHomePreviewWidth: 420,
  readingHomeLayout: INITIAL_READING_HOME_LAYOUT,
  selectedPaperId: "",
  sort: "relevance",
  searchMode: "scout",
  searchLayout: INITIAL_SEARCH_LAYOUT,
  searchAgentRun: null,
  searchAgentTransitioning: false,
  filterPanelOpen: INITIAL_FILTER_PANEL_OPEN,
  previewPanelOpen: INITIAL_PREVIEW_PANEL_OPEN,
  scopePicker: null,
  scopePickerQuery: "",
  searchScopes: [],
  filterSections: {
    scope: true,
    venue: true,
    year: false,
    rel: false,
  },
  workflowOpen: true,
  sidebarCollapsed: loadStorage(STORAGE_KEYS.sidebarCollapsed, "false") === "true",
  themeMode: normalizeThemeMode(loadStorage(STORAGE_KEYS.themeMode, "system")),
  openWorkflowMenu: "",
  searchMeta: {
    provider: "seed",
    live: false,
    total: 0,
    query: "",
    warning: "",
    searchMode: "scout",
    agentRuntime: "",
  },
  filters: {
    venues: new Set(),
    years: new Set(["2025", "2024", "2023", "earlier", "unknown"]),
    minRelevance: 60,
    openAccessOnly: false,
    savedOnly: false,
  },
};
applyThemeMode(state.themeMode);

const app = document.querySelector("#app");
let modalClosing = false;
let readingUploadModalFile = null;
let activeRunPollTimer = 0;
let activeRunEventSource = null;
let readingResizeDrag = null;
let readingResizeFrame = 0;
let readingHomeResizeDrag = null;
let applyingBrowserRoute = false;
let browserRouteSyncReady = false;
let lastBrowserRouteHash = "";
let browserRouteApplyTimer = 0;
let bottomNavAutoHideState = null;
let bottomNavHidden = false;
let bottomNavScrollFrame = 0;
let bottomNavLifecycleBound = false;
let viewportChromeFrame = 0;
let viewportChromeLifecycleBound = false;

function loadStorage(key, fallback) {
  try {
    return window.localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function saveStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures in restricted browsers.
  }
}

function normalizeThemeMode(mode) {
  return THEME_MODES.includes(mode) ? mode : "system";
}

function resolvedThemeMode(mode = state.themeMode) {
  const normalized = normalizeThemeMode(mode);
  if (normalized !== "system") {
    return normalized;
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyThemeMode(mode = state.themeMode) {
  const normalized = normalizeThemeMode(mode);
  const resolved = resolvedThemeMode(normalized);
  const root = document.documentElement;
  root.dataset.themeMode = normalized;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
}

function setThemeMode(mode) {
  const nextMode = normalizeThemeMode(mode);
  if (nextMode === state.themeMode) {
    applyThemeMode(nextMode);
    return false;
  }

  state.themeMode = nextMode;
  saveStorage(STORAGE_KEYS.themeMode, nextMode);
  applyThemeMode(nextMode);
  return true;
}

function bindThemeModeListener() {
  const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
  if (!mediaQuery) {
    return;
  }

  mediaQuery.addEventListener?.("change", () => {
    if (state.themeMode === "system") {
      applyThemeMode("system");
      render();
    }
  });
}

function normalizeStage(stageId) {
  return normalizeSurfaceStage(stageId);
}

function normalizeReadingDocumentTab(tabId) {
  return ["summary", "pdf", "assets"].includes(tabId) ? tabId : "pdf";
}

function normalizeReadingWorkbenchTab(tabId) {
  return ["chat", "notes"].includes(tabId) ? tabId : "chat";
}

function encodeRouteSegment(value) {
  return encodeURIComponent(String(value || ""));
}

function decodeRouteSegment(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
}

function parseAresRoute(locationLike = window.location) {
  const rawHash = String(locationLike.hash || "").replace(/^#\/?/, "");
  if (!rawHash) {
    return {};
  }

  const [pathPart, queryPart = ""] = rawHash.split("?");
  const segments = pathPart.split("/").map(decodeRouteSegment).filter(Boolean);
  const params = new URLSearchParams(queryPart);
  let index = 0;
  let projectId = "";

  if (segments[index] === "projects") {
    projectId = segments[index + 1] || "";
    index += 2;
  }

  const activeStage = normalizeStage(segments[index] || params.get("stage") || "search");
  index += 1;

  const route = {
    activeStage,
    projectId,
  };

  if (activeStage === "search") {
    if (segments[index] === "agent" && segments[index + 1]) {
      route.searchAgentRunId = segments[index + 1];
    }
    return route;
  }

  if (activeStage !== "reading") {
    return route;
  }

  if (segments[index] === "sessions" && segments[index + 1]) {
    route.readingView = "detail";
    route.activeReadingSessionId = segments[index + 1];
    route.readingDocumentTab = normalizeReadingDocumentTab(segments[index + 2] || params.get("doc") || "pdf");
  } else {
    route.readingView = segments[index] === "detail" || params.get("view") === "detail" ? "detail" : "home";
    route.activeReadingSessionId = params.get("session") || "";
    route.readingDocumentTab = normalizeReadingDocumentTab(params.get("doc") || "pdf");
  }

  route.readingWorkbenchTab = normalizeReadingWorkbenchTab(params.get("workbench") || "chat");
  route.readingAssetsFilter = params.get("assets") || "all";
  route.readingAssetDetailId = params.get("asset") || "";
  return route;
}

function stageById(stageId) {
  return WORKFLOW_STAGES.find((stage) => stage.id === stageId) || WORKFLOW_STAGES[0];
}

function workflowTabById(tabId) {
  return WORKFLOW_TABS.find((tab) => tab.id === tabId) || WORKFLOW_TABS[0];
}

function workflowTabByStageId(stageId) {
  const stage = stageById(normalizeStage(stageId));
  return workflowTabById(stage.tabId);
}

function activeWorkflowTab() {
  return workflowTabByStageId(state.activeStage);
}

async function selectStage(stageId, { transition = true } = {}) {
  state.activeStage = normalizeStage(stageId);
  state.scopePicker = null;
  saveStorage(STORAGE_KEYS.stage, state.activeStage);
  if (state.activeStage === "reading") {
    state.readingView = "home";
    state.readingHomePreviewOpen = false;
    await loadReadingSessions({ preserveSelection: true });
    syncReadingHomeSelection();
  }

  if (transition) {
    renderWithViewTransition();
    return;
  }

  render();
}

async function selectWorkflowTab(tabId, options = {}) {
  const tab = workflowTabById(tabId);
  await selectStage(tab.defaultStage, options);
}

function detectSearchLayout(width = window.innerWidth) {
  if (width <= SEARCH_LAYOUT_BREAKPOINTS.mobileMax) {
    return "mobile";
  }

  if (width <= SEARCH_LAYOUT_BREAKPOINTS.tabletMax) {
    return "tablet";
  }

  return "desktop";
}

function isTabletSearchLayout() {
  return state.searchLayout === "tablet";
}

function defaultFilterPanelOpen(layout = state.searchLayout) {
  return layout === "desktop";
}

function defaultPreviewPanelOpen() {
  return false;
}

function syncResponsiveSearchLayout(nextLayout = detectSearchLayout()) {
  const previousLayout = state.searchLayout;
  if (previousLayout === nextLayout) {
    return false;
  }

  state.searchLayout = nextLayout;
  state.filterPanelOpen = defaultFilterPanelOpen(nextLayout);
  state.previewPanelOpen = defaultPreviewPanelOpen();
  state.scopePicker = null;
  state.scopePickerQuery = "";
  return true;
}

function icon(name, { size = 16, color = "currentColor", className = "" } = {}) {
  const icons = {
    search:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.3-4.3"></path></svg>',
    heroSearch:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>',
    book:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>',
    keywordBook:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5V4.5A1.5 1.5 0 0 1 5.5 3H20v16H5.5A1.5 1.5 0 0 1 4 17.5Z"></path><path d="M8 7h8M8 11h6"></path></svg>',
    compass:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="m15.5 8.5-3 6-6 3 3-6Z"></path></svg>',
    flask:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6"></path><path d="M10 3v6L4.5 18a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 9V3"></path><path d="M7 15h10"></path></svg>',
    chart:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"></path><path d="M7 14l4-4 4 4 5-5"></path></svg>',
    sparkles:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"></path></svg>',
    pdf:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v5h5"></path><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M9 14h6"></path><path d="M9 17h6"></path><path d="M9 11h2"></path></svg>',
    chat:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
    note:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h12l4 4v12H4z"></path><path d="M16 4v4h4"></path><path d="M8 12h8"></path><path d="M8 16h5"></path></svg>',
    grid:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect></svg>',
    send:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"></path><path d="M22 2l-7 20-4-9-9-4 20-7z"></path></svg>',
    highlight:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20l9-9-4-4-9 9v4z"></path><path d="M14 7l4 4"></path><path d="M3 21h7"></path></svg>',
    pen:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3l4 4L7 21H3v-4L17 3z"></path></svg>',
    chevR:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"></path></svg>',
    ctaArrow:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"></path></svg>',
    chevL:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"></path></svg>',
    chevD:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>',
    plus:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"></path></svg>',
    x:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"></path><path d="M6 6l12 12"></path></svg>',
    filter:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 3H2l8 9.5V19l4 2v-8.5L22 3z"></path></svg>',
    globe:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18"></path><path d="M12 3a15 15 0 0 1 0 18"></path><path d="M12 3a15 15 0 0 0 0 18"></path></svg>',
    building:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"></path><path d="M5 21V7l7-4 7 4v14"></path><path d="M9 10h.01"></path><path d="M9 14h.01"></path><path d="M15 10h.01"></path><path d="M15 14h.01"></path><path d="M11 21v-4h2v4"></path></svg>',
    cap:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10l10-5 10 5-10 5-10-5z"></path><path d="M6 12v4c0 1.7 2.7 3 6 3s6-1.3 6-3v-4"></path></svg>',
    user:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21a8 8 0 0 0-16 0"></path><circle cx="12" cy="8" r="4"></circle></svg>',
    history:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 3v6h6"></path><path d="M12 7v5l3 2"></path></svg>',
    clock:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>',
    db:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="7" ry="3"></ellipse><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5"></path><path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"></path></svg>',
    layers:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3L2 8l10 5 10-5-10-5z"></path><path d="M2 12l10 5 10-5"></path><path d="M2 16l10 5 10-5"></path></svg>',
    quote:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M8 11H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3v6l-3 5"></path><path d="M19 11h-3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3v6l-3 5"></path></svg>',
    ext:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><path d="M15 3h6v6"></path><path d="M10 14L21 3"></path></svg>',
    check:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>',
    dot:
      '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4"></circle></svg>',
    git:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M8 12h8M12 8v8"></path></svg>',
    arrowR:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>',
    dl:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="M7 10l5 5 5-5"></path><path d="M12 15V3"></path></svg>',
    share:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"></path></svg>',
    download:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="M7 10l5 5 5-5"></path><path d="M12 15V3"></path></svg>',
    columns:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="7" height="16" rx="1"></rect><rect x="14" y="4" width="7" height="16" rx="1"></rect></svg>',
    rows:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="7" rx="1"></rect><rect x="3" y="14" width="18" height="7" rx="1"></rect></svg>',
    table:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M3 10h18"></path><path d="M3 15h18"></path><path d="M9 5v14"></path><path d="M15 5v14"></path></svg>',
    image:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="M21 15l-5-5-11 11"></path></svg>',
    info:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 8v5"></path><path d="M12 16h.01"></path></svg>',
    list:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13"></path><path d="M8 12h13"></path><path d="M8 18h13"></path><path d="M3 6h.01"></path><path d="M3 12h.01"></path><path d="M3 18h.01"></path></svg>',
    sidebar:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M9 3v18"></path></svg>',
    sun:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="M4.93 4.93l1.41 1.41"></path><path d="M17.66 17.66l1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="M6.34 17.66l-1.41 1.41"></path><path d="M19.07 4.93l-1.41 1.41"></path></svg>',
    moon:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 14.6A8.2 8.2 0 0 1 9.4 3.5a7 7 0 1 0 11.1 11.1Z"></path></svg>',
    monitor:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="13" rx="2"></rect><path d="M8 21h8"></path><path d="M12 17v4"></path></svg>',
    settings:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"></path></svg>',
    moreH:
      '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.4"></circle><circle cx="12" cy="12" r="1.4"></circle><circle cx="18" cy="12" r="1.4"></circle></svg>',
    bookmark:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"></path></svg>',
    status_done:
      '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" fill="currentColor"></circle><path d="M8 12l3 3 5-6" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
    status_run:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" stroke-width="1.75"></circle><path d="M12 3a9 9 0 0 1 9 9" stroke-width="2.5"></path></svg>',
    status_todo:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" stroke-dasharray="2 3"></circle></svg>',
    status_queue:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle></svg>',
  };

  const classes = ["icon", className].filter(Boolean).join(" ");
  return `<span class="${classes}" style="width:${size}px;height:${size}px;color:${color}">${icons[name] || icons.dot}</span>`;
}

function statusColor(status) {
  return {
    done: TOKENS.search,
    running: TOKENS.result,
    todo: TOKENS.t3,
    queue: TOKENS.t4,
    error: TOKENS.insight,
  }[status] || TOKENS.t3;
}

function statusIcon(status) {
  const color = statusColor(status);
  if (status === "done") {
    return icon("status_done", { size: 14, color });
  }

  if (status === "running") {
    return `<span class="pulse">${icon("status_run", { size: 14, color })}</span>`;
  }

  if (status === "todo") {
    return icon("status_todo", { size: 14, color });
  }

  return icon("status_queue", { size: 14, color });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderKbd(value) {
  return `<span class="kbd">${escapeHtml(value)}</span>`;
}

function renderTag(label, color, dot = false) {
  const style = color
    ? ` style="background:color-mix(in srgb, ${color} 8%, transparent);color:${color};border-color:color-mix(in srgb, ${color} 22%, transparent)"`
    : "";
  const dotMarkup = dot ? `<span class="tag-dot" style="background:${color || TOKENS.t3}"></span>` : "";
  return `<span class="tag"${style}>${dotMarkup}${escapeHtml(label)}</span>`;
}

function appUrl(path) {
  return new URL(String(path || "").replace(/^\/+/, ""), APP_BASE_URL);
}

function api(path, options = {}) {
  return fetch(appUrl(path), {
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  }).then(async (response) => {
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      if (response.status === 413) {
        throw new Error(`PDF 파일은 최대 ${MAX_READING_PDF_UPLOAD_LABEL}까지 업로드할 수 있습니다.`);
      }
      throw new Error(payload.error || `Request failed with ${response.status}`);
    }

    return response.json();
  });
}

function syncReadingSession(nextSession) {
  if (!nextSession?.id) {
    return;
  }

  const existingIndex = state.readingSessions.findIndex((entry) => entry.id === nextSession.id);
  if (existingIndex >= 0) {
    state.readingSessions[existingIndex] = nextSession;
  } else {
    state.readingSessions.unshift(nextSession);
  }

  state.readingSessions = sortReadingSessions(state.readingSessions);
  state.activeReadingSessionId = nextSession.id;
}

function clearReadingRequest() {
  state.readingRequest = null;
}

function readingSessionApiPath(sessionId, suffix = "") {
  const tail = suffix ? `/${suffix.replace(/^\/+/, "")}` : "";
  return `api/reading-sessions/${encodeURIComponent(sessionId)}${tail}`;
}

const readingPdfController = createReadingPdfController({
  appUrl,
  baseUrl: APP_BASE_URL,
  getSession: () => selectedReadingSession(),
  getState: () => state,
  readingSessionApiPath,
});

function scheduleReadingHydration() {
  readingPdfController.scheduleHydration();
}

async function handoffReadingToResearch({ noteId = "" } = {}) {
  const project = activeProject();
  const session = selectedReadingSession();
  if (!project || !session?.id) {
    return;
  }

  const readingNotes = Array.isArray(session.notes) ? session.notes : [];
  const noteIds = noteId
    ? [noteId]
    : readingNotes.map((note) => note.id).filter(Boolean);
  const selectedNotes = noteIds.length ? readingNotes.filter((note) => noteIds.includes(note.id)) : readingNotes;
  const readingAssets = Array.isArray(session.assets) ? session.assets : [];
  const readingSections = Array.isArray(session.sections) ? session.sections : [];
  const assetIds = readingAssets.map((asset) => asset.id).filter(Boolean);
  const sectionIds = readingSections.map((section) => section.id).filter(Boolean);
  const graph = state.projectGraph?.project?.id === project.id ? state.projectGraph : null;
  const readingPacket =
    graph?.readingPackets?.find((packet) => packet.id === `packet-${session.id}` || packet.paperId === session.paperId) || null;
  const evidenceLinkIds = Array.from(new Set([
    ...(Array.isArray(readingPacket?.evidenceLinkIds) ? readingPacket.evidenceLinkIds : []),
    ...selectedNotes.map((note) => note.evidenceLinkId).filter(Boolean),
  ]));
  const handoff = {
    assetIds,
    noteIds,
    readingSessionId: session.id,
    sectionIds,
  };
  const sourceRefLabel = (value, fallback) => String(value || fallback).trim().slice(0, 120);
  const sourceRefs = [
    { type: "readingSession", id: session.id, label: sourceRefLabel(session.title, "Reading session") },
    ...selectedNotes.map((note) => ({
      type: "readingNote",
      id: note.id,
      label: sourceRefLabel(note.quote || note.memo || note.note || note.text, "Reading note"),
    })),
    ...readingAssets.map((asset) => ({
      type: "readingAsset",
      id: asset.id,
      label: sourceRefLabel(asset.title || asset.label || asset.fileName || asset.type, "Reading asset"),
    })),
    ...readingSections.map((section) => ({
      type: "readingSection",
      id: section.id,
      label: sourceRefLabel(section.title || section.heading || section.label, "Reading section"),
    })),
  ].filter((entry) => entry.id);
  const paper = readingPaperFromSession(session) || {
    abstract: session.abstract || session.summary || "",
    authors: session.authors || [],
    keyPoints: session.keyPoints || [],
    paperId: session.paperId,
    paperUrl: session.paperUrl || null,
    pdfUrl: session.pdfUrl || null,
    summary: session.summary || session.abstract || "",
    title: session.title || "Untitled paper",
    venue: session.venue || "Unknown",
    year: session.year ?? null,
  };

  const planPayload = await api(`api/projects/${encodeURIComponent(project.id)}/reproduction-plans`, {
    method: "POST",
    body: JSON.stringify({
      checklist: [
        { category: "repo", status: "queue", title: "Confirm code availability" },
        { category: "env", status: "todo", title: "Validate environment setup" },
        { category: "eval", status: "todo", title: "Lock evaluation protocol" },
      ],
      evidenceLinkIds,
      handoff,
      metrics: ["primary score"],
      questionId: activeResearchQuestion()?.id || "",
      readingPacketId: readingPacket?.id || `packet-${session.id}`,
      sourceRefs,
      status: "draft",
    }),
  });

  const payload = await api("api/agent-runs", {
    method: "POST",
    body: JSON.stringify({
      assetRefs: [
        { type: "paper", id: session.paperId, label: session.title || "Paper" },
        { type: "readingSession", id: session.id, label: session.title || "Reading session" },
        { type: "readingPacket", id: readingPacket?.id || `packet-${session.id}`, label: session.title || "Reading packet" },
        { type: "reproductionPlan", id: planPayload.asset?.id || "", label: "Reproduction plan" },
        ...sourceRefs,
      ],
      input: {
        assetIds,
        evidenceLinkIds,
        handoff,
        handoffSource: "reading",
        noteIds,
        paper,
        paperId: session.paperId,
        readingPacketId: readingPacket?.id || `packet-${session.id}`,
        readingSessionId: session.id,
        reproductionPlanId: planPayload.asset?.id || "",
        sectionIds,
        sourceRefs,
      },
      projectId: project.id,
      stage: "research",
    }),
  });

  state.activeStage = "research";
  state.scopePicker = null;
  saveStorage(STORAGE_KEYS.stage, state.activeStage);
  await loadProjectGraph();
  if (payload?.run?.id) {
    state.activeReadingRunId = payload.run.id;
    subscribeAgentRun(payload.run.id);
  }
  renderWithViewTransition();
}

async function createManualExperimentRun() {
  const project = activeProject();
  if (!project) {
    return;
  }

  const plans = Array.isArray(state.projectGraph?.reproductionPlans) ? state.projectGraph.reproductionPlans : [];
  const plan = plans[0] || null;
  if (!plan?.id) {
    state.error = "Create a reproduction plan from Reader first.";
    render();
    return;
  }

  const runPayload = await api(`api/projects/${encodeURIComponent(project.id)}/experiment-runs`, {
    method: "POST",
    body: JSON.stringify({
      config: { source: "manual" },
      kind: "manual",
      metrics: { primary: "pending" },
      notes: "Manual result entry initialized from Lab.",
      reproductionPlanId: plan.id,
      status: "queue",
    }),
  });

  await api(`api/projects/${encodeURIComponent(project.id)}/result-dossiers`, {
    method: "POST",
    body: JSON.stringify({
      comparisons: [
        normaliseLabMetricComparison({
          metricName: "primary",
          metricUnit: "",
          paperMetricValue: "linked evidence",
          reproducedValue: "pending",
          summary: "Manual run created; attach observed metrics after execution.",
        }),
      ],
      evidenceLinkIds: plan.evidenceLinkIds || [],
      experimentRunIds: [runPayload.asset?.id].filter(Boolean),
      paperId: selectedReadingSession()?.paperId || "",
      questionId: plan.questionId || activeResearchQuestion()?.id || "",
      status: "draft",
    }),
  });

  await loadProjectGraph();
  render();
}

function labMetricNumber(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  const number = Number(text.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function labMetricDeltaValue(paperValue, observedValue) {
  const paperNumber = labMetricNumber(paperValue);
  const observedNumber = labMetricNumber(observedValue);
  if (paperNumber === null || observedNumber === null) {
    return null;
  }

  const delta = observedNumber - paperNumber;
  return Math.round(delta * 1000) / 1000;
}

function labMetricDelta(paperValue, observedValue) {
  const deltaValue = labMetricDeltaValue(paperValue, observedValue);
  if (deltaValue === null) {
    return observedValue ? "Needs analysis" : "Awaiting result";
  }

  return `${deltaValue > 0 ? "+" : ""}${deltaValue}`;
}

function normaliseLabMetricComparison({ metricName, metricUnit, paperMetricValue, reproducedValue, summary }) {
  const metric = String(metricName || "primary").trim() || "primary";
  const unit = String(metricUnit || "").trim();
  const paperValue = String(paperMetricValue || "linked evidence").trim() || "linked evidence";
  const observedValue = String(reproducedValue || "").trim();
  const deltaValue = labMetricDeltaValue(paperValue, observedValue);

  return {
    delta: labMetricDelta(paperValue, observedValue),
    deltaValue,
    metric,
    paperValue,
    reproducedValue: observedValue || "pending",
    status: deltaValue === null ? "needs-review" : "measured",
    summary,
    unit,
  };
}

function parseLabImportPayload(payload) {
  return parseLabImportPayloadValue(payload);
}

function buildFailedRunInsightCandidate({ comparison, dossierId, notes, plan, run, runId }) {
  const failureCause = String(notes || run?.notes || run?.error || "Run failed without a recorded cause.")
    .replace(/\s+/g, " ")
    .slice(0, 220);
  const metric = comparison?.metric || Object.keys(run?.metrics || {})[0] || "primary";
  const followUpExperiment = `Fix failure cause and rerun ${metric}.`;

  return {
    claim: `Run failed: ${failureCause}`,
    confidence: "unrated",
    createdBy: "lab",
    evidenceLinkIds: Array.isArray(plan?.evidenceLinkIds) ? plan.evidenceLinkIds : [],
    experimentRunIds: [runId],
    failureCause,
    followUpExperiment,
    nextAction: followUpExperiment,
    questionId: plan?.questionId || activeResearchQuestion()?.id || "",
    resultDossierIds: [dossierId].filter(Boolean),
    sourceRefs: [
      { id: runId, label: run?.title || `${run?.kind || "Manual"} run`, type: "experimentRun" },
      { id: dossierId, label: "Result dossier", type: "resultDossier" },
    ].filter((ref) => ref.id),
    status: "draft",
    type: "hypothesis",
  };
}

const INSIGHT_CLUSTER_STOPWORDS = new Set([
  "about",
  "after",
  "before",
  "between",
  "claim",
  "could",
  "from",
  "into",
  "that",
  "their",
  "there",
  "these",
  "this",
  "with",
  "would",
]);

function insightClaimTerms(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 4 && !INSIGHT_CLUSTER_STOPWORDS.has(term))
    .slice(0, 12);
}

function buildInsightClaimCluster(card = {}, insightCards = []) {
  const terms = Array.from(new Set(insightClaimTerms(card.claim))).slice(0, 3);
  const sharedTerms = terms.length ? terms : ["general"];
  const relatedInsightCardIds = (Array.isArray(insightCards) ? insightCards : [])
    .filter((entry) => {
      if (!entry?.id) {
        return false;
      }

      const entryTerms = new Set(insightClaimTerms(entry.claim));
      return sharedTerms.some((term) => entryTerms.has(term));
    })
    .map((entry) => entry.id)
    .slice(0, 12);
  const evidenceLinkCount = new Set(
    (Array.isArray(insightCards) ? insightCards : [])
      .filter((entry) => relatedInsightCardIds.includes(entry.id))
      .flatMap((entry) => (Array.isArray(entry.evidenceLinkIds) ? entry.evidenceLinkIds : [])),
  ).size;
  const label = sharedTerms.slice(0, 2).join(" ");
  return {
    evidenceLinkCount,
    id: `cluster-${label.replace(/[^a-z0-9가-힣]+/gi, "-").replace(/(^-|-$)/g, "") || "general"}`,
    label,
    relatedInsightCardIds,
    sharedTerms,
  };
}

function evaluateInsightQuality(card = {}, cluster = null) {
  const existing = card.qualityCriteria || {};
  const evidenceCount = Array.isArray(card.evidenceLinkIds) ? card.evidenceLinkIds.length : 0;
  const relatedCount = Array.isArray(cluster?.relatedInsightCardIds) ? cluster.relatedInsightCardIds.length : 0;
  const evidenceCoverage =
    existing.evidenceCoverage && existing.evidenceCoverage !== "unrated"
      ? existing.evidenceCoverage
      : evidenceCount >= 2 || cluster?.evidenceLinkCount >= 3
        ? "strong"
        : evidenceCount === 1
          ? "partial"
          : "weak";
  const contradictionFlag =
    existing.contradictionFlag && existing.contradictionFlag !== "unchecked"
      ? existing.contradictionFlag
      : relatedCount > 1 && card.type === "decision"
        ? "possible"
        : "unchecked";

  return {
    contradictionFlag,
    evidenceCoverage,
    followUpExperimentId: existing.followUpExperimentId || card.experimentRunIds?.[0] || "",
  };
}

function enrichInsightCardForQuality(card, insightCards = []) {
  const cluster = buildInsightClaimCluster(card, insightCards);
  return {
    ...card,
    claimCluster: cluster,
    qualityCriteria: evaluateInsightQuality(card, cluster),
  };
}

function buildInsightClusters(insightCards = []) {
  const clusters = new Map();
  for (const card of insightCards) {
    const cluster = card.claimCluster || buildInsightClaimCluster(card, insightCards);
    if (!cluster?.id) {
      continue;
    }

    const previous = clusters.get(cluster.id) || {
      evidenceLinkCount: 0,
      id: cluster.id,
      label: cluster.label,
      relatedInsightCardIds: [],
      sharedTerms: cluster.sharedTerms || [],
    };
    const relatedIds = Array.from(new Set([...previous.relatedInsightCardIds, ...(cluster.relatedInsightCardIds || []), card.id].filter(Boolean)));
    clusters.set(cluster.id, {
      ...previous,
      evidenceLinkCount: Math.max(previous.evidenceLinkCount, cluster.evidenceLinkCount || 0),
      relatedInsightCardIds: relatedIds,
      sharedTerms: Array.from(new Set([...previous.sharedTerms, ...(cluster.sharedTerms || [])])).slice(0, 8),
    });
  }

  return [...clusters.values()].sort(
    (left, right) =>
      right.relatedInsightCardIds.length - left.relatedInsightCardIds.length ||
      right.evidenceLinkCount - left.evidenceLinkCount ||
      left.label.localeCompare(right.label),
  );
}

function renderInsightClusterSummary(clusters = []) {
  return `
    <div class="insight-cluster-summary">
      <div class="insight-panel-head">
        <span class="insight-card-label">Claim clusters</span>
        ${renderTag(`${clusters.length} groups`, TOKENS.insight, true)}
      </div>
      ${
        clusters.length
          ? clusters
              .slice(0, 4)
              .map(
                (cluster) => `
                  <article class="insight-cluster-card">
                    <strong>${escapeHtml(cluster.label || "general")}</strong>
                    <span>${escapeHtml(String(cluster.relatedInsightCardIds.length))} related claims · ${escapeHtml(String(cluster.evidenceLinkCount || 0))} sources</span>
                  </article>
                `,
              )
              .join("")
          : '<div class="insight-empty-compact">No claim clusters</div>'
      }
    </div>
  `;
}

async function createFailedRunInsightCandidate({ comparison, dossier, notes, plan, project, run, runId }) {
  const insightCards = Array.isArray(state.projectGraph?.insightCards) ? state.projectGraph.insightCards : [];
  const existingCard = insightCards.find((card) => Array.isArray(card.experimentRunIds) && card.experimentRunIds.includes(runId));
  const dossierId = dossier?.id || "";
  const candidate = buildFailedRunInsightCandidate({ comparison, dossierId, notes, plan, run, runId });
  const payload = await api(`api/projects/${encodeURIComponent(project.id)}/insight-cards`, {
    method: "POST",
    body: JSON.stringify({
      ...(existingCard || {}),
      ...candidate,
    }),
  });
  state.activeInsightCardId = payload.asset?.id || existingCard?.id || state.activeInsightCardId;
}

async function importExternalExperimentRun(form) {
  const project = activeProject();
  if (!project || !form) {
    return;
  }

  const plans = Array.isArray(state.projectGraph?.reproductionPlans) ? state.projectGraph.reproductionPlans : [];
  const plan = plans[0] || null;
  if (!plan?.id) {
    state.error = "Create a reproduction plan from Reader first.";
    render();
    return;
  }

  const formData = new FormData(form);
  const parsed = parseLabImportPayload({
    artifactLabel: formData.get("labImportArtifactLabel"),
    artifactUrl: formData.get("labImportArtifactUrl"),
    command: formData.get("labImportCommand"),
    log: formData.get("labImportLog"),
  });
  if (!parsed.observedMetric) {
    state.error = "Paste a run log with at least one metric line.";
    render();
    return;
  }

  const metricUnit = String(formData.get("labImportMetricUnit") || "").trim();
  const paperValue = String(formData.get("labImportPaperMetricValue") || "").trim() || "linked evidence";
  const comparison = normaliseLabMetricComparison({
    metricName: parsed.metricName,
    metricUnit,
    paperMetricValue: paperValue,
    reproducedValue: parsed.observedMetric,
    summary: `Imported ${parsed.metricName}: ${parsed.observedMetric}`,
  });

  state.labImporting = true;
  render();
  try {
    const runPayload = await api(`api/projects/${encodeURIComponent(project.id)}/experiment-runs`, {
      method: "POST",
      body: JSON.stringify({
        artifacts: parsed.artifacts,
        config: {
          ...parsed.config,
          importSource: "external-paste",
        },
        kind: "external-import",
        metrics: parsed.metrics,
        notes: parsed.config.rawLog.slice(0, 600),
        reproductionPlanId: plan.id,
        status: parsed.status,
      }),
    });
    const run = runPayload?.asset || null;
    const runId = run?.id || "";
    const dossierPayload = await api(`api/projects/${encodeURIComponent(project.id)}/result-dossiers`, {
      method: "POST",
      body: JSON.stringify({
        comparisons: [comparison],
        deltaSummary: comparison.delta,
        evidenceLinkIds: plan.evidenceLinkIds || [],
        experimentRunIds: [runId].filter(Boolean),
        paperId: selectedReadingSession()?.paperId || "",
        questionId: plan.questionId || activeResearchQuestion()?.id || "",
        status: parsed.status === "done" ? "done" : "draft",
      }),
    });

    if (parsed.status === "error" && runId) {
      await createFailedRunInsightCandidate({
        comparison,
        dossier: dossierPayload?.asset || null,
        notes: parsed.config.rawLog,
        plan,
        project,
        run,
        runId,
      });
    }

    await loadProjectGraph();
  } finally {
    state.labImporting = false;
    render();
  }
}

async function saveLabExperimentResult(form) {
  const project = activeProject();
  if (!project || !form) {
    return;
  }

  const formData = new FormData(form);
  const runId = String(formData.get("labRunId") || "").trim();
  const observedMetric = String(formData.get("labObservedMetric") || "").trim();
  const status = String(formData.get("labRunStatus") || "queue").trim();
  const notes = String(formData.get("labRunNotes") || "").trim();
  const metricName = String(formData.get("labMetricName") || "primary").trim() || "primary";
  const metricUnit = String(formData.get("labMetricUnit") || "").trim();
  const paperMetricValue = String(formData.get("labPaperMetricValue") || "").trim();
  if (!runId) {
    return;
  }
  if (!observedMetric) {
    state.error = "Enter an observed result before saving.";
    render();
    return;
  }

  const experimentRuns = Array.isArray(state.projectGraph?.experimentRuns) ? state.projectGraph.experimentRuns : [];
  const dossiers = Array.isArray(state.projectGraph?.resultDossiers) ? state.projectGraph.resultDossiers : [];
  const plans = Array.isArray(state.projectGraph?.reproductionPlans) ? state.projectGraph.reproductionPlans : [];
  const run = experimentRuns.find((entry) => entry.id === runId);
  if (!run) {
    state.error = "Unknown experiment run.";
    render();
    return;
  }

  const plan = plans.find((entry) => entry.id === run.reproductionPlanId) || plans[0] || null;
  const existingDossier = dossiers.find((entry) => Array.isArray(entry.experimentRunIds) && entry.experimentRunIds.includes(runId));
  const existingComparison = Array.isArray(existingDossier?.comparisons) ? existingDossier.comparisons[0] : null;
  const paperValue = paperMetricValue || existingComparison?.paperValue || "linked evidence";
  const comparison = normaliseLabMetricComparison({
    metricName,
    metricUnit: metricUnit || existingComparison?.unit || "",
    paperMetricValue: paperValue,
    reproducedValue: observedMetric,
    summary: notes || "Observed metric saved from Lab.",
  });

  state.labSavingRunId = runId;
  render();
  try {
    await api(`api/projects/${encodeURIComponent(project.id)}/experiment-runs`, {
      method: "POST",
      body: JSON.stringify({
        ...run,
        metrics: {
          ...(run.metrics || {}),
          [metricName]: observedMetric,
          primary: observedMetric,
        },
        notes,
        status,
      }),
    });

    const dossierPayload = await api(`api/projects/${encodeURIComponent(project.id)}/result-dossiers`, {
      method: "POST",
      body: JSON.stringify({
        ...(existingDossier || {}),
        comparisons: [comparison],
        deltaSummary: notes || `Observed ${metricName}: ${observedMetric}`,
        evidenceLinkIds: existingDossier?.evidenceLinkIds || plan?.evidenceLinkIds || [],
        experimentRunIds: [runId],
        paperId: existingDossier?.paperId || selectedReadingSession()?.paperId || "",
        questionId: existingDossier?.questionId || plan?.questionId || activeResearchQuestion()?.id || "",
        status: status === "done" ? "done" : "draft",
      }),
    });

    if (status === "error") {
      await createFailedRunInsightCandidate({
        comparison,
        dossier: dossierPayload?.asset || existingDossier || null,
        notes,
        plan,
        project,
        run,
        runId,
      });
    }

    await loadProjectGraph();
  } finally {
    state.labSavingRunId = "";
    render();
  }
}

async function createInsightCardFromEvidence() {
  const project = activeProject();
  if (!project) {
    return;
  }

  const evidence = graphEvidenceItems(state.projectGraph)[0] || null;
  if (!evidence?.text || !evidence.evidenceLinkIds?.length) {
    state.error = "Link evidence before creating an insight card.";
    render();
    return;
  }
  const existingCards = Array.isArray(state.projectGraph?.insightCards) ? state.projectGraph.insightCards : [];
  const draftCard = {
    claim: String(evidence.text).replace(/\s+/g, " ").slice(0, 180),
    confidence: "unrated",
    evidenceLinkIds: evidence.evidenceLinkIds,
    nextAction: "Send to Writing or Lab",
    questionId: activeResearchQuestion()?.id || "",
    type: "claim",
  };
  const evaluatedCard = enrichInsightCardForQuality(draftCard, [...existingCards, draftCard]);

  const payload = await api(`api/projects/${encodeURIComponent(project.id)}/insight-cards`, {
    method: "POST",
    body: JSON.stringify(evaluatedCard),
  });

  state.activeInsightCardId = payload.asset?.id || state.activeInsightCardId;
  await loadProjectGraph();
  render();
}

async function saveInsightCardEdit(form) {
  const project = activeProject();
  if (!project || !form) {
    return;
  }

  const formData = new FormData(form);
  const cardId = String(formData.get("insightCardId") || "").trim();
  const claim = String(formData.get("insightClaim") || "").replace(/\s+/g, " ").trim();
  const contradictionFlag = String(formData.get("insightContradictionFlag") || "unchecked").trim();
  const evidenceCoverage = String(formData.get("insightEvidenceCoverage") || "unrated").trim();
  const followUpExperimentId = String(formData.get("insightFollowUpExperimentId") || "").trim();
  const confidence = String(formData.get("insightConfidence") || "unrated").trim();
  const nextAction = String(formData.get("insightNextAction") || "").replace(/\s+/g, " ").trim();
  const type = String(formData.get("insightType") || "claim").trim();
  if (!cardId || !claim) {
    state.error = "Add a claim before saving.";
    render();
    return;
  }

  const insightCards = Array.isArray(state.projectGraph?.insightCards) ? state.projectGraph.insightCards : [];
  const card = insightCards.find((entry) => entry.id === cardId);
  if (!card) {
    state.error = "Unknown insight card.";
    render();
    return;
  }

  state.insightSavingCardId = cardId;
  render();
  try {
    const nextCard = enrichInsightCardForQuality(
      {
        ...card,
        claim,
        confidence,
        nextAction,
        qualityCriteria: {
          ...(card.qualityCriteria || {}),
          contradictionFlag,
          evidenceCoverage,
          followUpExperimentId,
        },
        type,
      },
      insightCards,
    );
    const payload = await api(`api/projects/${encodeURIComponent(project.id)}/insight-cards`, {
      method: "POST",
      body: JSON.stringify(nextCard),
    });
    state.activeInsightCardId = payload.asset?.id || cardId;
    await loadProjectGraph();
  } finally {
    state.insightSavingCardId = "";
    render();
  }
}

async function deleteInsightCard(cardId) {
  const project = activeProject();
  const insightId = String(cardId || "").trim();
  if (!project || !insightId) {
    return;
  }

  state.insightSavingCardId = insightId;
  render();
  try {
    await api(`api/projects/${encodeURIComponent(project.id)}/insight-cards/${encodeURIComponent(insightId)}`, {
      method: "DELETE",
      body: JSON.stringify({
        confirmDelete: true,
        reason: `Delete insight card ${insightId} from Insight board.`,
      }),
    });
    if (state.activeInsightCardId === insightId) {
      state.activeInsightCardId = "";
    }
    await loadProjectGraph();
  } finally {
    state.insightSavingCardId = "";
    render();
  }
}

async function createFollowUpExperimentFromInsight(cardId = state.activeInsightCardId) {
  const project = activeProject();
  if (!project) {
    return;
  }

  const insightCards = Array.isArray(state.projectGraph?.insightCards) ? state.projectGraph.insightCards : [];
  const insightCard =
    insightCards.find((entry) => entry.id === cardId) ||
    insightCards.find((entry) => entry.id === state.activeInsightCardId) ||
    insightCards[0] ||
    null;
  if (!insightCard?.id) {
    state.error = "Select an insight card before creating a follow-up experiment.";
    render();
    return;
  }

  const plans = Array.isArray(state.projectGraph?.reproductionPlans) ? state.projectGraph.reproductionPlans : [];
  const experimentRuns = Array.isArray(state.projectGraph?.experimentRuns) ? state.projectGraph.experimentRuns : [];
  const linkedRun = experimentRuns.find((run) => (insightCard.experimentRunIds || []).includes(run.id));
  const plan =
    plans.find((entry) => entry.id === linkedRun?.reproductionPlanId) ||
    plans.find((entry) => entry.questionId && entry.questionId === insightCard.questionId) ||
    plans[0] ||
    null;
  if (!plan?.id) {
    state.error = "Create a reproduction plan before follow-up experiments.";
    render();
    return;
  }

  const followUpNote =
    String(insightCard.followUpExperiment || insightCard.nextAction || "").replace(/\s+/g, " ").trim() ||
    `Follow up on insight: ${String(insightCard.claim || "Untitled insight").replace(/\s+/g, " ").slice(0, 160)}`;
  const runPayload = await api(`api/projects/${encodeURIComponent(project.id)}/experiment-runs`, {
    method: "POST",
    body: JSON.stringify({
      config: {
        insightCardId: insightCard.id,
        nextAction: followUpNote,
        source: "insight-follow-up",
        sourceExperimentRunIds: insightCard.experimentRunIds || [],
        sourceResultDossierIds: insightCard.resultDossierIds || [],
      },
      kind: "follow-up",
      metrics: { primary: "pending" },
      notes: followUpNote,
      reproductionPlanId: plan.id,
      status: "queue",
    }),
  });

  const runId = runPayload.asset?.id || "";
  if (runId) {
    const nextCard = enrichInsightCardForQuality(
      {
        ...insightCard,
        experimentRunIds: Array.from(new Set([...(insightCard.experimentRunIds || []), runId])),
        qualityCriteria: {
          ...(insightCard.qualityCriteria || {}),
          followUpExperimentId: runId,
        },
      },
      insightCards,
    );
    await api(`api/projects/${encodeURIComponent(project.id)}/insight-cards`, {
      method: "POST",
      body: JSON.stringify(nextCard),
    });
    state.activeInsightCardId = insightCard.id;
  }

  state.activeStage = "research";
  saveStorage(STORAGE_KEYS.stage, state.activeStage);
  await loadProjectGraph();
  render();
}

async function createDraftSectionFromInsight() {
  const project = activeProject();
  if (!project) {
    return;
  }

  const { acceptedInsightCards, drafts } = createDraftFeatureModel(state.projectGraph);
  const insightCard =
    acceptedInsightCards.find((card) => card.id === state.activeInsightCardId) || acceptedInsightCards[0] || null;
  if (!insightCard?.id) {
    state.error = "Accept an insight card before drafting.";
    render();
    return;
  }

  const draft =
    drafts[0] ||
    (
      await api(`api/projects/${encodeURIComponent(project.id)}/drafts`, {
        method: "POST",
        body: JSON.stringify({
          title: `${project.name || "ARES"} draft`,
        }),
      })
    ).asset;

  const payload = await api(`api/projects/${encodeURIComponent(project.id)}/draft-sections`, {
    method: "POST",
    body: JSON.stringify({
      body: insightCard.claim,
      draftId: draft.id,
      evidenceLinkIds: insightCard.evidenceLinkIds || [],
      insightCardIds: [insightCard.id],
      sectionType: "method",
      title: "Method",
    }),
  });

  state.activeDraftSectionId = payload.asset?.id || state.activeDraftSectionId;
  await loadProjectGraph();
  render();
}

async function saveDraftSectionEdit(form) {
  const project = activeProject();
  if (!project || !form) {
    return;
  }

  const formData = new FormData(form);
  const sectionId = String(formData.get("draftSectionId") || "").trim();
  const title = String(formData.get("draftSectionTitle") || "").replace(/\s+/g, " ").trim();
  const body = String(formData.get("draftSectionBody") || "").trim();
  const sectionType = String(formData.get("draftSectionType") || "section").trim();
  const status = String(formData.get("draftSectionStatus") || "draft").trim();
  if (!sectionId || !title || !body) {
    state.error = "Add a title and draft body before saving.";
    render();
    return;
  }

  const draftSections = Array.isArray(state.projectGraph?.draftSections) ? state.projectGraph.draftSections : [];
  const section = draftSections.find((entry) => entry.id === sectionId);
  if (!section) {
    state.error = "Unknown draft section.";
    render();
    return;
  }

  state.draftSavingSectionId = sectionId;
  render();
  try {
    const payload = await api(`api/projects/${encodeURIComponent(project.id)}/draft-sections`, {
      method: "POST",
      body: JSON.stringify({
        ...section,
        body,
        sectionType,
        status,
        title,
      }),
    });
    state.activeDraftSectionId = payload.asset?.id || sectionId;
    await loadProjectGraph();
  } finally {
    state.draftSavingSectionId = "";
    render();
  }
}

async function deleteDraftSection(sectionId) {
  const project = activeProject();
  const draftSectionId = String(sectionId || "").trim();
  if (!project || !draftSectionId) {
    return;
  }

  state.draftSavingSectionId = draftSectionId;
  render();
  try {
    await api(`api/projects/${encodeURIComponent(project.id)}/draft-sections/${encodeURIComponent(draftSectionId)}`, {
      method: "DELETE",
      body: JSON.stringify({
        confirmDelete: true,
        reason: `Delete draft section ${draftSectionId} from Writing draft.`,
      }),
    });
    if (state.activeDraftSectionId === draftSectionId) {
      state.activeDraftSectionId = "";
    }
    await loadProjectGraph();
  } finally {
    state.draftSavingSectionId = "";
    render();
  }
}

async function exportWritingDraft() {
  const sections = Array.isArray(state.projectGraph?.draftSections) ? state.projectGraph.draftSections : [];
  if (!sections.length) {
    state.error = "Create a draft section before export.";
    render();
    return;
  }

  await copyTextToClipboard(buildWritingExportMarkdown());
  state.error = "";
  render();
}

function buildWritingExportMarkdown() {
  const sections = Array.isArray(state.projectGraph?.draftSections) ? state.projectGraph.draftSections : [];
  const evidenceLinks = Array.isArray(state.projectGraph?.evidenceLinks) ? state.projectGraph.evidenceLinks : [];
  return buildDraftExportBundle({ evidenceLinks, sections }).markdown;
}

function readingCitationText(session) {
  const authors = Array.isArray(session?.authors) && session.authors.length ? session.authors.join(", ") : "Unknown authors";
  const title = session?.title || "Untitled paper";
  const venue = session?.venue || "Unknown venue";
  const year = session?.year ? ` (${session.year})` : "";
  const url = session?.paperUrl || session?.pdfUrl || "";
  return `${authors}. ${title}. ${venue}${year}.${url ? ` ${url}` : ""}`;
}

function readingAssetCitationText(session, asset) {
  const base = readingCitationText(session);
  const kind = asset?.kind || asset?.type || "Asset";
  const number = asset?.number ? ` ${asset.number}` : "";
  const page = asset?.page ? ` p.${asset.page}.` : "";
  const caption = String(asset?.caption || asset?.title || "Untitled asset").replace(/\s+/g, " ").trim();
  return `${base} ${kind}${number}.${page} ${caption}`;
}

function readingGenerationProvenanceLine(source, kind = "summary") {
  const generatedBy = kind === "summary" ? source?.summaryGeneratedBy : source?.generatedBy;
  if (!generatedBy) {
    return "not recorded";
  }

  const label =
    generatedBy === "fallback"
      ? "local fallback"
      : generatedBy === "external-ocr"
        ? "external OCR import"
        : generatedBy === "built-in-ocr"
          ? "built-in OCR"
          : "agent generated";
  const fallbackReason = kind === "summary" ? source?.summaryFallbackReason : source?.fallbackReason;
  return fallbackReason ? `${label} (${fallbackReason})` : label;
}

function readingOcrProvenanceLines(session) {
  const provenance = session?.ocrProvenance;
  if (!provenance) {
    return ["- OCR import: not recorded"];
  }

  return [
    `- OCR import: ${provenance.sourceLabel || "External OCR text"}`,
    `- OCR tool: ${provenance.tool || "not recorded"}`,
    `- OCR generated at: ${provenance.generatedAt || "not recorded"}`,
    `- OCR imported at: ${provenance.importedAt || "not recorded"}`,
    `- OCR pages: ${provenance.pageCount || 0}`,
    `- OCR latency: ${Number.isFinite(Number(provenance.durationMs)) ? `${provenance.durationMs}ms` : "not recorded"}`,
    `- OCR text length: ${provenance.textLength || 0}`,
  ];
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function exportReadingNotes(session) {
  const notes = Array.isArray(session?.notes) ? session.notes : [];
  const lines = [
    `# ${session?.title || "Reading notes"}`,
    "",
    `- Venue: ${session?.venue || "Unknown"}`,
    `- Source: ${session?.paperUrl || session?.pdfUrl || "n/a"}`,
    "",
    "## Generation provenance",
    "",
    `- Summary: ${readingGenerationProvenanceLine(session, "summary")}`,
    ...readingOcrProvenanceLines(session),
    "- Chat turns:",
    ...(Array.isArray(session?.chatMessages) && session.chatMessages.some((message) => message.role === "assistant")
      ? session.chatMessages
          .filter((message) => message.role === "assistant")
          .map((message, index) => `  - ${index + 1}. ${readingGenerationProvenanceLine(message, "chat")}`)
      : ["  - none"]),
    "",
    "## Notes",
    "",
    ...(notes.length
      ? notes.flatMap((note, index) => [
          `### ${index + 1}. ${note.kind || "note"}${note.page ? ` · p.${note.page}` : ""}`,
          "",
          note.quote ? `> ${note.quote}` : "> No quote",
          "",
          note.body || "_No memo yet._",
          "",
        ])
      : ["_No notes yet._", ""]),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeTitle = String(session?.title || "reading-notes").toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").replace(/(^-|-$)/g, "");
  link.href = url;
  link.download = `${safeTitle || "reading-notes"}.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function runReadingRequest(kind, sessionId, task, { preserveRailFocus = false } = {}) {
  state.readingRequest = { kind, sessionId };
  refreshReadingStageUI({ preserveRailFocus });

  try {
    const payload = await task();
    const nextSession = payload?.readingSession || payload?.session || null;
    if (nextSession?.id) {
      syncReadingSession(nextSession);
    }

    return payload;
  } finally {
    clearReadingRequest();
    refreshReadingStageUI({ preserveRailFocus });
  }
}

function activeProject() {
  return state.projects.find((project) => project.id === state.activeProjectId) || state.projects[0] || null;
}

function activeResearchQuestion() {
  const questions = Array.isArray(state.projectGraph?.researchQuestions) ? state.projectGraph.researchQuestions : [];
  return questions.find((question) => question.id === state.activeQuestionId) || questions[0] || null;
}

function buildBrowserRouteHash({ stageId = state.activeStage } = {}) {
  const projectId = state.activeProjectId || activeProject()?.id || "";
  const stage = normalizeStage(stageId);
  const parts = ["projects", encodeRouteSegment(projectId), encodeRouteSegment(stage)];
  const params = new URLSearchParams();

  if (stage === "reading") {
    if (state.readingView === "detail") {
      const sessionId = state.activeReadingSessionId || selectedReadingSession()?.id || "";
      parts.push("sessions", encodeRouteSegment(sessionId), encodeRouteSegment(normalizeReadingDocumentTab(state.readingDocumentTab)));
      const workbench = normalizeReadingWorkbenchTab(state.readingWorkbenchTab);
      if (workbench !== "chat") {
        params.set("workbench", workbench);
      }
      if (state.readingDocumentTab === "assets" && state.readingAssetsFilter && state.readingAssetsFilter !== "all") {
        params.set("assets", state.readingAssetsFilter);
      }
      if (state.readingAssetDetailId) {
        params.set("asset", state.readingAssetDetailId);
      }
    } else {
      parts.push("home");
    }
  } else if (stage === "search" && state.searchAgentRun?.id) {
    parts.push("agent", encodeRouteSegment(state.searchAgentRun.id));
  }

  const query = params.toString();
  return `#/${parts.join("/")}${query ? `?${query}` : ""}`;
}

function browserUrlForRouteHash(hash) {
  const url = new URL(window.location.href);
  url.hash = hash;
  return url.href;
}

function syncBrowserUrlFromState({ replace = false } = {}) {
  if (applyingBrowserRoute || !activeProject()) {
    return;
  }

  const nextHash = buildBrowserRouteHash();
  if (nextHash === lastBrowserRouteHash && window.location.hash === nextHash) {
    return;
  }

  const method = replace || !browserRouteSyncReady ? "replaceState" : "pushState";
  window.history[method]({ aresRoute: true }, "", browserUrlForRouteHash(nextHash));
  lastBrowserRouteHash = nextHash;
  browserRouteSyncReady = true;
}

async function applyBrowserRouteFromUrl() {
  const route = parseAresRoute();
  if (!route.activeStage && !route.projectId) {
    return;
  }

  applyingBrowserRoute = true;
  try {
    const previousProjectId = state.activeProjectId;
    if (route.projectId) {
      state.activeProjectId = route.projectId;
    }

    state.activeStage = normalizeStage(route.activeStage || state.activeStage);
    if (state.activeStage === "search") {
      if (route.searchAgentRunId) {
        state.searchAgentRun = normaliseSearchAgentRun(
          {
            id: route.searchAgentRunId,
            input: {
              query: state.searchInput,
              scopes: state.searchScopes,
            },
            stage: "search",
            status: "running",
          },
          state.searchAgentRun || {},
        );
        subscribeAgentRun(route.searchAgentRunId);
      } else {
        state.searchAgentRun = null;
        state.searchAgentTransitioning = false;
      }
    }

    if (state.activeStage === "reading") {
      state.readingView = route.readingView || "home";
      state.activeReadingSessionId = route.activeReadingSessionId || state.activeReadingSessionId;
      state.readingDocumentTab = normalizeReadingDocumentTab(route.readingDocumentTab || state.readingDocumentTab);
      state.readingWorkbenchTab = normalizeReadingWorkbenchTab(route.readingWorkbenchTab || state.readingWorkbenchTab);
      state.readingAssetsFilter = route.readingAssetsFilter || "all";
      state.readingAssetDetailId = route.readingAssetDetailId || "";
      state.readingHomePreviewOpen = false;
      if (state.readingView === "home") {
        syncReadingHomeSelection();
      }
    }

    saveStorage(STORAGE_KEYS.project, state.activeProjectId);
    saveStorage(STORAGE_KEYS.stage, state.activeStage);

    if (previousProjectId && previousProjectId !== state.activeProjectId) {
      resetSearchState();
      await loadProjectLibrary();
      await loadReadingSessions({ preserveSelection: Boolean(state.activeReadingSessionId) });
    }

    render();
    lastBrowserRouteHash = window.location.hash;
    browserRouteSyncReady = true;
  } finally {
    applyingBrowserRoute = false;
  }
}

function scheduleApplyBrowserRouteFromUrl() {
  if (browserRouteApplyTimer) {
    window.clearTimeout(browserRouteApplyTimer);
  }

  browserRouteApplyTimer = window.setTimeout(() => {
    browserRouteApplyTimer = 0;
    void applyBrowserRouteFromUrl();
  }, 0);
}

function yearBucket(year) {
  if (!year) {
    return "unknown";
  }

  if (year >= 2025) {
    return "2025";
  }

  if (year >= 2024) {
    return "2024";
  }

  if (year >= 2023) {
    return "2023";
  }

  return "earlier";
}

function yearBucketLabel(bucket) {
  return {
    2025: "2025",
    2024: "2024",
    2023: "2023",
    earlier: "Earlier",
    unknown: "Unknown",
  }[bucket] || bucket;
}

function formatAuthors(authors = []) {
  if (!authors.length) {
    return "Unknown authors";
  }

  if (authors.length <= 2) {
    return authors.join(", ");
  }

  return `${authors[0]} et al.`;
}

function compactLink(value) {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    const path = url.pathname === "/" ? "" : url.pathname;
    return `${url.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return value;
  }
}

function visibleResults() {
  const filtered = state.results.filter((paper) => {
    const venueAllowed = state.availableVenues.length ? state.filters.venues.has(paper.venue) : true;
    const yearAllowed = state.filters.years.size ? state.filters.years.has(yearBucket(paper.year)) : false;
    const relevanceAllowed = Number(paper.relevance || 0) >= state.filters.minRelevance;
    const openAccessAllowed = state.filters.openAccessOnly ? Boolean(paper.openAccess) : true;
    const savedAllowed = state.filters.savedOnly ? Boolean(paper.saved) : true;

    return venueAllowed && yearAllowed && relevanceAllowed && openAccessAllowed && savedAllowed;
  });

  const activeSort = state.searchMode === "keyword" ? "cited" : "relevance";
  const sorter = {
    relevance: (left, right) => (right.relevance || 0) - (left.relevance || 0) || (right.citedByCount || 0) - (left.citedByCount || 0),
    recent: (left, right) => (right.year || 0) - (left.year || 0) || (right.relevance || 0) - (left.relevance || 0),
    cited: (left, right) => (right.citedByCount || 0) - (left.citedByCount || 0) || (right.relevance || 0) - (left.relevance || 0),
  }[activeSort];

  return filtered.sort(sorter);
}

function selectedPaper() {
  const visible = visibleResults();
  return visible.find((paper) => paper.paperId === state.selectedPaperId) || visible[0] || null;
}

function syncSelectedPaper() {
  const visible = visibleResults();
  if (!visible.length) {
    state.selectedPaperId = "";
    return;
  }

  if (!visible.some((paper) => paper.paperId === state.selectedPaperId)) {
    state.selectedPaperId = visible[0].paperId;
  }
}

function readingStatusRank(status) {
  return {
    running: 0,
    queue: 1,
    todo: 2,
    done: 3,
  }[status] ?? 4;
}

function sortReadingSessions(sessions = []) {
  return [...sessions].sort((left, right) => {
    const statusDelta = readingStatusRank(left.status) - readingStatusRank(right.status);
    if (statusDelta) {
      return statusDelta;
    }

    const leftStamp = Date.parse(left.updatedAt || left.createdAt || 0) || 0;
    const rightStamp = Date.parse(right.updatedAt || right.createdAt || 0) || 0;
    return rightStamp - leftStamp;
  });
}

function uniqueValues(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function searchRunProgressLabel(run) {
  if (run?.status === "canceled") {
    return "canceled";
  }

  if (run?.status === "error" || run?.error) {
    return "error";
  }

  const output = run?.outputPayload && typeof run.outputPayload === "object" ? run.outputPayload : {};
  const total = Math.max(1, Number(output.total) || (Array.isArray(output.results) ? output.results.length : 0) || 32);

  if (run?.status === "done") {
    return `${total}/${total}`;
  }

  if (run?.status === "queue") {
    return `0/${total}`;
  }

  return `${Math.min(1, total)}/${total}`;
}

function isTerminalAgentRunStatus(status) {
  return status === "done" || status === "error" || status === "canceled";
}

function readingProgress(session) {
  const sections = Array.isArray(session?.sections) ? session.sections : [];
  if (!sections.length) {
    return 0;
  }

  const doneCount = sections.filter((section) => section.status === "done").length;
  return Math.round((doneCount / sections.length) * 100);
}

function deriveReadingNotes(session) {
  const notes = Array.isArray(session?.notes) ? session.notes : [];
  const sections = Array.isArray(session?.sections) ? session.sections : [];
  const cards = [];

  notes.forEach((note, index) => {
    const meta = readingCategoryMeta(note.kind || note.label);
    const sectionIndex = readingMatchSectionIndex(sections, note.sectionId || note.section);
    cards.push({
      id: note.id || `${session?.id || "reading"}-note-${index}`,
      cat: meta.label,
      color: meta.color,
      text: readingExcerpt(note.quote || note.text || note.value, "", 170),
      memo: readingExcerpt(note.body || note.value || sections[index]?.summary || session?.summary, "No memo.", 180),
      pg: note.page || (sectionIndex >= 0 ? readingSectionPage(sectionIndex + 1) : readingSectionPage(index + 1)),
    });
  });

  if (cards.length) {
    return cards.slice(0, 6);
  }

  return (Array.isArray(session?.highlights) ? session.highlights : []).slice(0, 6).map((highlight, index) => ({
    id: highlight.id || `${session?.id || "reading"}-highlight-${index}`,
    cat: readingCategoryMeta(highlight.type).label,
    color: readingCategoryMeta(highlight.type).color,
    text: readingExcerpt(highlight.quote || highlight.text, "Highlight pending", 170),
    memo: "Parse 단계에서 추출된 하이라이트입니다.",
    pg: highlight.page || readingSectionPage(index + 1),
  }));
}

function buildPreviewReadingPaper(project) {
  const keywords = Array.isArray(project?.keywords) ? project.keywords.filter(Boolean).slice(0, 6) : [];
  const focus = readingText(project?.focus, `${project?.name || "Project"} reading workspace`);
  const query = readingText(project?.defaultQuery, keywords.join(", "));
  const timestamp = new Date().toISOString();

  return {
    paperId: `preview-paper-${project?.id || "project"}`,
    title: `${project?.name || "Project"} reading workspace`,
    authors: ["ARES Reader"],
    venue: "Preview session",
    year: new Date().getFullYear(),
    abstract: focus,
    summary: `${focus} Search 탭에서 논문을 저장하면 이 Reading 워크벤치가 실제 구조화 세션으로 이어집니다.`,
    keyPoints: (() => {
      const previewPoints = keywords.slice(0, 3).map((keyword) => `${keyword} 관점에서 핵심 주장과 재현 포인트를 우선 정리합니다.`);
      return previewPoints.length
        ? previewPoints
        : [`${project?.name || "현재 프로젝트"}의 reading workflow를 바로 확인할 수 있는 starter session입니다.`];
    })(),
    keywords,
    matchedKeywords: keywords.slice(0, 4),
    paperUrl: "",
    pdfUrl: "",
    sourceName: "ARES preview",
    sourceProvider: "preview",
    citedByCount: 0,
    openAccess: true,
    relevance: 91,
    savedAt: timestamp,
    updatedAt: timestamp,
    query,
  };
}

function buildPreviewReadingSections(project, paper) {
  const focus = readingSentence(project?.focus, `${paper?.title || "Paper"} overview`);
  const summary = readingSentence(paper?.summary || paper?.abstract, focus);
  const keyPoints = Array.isArray(paper?.keyPoints) ? paper.keyPoints.filter(Boolean) : [];
  const keywords = Array.isArray(paper?.keywords) ? paper.keywords.filter(Boolean) : [];

  return [
    {
      id: "overview",
      label: "1. Overview",
      status: "done",
      summary: focus,
    },
    {
      id: "method",
      label: "2. Method / Setup",
      status: "done",
      summary: readingSentence(keyPoints[0], summary || focus),
    },
    {
      id: "result",
      label: "3. Result Snapshot",
      status: "done",
      summary: readingSentence(
        keyPoints[1],
        `${paper?.title || "This work"}의 주요 결과와 효율 포인트를 빠르게 비교할 수 있도록 정리합니다.`,
      ),
    },
    {
      id: "limit",
      label: "4. Limits & Follow-up",
      status: "done",
      summary: readingSentence(
        keyPoints[2],
        `${keywords.slice(0, 2).join(", ") || "후속 검토"} 관점에서 한계와 다음 액션을 정리합니다.`,
      ),
    },
  ];
}

function buildPreviewReadingSession(project, paper, index = 0) {
  const safePaper = paper || buildPreviewReadingPaper(project);
  const keywords = Array.isArray(safePaper.keywords) ? safePaper.keywords.filter(Boolean).slice(0, 6) : [];
  const keyPoints = Array.isArray(safePaper.keyPoints) ? safePaper.keyPoints.filter(Boolean).slice(0, 4) : [];
  const sections = buildPreviewReadingSections(project, safePaper);
  const sessionId = `preview-session-${project?.id || "project"}-${safePaper.paperId || index}`;
  const timestamp = safePaper.updatedAt || safePaper.savedAt || new Date().toISOString();
  const focus = readingSentence(project?.focus, safePaper.summary || safePaper.abstract || safePaper.title || "Reading preview");
  const summary = readingSentence(
    safePaper.summary || safePaper.abstract,
    `${safePaper.title || "Saved paper"}를 Reading 워크벤치에서 바로 검토할 수 있도록 starter session을 구성했습니다.`,
  );
  const sourceProvider = readingText(safePaper.sourceProvider, "preview");
  const usingProjectPreview = sourceProvider === "preview";

  return {
    id: sessionId,
    projectId: project?.id || "",
    runId: "",
    paperId: safePaper.paperId || sessionId,
    title: safePaper.title || `${project?.name || "Project"} reading workspace`,
    authors: Array.isArray(safePaper.authors) && safePaper.authors.length ? safePaper.authors.slice(0, 8) : ["ARES Reader"],
    venue: safePaper.venue || "Preview session",
    year: safePaper.year ?? null,
    abstract: safePaper.abstract || focus,
    summary,
    keyPoints,
    keywords,
    matchedKeywords: Array.isArray(safePaper.matchedKeywords) ? safePaper.matchedKeywords.slice(0, 6) : keywords.slice(0, 4),
    citedByCount: Number(safePaper.citedByCount) || 0,
    openAccess: safePaper.openAccess !== false,
    relevance: Number(safePaper.relevance) || 0,
    paperUrl: safePaper.paperUrl || "",
    pdfUrl: safePaper.pdfUrl || "",
    sourceName: safePaper.sourceName || (usingProjectPreview ? "ARES preview" : "Saved paper"),
    sourceProvider,
    status: "done",
    warning: usingProjectPreview ? "Saved paper가 아직 없어 프로젝트 focus 기반 preview session을 표시 중입니다." : "",
    createdAt: safePaper.savedAt || timestamp,
    updatedAt: timestamp,
    sections,
    highlights: [
      {
        id: `${sessionId}-highlight-claim`,
        type: "claim",
        text: summary,
        section: "overview",
      },
      {
        id: `${sessionId}-highlight-method`,
        type: "method",
        text: readingSentence(keyPoints[0], sections[1]?.summary || summary),
        section: "method",
      },
      {
        id: `${sessionId}-highlight-result`,
        type: "result",
        text: readingSentence(keyPoints[1], sections[2]?.summary || sections[1]?.summary || summary),
        section: "result",
      },
      {
        id: `${sessionId}-highlight-limit`,
        type: "limit",
        text: readingSentence(keyPoints[2], sections[3]?.summary || focus),
        section: "limit",
      },
    ],
    notes: [
      {
        id: `${sessionId}-note-focus`,
        label: "summary",
        value: focus,
      },
      {
        id: `${sessionId}-note-followup`,
        label: "note",
        value: readingSentence(
          safePaper.query,
          `${project?.name || "현재 프로젝트"} 기준으로 후속 실험과 비교 포인트를 이어서 정리합니다.`,
        ),
      },
    ],
    reproParams: [
      {
        id: `${sessionId}-param-focus`,
        label: "Project focus",
        value: focus,
      },
      {
        id: `${sessionId}-param-keywords`,
        label: "Matched keywords",
        value: keywords.join(", ") || "No keywords yet",
      },
      {
        id: `${sessionId}-param-access`,
        label: "Open access",
        value: safePaper.openAccess === false ? "Manual source check needed" : "Likely reproducible with public sources",
      },
    ],
  };
}

function buildPreviewReadingSessions(project) {
  if (!project) {
    return [];
  }

  const papers = Array.isArray(project.recentLibrary) && project.recentLibrary.length ? project.recentLibrary : [buildPreviewReadingPaper(project)];
  return sortReadingSessions(papers.map((paper, index) => buildPreviewReadingSession(project, paper, index)));
}

function effectiveReadingSessions(project = activeProject()) {
  if (state.readingSessions.length) {
    return sortReadingSessions(state.readingSessions);
  }

  if (Array.isArray(project?.recentReadingSessions) && project.recentReadingSessions.length) {
    return sortReadingSessions(project.recentReadingSessions);
  }

  return [];
}

function actualReadingSessions(project = activeProject()) {
  return effectiveReadingSessions(project);
}

function currentProjectLibrary() {
  return Array.isArray(state.projectLibrary) ? [...state.projectLibrary] : [];
}

function parseTimestamp(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortByRecentTimestamp(values = [], keys = ["updatedAt", "savedAt", "queuedAt", "createdAt"]) {
  return [...values].sort((left, right) => {
    const leftTimestamp = keys.map((key) => parseTimestamp(left?.[key])).find(Boolean) || 0;
    const rightTimestamp = keys.map((key) => parseTimestamp(right?.[key])).find(Boolean) || 0;
    return rightTimestamp - leftTimestamp;
  });
}

function dashboardLibraryItems() {
  return sortByRecentTimestamp(currentProjectLibrary(), ["savedAt", "updatedAt", "createdAt"]);
}

function dashboardQueuedPaperIds(project = activeProject()) {
  return new Set(
    actualReadingSessions(project)
      .filter((session) => ["queue", "running"].includes(session.status))
      .map((session) => session.paperId)
      .filter(Boolean),
  );
}

function dashboardPercent(part, total) {
  if (!total) {
    return 0;
  }

  return Math.round((part / total) * 1000) / 10;
}

function dashboardRecentCount(items = [], days = 7, keys = ["savedAt", "updatedAt", "createdAt"]) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return items.filter((item) => (keys.map((key) => parseTimestamp(item?.[key])).find(Boolean) || 0) >= cutoff).length;
}

function dashboardRelativeAge(value) {
  const timestamp = parseTimestamp(value);
  if (!timestamp) {
    return "—";
  }

  const deltaDays = Math.max(0, Math.floor((Date.now() - timestamp) / (24 * 60 * 60 * 1000)));
  if (deltaDays === 0) {
    return "today";
  }

  if (deltaDays < 30) {
    return `${deltaDays}d`;
  }

  const weeks = Math.max(1, Math.round(deltaDays / 7));
  return `${weeks}w`;
}

function dashboardDailyCounts(items = [], days = 30, keys = ["savedAt", "updatedAt", "createdAt"]) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const counts = Array.from({ length: days }, () => 0);

  items.forEach((item) => {
    const timestamp = keys.map((key) => parseTimestamp(item?.[key])).find(Boolean) || 0;
    if (!timestamp) {
      return;
    }

    const delta = Math.floor((todayStart - timestamp) / dayMs);
    if (delta < 0 || delta >= days) {
      return;
    }

    counts[days - delta - 1] += 1;
  });

  return counts;
}

function dashboardCumulativeCounts(items = [], days = 30, keys = ["savedAt", "updatedAt", "createdAt"]) {
  const daily = dashboardDailyCounts(items, days, keys);
  const total = items.length;
  let runningTotal = total - daily.reduce((sum, value) => sum + value, 0);
  return daily.map((value) => {
    runningTotal += value;
    return runningTotal;
  });
}

function dashboardSeriesPath(values = [], width, height, { padTop = 2, padBottom = 2 } = {}) {
  if (!values.length) {
    return "";
  }

  const top = padTop;
  const bottom = Math.max(top + 1, height - padBottom);
  const usableHeight = Math.max(1, bottom - top);
  const maxValue = Math.max(...values, 1);
  const step = values.length === 1 ? 0 : width / (values.length - 1);
  const points = values.map((value, index) => {
    const x = Number((step * index).toFixed(2));
    const ratio = maxValue ? value / maxValue : 0;
    const y = Number((bottom - ratio * usableHeight).toFixed(2));
    return { x, y };
  });

  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
}

function dashboardAreaPath(values = [], width, height, options = {}) {
  const linePath = dashboardSeriesPath(values, width, height, options);
  if (!linePath) {
    return "";
  }

  const step = values.length === 1 ? 0 : width / (values.length - 1);
  const lastX = Number((step * Math.max(values.length - 1, 0)).toFixed(2));
  return `${linePath} L${lastX},${height} L0,${height} Z`;
}

function dashboardVenueBreakdown(library = []) {
  const counts = new Map();
  library.forEach((paper) => {
    const venue = String(paper?.venue || "Unknown").trim() || "Unknown";
    counts.set(venue, (counts.get(venue) || 0) + 1);
  });

  return [...counts.entries()]
    .map(([venue, count]) => ({ venue, count }))
    .sort((left, right) => right.count - left.count || left.venue.localeCompare(right.venue));
}

function dashboardPaperTags(paper) {
  return uniqueValues([...(paper?.matchedKeywords || []), ...(paper?.keywords || [])]).filter(Boolean).slice(0, 3);
}

function readingPaperFromSession(session) {
  if (!session) {
    return null;
  }

  return {
    abstract: session.abstract || "",
    authors: Array.isArray(session.authors) ? session.authors : [],
    citedByCount: Number(session.citedByCount) || 0,
    keyPoints: Array.isArray(session.keyPoints) ? session.keyPoints : [],
    keywords: Array.isArray(session.keywords) ? session.keywords : [],
    matchedKeywords: Array.isArray(session.matchedKeywords) ? session.matchedKeywords : [],
    openAccess: Boolean(session.openAccess),
    paperId: session.paperId,
    paperUrl: session.paperUrl || null,
    pdfUrl: session.pdfUrl || null,
    relevance: Number(session.relevance) || 0,
    sourceName: session.sourceName || "Reading",
    sourceProvider: session.sourceProvider || "reading",
    summary: session.summary || session.summaryCards?.tldr || session.abstract || "",
    title: session.title || "Untitled paper",
    updatedAt: session.updatedAt || session.startedAt || session.createdAt || "",
    venue: session.venue || "Unknown venue",
    year: session.year ?? null,
  };
}

function readingHomeStatusMeta(paper, session) {
  const parseStatus = String(session?.parseStatus || "").toLowerCase();
  const summaryStatus = String(session?.summaryStatus || "").toLowerCase();
  if (summaryStatus === "done") {
    return { bucket: "done", label: "Completed", color: TOKENS.search };
  }

  if (parseStatus === "running" || summaryStatus === "running") {
    return { bucket: "running", label: "In progress", color: TOKENS.result };
  }

  if (parseStatus === "done") {
    return { bucket: "ready", label: "Parsed", color: TOKENS.read };
  }

  if (parseStatus === "error" || summaryStatus === "error") {
    return { bucket: "saved", label: "Needs retry", color: TOKENS.result };
  }

  if (paper?.pdfUrl || session?.pdfUrl) {
    return { bucket: "ready", label: "Ready", color: TOKENS.read };
  }

  return { bucket: "saved", label: "Saved", color: TOKENS.t3 };
}

function readingHomeActionMeta(item) {
  if (item?.session?.summaryStatus === "running" || item?.session?.parseStatus === "running") {
    return {
      primaryLabel: "Resume Reading",
      primaryIcon: "book",
      secondaryLabel: "Back to Search",
      secondaryIcon: "search",
    };
  }

  if (item?.session?.summaryStatus === "done" || item?.session?.parseStatus === "done") {
    return {
      primaryLabel: "Open Reading",
      primaryIcon: "note",
      secondaryLabel: "Back to Search",
      secondaryIcon: "search",
    };
  }

  return {
    primaryLabel: "Open Reading",
    primaryIcon: "arrowR",
    secondaryLabel: "Back to Search",
    secondaryIcon: "search",
  };
}

function readingHomeSessionMap(project = activeProject()) {
  return new Map(
    actualReadingSessions(project)
      .filter((session) => session?.paperId)
      .map((session) => [session.paperId, session]),
  );
}

function readingHomeItems(project = activeProject()) {
  const library = sortByRecentTimestamp(currentProjectLibrary(), ["savedAt", "updatedAt", "createdAt"]);
  const sessionMap = readingHomeSessionMap(project);

  return library.map((paper) => {
    const session = sessionMap.get(paper.paperId) || null;
    const mergedPaper = {
      ...(readingPaperFromSession(session) || {}),
      ...paper,
    };
    const status = readingHomeStatusMeta(mergedPaper, session);
    const tags = uniqueValues([...(mergedPaper.matchedKeywords || []), ...(mergedPaper.keywords || [])]).slice(0, 4);
    const progress = session ? readingProgress(session) : 0;
    const notes = session ? deriveReadingNotes(session) : [];
    const sections = Array.isArray(session?.sections) ? session.sections : [];
    const lastActivityTimestamp =
      session?.updatedAt || session?.startedAt || session?.createdAt || mergedPaper.updatedAt || mergedPaper.savedAt || mergedPaper.createdAt || "";

    return {
      abstract: mergedPaper.summary || mergedPaper.abstract || "",
      authorsLabel: formatAuthors(mergedPaper.authors || []),
      hasPdf: Boolean(mergedPaper.pdfUrl || session?.pdfUrl),
      lastActivityLabel: readingHomeTimestampLabel(lastActivityTimestamp),
      noteCount: notes.length,
      paper: mergedPaper,
      paperId: mergedPaper.paperId,
      progress,
      savedLabel: dashboardRelativeAge(mergedPaper.savedAt || mergedPaper.updatedAt || mergedPaper.createdAt),
      sectionCount: sections.length,
      session,
      status,
      tags,
      title: mergedPaper.title || "Untitled paper",
      venue: mergedPaper.venue || "Unknown venue",
      year: mergedPaper.year ?? null,
    };
  });
}

function readingHomeCounts(items = []) {
  return {
    saved: items.length,
    ready: items.filter((item) => item.status.bucket === "ready").length,
    running: items.filter((item) => item.status.bucket === "running").length,
    done: items.filter((item) => item.status.bucket === "done").length,
    noPdf: items.filter((item) => !item.hasPdf).length,
  };
}

function filterReadingHomeItems(items = []) {
  if (state.readingHomeFilter === "ready") {
    return items.filter((item) => item.status.bucket === "ready");
  }

  if (state.readingHomeFilter === "running") {
    return items.filter((item) => item.status.bucket === "running");
  }

  if (state.readingHomeFilter === "done") {
    return items.filter((item) => item.status.bucket === "done");
  }

  if (state.readingHomeFilter === "noPdf") {
    return items.filter((item) => !item.hasPdf);
  }

  return items;
}

function readingHomeTimestampLabel(value) {
  const timestamp = parseTimestamp(value);
  if (!timestamp) {
    return "—";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(timestamp));
}

function syncReadingHomeSelection(project = activeProject()) {
  const items = readingHomeItems(project);
  const visible = filterReadingHomeItems(items);
  const candidates = visible.length ? visible : items;
  const preferredPaperId = state.readingHomeSelectedPaperId || selectedReadingSession()?.paperId || "";

  if (!candidates.some((item) => item.paperId === preferredPaperId)) {
    state.readingHomeSelectedPaperId = candidates[0]?.paperId || "";
  }

  if (!state.readingHomeSelectedPaperId) {
    state.readingHomePreviewOpen = false;
    return;
  }

  if (state.readingHomeLayout === "desktop") {
    state.readingHomePreviewOpen = false;
  }
}

function selectedReadingHomeItem(project = activeProject()) {
  syncReadingHomeSelection(project);
  const items = readingHomeItems(project);
  return items.find((item) => item.paperId === state.readingHomeSelectedPaperId) || items[0] || null;
}

function readingHomeSourceUrl(item = selectedReadingHomeItem()) {
  return item?.paper?.paperUrl || item?.paper?.url || item?.paper?.pdfUrl || item?.session?.paperUrl || item?.session?.pdfUrl || "";
}

function readingUploadFileSizeLabel(file) {
  const size = Number(file?.size) || 0;
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)}MB`;
  }
  if (size >= 1024) {
    return `${Math.max(1, Math.round(size / 1024))}KB`;
  }
  return size ? `${size}B` : "";
}

function setReadingUploadModalFile(file = null) {
  readingUploadModalFile = file;
  state.readingUploadModalFileName = file?.name || "";
  state.readingUploadModalFileSizeLabel = file ? readingUploadFileSizeLabel(file) : "";
}

function closeReadingUploadModal() {
  state.readingUploadModalOpen = false;
  setReadingUploadModalFile(null);
}

function focusReadingUploadModalInput() {
  window.setTimeout(() => {
    document.querySelector('[name="readingPdfUploadModal"]')?.focus({ preventScroll: true });
  }, 0);
}

function currentReadingPaper(project = activeProject()) {
  if (state.readingView === "home") {
    return selectedReadingHomeItem(project)?.paper || null;
  }

  const session = selectedReadingSession();
  if (!session) {
    return selectedReadingHomeItem(project)?.paper || null;
  }

  return (
    currentProjectLibrary().find((paper) => paper.paperId === session.paperId) ||
    readingPaperFromSession(session) ||
    null
  );
}

function syncResponsiveReadingHomeLayout() {
  const nextLayout = detectReadingHomeLayout();
  if (nextLayout === state.readingHomeLayout) {
    return false;
  }

  state.readingHomeLayout = nextLayout;
  if (nextLayout === "desktop") {
    state.readingHomePreviewOpen = false;
  }
  syncReadingHomeSelection();
  return true;
}

function syncResponsiveReadingRail(layout = state.searchLayout) {
  if (state.readingView !== "detail") {
    return false;
  }

  const nextRail = defaultReadingRailOpen(layout);
  if (state.readingRailOpen === nextRail) {
    return false;
  }

  state.readingRailOpen = nextRail;
  return true;
}

function selectedReadingSession() {
  const sessions = effectiveReadingSessions();
  return sessions.find((session) => session.id === state.activeReadingSessionId) || sessions[0] || null;
}

function syncSelectedReadingSession() {
  const sessions = effectiveReadingSessions();
  if (!sessions.length) {
    state.activeReadingSessionId = "";
    return;
  }

  if (!sessions.some((session) => session.id === state.activeReadingSessionId)) {
    state.activeReadingSessionId = sessions[0].id;
  }
}

function clearActiveRunPoll() {
  if (activeRunPollTimer) {
    window.clearTimeout(activeRunPollTimer);
    activeRunPollTimer = 0;
  }
  if (activeRunEventSource) {
    activeRunEventSource.close();
    activeRunEventSource = null;
  }
}

function setProjects(projects) {
  state.projects = projects;

  if (!state.activeProjectId || !projects.some((project) => project.id === state.activeProjectId)) {
    state.activeProjectId = projects[0]?.id || "";
  }

  saveStorage(STORAGE_KEYS.project, state.activeProjectId);
}

function replaceProject(project) {
  state.projects = state.projects.map((entry) => (entry.id === project.id ? project : entry));
}

async function loadProjects() {
  const payload = await api("api/projects");
  setProjects(payload.projects || []);
}

async function loadProjectGraph() {
  const project = activeProject();
  if (!project) {
    state.projectGraph = null;
    state.activeQuestionId = "";
    return;
  }

  const payload = await api(`api/projects/${encodeURIComponent(project.id)}/graph`);
  state.projectGraph = payload;
  const questions = Array.isArray(payload.researchQuestions) ? payload.researchQuestions : [];
  if (!state.activeQuestionId || !questions.some((question) => question.id === state.activeQuestionId)) {
    state.activeQuestionId = questions[0]?.id || "";
  }
}

async function loadProjectLibrary() {
  const project = activeProject();
  if (!project) {
    state.projectLibrary = [];
    state.readingHomeSelectedPaperId = "";
    return;
  }

  const payload = await api(`api/projects/${encodeURIComponent(project.id)}/library`);
  state.projectLibrary = Array.isArray(payload.results) ? payload.results : [];
  syncReadingHomeSelection(project);
}

async function loadReadingSessions({ preserveSelection = true } = {}) {
  const project = activeProject();
  if (!project) {
    state.readingSessions = [];
    state.activeReadingSessionId = "";
    return;
  }

  state.readingLoading = true;
  try {
    const payload = await api(`api/projects/${encodeURIComponent(project.id)}/reading-sessions`);
    state.readingSessions = sortReadingSessions(payload.results || []);
    if (!preserveSelection) {
      state.activeReadingSessionId = state.readingSessions[0]?.id || "";
    }
    syncSelectedReadingSession();
    syncReadingHomeSelection(project);
  } catch (error) {
    state.error = error.message;
    state.readingSessions = [];
    state.activeReadingSessionId = "";
  } finally {
    state.readingLoading = false;
  }
}

async function applyAgentRunPayload(payload) {
  const run = payload?.run || null;
  if (!run) {
    state.activeReadingRunId = "";
    return true;
  }

  if (run.stage === "reading") {
    await loadProjects();
    await loadReadingSessions({ preserveSelection: true });
    if (payload.assets?.length) {
      const readingAsset = payload.assets.find((entry) => entry.collection === "readingSessions");
      if (readingAsset?.item?.id) {
        state.activeReadingSessionId = readingAsset.item.id;
      }
    }
  }

  if (run.stage === "search") {
    state.searchAgentRun = normaliseSearchAgentRun(run, state.searchAgentRun || {});
    applyAgenticSearchOutput(run.outputPayload, { preserveSelection: true });
    state.loading = !isTerminalAgentRunStatus(run.status);
    if (run.status === "error") {
      state.error = run.error || run.outputSummary || "Agentic Search failed.";
    }
  }

  if (run.stage !== "reading" && isTerminalAgentRunStatus(run.status)) {
    await loadProjects();
  }

  if (isTerminalAgentRunStatus(run.status)) {
    state.activeReadingRunId = "";
    return true;
  }

  state.activeReadingRunId = run.id || state.activeReadingRunId;
  return false;
}

function applyAgentRunProgressEvent(payload) {
  const runId = payload?.runId || "";
  const event = payload?.event && typeof payload.event === "object" ? payload.event : null;
  if (!runId || !event || state.searchAgentRun?.id !== runId) {
    return;
  }

  const progressEvents = Array.isArray(state.searchAgentRun.progressEvents)
    ? state.searchAgentRun.progressEvents
    : [];
  state.searchAgentRun = {
    ...state.searchAgentRun,
    progressEvents: [...progressEvents, event].slice(-80),
  };
}

async function pollAgentRun(runId) {
  if (!runId) {
    state.activeReadingRunId = "";
    return;
  }

  state.activeReadingRunId = runId;

  try {
    const payload = await api(`api/agent-runs/${encodeURIComponent(runId)}`);
    const done = await applyAgentRunPayload(payload);
    if (!done) {
      activeRunPollTimer = window.setTimeout(() => {
        void pollAgentRun(runId);
      }, 5000);
    }
  } catch (error) {
    state.error = error.message;
    activeRunPollTimer = window.setTimeout(() => {
      void pollAgentRun(runId);
    }, 5000);
  } finally {
    refreshActiveStageUI();
  }
}

function subscribeAgentRun(runId) {
  clearActiveRunPoll();
  if (!runId) {
    state.activeReadingRunId = "";
    return;
  }

  state.activeReadingRunId = runId;

  if (typeof window.EventSource !== "function") {
    void pollAgentRun(runId);
    return;
  }

  const source = new EventSource(appUrl(`api/agent-runs/${encodeURIComponent(runId)}/events`).href);
  activeRunEventSource = source;

  source.addEventListener("run", (event) => {
    void (async () => {
      try {
        const payload = JSON.parse(event.data || "{}");
        const done = await applyAgentRunPayload(payload);
        refreshActiveStageUI();
        if (done && activeRunEventSource === source) {
          clearActiveRunPoll();
        }
      } catch (error) {
        state.error = error.message;
        refreshActiveStageUI();
      }
    })();
  });

  source.addEventListener("progress", (event) => {
    try {
      applyAgentRunProgressEvent(JSON.parse(event.data || "{}"));
      refreshActiveStageUI();
    } catch (error) {
      state.error = error.message;
      refreshActiveStageUI();
    }
  });

  source.onerror = () => {
    if (activeRunEventSource !== source) {
      return;
    }

    source.close();
    activeRunEventSource = null;
    activeRunPollTimer = window.setTimeout(() => {
      void pollAgentRun(runId);
    }, 2500);
  };
}

function resetSearchState() {
  state.hasSearched = false;
  state.loading = false;
  state.error = "";
  state.searchAgentRun = null;
  state.searchAgentTransitioning = false;
  state.results = [];
  state.availableVenues = [];
  state.selectedPaperId = "";
  state.searchMeta = {
    provider: "",
    live: false,
    total: 0,
    query: "",
    warning: "",
    searchMode: state.searchMode,
    agentRuntime: "",
  };
  state.filters.venues = new Set();
  state.filterPanelOpen = defaultFilterPanelOpen();
  state.previewPanelOpen = defaultPreviewPanelOpen();
}

function clearAgenticSearchBodyState() {
  document.body.classList.remove("is-pressed", "is-run");
}

function focusAgenticSearchQuestion() {
  window.requestAnimationFrame(() => {
    const question = document.querySelector(".stage-run .q-text");
    if (question instanceof HTMLElement) {
      question.focus({ preventScroll: true });
    }
  });
}

function syncAgenticSearchStageDom() {
  const active = state.activeStage === "search" && Boolean(state.searchAgentRun);
  const animate = active && state.searchAgentTransitioning;
  state.searchAgentTransitioning = false;

  const home = document.querySelector(".search-agentic-entry .stage-home");
  if (home) {
    home.inert = active;
  }

  if (!active) {
    clearAgenticSearchBodyState();
    return;
  }

  if (!animate) {
    document.body.classList.add("is-run");
    return;
  }

  clearAgenticSearchBodyState();
  document.body.classList.add("is-pressed");
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      document.body.classList.add("is-run");
      window.setTimeout(focusAgenticSearchQuestion, AGENTIC_SEARCH_FOCUS_DELAY_MS);
    });
  });
  window.setTimeout(() => {
    document.body.classList.remove("is-pressed");
  }, AGENTIC_SEARCH_PRESS_MS);
}

function pulseInvalidAgenticSearch() {
  clearAgenticSearchBodyState();
  document.body.classList.add("is-pressed");
  const hero = document.querySelector(".dashboard-hero");
  const input = document.querySelector("#search-input");
  hero?.classList.remove("is-invalid");
  void hero?.offsetWidth;
  hero?.classList.add("is-invalid");
  input?.focus();
  window.setTimeout(() => {
    document.body.classList.remove("is-pressed");
    hero?.classList.remove("is-invalid");
  }, AGENTIC_SEARCH_PRESS_MS);
}

function normaliseSearchAgentRun(run, fallback = {}) {
  if (!run || typeof run !== "object") {
    return fallback;
  }

  return {
    ...fallback,
    ...run,
    input: {
      ...(fallback.input || {}),
      ...(run.input || {}),
    },
  };
}

function applyAgenticSearchOutput(outputPayload, { preserveSelection = false } = {}) {
  const results = Array.isArray(outputPayload?.results) ? outputPayload.results : [];
  if (!outputPayload || typeof outputPayload !== "object") {
    return false;
  }

  state.hasSearched = true;
  state.results = results;
  state.availableVenues = Array.isArray(outputPayload.availableVenues) && outputPayload.availableVenues.length
    ? outputPayload.availableVenues
    : uniqueValues(results.map((paper) => paper.venue)).slice(0, 8);
  state.searchMeta = {
    agentRuntime: outputPayload.agentRuntime || "",
    live: outputPayload.live !== false,
    provider: outputPayload.provider || "",
    query: outputPayload.query || state.searchInput.trim(),
    searchMode: outputPayload.searchMode || "scout",
    total: Number(outputPayload.total) || results.length,
    warning: outputPayload.warning || "",
  };
  state.filters.venues = new Set(state.availableVenues);

  if (!preserveSelection || !state.selectedPaperId || !results.some((paper) => paper.paperId === state.selectedPaperId)) {
    state.selectedPaperId = results[0]?.paperId || "";
  }

  syncSelectedPaper();
  return true;
}

async function runSearch({ preserveSelection = false } = {}) {
  const project = activeProject();
  if (!project) {
    return;
  }

  const wasHome = !state.hasSearched;
  state.hasSearched = true;
  state.loading = true;
  state.error = "";
  if (wasHome) {
    renderWithViewTransition();
  } else {
    render();
  }

  try {
    const query = state.searchInput.trim();
    const payload = await api("api/search", {
      method: "POST",
      body: JSON.stringify({
        projectId: project.id,
        questionId: activeResearchQuestion()?.id || "",
        q: query,
        mode: state.searchMode,
        scopes: state.searchScopes,
        page: 1,
      }),
    });

    replaceProject(payload.project);
    state.results = payload.results || [];
    state.availableVenues = payload.availableVenues || [];
    state.searchMeta = {
      provider: payload.provider,
      live: payload.live,
      total: payload.total,
      query: payload.query,
      warning: payload.warning || "",
      searchMode: payload.searchMode || state.searchMode,
      agentRuntime: payload.agentRuntime || "",
    };
    state.filters.venues = new Set(state.availableVenues);

    if (!preserveSelection) {
      state.selectedPaperId = state.results[0]?.paperId || "";
    }

    syncSelectedPaper();
  } catch (error) {
    state.error = error.message;
    state.results = [];
    state.selectedPaperId = "";
  } finally {
    state.loading = false;
    render();
  }
}

async function startAgenticSearchRun({ query } = {}) {
  const project = activeProject();
  if (!project) {
    return;
  }

  const trimmedQuery = String(query ?? state.searchInput ?? "").trim();
  state.searchMode = "scout";
  state.searchInput = trimmedQuery;
  state.scopePicker = null;
  state.scopePickerQuery = "";

  if (!trimmedQuery) {
    render();
    pulseInvalidAgenticSearch();
    return;
  }

  const optimisticRun = {
    createdAt: new Date().toISOString(),
    id: "",
    input: {
      questionId: activeResearchQuestion()?.id || "",
      query: trimmedQuery,
      scopes: state.searchScopes,
    },
    outputSummary: "",
    stage: "search",
    status: "queue",
  };

  state.hasSearched = false;
  state.error = "";
  state.loading = true;
  state.searchAgentRun = optimisticRun;
  state.searchAgentTransitioning = true;
  render();

  try {
    const payload = await api("api/agent-runs", {
      method: "POST",
      body: JSON.stringify({
        input: {
          questionId: activeResearchQuestion()?.id || "",
          query: trimmedQuery,
          scopes: state.searchScopes,
        },
        projectId: project.id,
        stage: "search",
        taskKind: "run-agentic-search",
      }),
    });

    state.searchAgentRun = normaliseSearchAgentRun(payload.run, optimisticRun);
    state.loading = false;
    render();
    if (payload.run?.id) {
      subscribeAgentRun(payload.run.id);
    }
  } catch (error) {
    state.searchAgentRun = {
      ...optimisticRun,
      error: error.message,
      outputSummary: `Agentic search could not start: ${error.message}`,
      status: "done",
      warning: error.message,
    };
    state.error = error.message;
    state.loading = false;
    render();
  }
}

async function savePaper(paper) {
  state.savingPaperId = paper.paperId;
  render();

  try {
    const project = activeProject();
    if (!project) {
      return;
    }

    if (paper.saved) {
      const path = `/api/projects/${encodeURIComponent(project.id)}/library/${encodeURIComponent(paper.paperId)}`;
      const payload = await api(path, { method: "DELETE" });
      replaceProject(payload.project);
      state.results = state.results.map((entry) => (entry.paperId === paper.paperId ? { ...entry, saved: false } : entry));
      await loadProjectLibrary();
    } else {
      const payload = await api(`api/projects/${encodeURIComponent(project.id)}/library`, {
        method: "POST",
        body: JSON.stringify({ paper }),
      });
      replaceProject(payload.project);
      state.results = state.results.map((entry) => (entry.paperId === paper.paperId ? { ...entry, saved: true } : entry));
      await loadProjectLibrary();
    }

    syncSelectedPaper();
  } catch (error) {
    state.error = error.message;
  } finally {
    state.savingPaperId = "";
    render();
  }
}

async function startReadingSession(paper) {
  state.readingStartingPaperId = paper.paperId;
  state.readingHomeSelectedPaperId = paper.paperId;
  state.readingHomePreviewOpen = false;
  render();

  try {
    const project = activeProject();
    if (!project) {
      return;
    }

    const payload = await api(`api/projects/${encodeURIComponent(project.id)}/reading-sessions`, {
      method: "POST",
      body: JSON.stringify({
        paper,
        paperId: paper.paperId,
      }),
    });
    state.results = state.results.map((entry) => (entry.paperId === paper.paperId ? { ...entry, queued: true } : entry));
    state.activeStage = "reading";
    state.readingView = "detail";
    state.readingRailOpen = defaultReadingRailOpen(state.searchLayout);
    saveStorage(STORAGE_KEYS.stage, state.activeStage);
    await loadProjects();
    await loadProjectLibrary();
    await loadReadingSessions({ preserveSelection: false });
    if (payload.readingSession?.id) {
      state.activeReadingSessionId = payload.readingSession.id;
      syncReadingSession(payload.readingSession);
    }
  } catch (error) {
    state.error = error.message;
  } finally {
    state.readingStartingPaperId = "";
    render();
  }
}

async function uploadReadingPdf(file) {
  const project = activeProject();
  if (!project || !file) {
    return;
  }

  if (file.type && file.type !== "application/pdf") {
    state.error = "PDF 파일만 업로드할 수 있습니다.";
    render();
    return;
  }

  if (file.size > MAX_READING_PDF_UPLOAD_BYTES) {
    state.error = `PDF 파일은 최대 ${MAX_READING_PDF_UPLOAD_LABEL}까지 업로드할 수 있습니다.`;
    render();
    return;
  }

  state.readingUploading = true;
  state.error = "";
  render();

  try {
    const payload = await api(`api/projects/${encodeURIComponent(project.id)}/reading-sessions/upload`, {
      method: "POST",
      headers: {
        "content-type": "application/pdf",
        "x-file-name": encodeURIComponent(file.name || "upload.pdf"),
      },
      body: file,
    });

    if (payload.paper?.paperId) {
      const existingIndex = state.projectLibrary.findIndex((entry) => entry.paperId === payload.paper.paperId);
      if (existingIndex >= 0) {
        state.projectLibrary[existingIndex] = payload.paper;
      } else {
        state.projectLibrary.unshift(payload.paper);
      }
      state.readingHomeSelectedPaperId = payload.paper.paperId;
    }

    if (payload.readingSession?.id) {
      syncReadingSession(payload.readingSession);
      state.activeReadingSessionId = payload.readingSession.id;
    }

    state.activeStage = "reading";
    state.readingView = "detail";
    state.readingDocumentTab = "pdf";
    closeReadingUploadModal();
    state.readingHomePreviewOpen = false;
    state.readingRailOpen = defaultReadingRailOpen(state.searchLayout);
    saveStorage(STORAGE_KEYS.stage, state.activeStage);
    await loadProjects();
    await loadProjectLibrary();
    await loadReadingSessions({ preserveSelection: true });
  } catch (error) {
    state.error = error.message;
  } finally {
    state.readingUploading = false;
    renderWithViewTransition();
  }
}

function dragEventHasFiles(event) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

function getReadingPdfDropFile(dataTransfer) {
  return Array.from(dataTransfer?.files || []).find(
    (file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name || ""),
  );
}

async function openReadingDetailForPaper(paperId, { createIfMissing = true } = {}) {
  const project = activeProject();
  if (!project || !paperId) {
    return;
  }

  const session = actualReadingSessions(project).find((entry) => entry.paperId === paperId) || null;
  if (session?.id) {
    state.activeStage = "reading";
    state.readingView = "detail";
    state.activeReadingSessionId = session.id;
    state.readingHomeSelectedPaperId = paperId;
    state.readingHomePreviewOpen = false;
    state.readingRailOpen = defaultReadingRailOpen(state.searchLayout);
    saveStorage(STORAGE_KEYS.stage, state.activeStage);
    renderWithViewTransition();
    return;
  }

  if (!createIfMissing) {
    return;
  }

  const paper =
    currentProjectLibrary().find((entry) => entry.paperId === paperId) ||
    state.results.find((entry) => entry.paperId === paperId) ||
    selectedReadingHomeItem(project)?.paper ||
    null;

  if (paper) {
    await startReadingSession(paper);
  }
}

function renderSidebar() {
  const collapsed = state.sidebarCollapsed;
  const workflowExpanded = collapsed || state.workflowOpen;
  const workflowRows = workflowExpanded
    ? WORKFLOW_TABS.map((tab) => {
        const active = tab.id === activeWorkflowTab().id;
        const menuOpen = state.openWorkflowMenu === tab.id;
        const iconBackground = active ? tab.color : `${tab.color}1a`;
        const iconColor = active ? "#ffffff" : tab.color;

        return `
          <div class="workflow-item ${active ? "is-active" : ""} ${menuOpen ? "menu-open" : ""}" data-ares-role="workflow-row" data-ares-tab="${escapeHtml(tab.id)}">
            <button
              type="button"
              class="workflow-stage-btn hov"
              aria-label="${escapeHtml(tab.label)}"
              data-action="select-workflow-tab"
              data-tab-id="${escapeHtml(tab.id)}"
              data-ares-role="workflow-stage"
              data-ares-tab="${escapeHtml(tab.id)}"
              data-ares-stage="${escapeHtml(tab.defaultStage)}"
              title="${escapeHtml(tab.label)}"
            >
              <span class="workflow-stage-icon" style="background:${iconBackground};color:${iconColor}">
                ${icon(tab.icon, { size: 13 })}
              </span>
              <span class="workflow-stage-copy">
                <span class="workflow-stage-label">${escapeHtml(tab.shortLabel || tab.label)}</span>
              </span>
            </button>
            <div class="workflow-side-actions">
              <button
                type="button"
                class="sidebar-icon-btn"
                aria-label="${escapeHtml(tab.label)} context menu"
                data-action="toggle-workflow-menu"
                data-stage-id="${escapeHtml(tab.id)}"
              >
                ${icon("moreH", { size: 14 })}
              </button>
              ${
                menuOpen
                  ? `
                    <div class="sidebar-menu">
                      <button type="button" class="sidebar-menu-item" data-action="select-workflow-tab" data-tab-id="${escapeHtml(tab.id)}">Open tab</button>
                      <button type="button" class="sidebar-menu-item" data-action="copy-stage-link" data-stage-id="${escapeHtml(tab.defaultStage)}">Copy deep link</button>
                      <div class="sidebar-menu-divider"></div>
                      <button type="button" class="sidebar-menu-item" data-action="dismiss-workflow-menu">Add note</button>
                    </div>
                  `
                  : ""
              }
            </div>
          </div>
        `;
      }).join("")
    : "";

  const toggleLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";
  return `
    <aside class="desktop-sidebar" data-ares-surface="sidebar" data-ares-role="navigation" data-collapsed="${collapsed ? "true" : "false"}">
      <section class="sidebar-section">
        <div class="workspace-switch" title="ARES · Research workspace">
          <span class="brand-mark">A</span>
          <span class="brand-copy">
            <span class="brand-title">ARES</span>
            <span class="brand-subtitle">Research workspace</span>
          </span>
        </div>
      </section>

      <section class="sidebar-section">
        <button type="button" class="sidebar-action hov-soft" data-action="focus-search" title="Search (⌘K)">
          ${icon("search", { size: 13.5, color: TOKENS.t3 })}
          <span class="sidebar-action-label">Search</span>
          ${renderKbd("⌘K")}
        </button>
        <button type="button" class="sidebar-action hov-soft" data-action="focus-search" title="New paper (C)">
          ${icon("plus", { size: 13.5, color: TOKENS.t3 })}
          <span class="sidebar-action-label">New paper</span>
          ${renderKbd("C")}
        </button>
      </section>

      <section class="sidebar-section">
        <p class="sidebar-label">Project</p>
        <div class="project-list">
          ${state.projects
            .map((project) => {
              const active = project.id === state.activeProjectId;
              return `
                <button
                  type="button"
                  class="project-item hov ${active ? "is-active" : ""}"
                  data-action="select-project"
                  data-project-id="${escapeHtml(project.id)}"
                  data-ares-role="project-item"
                  data-ares-project-id="${escapeHtml(project.id)}"
                  data-ares-project-name="${escapeHtml(project.name)}"
                  title="${escapeHtml(project.name)}"
                >
                  <span class="project-swatch" style="background:${escapeHtml(project.color)}"></span>
                  <span class="project-item-label">${escapeHtml(project.name)}</span>
                </button>
              `;
            })
            .join("")}
        </div>
      </section>

      <section class="sidebar-section sidebar-section--scroll">
        <button type="button" class="workflow-toggle" data-action="toggle-workflow">
          <span class="sidebar-label" style="padding:0">Workflow</span>
          ${icon(state.workflowOpen ? "chevD" : "chevR", { size: 12, color: TOKENS.t3 })}
        </button>
        <div class="workflow-list">${workflowRows}</div>
      </section>

      <section class="sidebar-section sidebar-section--collapse">
        <button
          type="button"
          class="sidebar-action sidebar-collapse-btn hov-soft"
          data-action="toggle-sidebar"
          aria-label="${toggleLabel}"
          title="${toggleLabel}"
        >
          <span class="sidebar-collapse-icon" aria-hidden="true">
            ${icon(collapsed ? "sidebar" : "sidebar", { size: 13.5, color: TOKENS.t3 })}
          </span>
          <span class="sidebar-action-label">${collapsed ? "Expand sidebar" : "Collapse sidebar"}</span>
        </button>
      </section>

      <section class="sidebar-section">
        <div class="sidebar-account" title="Dokyung · Pro plan">
          <span class="account-mark">DK</span>
          <span class="brand-copy">
            <span class="account-name">Dokyung</span>
            <span class="account-plan">Pro plan</span>
          </span>
        </div>
      </section>
    </aside>
  `;
}

function renderThemeSwitcher() {
  return `
    <div class="theme-switcher" role="group" aria-label="Color theme">
      ${[
        ["light", "Light", "sun"],
        ["dark", "Dark", "moon"],
        ["system", "System", "monitor"],
      ]
        .map(([mode, label, iconName]) => {
          const active = state.themeMode === mode;
          return `
            <button
              type="button"
              class="theme-switcher-btn ${active ? "is-active" : ""}"
              data-action="set-theme-mode"
              data-theme-mode="${mode}"
              aria-pressed="${active ? "true" : "false"}"
              title="${label}"
            >
              ${icon(iconName, { size: 12 })}
              <span>${label}</span>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderTopbar() {
  const stage = stageById(state.activeStage);
  const tab = activeWorkflowTab();
  const readingSession = stage.id === "reading" && state.readingView === "detail" ? selectedReadingSession() : null;
  const searchRun = stage.id === "search" ? state.searchAgentRun : null;
  const readingBreadcrumb = readingSession
    ? `
        <span class="topbar-separator topbar-breadcrumb-bridge">/</span>
        <nav class="topbar-breadcrumb" aria-label="Reading breadcrumb">
          <button type="button" class="topbar-crumb-link" data-action="back-reading-home">Library</button>
          <span class="topbar-crumb-separator" aria-hidden="true">/</span>
          <span class="topbar-crumb-current" title="${escapeHtml(readingSession.title || "Untitled paper")}">
            ${escapeHtml(readingSession.title || "Untitled paper")}
          </span>
        </nav>
      `
    : "";
  const searchBreadcrumb = searchRun
    ? `
        <span class="topbar-separator topbar-breadcrumb-bridge">/</span>
        <nav class="topbar-breadcrumb" aria-label="Search breadcrumb">
          <span class="topbar-crumb-link">Agentic</span>
          <span class="topbar-crumb-separator" aria-hidden="true">/</span>
          <span class="topbar-crumb-current">${escapeHtml(searchRun.id ? `Run #${String(searchRun.id).replace(/^run[-_]?/i, "").slice(-4).toUpperCase()}` : "Run 준비 중")}</span>
        </nav>
      `
    : "";
  const searchRunBadge = searchRun
    ? `
        <div class="run-badge" aria-live="off">
          <span class="dot"></span>
          ${escapeHtml(searchRun.status === "error" || searchRun.error ? "Failed" : searchRun.status === "canceled" ? "Canceled" : searchRun.status === "done" ? "Done" : searchRun.status === "queue" ? "Queued" : "Live")} · ${escapeHtml(searchRunProgressLabel(searchRun))}
        </div>
      `
    : "";
  return `
    <header class="main-topbar" data-ares-surface="topbar" data-ares-stage="${escapeHtml(stage.id)}" data-ares-tab="${escapeHtml(tab.id)}">
      <div class="topbar-stage">
        <span class="topbar-stage-badge" style="background:${tab.color}">
          ${icon(tab.icon, { size: 13, color: "#ffffff" })}
        </span>
        <span class="topbar-stage-label">${escapeHtml(tab.shortLabel || tab.label)}</span>
        ${stage.tabId === tab.id && stage.label !== tab.label ? `<span class="topbar-separator">/</span><span class="topbar-stage-mode">${escapeHtml(stage.modeLabel || stage.label)}</span>` : ""}
        ${readingBreadcrumb}
        ${searchBreadcrumb}
      </div>
      <div class="topbar-actions">
        ${searchRunBadge}
        ${renderThemeSwitcher()}
        <button type="button" class="btn-s" data-action="copy-stage-link" data-stage-id="${escapeHtml(stage.id)}">${icon("share", { size: 12 })} Share</button>
        <button type="button" class="btn-s" ${stage.id === "search" ? 'data-action="toggle-filter-panel"' : "disabled"}>${icon("filter", { size: 12 })} Filter</button>
      </div>
    </header>
  `;
}

function workflowModeLabel(stage) {
  if (stage.id === "reading") {
    return state.readingView === "detail" ? "Reader" : "Library";
  }

  return stage.modeLabel || stage.label;
}

function workflowModeHint(stage) {
  if (stage.id === "search") {
    return "Discover";
  }

  if (stage.id === "reading") {
    return state.readingView === "detail" ? "Library available" : "Reader opens selected paper";
  }

  return stage.label;
}

function renderWorkflowModeNav() {
  const tab = activeWorkflowTab();
  const stages = WORKFLOW_STAGES.filter((stage) => stage.tabId === tab.id);
  if (stages.length < 2) {
    return "";
  }

  return `
    <nav
      class="workflow-mode-nav"
      aria-label="${escapeHtml(tab.label)} modes"
      data-ares-role="workflow-mode-nav"
      data-tab-id="${escapeHtml(tab.id)}"
    >
      <div class="workflow-mode-context">
        <span class="workflow-mode-kicker">${escapeHtml(tab.shortLabel)}</span>
        <span class="workflow-mode-title">${escapeHtml(tab.shortLabel || tab.label)}</span>
      </div>
      <div class="workflow-mode-list">
        ${stages
          .map((stage) => {
            const active = stage.id === state.activeStage;
            return `
              <button
                type="button"
                class="workflow-mode-btn ${active ? "is-active" : ""}"
                data-action="select-stage"
                data-stage-id="${escapeHtml(stage.id)}"
                style="--mode-color:${stage.color};--mode-tint:${stage.color}12"
              >
                ${icon(stage.icon, { size: 13, color: "currentColor" })}
                <span>${escapeHtml(workflowModeLabel(stage))}</span>
                <small>${escapeHtml(workflowModeHint(stage))}</small>
              </button>
            `;
          })
          .join("")}
      </div>
    </nav>
  `;
}

// Feature renderers live in dedicated modules so this entry stays focused on state, IO, and DOM events.
const searchFeature = createSearchFeature({
  state,
  TOKENS,
  SEARCH_MODES,
  SEARCH_TARGET_TYPES,
  SEARCH_TARGET_CATALOG,
  icon,
  escapeHtml,
  renderTag,
  yearBucket,
  yearBucketLabel,
  formatAuthors,
  visibleResults,
  selectedPaper,
  isTabletSearchLayout,
  dashboardLibraryItems,
  dashboardQueuedPaperIds,
  dashboardPercent,
  dashboardRecentCount,
  dashboardRelativeAge,
  dashboardDailyCounts,
  dashboardCumulativeCounts,
  dashboardSeriesPath,
  dashboardAreaPath,
  dashboardVenueBreakdown,
  dashboardPaperTags,
  actualReadingSessions,
  activeResearchQuestion,
});

const { renderSearchPreview, renderSearchStage, resolveScopeCatalogItem, searchPlaceholder } = searchFeature;

const readingFeature = createReadingFeature({
  state,
  TOKENS,
  icon,
  escapeHtml,
  renderTag,
  renderKbd,
  statusColor,
  statusIcon,
  formatAuthors,
  effectiveReadingSessions,
  selectedReadingSession,
  readingHomeItems,
  readingHomeCounts,
  filterReadingHomeItems,
  readingHomeActionMeta,
  maxReadingPdfUploadLabel: MAX_READING_PDF_UPLOAD_LABEL,
});

const { renderReadingStage } = readingFeature;
const readingStagePatchController = createReadingStagePatchController({
  activeProject,
  applyReadingSplitUI,
  currentReadingPaper,
  readingPdfController,
  render,
  renderReadingStage,
  scheduleReadingHydration,
  state,
  syncAppActivePaperMetadata,
  syncBrowserUrlFromState,
});
const {
  patchReadingDocumentPaneOnly,
  patchReadingPdfSelectionBarOnly,
  patchReadingPdfSelectionSurfaces,
  patchReadingStageUI,
  patchReadingWorkbenchPaneOnly,
  refreshReadingStageUI,
} = readingStagePatchController;

function renderLabStage(project) {
  const stage = stageById(state.activeStage);
  const session = selectedReadingSession();
  const library = dashboardLibraryItems();
  const { dossiers, experimentRuns, plan, plans, sourcePacket } = createLabFeatureModel(state.projectGraph);
  const sourcePaper = session || sourcePacket || library[0] || null;
  const paperTitle = sourcePaper?.title || "No reading packet";
  const paperVenue = sourcePaper?.venue || "No venue";
  const progress = session ? readingProgress(session) : 0;
  const status = session?.status || (project.queueCount ? "queue" : "todo");
  const compareActive = stage.id === "result";
  const labMode = compareActive ? "Compare" : "Plan";
  const labStatusLabel = plan ? "Plan linked" : session || sourcePacket ? "Packet linked" : "Not connected";
  const handoff = plan?.handoff && typeof plan.handoff === "object" ? plan.handoff : {};
  const sourceRefs = Array.isArray(plan?.sourceRefs) ? plan.sourceRefs : [];
  const handoffNoteCount = Array.isArray(handoff.noteIds) ? handoff.noteIds.length : 0;
  const handoffAssetCount = Array.isArray(handoff.assetIds) ? handoff.assetIds.length : 0;
  const handoffSectionCount = Array.isArray(handoff.sectionIds) ? handoff.sectionIds.length : 0;
  const handoffSummary = plan
    ? `${handoffNoteCount} notes · ${handoffAssetCount} assets · ${handoffSectionCount} sections`
    : "No handoff context";
  const handoffSourcePreview = sourceRefs
    .slice(0, 2)
    .map((ref) => ref.label || ref.id)
    .filter(Boolean)
    .join(" · ");
  const runs = experimentRuns.length
    ? experimentRuns.map((run) => {
        const dossier = dossiers.find((entry) => Array.isArray(entry.experimentRunIds) && entry.experimentRunIds.includes(run.id));
        const comparison = Array.isArray(dossier?.comparisons) ? dossier.comparisons[0] : null;
        const metric = comparison?.metric || Object.keys(run.metrics || {})[0] || "primary";
        const ours = comparison?.reproducedValue || run.metrics?.primary || run.metrics?.[metric] || "";
        const unit = comparison?.unit || "";
        return {
          canEdit: true,
          delta: comparison?.delta || (ours ? labMetricDelta(comparison?.paperValue, ours) : "—"),
          id: run.id,
          metric,
          name: run.title || `${run.kind || "Manual"} run`,
          notes: run.notes || "",
          ours: ours || "pending",
          paper: comparison?.paperValue || (plan ? "linked" : "none"),
          status: run.status || "todo",
          unit,
        };
      })
    : [
        {
          canEdit: false,
          name: "Baseline reproduction",
          metric: "primary score",
          paper: plan || session ? "linked" : "none",
          ours: "—",
          delta: "—",
          status: status === "done" ? "queue" : "todo",
          unit: "",
        },
      ];

  return `
    <div class="lab-stage" data-ares-surface="lab-stage" data-ares-stage="${escapeHtml(stage.id)}" data-lab-mode="${escapeHtml(labMode.toLowerCase())}">
      <section class="lab-main">
        <div class="lab-hero">
          <div class="lab-hero-copy">
            <div class="lab-kicker">${icon("flask", { size: 14, color: TOKENS.research })}<span>Lab</span></div>
            <h1>${escapeHtml(compareActive ? "Compare result dossier" : "Plan reproduction run")}</h1>
            <p>Reading packet, reproduction plan, and metric deltas.</p>
          </div>
          <div class="lab-source-card">
            <span class="lab-card-label">Reading Packet</span>
            <strong title="${escapeHtml(paperTitle)}">${escapeHtml(paperTitle)}</strong>
            <div class="lab-source-meta">
              ${renderTag(paperVenue)}
              ${renderTag(`${progress}% read`, TOKENS.read, progress > 0)}
              ${renderTag(labStatusLabel, session ? TOKENS.search : TOKENS.t3, Boolean(session))}
            </div>
            <div class="lab-handoff-context" data-handoff-note-count="${escapeHtml(handoffNoteCount)}">
              <span class="lab-card-label">Handoff context</span>
              <span>${escapeHtml(handoffSummary)}</span>
              ${handoffSourcePreview ? `<small>${escapeHtml(handoffSourcePreview)}</small>` : ""}
            </div>
          </div>
        </div>

        <section class="lab-mode-grid" aria-label="Lab modes">
          <article class="lab-mode-card ${compareActive ? "" : "is-active"}">
            <span class="lab-card-label">Plan</span>
            <h2>Reproduction plan</h2>
            <ul>
              <li>${project.libraryCount || 0} saved papers</li>
              <li>${project.queueCount || 0} queued readings</li>
              <li>${session?.sections?.length || 0} parsed sections</li>
              <li>${sourceRefs.length} source refs</li>
            </ul>
          </article>

          <article class="lab-mode-card">
            <span class="lab-card-label">Runs</span>
            <h2>Experiment runs</h2>
            <button type="button" class="btn-s" disabled>Run experiment</button>
          </article>

          <article class="lab-mode-card ${compareActive ? "is-active" : ""}">
            <span class="lab-card-label">Compare</span>
            <h2>Result Dossier</h2>
            <button type="button" class="btn-s" data-action="select-stage" data-stage-id="result">Open Compare</button>
          </article>
        </section>

        <section class="lab-run-list" aria-label="Experiment run cards">
          <div class="lab-section-head">
            <div>
              <span class="lab-card-label">Runs</span>
              <h2>Current run queue</h2>
            </div>
            <button type="button" class="btn-s" data-action="create-manual-experiment-run" ${plan ? "" : "disabled"}>Attach result</button>
          </div>
          <div class="lab-run-grid">
            ${runs
              .map(
                (run) => `
                  <article class="lab-run-card">
                    <div class="lab-run-head">
                      <strong>${escapeHtml(run.name)}</strong>
                      ${renderTag(run.status, statusColor(run.status), run.status === "done")}
                    </div>
                    <dl>
                      <div><dt>Metric</dt><dd>${escapeHtml(run.metric)}</dd></div>
                      <div><dt>Unit</dt><dd>${escapeHtml(run.unit || "—")}</dd></div>
                      <div><dt>Paper</dt><dd>${escapeHtml(run.paper)}</dd></div>
                      <div><dt>Ours</dt><dd>${escapeHtml(run.ours)}</dd></div>
                      <div><dt>Delta</dt><dd>${escapeHtml(run.delta)}</dd></div>
                    </dl>
                    ${
                      run.canEdit
                        ? `
                          <form class="lab-result-form" data-action="submit-lab-result-form">
                            <input type="hidden" name="labRunId" value="${escapeHtml(run.id)}" />
                            <input type="hidden" name="labMetricName" value="${escapeHtml(run.metric)}" />
                            <label>
                              <span>Paper baseline</span>
                              <input name="labPaperMetricValue" value="${escapeHtml(run.paper === "linked" || run.paper === "none" ? "" : run.paper)}" placeholder="0.810" />
                            </label>
                            <label>
                              <span>Observed</span>
                              <input name="labObservedMetric" value="${escapeHtml(run.ours === "pending" ? "" : run.ours)}" placeholder="0.842" />
                            </label>
                            <label>
                              <span>Unit</span>
                              <input name="labMetricUnit" value="${escapeHtml(run.unit)}" placeholder="accuracy" />
                            </label>
                            <label>
                              <span>Status</span>
                              <select name="labRunStatus">
                                ${["queue", "running", "done", "error"]
                                  .map((option) => `<option value="${option}" ${run.status === option ? "selected" : ""}>${option}</option>`)
                                  .join("")}
                              </select>
                            </label>
                            <label class="lab-result-notes">
                              <span>Notes</span>
                              <textarea name="labRunNotes" rows="2" placeholder="What changed?">${escapeHtml(run.notes)}</textarea>
                            </label>
                            <button type="submit" class="btn-p" ${state.labSavingRunId === run.id ? "disabled" : ""}>
                              ${state.labSavingRunId === run.id ? "Saving..." : "Save result"}
                            </button>
                          </form>
                        `
                        : ""
                    }
                  </article>
                `,
              )
              .join("")}
          </div>
          <form class="lab-result-form lab-import-form" data-action="submit-lab-import-form">
            <input type="hidden" name="labImportPlanId" value="${escapeHtml(plan?.id || "")}" />
            <label>
              <span>Command</span>
              <input name="labImportCommand" placeholder="python eval.py --dataset ..." ${plan ? "" : "disabled"} />
            </label>
            <label>
              <span>Paper baseline</span>
              <input name="labImportPaperMetricValue" placeholder="0.810" ${plan ? "" : "disabled"} />
            </label>
            <label>
              <span>Unit</span>
              <input name="labImportMetricUnit" placeholder="accuracy" ${plan ? "" : "disabled"} />
            </label>
            <label>
              <span>Artifact label</span>
              <input name="labImportArtifactLabel" placeholder="metrics.json" ${plan ? "" : "disabled"} />
            </label>
            <label>
              <span>Artifact URL</span>
              <input name="labImportArtifactUrl" placeholder="file:///runs/metrics.json" ${plan ? "" : "disabled"} />
            </label>
            <label class="lab-result-notes">
              <span>Run log</span>
              <textarea name="labImportLog" rows="4" placeholder="accuracy: 0.842" ${plan ? "" : "disabled"}></textarea>
            </label>
            <button type="submit" class="btn-p" ${plan && !state.labImporting ? "" : "disabled"}>
              ${state.labImporting ? "Importing..." : "Import run"}
            </button>
          </form>
        </section>
      </section>

      <aside class="lab-agent-panel">
        <div class="agent-panel-header">
          <div class="agent-panel-status">
            ${statusIcon("todo")}
            <span>Analyst agent</span>
          </div>
          ${renderTag(labStatusLabel, session ? TOKENS.search : TOKENS.t3, Boolean(session))}
        </div>
        <div class="agent-panel-body">
          <section class="agent-panel-section" style="border-left-color:${TOKENS.research}">
            <div class="agent-panel-eyebrow" style="color:${TOKENS.research};margin-bottom:4px">Plan</div>
            <p>${escapeHtml(plan ? `${plans.length} plan · ${experimentRuns.length} run · ${dossiers.length} dossier` : session || sourcePacket ? "Reading packet linked. Create a plan from Reader handoff." : "No reading packet selected.")}</p>
          </section>
          <section class="agent-panel-section" style="border-left-color:${TOKENS.result}">
            <div class="agent-panel-eyebrow" style="color:${TOKENS.result};margin-bottom:4px">Compare</div>
            <p>${escapeHtml(dossiers.length ? `${dossiers.length} result dossier ready.` : compareActive ? "Result dossier selected." : "Delta table is empty.")}</p>
          </section>
        </div>
        <div class="agent-panel-footer">
          <button type="button" class="btn-p" data-action="select-stage" data-stage-id="insight">Extract insight</button>
        </div>
      </aside>
    </div>
  `;
}

function renderInsightStage(project) {
  const session = selectedReadingSession();
  const notes = Array.isArray(session?.notes) ? session.notes : [];
  const highlights = Array.isArray(session?.highlights) ? session.highlights : [];
  const graphEvidence = graphEvidenceItems(state.projectGraph);
  const insightCards = Array.isArray(state.projectGraph?.insightCards) ? state.projectGraph.insightCards : [];
  const evaluatedInsightCards = insightCards.map((card) => enrichInsightCardForQuality(card, insightCards));
  const insightClusters = buildInsightClusters(evaluatedInsightCards);
  const evidenceItems = graphEvidence.length ? graphEvidence : [...notes, ...highlights].slice(0, 4);
  const hasEvidence = evidenceItems.length > 0;
  const fallbackEvidence = [
    {
      cat: session ? "Reading Packet" : "Project",
      text: session?.summary || project?.focus || "No linked evidence",
    },
    {
      cat: "Result Dossier",
      text: "No result attached",
    },
  ];
  const evidence = evidenceItems.length
    ? evidenceItems.map((entry) => ({
        cat: entry.cat || entry.type || entry.kind || "Evidence",
        evidenceLinkIds: Array.isArray(entry.evidenceLinkIds)
          ? entry.evidenceLinkIds
          : [entry.evidenceLinkId].filter(Boolean),
        page: entry.page || "",
        text: entry.quote || entry.text || entry.body || entry.memo || "No evidence text",
      }))
    : fallbackEvidence;
  const primaryCard = evaluatedInsightCards[0] || null;
  const primaryClaim = primaryCard?.claim || (hasEvidence ? evidence[0]?.text : project?.focus || "Select evidence to draft a claim");
  const focus = project?.focus || session?.title || "current research direction";
  const hypotheses = hasEvidence
    ? [
        `${focus}: verify the strongest unresolved assumption.`,
        "Compare the smallest ablation before expanding the run.",
      ]
    : [];
  const displayedInsightCards = evaluatedInsightCards.length
    ? evaluatedInsightCards
    : [
        {
          claim: primaryClaim,
          confidence: hasEvidence ? "unrated" : "—",
          evidenceLinkIds: evidence[0]?.evidenceLinkIds || [],
          nextAction: hasEvidence ? "Send to Writing or Lab" : "Link evidence",
          status: hasEvidence ? "draft" : "empty",
        },
      ];
  const selectedInsightCard =
    evaluatedInsightCards.find((card) => card.id === state.activeInsightCardId) || evaluatedInsightCards[0] || null;

  return `
    <div class="insight-stage" data-ares-surface="insight-stage" data-ares-stage="insight">
      <section class="insight-main">
        <div class="insight-hero">
            <div>
              <div class="insight-kicker">${icon("sparkles", { size: 14, color: TOKENS.insight })}<span>Insight</span></div>
              <h1>Evidence to decisions</h1>
              <p>Claims, hypotheses, and decisions from linked evidence.</p>
            </div>
          <div class="insight-hero-actions">
            <button type="button" class="btn-p" data-action="select-stage" data-stage-id="writing">Send to Writing</button>
            <button type="button" class="btn-s" data-action="select-stage" data-stage-id="research">Create follow-up experiment</button>
            <button type="button" class="btn-s" data-action="create-insight-card" ${hasEvidence ? "" : "disabled"}>Create insight card</button>
          </div>
        </div>

        <div class="insight-grid">
          <aside class="insight-panel">
            <div class="insight-panel-head">
              <span class="insight-card-label">Evidence</span>
              ${renderTag(`${evidence.length} items`, TOKENS.read, true)}
            </div>
            <div class="insight-evidence-list">
              ${evidence
                .map(
                  (item, index) => `
                    <article class="insight-evidence-card">
                      <div class="insight-evidence-meta">
                        ${renderTag(item.cat, index % 2 === 0 ? TOKENS.read : TOKENS.result, true)}
                        ${item.page ? `<span class="mono">p.${escapeHtml(String(item.page))}</span>` : ""}
                      </div>
                      <p>${escapeHtml(String(item.text).slice(0, 220))}</p>
                    </article>
                  `,
                )
                .join("")}
            </div>
            ${renderInsightClusterSummary(insightClusters)}
          </aside>

          <section class="insight-panel insight-panel--cards">
            <div class="insight-panel-head">
              <span class="insight-card-label">Claims</span>
              ${renderTag(`${insightCards.length || 1} Insight Card`, TOKENS.insight, true)}
            </div>
            ${
              displayedInsightCards
                .slice(0, 3)
                .map(
                  (card, index) => {
                    const isSelected = Boolean(card.id && selectedInsightCard?.id === card.id);
                    const qualityCriteria = card.qualityCriteria || {};
                    const claimCluster = card.claimCluster || null;
                    return `
                    <article class="insight-card ${isSelected || (!selectedInsightCard && index === 0) ? "is-primary" : ""}">
                      <div class="insight-card-top">
                        <span class="insight-card-label">Insight Card</span>
                        ${renderTag(card.status || "draft", hasEvidence || insightCards.length ? TOKENS.insight : TOKENS.t3, Boolean(hasEvidence || insightCards.length))}
                      </div>
                      <h2>${escapeHtml(String(card.claim || primaryClaim).replace(/\s+/g, " ").slice(0, 96))}</h2>
                      <dl>
                        <div>
                          <dt>linked evidence</dt>
                          <dd>${escapeHtml(card.evidenceLinkIds?.length ? `${card.evidenceLinkIds.length} source` : evidence[0]?.cat || "Evidence")}</dd>
                        </div>
                        <div>
                          <dt>confidence</dt>
                          <dd>${escapeHtml(card.confidence || "unrated")}</dd>
                        </div>
                        <div>
                          <dt>evidence coverage</dt>
                          <dd>${escapeHtml(qualityCriteria.evidenceCoverage || "unrated")}</dd>
                        </div>
                        <div>
                          <dt>auto quality</dt>
                          <dd>${escapeHtml(claimCluster?.label ? `${claimCluster.label} · ${claimCluster.relatedInsightCardIds?.length || 1} related claims` : "unclustered")}</dd>
                        </div>
                        <div>
                          <dt>contradiction</dt>
                          <dd>${escapeHtml(qualityCriteria.contradictionFlag || "unchecked")}</dd>
                        </div>
                        <div>
                          <dt>follow-up run</dt>
                          <dd>${escapeHtml(qualityCriteria.followUpExperimentId || "none")}</dd>
                        </div>
                        ${
                          card.failureCause
                            ? `<div><dt>failure cause</dt><dd>${escapeHtml(String(card.failureCause).slice(0, 120))}</dd></div>`
                            : ""
                        }
                        ${
                          card.followUpExperiment
                            ? `<div><dt>follow-up</dt><dd>${escapeHtml(String(card.followUpExperiment).slice(0, 120))}</dd></div>`
                            : ""
                        }
                        <div>
                          <dt>next action</dt>
                          <dd>${escapeHtml(card.nextAction || "Send to Writing or Lab")}</dd>
                        </div>
                      </dl>
                      <div class="insight-card-actions">
                        ${
                          card.id
                            ? `<button type="button" class="btn-s" data-action="select-insight-card" data-insight-card-id="${escapeHtml(card.id)}">${isSelected ? "Selected" : "Select"}</button>`
                            : ""
                        }
                        <button type="button" class="btn-p" data-action="select-stage" data-stage-id="writing">Send to Writing</button>
                        <button type="button" class="btn-s" data-action="create-follow-up-experiment" data-insight-card-id="${escapeHtml(card.id || "")}" ${card.id ? "" : "disabled"}>Create follow-up experiment</button>
                      </div>
                      ${
                        isSelected
                          ? `
                            <form class="insight-edit-form" data-action="submit-insight-card-form">
                              <input type="hidden" name="insightCardId" value="${escapeHtml(card.id)}" />
                              <label>
                                <span>Claim</span>
                                <textarea name="insightClaim" rows="3">${escapeHtml(card.claim || "")}</textarea>
                              </label>
                              <div class="insight-edit-row">
                                <label>
                                  <span>Type</span>
                                  <select name="insightType">
                                    ${["claim", "hypothesis", "decision", "observation"]
                                      .map((option) => `<option value="${option}" ${card.type === option ? "selected" : ""}>${option}</option>`)
                                      .join("")}
                                  </select>
                                </label>
                                <label>
                                  <span>Confidence</span>
                                  <select name="insightConfidence">
                                    ${["unrated", "low", "medium", "high"]
                                      .map((option) => `<option value="${option}" ${card.confidence === option ? "selected" : ""}>${option}</option>`)
                                      .join("")}
                                  </select>
                                </label>
                              </div>
                              <div class="insight-edit-row">
                                <label>
                                  <span>Evidence coverage</span>
                                  <select name="insightEvidenceCoverage">
                                    ${["unrated", "weak", "partial", "strong"]
                                      .map(
                                        (option) =>
                                          `<option value="${option}" ${qualityCriteria.evidenceCoverage === option ? "selected" : ""}>${option}</option>`,
                                      )
                                      .join("")}
                                  </select>
                                </label>
                                <label>
                                  <span>Contradiction</span>
                                  <select name="insightContradictionFlag">
                                    ${["unchecked", "none", "possible", "conflict"]
                                      .map(
                                        (option) =>
                                          `<option value="${option}" ${qualityCriteria.contradictionFlag === option ? "selected" : ""}>${option}</option>`,
                                      )
                                      .join("")}
                                  </select>
                                </label>
                              </div>
                              <label>
                                <span>Follow-up run</span>
                                <input name="insightFollowUpExperimentId" value="${escapeHtml(qualityCriteria.followUpExperimentId || "")}" />
                              </label>
                              <label>
                                <span>Next action</span>
                                <textarea name="insightNextAction" rows="2">${escapeHtml(card.nextAction || "")}</textarea>
                              </label>
                              <div class="insight-edit-actions">
                                <button type="submit" class="btn-p" ${state.insightSavingCardId === card.id ? "disabled" : ""}>${state.insightSavingCardId === card.id ? "Saving..." : "Save insight"}</button>
                                <button type="button" class="btn-s" data-action="delete-insight-card" data-insight-card-id="${escapeHtml(card.id)}" ${state.insightSavingCardId === card.id ? "disabled" : ""}>Delete</button>
                              </div>
                            </form>
                          `
                          : ""
                      }
                    </article>
                  `;
                  },
                )
                .join("")
            }
          </section>

          <aside class="insight-panel">
            <div class="insight-panel-head">
              <span class="insight-card-label">Hypotheses</span>
              ${renderTag("Decisions", TOKENS.research, true)}
            </div>
            <div class="insight-hypothesis-list">
              ${
                hypotheses.length
                  ? hypotheses
                      .map(
                        (hypothesis, index) => `
                          <article class="insight-hypothesis-card">
                            <span class="mono">H${index + 1}</span>
                            <p>${escapeHtml(hypothesis)}</p>
                          </article>
                        `,
                      )
                      .join("")
                  : '<div class="insight-empty-compact">No hypotheses</div>'
              }
            </div>
            <div class="insight-decision-box">
              <span class="insight-card-label">Decisions</span>
              <p>${escapeHtml(hasEvidence ? "Route the claim forward or back to Lab." : "No decision")}</p>
            </div>
          </aside>
        </div>
      </section>
    </div>
  `;
}

function renderWritingStage(project) {
  const session = selectedReadingSession();
  const sourceTitle = session?.title || dashboardLibraryItems()[0]?.title || project?.name || "Untitled research draft";
  const { acceptedInsightCards, draftSections, insightCards } = createDraftFeatureModel(state.projectGraph);
  const sections = draftSections.length
    ? draftSections.map((section) => ({
        id: section.id,
        label: section.title || section.sectionType || "Section",
        status: section.status || "draft",
        words: String(section.body || "").split(/\s+/).filter(Boolean).length,
      }))
    : [
        { id: "abstract", label: "Abstract", status: "todo", words: 0 },
        { id: "intro", label: "Introduction", status: "queue", words: 120 },
        { id: "related", label: "Related Work", status: "todo", words: 0 },
        { id: "method", label: "Method", status: "queue", words: 180 },
        { id: "experiments", label: "Experiments", status: "todo", words: 0 },
        { id: "conclusion", label: "Conclusion", status: "todo", words: 0 },
      ];
  const activeSection =
    draftSections.find((section) => section.id === state.activeDraftSectionId) || draftSections[0] || null;
  const activeInsight =
    insightCards.find((card) => Array.isArray(activeSection?.insightCardIds) && activeSection.insightCardIds.includes(card.id)) ||
    acceptedInsightCards.find((card) => card.id === state.activeInsightCardId) ||
    acceptedInsightCards[0] ||
    null;
  const draftSaving = Boolean(activeSection?.id && state.draftSavingSectionId === activeSection.id);
  const evidence = [
    {
      label: "Insight Card",
      detail: activeInsight?.claim || session?.summary || "No claim selected.",
    },
    {
      label: "Evidence Bundle",
      detail: activeInsight?.evidenceLinkIds?.length ? `${activeInsight.evidenceLinkIds.length} linked source` : sourceTitle,
    },
    {
      label: "Result Dossier",
      detail: "No result attached.",
    },
  ];

  return `
    <div class="writing-stage" data-ares-surface="writing-stage" data-ares-stage="writing">
      <aside class="writing-outline">
        <div class="writing-panel-head">
          <span class="writing-card-label">Outline</span>
          ${renderTag(`${sections.length} sections`, TOKENS.writing, true)}
        </div>
        <div class="writing-section-list">
          ${sections
            .map(
              (section) => `
                <button
                  type="button"
                  class="writing-section-row ${activeSection?.id === section.id || (!activeSection && section.status === "queue") ? "is-active" : ""}"
                  data-action="select-draft-section"
                  data-draft-section-id="${escapeHtml(section.id)}"
                  ${draftSections.length ? "" : "disabled"}
                >
                  <span>${escapeHtml(section.label)}</span>
                  <small class="mono">${escapeHtml(section.status)} · ${escapeHtml(String(section.words))}w</small>
                </button>
              `,
            )
            .join("")}
        </div>
      </aside>

      <main class="writing-editor">
        <div class="writing-hero">
            <div>
              <div class="writing-kicker">${icon("pen", { size: 14, color: TOKENS.writing })}<span>Writing</span></div>
              <h1>Draft from evidence</h1>
              <p>Source-linked sections and export queue.</p>
          </div>
          <div class="writing-actions">
            <button type="button" class="btn-p" data-action="create-draft-section" ${activeInsight ? "" : "disabled"}>Generate section</button>
            <button type="button" class="btn-s" data-action="export-writing-draft" ${draftSections.length ? "" : "disabled"}>Export</button>
          </div>
        </div>

        <section class="writing-draft-card">
          <div class="writing-draft-toolbar">
            <span class="writing-card-label">Draft</span>
            ${renderTag("source-linked draft", TOKENS.writing, true)}
          </div>
          <article class="writing-draft-body">
            <h2>${escapeHtml(activeSection?.title || "Method")}</h2>
            <p>
              Source: <strong>${escapeHtml(sourceTitle)}</strong>
            </p>
            <blockquote>${escapeHtml(activeSection?.body || "No suggestion selected.")}</blockquote>
          </article>
          ${
            activeSection
              ? `
                <form class="writing-section-form" data-action="submit-draft-section-form">
                  <input type="hidden" name="draftSectionId" value="${escapeHtml(activeSection.id)}" />
                  <div class="writing-section-form-row">
                    <label>
                      <span>Title</span>
                      <input name="draftSectionTitle" value="${escapeHtml(activeSection.title || "")}" ${draftSaving ? "disabled" : ""} />
                    </label>
                    <label>
                      <span>Type</span>
                      <select name="draftSectionType" ${draftSaving ? "disabled" : ""}>
                        ${["abstract", "introduction", "method", "experiments", "related-work", "discussion", "conclusion", "section"]
                          .map(
                            (type) =>
                              `<option value="${type}" ${type === (activeSection.sectionType || "section") ? "selected" : ""}>${type}</option>`,
                          )
                          .join("")}
                      </select>
                    </label>
                  </div>
                  <label>
                    <span>Body</span>
                    <textarea name="draftSectionBody" rows="8" ${draftSaving ? "disabled" : ""}>${escapeHtml(activeSection.body || "")}</textarea>
                  </label>
                  <div class="writing-section-form-row">
                    <label>
                      <span>Status</span>
                      <select name="draftSectionStatus" ${draftSaving ? "disabled" : ""}>
                        ${["draft", "review", "done"]
                          .map(
                            (status) =>
                              `<option value="${status}" ${status === (activeSection.status || "draft") ? "selected" : ""}>${status}</option>`,
                          )
                          .join("")}
                      </select>
                    </label>
                  </div>
                  <div class="writing-section-actions">
                    <button type="submit" class="btn-p" ${draftSaving ? "disabled" : ""}>${draftSaving ? "Saving..." : "Save section"}</button>
                    <button
                      type="button"
                      class="btn-s"
                      data-action="delete-draft-section"
                      data-draft-section-id="${escapeHtml(activeSection.id)}"
                      ${draftSaving ? "disabled" : ""}
                    >Delete section</button>
                  </div>
                </form>
              `
              : ""
          }
          <div class="writing-suggestion-bar">
            <button type="button" class="btn-s" data-action="select-stage" data-stage-id="insight">Insert evidence</button>
            <button type="button" class="btn-s" data-action="create-draft-section" ${activeInsight ? "" : "disabled"}>Accept suggestion</button>
          </div>
        </section>
      </main>

      <aside class="writing-sources">
        <div class="writing-panel-head">
          <span class="writing-card-label">Sources</span>
          ${renderTag("Evidence Bundle", TOKENS.read, true)}
        </div>
        <div class="writing-source-list">
          ${evidence
            .map(
              (item) => `
                <article class="writing-source-card">
                  <span class="writing-card-label">${escapeHtml(item.label)}</span>
                  <p>${escapeHtml(item.detail)}</p>
                </article>
              `,
            )
            .join("")}
        </div>
        <div class="writing-gap-box">
          <span class="writing-card-label">Evidence gaps</span>
          <p>Resolve before export.</p>
        </div>
      </aside>
    </div>
  `;
}

function renderBottomNav() {
  const activeTab = activeWorkflowTab();
  return `
    <nav class="bottom-nav${bottomNavHidden ? " bottom-nav-hidden" : ""}" aria-label="Workflow tabs" data-ares-surface="bottom-nav" data-ares-role="navigation">
      <span class="bottom-nav-indicator" aria-hidden="true"></span>
      ${WORKFLOW_TABS.map((tab) => {
        const active = tab.id === activeTab.id;
        return `
          <button
            type="button"
            class="nav-item ${active ? "active" : ""}"
            aria-label="${escapeHtml(tab.label)}"
            aria-current="${active ? "page" : "false"}"
            data-action="select-workflow-tab"
            data-tab-id="${escapeHtml(tab.id)}"
            data-stage-id="${escapeHtml(tab.defaultStage)}"
            style="--stage-color:${tab.color};--stage-tint:${tab.color}12"
            data-ares-role="bottom-stage"
            data-ares-tab="${escapeHtml(tab.id)}"
            data-ares-stage="${escapeHtml(tab.defaultStage)}"
            data-bottom-nav-tab="${escapeHtml(tab.id)}"
          >
            ${icon(tab.icon, { size: 20 })}
            <span>${escapeHtml(tab.shortLabel)}</span>
          </button>
        `;
      }).join("")}
    </nav>
  `;
}

function getWindowScrollY() {
  return Math.max(window.scrollY || 0, document.documentElement.scrollTop || 0, document.body.scrollTop || 0);
}

function getBottomNavScrollContainers() {
  return Array.from(document.querySelectorAll(BOTTOM_NAV_SCROLL_SOURCE_SELECTORS.join(","))).filter(
    (element) => element.scrollHeight > element.clientHeight,
  );
}

function getBottomNavScrollY() {
  return Math.max(
    getWindowScrollY(),
    ...getBottomNavScrollContainers().map((element) => element.scrollTop || 0),
  );
}

function isBottomNavMobile() {
  return window.innerWidth <= SEARCH_LAYOUT_BREAKPOINTS.mobileMax;
}

function isIosViewportBrowserChromeFallbackTarget() {
  const platform = navigator.platform || "";
  const userAgent = navigator.userAgent || "";
  const isIosDevice = /iP(ad|hone|od)/.test(platform) || (/Mac/.test(platform) && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true;
  return isBottomNavMobile() && isIosDevice && /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent) && !isStandalone;
}

function getViewportBrowserBottomOcclusion() {
  const viewport = window.visualViewport;
  if (!viewport) {
    return 0;
  }

  const layoutHeight = window.innerHeight || document.documentElement.clientHeight || viewport.height;
  const visibleBottom = viewport.offsetTop + viewport.height;
  return Math.max(0, Math.ceil(layoutHeight - visibleBottom));
}

function getViewportBrowserBottomFallback() {
  if (!isIosViewportBrowserChromeFallbackTarget()) {
    return 0;
  }

  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || window.visualViewport?.height || 0;
  return Math.round(Math.min(
    IOS_BROWSER_CHROME_FALLBACK_MAX,
    Math.max(IOS_BROWSER_CHROME_FALLBACK_MIN, viewportHeight * IOS_BROWSER_CHROME_FALLBACK_RATIO),
  ));
}

function syncViewportChromeVariables() {
  document.documentElement.style.setProperty("--viewport-browser-bottom", `${getViewportBrowserBottomOcclusion()}px`);
  document.documentElement.style.setProperty("--viewport-browser-bottom-fallback", `${getViewportBrowserBottomFallback()}px`);
}

function scheduleViewportChromeSync() {
  if (viewportChromeFrame) {
    return;
  }

  viewportChromeFrame = window.requestAnimationFrame(() => {
    viewportChromeFrame = 0;
    syncViewportChromeVariables();
    syncBottomNavIndicator();
  });
}

function bindViewportChromeLifecycle() {
  if (viewportChromeLifecycleBound) {
    return;
  }

  viewportChromeLifecycleBound = true;
  syncViewportChromeVariables();
  window.addEventListener("resize", scheduleViewportChromeSync);
  window.addEventListener("orientationchange", scheduleViewportChromeSync);
  window.addEventListener("pageshow", scheduleViewportChromeSync);
  document.addEventListener("visibilitychange", scheduleViewportChromeSync);

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", scheduleViewportChromeSync);
    window.visualViewport.addEventListener("scroll", scheduleViewportChromeSync);
  }
}

function setBottomNavHidden(nextHidden) {
  if (bottomNavHidden === nextHidden) {
    return;
  }

  bottomNavHidden = nextHidden;
  const nav = document.querySelector('[data-ares-surface="bottom-nav"]');
  if (nav) {
    nav.classList.toggle("bottom-nav-hidden", nextHidden);
  }
}

function primeBottomNavAutoHideState() {
  bottomNavAutoHideState = primeAutoHideScrollState({
    currentY: getBottomNavScrollY(),
    now: Date.now(),
    resumeGuardMs: AUTO_HIDE_RESUME_GUARD_MS,
  });
  setBottomNavHidden(bottomNavAutoHideState.hidden);
}

function updateBottomNavVisibility() {
  bottomNavScrollFrame = 0;
  if (!bottomNavAutoHideState) {
    primeBottomNavAutoHideState();
  }

  bottomNavAutoHideState = reduceAutoHideScrollState({
    state: bottomNavAutoHideState,
    currentY: getBottomNavScrollY(),
    now: Date.now(),
    isMobile: isBottomNavMobile(),
    thresholds: BOTTOM_NAV_AUTO_HIDE_THRESHOLDS,
  });
  setBottomNavHidden(bottomNavAutoHideState.hidden);
}

function onBottomNavScroll() {
  if (bottomNavScrollFrame) {
    return;
  }
  bottomNavScrollFrame = window.requestAnimationFrame(updateBottomNavVisibility);
}

function onBottomNavResize() {
  scheduleViewportChromeSync();

  if (bottomNavScrollFrame) {
    window.cancelAnimationFrame(bottomNavScrollFrame);
    bottomNavScrollFrame = 0;
  }

  bottomNavAutoHideState = {
    ...(bottomNavAutoHideState || { hidden: false, resumeGuardUntil: 0 }),
    hidden: isBottomNavMobile() ? bottomNavHidden : false,
    lastScrollY: getBottomNavScrollY(),
    resumeGuardUntil: 0,
  };
  setBottomNavHidden(bottomNavAutoHideState.hidden);
  window.requestAnimationFrame(syncBottomNavIndicator);
}

function onBottomNavResume() {
  if (document.visibilityState === "hidden") {
    return;
  }

  if (bottomNavScrollFrame) {
    window.cancelAnimationFrame(bottomNavScrollFrame);
    bottomNavScrollFrame = 0;
  }
  primeBottomNavAutoHideState();
  window.requestAnimationFrame(syncBottomNavIndicator);
}

function syncBottomNavIndicator() {
  const nav = document.querySelector('[data-ares-surface="bottom-nav"]');
  const indicator = nav?.querySelector(".bottom-nav-indicator");
  const activeButton = nav?.querySelector(".nav-item.active");
  if (!nav || !indicator || !activeButton) {
    return;
  }

  const navRect = nav.getBoundingClientRect();
  const buttonRect = activeButton.getBoundingClientRect();
  const width = Math.round(buttonRect.width);
  const x = Math.round(buttonRect.left - navRect.left - 4);

  indicator.style.width = `${width}px`;
  indicator.style.transform = `translateX(${x}px)`;
  indicator.style.opacity = "1";
}

function bindBottomNavLifecycle() {
  if (bottomNavLifecycleBound) {
    return;
  }

  bottomNavLifecycleBound = true;
  bindViewportChromeLifecycle();
  primeBottomNavAutoHideState();
  window.addEventListener("scroll", onBottomNavScroll, { passive: true });
  document.addEventListener("scroll", onBottomNavScroll, { passive: true, capture: true });
  window.addEventListener("resize", onBottomNavResize);
  window.addEventListener("focus", onBottomNavResume);
  window.addEventListener("pageshow", onBottomNavResume);
  window.addEventListener("orientationchange", syncBottomNavIndicator);
  document.addEventListener("visibilitychange", onBottomNavResume);
}

function syncBottomNavAfterRender() {
  bindBottomNavLifecycle();
  const nav = document.querySelector('[data-ares-surface="bottom-nav"]');
  if (nav) {
    nav.classList.toggle("bottom-nav-hidden", bottomNavHidden);
  }
  window.requestAnimationFrame(syncBottomNavIndicator);
}

function renderShell(message) {
  readingPdfController.resetSurface();
  clearAgenticSearchBodyState();
  app.innerHTML = `
    <div class="app-shell">
      <main class="workspace">
        <header class="main-topbar">
          <div class="topbar-stage">
            <span class="topbar-stage-label">ARES</span>
          </div>
        </header>
        <div class="empty-state">${escapeHtml(message)}</div>
      </main>
    </div>
  `;
}

function render() {
  syncResponsiveSearchLayout();
  syncResponsiveReadingHomeLayout();
  const project = activeProject();
  const preservedPdfHost = captureStableReadingPdfHost();

  if (!project) {
    renderShell(state.error || (state.booting ? "프로젝트 정보를 불러오는 중입니다." : "프로젝트 정보를 불러오지 못했습니다."));
    return;
  }

  const selected =
    state.activeStage === "search"
      ? selectedPaper()
      : state.activeStage === "reading"
        ? currentReadingPaper(project)
        : null;
  const stageContent =
    state.activeStage === "search"
      ? renderSearchStage(project)
      : state.activeStage === "reading"
        ? renderReadingStage(project)
        : state.activeStage === "research" || state.activeStage === "result"
          ? renderLabStage(project)
          : state.activeStage === "insight"
            ? renderInsightStage(project)
            : state.activeStage === "writing"
              ? renderWritingStage(project)
              : renderSearchStage(project);

  app.innerHTML = `
    <div
      class="app-shell"
      data-ares-app="true"
      data-active-stage="${escapeHtml(state.activeStage)}"
      data-active-tab="${escapeHtml(activeWorkflowTab().id)}"
      data-active-project-id="${escapeHtml(project.id)}"
      data-active-project-name="${escapeHtml(project.name)}"
      data-active-paper-id="${escapeHtml(selected?.paperId || "")}"
      data-active-paper-title="${escapeHtml(selected?.title || "")}"
    >
      ${renderSidebar()}
      <main class="workspace" data-ares-surface="workspace" data-ares-stage="${escapeHtml(state.activeStage)}">
        ${renderTopbar()}
        <div class="stage-wrap" data-ares-surface="stage-wrap" data-ares-stage="${escapeHtml(state.activeStage)}">
          ${renderWorkflowModeNav()}
          ${stageContent}
        </div>
      </main>
      ${renderBottomNav()}
    </div>
  `;
  syncAgenticSearchStageDom();
  restoreStableReadingPdfHost(preservedPdfHost);
  syncBrowserUrlFromState();
  scheduleReadingHydration();
  syncBottomNavAfterRender();
}

function focusSearchInput({ forceSearchStage = false, select = false } = {}) {
  if (forceSearchStage && state.activeStage !== "search") {
    state.activeStage = "search";
    saveStorage(STORAGE_KEYS.stage, state.activeStage);
    render();
  }

  window.requestAnimationFrame(() => {
    const input = document.querySelector("#search-input");
    if (!input) {
      return;
    }

    input.focus();
    if (select) {
      input.select();
    }
  });
}

function syncAppActivePaperMetadata(paper) {
  const shell = document.querySelector('[data-ares-app="true"]');
  if (!shell) {
    return;
  }

  shell.dataset.activePaperId = paper?.paperId || "";
  shell.dataset.activePaperTitle = paper?.title || "";
}

function replaceSearchPreviewSurface(markup) {
  const stage = document.querySelector('[data-ares-surface="search-stage"]');
  const currentPreview = stage?.querySelector('[data-ares-surface="search-preview"]');
  if (!stage || !currentPreview) {
    return false;
  }

  stage.querySelector(".preview-backdrop")?.remove();

  const template = document.createElement("template");
  template.innerHTML = markup.trim();
  const nextNodes = Array.from(template.content.children);
  currentPreview.replaceWith(...nextNodes);
  return true;
}

function patchSearchSelectionUI() {
  if (state.activeStage !== "search") {
    return false;
  }

  const stage = document.querySelector('[data-ares-surface="search-stage"]');
  if (!stage) {
    return false;
  }

  const rows = stage.querySelectorAll('[data-action="select-paper"]');
  if (!rows.length) {
    return false;
  }

  rows.forEach((row) => {
    const isSelected = row.dataset.paperId === state.selectedPaperId;
    row.classList.toggle("is-selected", isSelected);
    const venueBar = row.querySelector(".paper-venue-bar");
    if (venueBar) {
      venueBar.style.opacity = isSelected ? "1" : "0.32";
    }
  });

  const paper = selectedPaper();
  if (!replaceSearchPreviewSurface(renderSearchPreview(paper))) {
    return false;
  }

  syncAppActivePaperMetadata(paper);
  return true;
}

function patchSearchStageUI() {
  if (state.activeStage !== "search") {
    return false;
  }

  const project = activeProject();
  const currentStage = document.querySelector('[data-ares-surface="search-stage"]');
  if (!project || !currentStage) {
    return false;
  }

  const template = document.createElement("template");
  template.innerHTML = renderSearchStage(project).trim();
  const nextStage = template.content.firstElementChild;
  if (!nextStage) {
    return false;
  }

  currentStage.replaceWith(nextStage);
  syncAgenticSearchStageDom();
  syncAppActivePaperMetadata(selectedPaper());
  syncBrowserUrlFromState();
  return true;
}

function scrollReadingChatToBottom() {
  const chatBody = document.querySelector(".reading-chat-body");
  if (chatBody) {
    chatBody.scrollTop = chatBody.scrollHeight;
  }
}

function refreshActiveStageUI() {
  if (state.activeStage === "reading") {
    refreshReadingStageUI();
    return;
  }

  if (state.activeStage === "search" && patchSearchStageUI()) {
    return;
  }

  render();
}

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

function renderWithViewTransition() {
  const applyMorphFlag = () => {
    const shell = document.querySelector('[data-ares-app="true"]');
    if (shell) {
      shell.setAttribute("data-ares-morph", "true");
    }
  };
  const clearMorphFlag = () => {
    const shell = document.querySelector('[data-ares-app="true"]');
    if (shell) {
      shell.removeAttribute("data-ares-morph");
    }
  };

  if (prefersReducedMotion()) {
    render();
    return;
  }

  // Chrome/Edge — native View Transitions API: cross-fade + element morph.
  if (typeof document.startViewTransition === "function") {
    try {
      const transition = document.startViewTransition(() => {
        render();
        applyMorphFlag();
      });
      window.setTimeout(clearMorphFlag, 1500);
      if (transition && typeof transition.finished?.catch === "function") {
        transition.finished.catch(() => {});
      }
      return;
    } catch (_err) {
      // fall through to CSS-only path
    }
  }

  // Safari / Firefox — no VT API, but still fire staggered entrance animations
  // by setting the `data-ares-morph` flag so gated CSS rules apply.
  render();
  applyMorphFlag();
  window.setTimeout(clearMorphFlag, 1500);
}

function previewSearchModeSwitch(nextMode) {
  const dashboardHero = document.querySelector(".dashboard-hero");
  const resultsHero = document.querySelector(".hero-input");
  const hero = dashboardHero || resultsHero;
  if (!hero) {
    return Promise.resolve();
  }

  const currentMode = hero.classList.contains("scout") ? "scout" : "keyword";
  if (currentMode === nextMode) {
    return Promise.resolve();
  }

  if (prefersReducedMotion()) {
    return Promise.resolve();
  }

  const btnSelector = dashboardHero ? ".dashboard-sbtn" : ".hero-submit-btn";
  const placeholderInput = hero.querySelector("#search-input");

  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      hero.classList.remove("scout", "keyword");
      hero.classList.add(nextMode);

      const activeButton = hero.querySelector(`${btnSelector}.active`);
      const nextButton = hero.querySelector(`${btnSelector}[data-mode="${nextMode}"]`);
      activeButton?.classList.remove("active", "is-just-activated");
      if (nextButton) {
        nextButton.classList.add("active", "is-just-activated");
        nextButton.addEventListener(
          "animationend",
          () => nextButton.classList.remove("is-just-activated"),
          { once: true },
        );
      }

      if (placeholderInput) {
        placeholderInput.placeholder = searchPlaceholder(nextMode);
      }

      window.setTimeout(resolve, SEARCH_MODE_TRANSITION_MS);
    });
  });
}

function focusScopePickerInput() {
  window.requestAnimationFrame(() => {
    const input = document.querySelector('[name="scopePickerQuery"]');
    if (!input) {
      return;
    }

    input.focus();
    const length = input.value.length;
    input.setSelectionRange(length, length);
  });
}

function startReadingResize(axis, event) {
  if (state.readingWorkbenchCollapsed) {
    return;
  }

  readingResizeDrag = {
    axis,
    startX: event.clientX,
    startY: event.clientY,
    startSplit: axis === "vertical" ? state.readingSplitVertical : state.readingSplitHorizontal,
  };
  document.body.classList.add("reading-resize-active");
}

function applyReadingSplitUI() {
  if (state.activeStage !== "reading") {
    return false;
  }

  const stage = document.querySelector('[data-ares-surface="reading-stage"]');
  const split = stage?.querySelector(".reading-split");
  const docPane = split?.querySelector(".reading-doc-pane");
  if (!stage || !split || !docPane) {
    return false;
  }

  const orientation = state.readingOrientation === "vertical" ? "vertical" : "horizontal";
  const splitValue = orientation === "vertical" ? state.readingSplitVertical : state.readingSplitHorizontal;
  const workbenchPane = split.querySelector(".reading-workbench-pane");
  const handle = split.querySelector(".reading-resize-handle");

  stage.dataset.readingOrientation = orientation;
  split.classList.toggle("is-vertical", orientation === "vertical");
  docPane.style.flex = state.readingWorkbenchCollapsed ? "1 1 auto" : `0 0 calc(${splitValue}% - 2.5px)`;

  if (workbenchPane) {
    workbenchPane.style.flex = `0 0 calc(${100 - splitValue}% - 2.5px)`;
  }

  if (handle) {
    handle.classList.toggle("is-vertical", orientation === "vertical");
    handle.classList.toggle("is-horizontal", orientation !== "vertical");
    handle.dataset.readingResizeAxis = orientation;
  }

  return true;
}

function stopReadingResize() {
  readingResizeDrag = null;
  if (readingResizeFrame) {
    window.cancelAnimationFrame(readingResizeFrame);
    readingResizeFrame = 0;
  }
  document.body.classList.remove("reading-resize-active");
}

function updateReadingSplitFromPointer(clientX, clientY) {
  if (!readingResizeDrag) {
    return;
  }

  const split = document.querySelector(".reading-split");
  if (!split) {
    return;
  }

  const rect = split.getBoundingClientRect();
  const axis = readingResizeDrag.axis;
  const bounds = axis === "vertical" ? { min: 32, max: 82 } : { min: 30, max: 82 };

  if (axis === "vertical") {
    const delta = clientY - readingResizeDrag.startY;
    const total = Math.max(rect.height, 1);
    const next = clampValue(readingResizeDrag.startSplit + (delta / total) * 100, bounds.min, bounds.max);
    if (Math.abs(next - state.readingSplitVertical) >= 0.1) {
      state.readingSplitVertical = Number(next.toFixed(2));
      applyReadingSplitUI();
    }
    return;
  }

  const delta = clientX - readingResizeDrag.startX;
  const total = Math.max(rect.width, 1);
  const next = clampValue(readingResizeDrag.startSplit + (delta / total) * 100, bounds.min, bounds.max);
  if (Math.abs(next - state.readingSplitHorizontal) >= 0.1) {
    state.readingSplitHorizontal = Number(next.toFixed(2));
    applyReadingSplitUI();
  }
}

function applyReadingHomePreviewWidth() {
  const content = document.querySelector(".reading-home-content.is-resizable");
  if (!content) {
    return false;
  }

  content.style.setProperty("--reading-home-preview-w", `${state.readingHomePreviewWidth}px`);
  return true;
}

function startReadingHomeResize(event) {
  if (state.activeStage !== "reading" || state.readingView !== "home" || state.readingHomeLayout !== "desktop") {
    return;
  }

  readingHomeResizeDrag = {
    startWidth: state.readingHomePreviewWidth,
    startX: event.clientX,
  };
  document.body.classList.add("reading-home-resize-active");
}

function stopReadingHomeResize() {
  readingHomeResizeDrag = null;
  document.body.classList.remove("reading-home-resize-active");
}

function updateReadingHomePreviewFromPointer(clientX) {
  if (!readingHomeResizeDrag) {
    return;
  }

  const delta = readingHomeResizeDrag.startX - clientX;
  const nextWidth = clampValue(readingHomeResizeDrag.startWidth + delta, 360, 560);
  if (Math.abs(nextWidth - state.readingHomePreviewWidth) >= 1) {
    state.readingHomePreviewWidth = Number(nextWidth.toFixed(0));
    applyReadingHomePreviewWidth();
  }
}

function openScopePickerFromTrigger(trigger, tab) {
  const rect = trigger.getBoundingClientRect();
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - 384));
  const top = Math.max(56, Math.min(rect.bottom + 8, window.innerHeight - 440));
  const source = trigger.dataset.scopeSource || "hero";

  state.scopePicker = { tab, left, top, source };
  state.scopePickerQuery = "";
  render();
  focusScopePickerInput();
}

document.addEventListener("click", async (event) => {
  const trigger = event.target.closest("[data-action]");
  if (!trigger) {
    let needsRender = false;
    if (state.openWorkflowMenu && !event.target.closest(".sidebar-menu")) {
      state.openWorkflowMenu = "";
      needsRender = true;
    }
    if (state.scopePicker && !event.target.closest(".scope-picker-popover")) {
      state.scopePicker = null;
      state.scopePickerQuery = "";
      needsRender = true;
    }
    if (needsRender) {
      render();
    }
    return;
  }

  const action = trigger.dataset.action;

  if (action !== "toggle-workflow-menu" && action !== "dismiss-workflow-menu") {
    state.openWorkflowMenu = "";
  }

  if (
    state.scopePicker &&
    !trigger.closest(".scope-picker-popover") &&
    !["open-scope-picker", "remove-scope"].includes(action)
  ) {
    state.scopePicker = null;
    state.scopePickerQuery = "";
  }

  if (action === "select-stage") {
    await selectStage(trigger.dataset.stageId);
    return;
  }

  if (action === "select-workflow-tab") {
    await selectWorkflowTab(trigger.dataset.tabId);
    return;
  }

  if (action === "select-project") {
    clearActiveRunPoll();
    state.activeProjectId = trigger.dataset.projectId;
    state.projectLibrary = [];
    state.scopePicker = null;
    saveStorage(STORAGE_KEYS.project, state.activeProjectId);
    await loadProjectGraph();
    state.searchInput = activeResearchQuestion()?.prompt || activeProject()?.defaultQuery || "";
    resetSearchState();
    await loadProjectLibrary();
    await loadReadingSessions({ preserveSelection: false });
    if (state.activeStage === "reading") {
      state.readingView = "home";
      state.readingHomePreviewOpen = false;
    }
    render();
    return;
  }

  if (action === "select-paper") {
    if (modalClosing) return;
    const nextPaperId = trigger.dataset.paperId || "";
    if (state.selectedPaperId === nextPaperId && state.previewPanelOpen) {
      return;
    }

    state.selectedPaperId = nextPaperId;
    state.previewPanelOpen = true;
    if (isTabletSearchLayout()) {
      state.filterPanelOpen = false;
    }
    if (!patchSearchSelectionUI()) {
      render();
    }
    return;
  }

  if (action === "close-filter-panel") {
    state.filterPanelOpen = false;
    render();
    return;
  }

  if (action === "close-preview-panel") {
    state.previewPanelOpen = false;
    render();
    return;
  }

  if (action === "close-preview-modal") {
    state.selectedPaperId = "";
    state.previewPanelOpen = false;
    modalClosing = true;
    render();
    setTimeout(() => { modalClosing = false; }, 350);
    return;
  }

  if (action === "toggle-save") {
    const paper = state.results.find((entry) => entry.paperId === trigger.dataset.paperId);
    if (paper) {
      await savePaper(paper);
    }
    return;
  }

  if (action === "queue-paper") {
    const paper = state.results.find((entry) => entry.paperId === trigger.dataset.paperId);
    if (paper) {
      await startReadingSession(paper);
    }
    return;
  }

  if (action === "open-reading-paper") {
    await openReadingDetailForPaper(trigger.dataset.paperId || "");
    return;
  }

  if (action === "open-reading-upload-modal") {
    state.readingUploadModalOpen = true;
    state.error = "";
    render();
    focusReadingUploadModalInput();
    return;
  }

  if (action === "close-reading-upload-modal") {
    closeReadingUploadModal();
    render();
    return;
  }

  if (action === "submit-reading-upload-modal") {
    if (!readingUploadModalFile) {
      state.error = "업로드할 PDF 파일을 선택하세요.";
      state.readingUploadModalOpen = true;
      render();
      focusReadingUploadModalInput();
      return;
    }

    await uploadReadingPdf(readingUploadModalFile);
    return;
  }

  if (action === "set-reading-home-filter") {
    state.readingHomeFilter = trigger.dataset.readingHomeFilter || "all";
    syncReadingHomeSelection();
    refreshReadingStageUI();
    return;
  }

  if (action === "select-reading-home-paper") {
    state.readingHomeSelectedPaperId = trigger.dataset.readingPaperId || "";
    state.readingHomePreviewMenuOpen = false;
    if (state.readingHomeLayout !== "desktop") {
      state.readingHomePreviewOpen = true;
    }
    refreshReadingStageUI();
    return;
  }

  if (action === "close-reading-home-preview") {
    state.readingHomePreviewOpen = false;
    state.readingHomePreviewMenuOpen = false;
    refreshReadingStageUI();
    return;
  }

  if (action === "toggle-reading-home-preview-menu") {
    const paperId = trigger.dataset.readingPaperId || "";
    if (paperId) {
      state.readingHomeSelectedPaperId = paperId;
    }
    state.readingHomePreviewMenuOpen = !state.readingHomePreviewMenuOpen;
    refreshReadingStageUI();
    return;
  }

  if (action === "open-reading-home-source") {
    const paperId = trigger.dataset.readingPaperId || "";
    if (paperId) {
      state.readingHomeSelectedPaperId = paperId;
    }
    state.readingHomePreviewMenuOpen = false;
    const sourceUrl = readingHomeSourceUrl();
    if (sourceUrl) {
      window.open(sourceUrl, "_blank", "noopener,noreferrer");
      refreshReadingStageUI();
    } else {
      state.error = "Source URL is not available for this paper.";
      render();
    }
    return;
  }

  if (action === "copy-reading-home-paper-link") {
    const paperId = trigger.dataset.readingPaperId || "";
    if (paperId) {
      state.readingHomeSelectedPaperId = paperId;
    }
    state.readingHomePreviewMenuOpen = false;
    const sourceUrl = readingHomeSourceUrl();
    if (sourceUrl) {
      try {
        await copyTextToClipboard(sourceUrl);
      } catch (error) {
        state.error = error.message;
      }
      refreshReadingStageUI();
    } else {
      state.error = "Source URL is not available for this paper.";
      render();
    }
    return;
  }

  if (action === "open-reading-detail") {
    state.readingHomePreviewMenuOpen = false;
    await openReadingDetailForPaper(trigger.dataset.readingPaperId || "");
    return;
  }

  if (action === "select-reading-session") {
    const nextSessionId = trigger.dataset.readingSessionId || "";
    state.readingView = "detail";
    if (nextSessionId !== state.activeReadingSessionId) {
      state.readingPdfSourceHighlight = null;
      state.readingPdfTargetPage = null;
    }
    state.activeReadingSessionId = nextSessionId;
    state.readingHomeSelectedPaperId = selectedReadingSession()?.paperId || state.readingHomeSelectedPaperId;
    renderWithViewTransition();
    return;
  }

  if (action === "back-reading-home") {
    state.readingView = "home";
    state.readingHomeSelectedPaperId = selectedReadingSession()?.paperId || state.readingHomeSelectedPaperId;
    state.readingHomePreviewOpen = false;
    syncReadingHomeSelection();
    renderWithViewTransition();
    return;
  }

  if (action === "set-reading-rail") {
    const nextRail = trigger.dataset.readingRail || "overview";
    state.readingRailOpen = state.readingRailOpen === nextRail ? "" : nextRail;
    refreshReadingStageUI();
    return;
  }

  if (action === "close-reading-rail") {
    state.readingRailOpen = "";
    refreshReadingStageUI();
    return;
  }

  if (action === "set-reading-document-tab") {
    const nextDocumentTab = trigger.dataset.readingDocumentTab || "pdf";
    if (state.readingDocumentTab === nextDocumentTab) {
      return;
    }

    state.readingDocumentTab = nextDocumentTab;
    state.readingContextMenuOpen = false;
    if (state.readingDocumentTab !== "pdf") {
      state.readingPdfTargetPage = null;
      state.readingPdfSourceHighlight = null;
    }
    if (!patchReadingDocumentPaneOnly()) {
      refreshReadingStageUI();
    }
    return;
  }

  if (action === "toggle-reading-context-menu") {
    state.readingContextMenuOpen = !state.readingContextMenuOpen;
    refreshReadingStageUI();
    return;
  }

  if (action === "open-reading-source") {
    const session = selectedReadingSession();
    const sourceUrl = session?.paperUrl || session?.pdfUrl || "";
    state.readingContextMenuOpen = false;
    if (sourceUrl) {
      window.open(sourceUrl, "_blank", "noopener,noreferrer");
      refreshReadingStageUI();
    } else {
      state.error = "Source URL is not available for this reading session.";
      render();
    }
    return;
  }

  if (action === "copy-reading-citation") {
    const session = selectedReadingSession();
    state.readingContextMenuOpen = false;
    if (session?.id) {
      try {
        await copyTextToClipboard(readingCitationText(session));
      } catch (error) {
        state.error = error.message;
      }
    }
    refreshReadingStageUI();
    return;
  }

  if (action === "export-reading-notes") {
    const session = selectedReadingSession();
    state.readingContextMenuOpen = false;
    if (session?.id) {
      exportReadingNotes(session);
    }
    refreshReadingStageUI();
    return;
  }

  if (action === "jump-reading-page") {
    const page = Number(trigger.dataset.readingPage || trigger.dataset.page || "");
    if (Number.isFinite(page) && page > 0) {
      const session = selectedReadingSession();
      const assetId = String(trigger.dataset.readingAssetId || "");
      const sourceAsset = assetId ? session?.assets?.find?.((asset) => asset.id === assetId) : null;
      const sourceBounds = sourceAsset?.sourceBounds;
      state.readingDocumentTab = "pdf";
      state.readingPdfTargetPage = page;
      state.readingPdfSourceHighlight =
        sourceBounds?.unit === "page-ratio"
          ? {
              height: Number(sourceBounds.height) || 0,
              page: Number(sourceBounds.page || page) || page,
              unit: "page-ratio",
              width: Number(sourceBounds.width) || 0,
              x: Number(sourceBounds.x) || 0,
              y: Number(sourceBounds.y) || 0,
            }
          : null;
      state.readingPdfDockPanel = "";
      refreshReadingStageUI();
      window.requestAnimationFrame(() => {
        if (!readingPdfController.scrollToPage(page)) {
          scheduleReadingHydration();
        }
      });
    }
    return;
  }

  if (action === "toggle-reading-pdf-dock-panel") {
    const panel = String(trigger.dataset.readingPdfDockPanel || "");
    state.readingPdfDockPanel = state.readingPdfDockPanel === panel ? "" : panel;
    if (!patchReadingPdfSelectionBarOnly()) {
      refreshReadingStageUI();
    }
    return;
  }

  if (action === "jump-reading-pdf-search-result") {
    const page = Number(trigger.dataset.readingPage || "");
    if (Number.isFinite(page) && page > 0) {
      state.readingPdfTargetPage = page;
      state.readingPdfSourceHighlight = null;
      state.readingPdfDockPanel = "";
      if (!patchReadingPdfSelectionBarOnly()) {
        refreshReadingStageUI();
      }
      window.requestAnimationFrame(() => {
        if (!readingPdfController.scrollToPage(page)) {
          scheduleReadingHydration();
        }
      });
    }
    return;
  }

  if (action === "set-reading-pdf-zoom") {
    const delta = Number(trigger.dataset.readingPdfZoomDelta || "");
    if (Number.isFinite(delta)) {
      const currentZoom = Number(state.readingPdfZoom) || 100;
      state.readingPdfZoom = Math.min(200, Math.max(50, currentZoom + delta));
      state.readingPdfDockPanel = "";
      if (!patchReadingPdfSelectionBarOnly()) {
        refreshReadingStageUI();
      }
      scheduleReadingHydration();
    }
    return;
  }

  if (action === "fit-reading-pdf-zoom") {
    state.readingPdfZoom = 100;
    state.readingPdfDockPanel = "";
    if (!patchReadingPdfSelectionBarOnly()) {
      refreshReadingStageUI();
    }
    scheduleReadingHydration();
    return;
  }

  if (action === "clear-reading-pdf-selection") {
    state.readingPdfDockSelectionActive = false;
    state.readingPdfSelection = null;
    patchReadingPdfSelectionSurfaces();
    return;
  }

  if (action === "create-reading-highlight-from-selection") {
    const currentSession = selectedReadingSession();
    const selection = state.readingPdfSelection;
    if (currentSession?.id && selection?.quote) {
      try {
        await runReadingRequest("note", currentSession.id, () =>
          api(readingSessionApiPath(currentSession.id, "notes"), {
            method: "POST",
            body: JSON.stringify({
              body: "Highlighted from PDF selection.",
              kind: "note",
              origin: "selection-highlight",
              page: selection.page || null,
              quote: selection.quote,
              sourceBounds: selection.sourceBounds,
            }),
          }),
        );
        state.readingPdfDockSelectionActive = false;
        state.readingPdfSelection = null;
      } catch (error) {
        state.error = error.message;
      }
      if (!patchReadingPdfSelectionBarOnly()) {
        refreshReadingStageUI();
      }
    }
    return;
  }

  if (action === "create-reading-note-from-selection") {
    const currentSession = selectedReadingSession();
    const selection = state.readingPdfSelection;
    if (currentSession?.id && selection?.quote) {
      try {
        await runReadingRequest("note", currentSession.id, () =>
          api(readingSessionApiPath(currentSession.id, "notes"), {
            method: "POST",
            body: JSON.stringify({
              body: "",
              kind: "note",
              origin: "selection",
              page: selection.page || null,
              quote: selection.quote,
              sourceBounds: selection.sourceBounds,
            }),
          }),
        );
        state.readingPdfDockSelectionActive = false;
        state.readingPdfSelection = null;
        state.readingWorkbenchTab = "notes";
        state.readingWorkbenchCollapsed = false;
      } catch (error) {
        state.error = error.message;
      }
      const patchedSelection = patchReadingPdfSelectionBarOnly();
      const patchedWorkbench = patchReadingWorkbenchPaneOnly();
      if (!patchedSelection || !patchedWorkbench) {
        refreshReadingStageUI();
      }
    }
    return;
  }

  if (action === "open-reading-note-linker") {
    state.readingWorkbenchTab = "notes";
    state.readingWorkbenchCollapsed = false;
    const patchedDock = patchReadingPdfSelectionBarOnly();
    const patchedWorkbench = patchReadingWorkbenchPaneOnly();
    if (!patchedDock || !patchedWorkbench) {
      refreshReadingStageUI();
    }
    return;
  }

  if (action === "set-reading-workbench-tab") {
    const nextWorkbenchTab = trigger.dataset.readingWorkbenchTab || "chat";
    if (state.readingWorkbenchTab === nextWorkbenchTab && !state.readingWorkbenchCollapsed) {
      return;
    }

    state.readingWorkbenchTab = nextWorkbenchTab;
    state.readingWorkbenchCollapsed = false;
    if (!patchReadingWorkbenchPaneOnly()) {
      refreshReadingStageUI();
    }
    return;
  }

  if (action === "open-reading-workbench") {
    state.readingWorkbenchTab = trigger.dataset.readingWorkbenchTab || state.readingWorkbenchTab;
    state.readingWorkbenchCollapsed = false;
    refreshReadingStageUI();
    return;
  }

  if (action === "toggle-reading-workbench-collapse") {
    state.readingWorkbenchCollapsed = !state.readingWorkbenchCollapsed;
    refreshReadingStageUI();
    return;
  }

  if (action === "set-reading-assets-filter") {
    state.readingAssetsFilter = trigger.dataset.readingAssetsFilter || "all";
    state.readingAssetDetailId = "";
    if (!patchReadingDocumentPaneOnly()) {
      refreshReadingStageUI();
    }
    return;
  }

  if (action === "open-reading-asset-detail") {
    state.readingAssetDetailId = trigger.dataset.readingAssetId || "";
    if (!patchReadingDocumentPaneOnly()) {
      refreshReadingStageUI();
    }
    return;
  }

  if (action === "close-reading-asset-detail") {
    state.readingAssetDetailId = "";
    if (!patchReadingDocumentPaneOnly()) {
      refreshReadingStageUI();
    }
    return;
  }

  if (action === "open-reading-asset-data") {
    const session = selectedReadingSession();
    const assetId = trigger.dataset.readingAssetId || state.readingAssetDetailId || "";
    const asset = Array.isArray(session?.assets) ? session.assets.find((entry) => entry.id === assetId) : null;
    if (!session?.id || !asset?.id || !asset.dataPath) {
      state.error = "Asset data file is not available.";
      render();
      return;
    }

    const dataUrl = appUrl(
      `api/reading-sessions/${encodeURIComponent(session.id)}/assets/${encodeURIComponent(asset.id)}/file?kind=data`,
    ).href;
    window.open(dataUrl, "_blank", "noopener,noreferrer");
    return;
  }

  if (action === "copy-reading-asset-citation") {
    const session = selectedReadingSession();
    const assetId = trigger.dataset.readingAssetId || state.readingAssetDetailId || "";
    const asset = Array.isArray(session?.assets) ? session.assets.find((entry) => entry.id === assetId) : null;
    if (!session?.id || !asset?.id) {
      state.error = "Asset citation is not available.";
      render();
      return;
    }

    try {
      await copyTextToClipboard(readingAssetCitationText(session, asset));
      state.error = "";
    } catch (error) {
      state.error = error.message;
    }
    refreshReadingStageUI();
    return;
  }

  if (action === "create-reading-asset-evidence") {
    const project = activeProject();
    const session = selectedReadingSession();
    const assetId = trigger.dataset.readingAssetId || state.readingAssetDetailId || "";
    const asset = Array.isArray(session?.assets) ? session.assets.find((entry) => entry.id === assetId) : null;
    if (!project || !session?.id || !asset?.id) {
      state.error = "Asset evidence cannot be created from the current selection.";
      render();
      return;
    }

    try {
      await api(`api/projects/${encodeURIComponent(project.id)}/evidence-links`, {
        method: "POST",
        body: JSON.stringify({
          createdBy: "user",
          locator: {
            assetId: asset.id,
            dataPath: asset.dataPath || "",
            thumbPath: asset.thumbPath || "",
          },
          page: asset.page || null,
          paperId: session.paperId || "",
          quote: asset.caption || asset.title || `${asset.kind || "Asset"} ${asset.number || ""}`.trim(),
          readingSessionId: session.id,
          sectionId: asset.sectionId || "",
          sourceId: asset.id,
          sourceRefs: [{ id: asset.id, label: asset.caption || asset.title || "Reading asset", type: "readingAsset" }],
          sourceType: "readingAsset",
        }),
      });
      await loadProjectGraph();
      state.error = "";
    } catch (error) {
      state.error = error.message;
    }
    refreshReadingStageUI();
    return;
  }

  if (action === "set-reading-orientation") {
    const nextOrientation = trigger.dataset.readingOrientation === "vertical" ? "vertical" : "horizontal";
    state.readingOrientation = nextOrientation;
    refreshReadingStageUI();
    return;
  }

  if (action === "reading-parse-session") {
    const currentSession = selectedReadingSession();
    if (currentSession?.id) {
      state.readingContextMenuOpen = false;
      state.readingDocumentTab = "pdf";
      try {
        await runReadingRequest("parse", currentSession.id, () =>
          api(readingSessionApiPath(currentSession.id, "parse"), {
            method: "POST",
            body: JSON.stringify({}),
          }),
        );
        await loadProjects();
      } catch (error) {
        state.error = error.message;
      }
    }
    return;
  }

  if (action === "reading-summarize-session") {
    const currentSession = selectedReadingSession();
    if (currentSession?.id) {
      state.readingDocumentTab = "summary";
      try {
        await runReadingRequest("summarize", currentSession.id, () =>
          api(readingSessionApiPath(currentSession.id, "summarize"), {
            method: "POST",
            body: JSON.stringify({}),
          }),
        );
        await loadProjects();
      } catch (error) {
        state.error = error.message;
      }
    }
    return;
  }

  if (action === "reading-extract-assets") {
    const currentSession = selectedReadingSession();
    if (currentSession?.id) {
      state.readingDocumentTab = "assets";
      try {
        await runReadingRequest("extract", currentSession.id, () =>
          api(readingSessionApiPath(currentSession.id, "extract-assets"), {
            method: "POST",
            body: JSON.stringify({}),
          }),
        );
      } catch (error) {
        state.error = error.message;
      }
    }
    return;
  }

  if (action === "create-reading-note") {
    const currentSession = selectedReadingSession();
    if (currentSession?.id) {
      try {
        await runReadingRequest("note", currentSession.id, () =>
          api(readingSessionApiPath(currentSession.id, "notes"), {
            method: "POST",
            body: JSON.stringify({
              body: "",
              kind: "note",
              origin: "user",
            }),
          }),
        );
        state.readingWorkbenchTab = "notes";
      } catch (error) {
        state.error = error.message;
      }
    }
    return;
  }

  if (action === "save-reading-note") {
    const currentSession = selectedReadingSession();
    const noteId = trigger.dataset.noteId || "";
    const noteCard = trigger.closest("[data-reading-note-id]");
    const body = noteCard?.querySelector('[name="readingNoteBody"]')?.value || "";
    if (currentSession?.id && noteId) {
      try {
        await runReadingRequest("note", currentSession.id, () =>
          api(readingSessionApiPath(currentSession.id, `notes/${encodeURIComponent(noteId)}`), {
            method: "PATCH",
            body: JSON.stringify({ body }),
          }),
        );
      } catch (error) {
        state.error = error.message;
      }
    }
    return;
  }

  if (action === "delete-reading-note") {
    const currentSession = selectedReadingSession();
    const noteId = trigger.dataset.noteId || "";
    if (currentSession?.id && noteId) {
      try {
        await runReadingRequest("note", currentSession.id, () =>
          api(readingSessionApiPath(currentSession.id, `notes/${encodeURIComponent(noteId)}`), {
            method: "DELETE",
          }),
        );
      } catch (error) {
        state.error = error.message;
      }
    }
    return;
  }

  if (action === "handoff-reading-to-research") {
    const noteCard = trigger.closest("[data-reading-note-id]");
    try {
      await handoffReadingToResearch({
        noteId: noteCard?.dataset.readingNoteId || "",
      });
    } catch (error) {
      state.error = error.message;
      render();
    }
    return;
  }

  if (action === "create-manual-experiment-run") {
    try {
      await createManualExperimentRun();
    } catch (error) {
      state.error = error.message;
      render();
    }
    return;
  }

  if (action === "create-insight-card") {
    try {
      await createInsightCardFromEvidence();
    } catch (error) {
      state.error = error.message;
      render();
    }
    return;
  }

  if (action === "select-insight-card") {
    state.activeInsightCardId = trigger.dataset.insightCardId || "";
    render();
    return;
  }

  if (action === "create-follow-up-experiment") {
    try {
      await createFollowUpExperimentFromInsight(trigger.dataset.insightCardId || "");
    } catch (error) {
      state.error = error.message;
      render();
    }
    return;
  }

  if (action === "delete-insight-card") {
    try {
      await deleteInsightCard(trigger.dataset.insightCardId || "");
    } catch (error) {
      state.error = error.message;
      state.insightSavingCardId = "";
      render();
    }
    return;
  }

  if (action === "create-draft-section") {
    try {
      await createDraftSectionFromInsight();
    } catch (error) {
      state.error = error.message;
      render();
    }
    return;
  }

  if (action === "select-draft-section") {
    state.activeDraftSectionId = trigger.dataset.draftSectionId || "";
    render();
    return;
  }

  if (action === "delete-draft-section") {
    try {
      await deleteDraftSection(trigger.dataset.draftSectionId || "");
    } catch (error) {
      state.error = error.message;
      state.draftSavingSectionId = "";
      render();
    }
    return;
  }

  if (action === "export-writing-draft") {
    try {
      await exportWritingDraft();
    } catch (error) {
      state.error = error.message;
      render();
    }
    return;
  }

  if (action === "ask-ai-from-note") {
    const currentSession = selectedReadingSession();
    const noteId = trigger.dataset.noteId || "";
    const note = Array.isArray(currentSession?.notes) ? currentSession.notes.find((entry) => entry.id === noteId) : null;
    if (currentSession?.id && noteId && note) {
      state.readingWorkbenchTab = "chat";
      try {
        await runReadingRequest("chat", currentSession.id, () =>
          api(readingSessionApiPath(currentSession.id, "chat"), {
            method: "POST",
            body: JSON.stringify({
              message: note.quote
                ? `이 인용이 의미하는 핵심 포인트와 후속 검증 포인트를 설명해줘.\n\n"${note.quote}"`
                : "이 노트를 바탕으로 핵심 포인트를 설명해줘.",
              noteId,
            }),
          }),
        );
      } catch (error) {
        state.error = error.message;
      }
    }
    return;
  }

  if (action === "focus-search") {
    state.scopePicker = null;
    focusSearchInput({ forceSearchStage: true, select: true });
    return;
  }

  if (action === "clear-search") {
    event.preventDefault();
    if (!state.hasSearched && !state.searchAgentRun) {
      return;
    }
    state.hasSearched = false;
    state.loading = false;
    state.error = "";
    state.searchAgentRun = null;
    state.searchAgentTransitioning = false;
    state.scopePicker = null;
    clearAgenticSearchBodyState();
    renderWithViewTransition();
    return;
  }

  if (action === "set-search-mode") {
    event.preventDefault();
    const nextMode = trigger.dataset.searchMode === "keyword" ? "keyword" : "scout";
    if (nextMode === state.searchMode) {
      return;
    }
    if (nextMode === "keyword" && state.searchAgentRun) {
      state.searchAgentRun = null;
      state.searchAgentTransitioning = false;
      clearAgenticSearchBodyState();
    }

    const supportsViewTransition =
      typeof document.startViewTransition === "function" && !prefersReducedMotion();

    if (supportsViewTransition) {
      state.searchMode = nextMode;
      syncSelectedPaper();
      renderWithViewTransition();
      focusSearchInput();
      return;
    }

    await previewSearchModeSwitch(nextMode);
    state.searchMode = nextMode;
    syncSelectedPaper();
    render();
    focusSearchInput();
    return;
  }

  if (action === "toggle-filter-panel") {
    const nextOpen = !state.filterPanelOpen;
    state.filterPanelOpen = nextOpen;
    if (isTabletSearchLayout() && nextOpen) {
      state.previewPanelOpen = false;
    }
    render();
    return;
  }

  if (action === "toggle-preview-panel") {
    const nextOpen = !state.previewPanelOpen;
    state.previewPanelOpen = nextOpen;
    if (isTabletSearchLayout() && nextOpen) {
      state.filterPanelOpen = false;
    }
    render();
    return;
  }

  if (action === "toggle-filter-section") {
    const section = trigger.dataset.filterSection;
    if (section && Object.prototype.hasOwnProperty.call(state.filterSections, section)) {
      state.filterSections[section] = !state.filterSections[section];
      render();
    }
    return;
  }

  if (action === "open-scope-picker") {
    const tab = trigger.dataset.scopeTab || "conference";
    if (
      state.scopePicker &&
      state.scopePicker.tab === tab &&
      state.scopePicker.source === (trigger.dataset.scopeSource || "hero")
    ) {
      state.scopePicker = null;
      state.scopePickerQuery = "";
      render();
      return;
    }
    openScopePickerFromTrigger(trigger, tab);
    return;
  }

  if (action === "switch-scope-picker-tab") {
    if (state.scopePicker) {
      state.scopePicker = { ...state.scopePicker, tab: trigger.dataset.scopeTab || "conference" };
      render();
      focusScopePickerInput();
    }
    return;
  }

  if (action === "close-scope-picker") {
    state.scopePicker = null;
    state.scopePickerQuery = "";
    render();
    return;
  }

  if (action === "add-scope") {
    const type = trigger.dataset.scopeType;
    const id = trigger.dataset.scopeId;
    const label = trigger.dataset.scopeLabel;
    if (type && id && label && !state.searchScopes.some((scope) => scope.id === id)) {
      state.searchScopes = [
        ...state.searchScopes,
        {
          id,
          type,
          label,
          meta: resolveScopeCatalogItem(type, id),
        },
      ];
      render();
      focusScopePickerInput();
    }
    return;
  }

  if (action === "remove-scope") {
    state.searchScopes = state.searchScopes.filter((scope) => scope.id !== trigger.dataset.scopeId);
    render();
    return;
  }

  if (action === "toggle-workflow") {
    state.workflowOpen = !state.workflowOpen;
    render();
    return;
  }

  if (action === "toggle-sidebar") {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    saveStorage(STORAGE_KEYS.sidebarCollapsed, state.sidebarCollapsed ? "true" : "false");
    render();
    return;
  }

  if (action === "set-theme-mode") {
    if (setThemeMode(trigger.dataset.themeMode)) {
      render();
    }
    return;
  }

  if (action === "toggle-workflow-menu") {
    state.openWorkflowMenu = state.openWorkflowMenu === trigger.dataset.stageId ? "" : trigger.dataset.stageId;
    render();
    return;
  }

  if (action === "dismiss-workflow-menu") {
    state.openWorkflowMenu = "";
    render();
    return;
  }

  if (action === "copy-stage-link") {
    const stageId = normalizeStage(trigger.dataset.stageId);
    const url = browserUrlForRouteHash(buildBrowserRouteHash({ stageId }));
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Ignore clipboard failures.
    }
    render();
  }
});

document.addEventListener("mousedown", (event) => {
  const homeHandle = event.target.closest('[data-action="start-reading-home-resize"]');
  if (homeHandle) {
    event.preventDefault();
    startReadingHomeResize(event);
    return;
  }

  const handle = event.target.closest('[data-action="start-reading-resize"]');
  if (!handle) {
    return;
  }

  event.preventDefault();
  startReadingResize(handle.dataset.readingResizeAxis === "vertical" ? "vertical" : "horizontal", event);
});

document.addEventListener("mousemove", (event) => {
  if (readingHomeResizeDrag) {
    event.preventDefault();
    updateReadingHomePreviewFromPointer(event.clientX);
    return;
  }

  if (!readingResizeDrag) {
    return;
  }

  event.preventDefault();
  if (readingResizeFrame) {
    return;
  }

  readingResizeFrame = window.requestAnimationFrame(() => {
    readingResizeFrame = 0;
    updateReadingSplitFromPointer(event.clientX, event.clientY);
  });
});

document.addEventListener("mouseup", () => {
  if (readingHomeResizeDrag) {
    stopReadingHomeResize();
  }

  if (readingResizeDrag) {
    stopReadingResize();
  }
});

function countReadingSelectionLines(value) {
  const text = String(value || "").trim();
  if (!text) {
    return 0;
  }

  const explicitLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length;
  if (explicitLines > 1) {
    return explicitLines;
  }

  return Math.max(1, Math.ceil(text.replace(/\s+/g, " ").trim().length / 84));
}

function normalizeReadingSelectionRects(rects, surfaceRect) {
  if (!surfaceRect?.width || !surfaceRect?.height) {
    return [];
  }

  return Array.from(rects || [])
    .map((rect) => {
      const width = Math.min(1, Math.max(0.01, (rect.right - rect.left) / surfaceRect.width));
      const height = Math.min(1, Math.max(0.01, (rect.bottom - rect.top) / surfaceRect.height));
      return {
        height,
        width,
        x: Math.min(1 - width, Math.max(0, (rect.left - surfaceRect.left) / surfaceRect.width)),
        y: Math.min(1 - height, Math.max(0, (rect.top - surfaceRect.top) / surfaceRect.height)),
      };
    })
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .slice(0, 24);
}

function captureReadingSelectionSourceBounds(selection, pageNode, page) {
  if (!selection?.rangeCount || !pageNode) {
    return null;
  }

  const surface = pageNode.querySelector(".reading-pdf-page-surface") || pageNode;
  const surfaceRect = surface.getBoundingClientRect?.();
  if (!surfaceRect?.width || !surfaceRect?.height) {
    return null;
  }

  const rects = Array.from(selection.getRangeAt(0).getClientRects?.() || [])
    .map((rect) => ({
      bottom: Math.min(rect.bottom, surfaceRect.bottom),
      left: Math.max(rect.left, surfaceRect.left),
      right: Math.min(rect.right, surfaceRect.right),
      top: Math.max(rect.top, surfaceRect.top),
    }))
    .filter((rect) => rect.right > rect.left && rect.bottom > rect.top);

  if (!rects.length) {
    return null;
  }

  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  const width = Math.min(1, Math.max(0.01, (right - left) / surfaceRect.width));
  const height = Math.min(1, Math.max(0.01, (bottom - top) / surfaceRect.height));
  return {
    height,
    page,
    rects: normalizeReadingSelectionRects(rects, surfaceRect),
    unit: "page-ratio",
    width,
    x: Math.min(1 - width, Math.max(0, (left - surfaceRect.left) / surfaceRect.width)),
    y: Math.min(1 - height, Math.max(0, (top - surfaceRect.top) / surfaceRect.height)),
  };
}

function captureReadingPdfSelection() {
  if (state.activeStage !== "reading" || state.readingView !== "detail" || state.readingDocumentTab !== "pdf") {
    return;
  }

  const selection = window.getSelection?.();
  const quote = String(selection?.toString() || "").replace(/\s+/g, " ").trim();
  if (!selection || !quote || quote.length < 2) {
    return;
  }

  const anchor =
    selection.anchorNode?.nodeType === Node.TEXT_NODE ? selection.anchorNode.parentElement : selection.anchorNode;
  const focus =
    selection.focusNode?.nodeType === Node.TEXT_NODE ? selection.focusNode.parentElement : selection.focusNode;
  const pageNode =
    anchor?.closest?.("[data-reading-pdf-page]") ||
    focus?.closest?.("[data-reading-pdf-page]") ||
    null;
  const host = pageNode?.closest?.('[data-reading-pdf-host="true"]');
  const session = selectedReadingSession();
  if (!host || !session?.id) {
    return;
  }

  const page = Number(pageNode.dataset.readingPdfPage || "");
  state.readingPdfSelection = {
    lineCount: countReadingSelectionLines(quote),
    page: Number.isFinite(page) && page > 0 ? page : null,
    quote: quote.slice(0, 900),
    sessionId: session.id,
    sourceBounds: captureReadingSelectionSourceBounds(selection, pageNode, page),
  };
  state.readingPdfDockSelectionActive = true;
  patchReadingPdfSelectionSurfaces();
}

document.addEventListener("mouseup", () => {
  if (state.activeStage !== "reading" || state.readingView !== "detail" || state.readingDocumentTab !== "pdf") {
    return;
  }

  window.setTimeout(captureReadingPdfSelection, 0);
});

let readingPdfSelectionClearTimer = null;
let readingPdfSelectionPreserveUntil = 0;

function clearReadingPdfSelectionFromInteraction({ clearNativeSelection = false } = {}) {
  if (!state.readingPdfSelection) {
    return false;
  }

  state.readingPdfDockSelectionActive = false;
  state.readingPdfSelection = null;
  if (clearNativeSelection) {
    window.getSelection?.()?.removeAllRanges();
  }

  patchReadingPdfSelectionSurfaces();
  return true;
}

function collapseReadingPdfDockSelectionFromNativeClear() {
  if (!state.readingPdfDockSelectionActive) {
    return false;
  }

  state.readingPdfDockSelectionActive = false;
  if (!patchReadingPdfSelectionBarOnly()) {
    refreshReadingStageUI();
  }
  return true;
}

function isReadingPdfSelectionPreservingTarget(target) {
  return Boolean(
    target?.closest?.('[data-reading-pdf-host="true"]') ||
      target?.closest?.(".reading-pdf-dock-layer") ||
      target?.closest?.(".popup-panel") ||
      target?.closest?.(".reading-chat-input") ||
      target?.closest?.(".reading-chat-wrap"),
  );
}

function shouldPreserveReadingPdfSelectionAfterNativeClear() {
  if (Date.now() < readingPdfSelectionPreserveUntil) {
    return true;
  }

  const activeElement = document.activeElement;
  return Boolean(activeElement?.closest?.(".reading-chat-input") || activeElement?.closest?.(".reading-chat-wrap"));
}

document.addEventListener("selectionchange", () => {
  if (!state.readingPdfSelection) {
    return;
  }

  window.clearTimeout(readingPdfSelectionClearTimer);
  readingPdfSelectionClearTimer = window.setTimeout(() => {
    const quote = window.getSelection?.()?.toString().trim() || "";
    if (!quote) {
      collapseReadingPdfDockSelectionFromNativeClear();
    }
  }, 140);
});

document.addEventListener("mousedown", (event) => {
  if (!state.readingPdfSelection) {
    return;
  }

  const target = event.target;
  if (isReadingPdfSelectionPreservingTarget(target)) {
    readingPdfSelectionPreserveUntil = Date.now() + 700;
    return;
  }

  clearReadingPdfSelectionFromInteraction({ clearNativeSelection: true });
});

document.addEventListener("keydown", async (event) => {
  if (event.key === "Escape") {
    clearReadingPdfSelectionFromInteraction({ clearNativeSelection: true });
  }

  if (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.isComposing &&
    event.target?.matches?.('textarea[name="readingChatMessage"]')
  ) {
    const form = event.target.closest('[data-action="submit-reading-chat-form"]');
    if (form) {
      event.preventDefault();
      form.requestSubmit();
    }
  }
});

document.addEventListener("submit", async (event) => {
  const draftSectionForm = event.target.closest('[data-action="submit-draft-section-form"]');
  if (draftSectionForm) {
    event.preventDefault();
    try {
      await saveDraftSectionEdit(draftSectionForm);
    } catch (error) {
      state.error = error.message;
      state.draftSavingSectionId = "";
      render();
    }
    return;
  }

  const insightCardForm = event.target.closest('[data-action="submit-insight-card-form"]');
  if (insightCardForm) {
    event.preventDefault();
    try {
      await saveInsightCardEdit(insightCardForm);
    } catch (error) {
      state.error = error.message;
      state.insightSavingCardId = "";
      render();
    }
    return;
  }

  const labResultForm = event.target.closest('[data-action="submit-lab-result-form"]');
  if (labResultForm) {
    event.preventDefault();
    try {
      await saveLabExperimentResult(labResultForm);
    } catch (error) {
      state.error = error.message;
      state.labSavingRunId = "";
      render();
    }
    return;
  }

  const labImportForm = event.target.closest('[data-action="submit-lab-import-form"]');
  if (labImportForm) {
    event.preventDefault();
    try {
      await importExternalExperimentRun(labImportForm);
    } catch (error) {
      state.error = error.message;
      state.labImporting = false;
      render();
    }
    return;
  }

  const readingTextImportForm = event.target.closest('[data-action="submit-reading-text-import-form"]');
  if (readingTextImportForm) {
    event.preventDefault();
    const currentSession = selectedReadingSession();
    const formData = new FormData(readingTextImportForm);
    const text = String(formData.get("readingTextImport") || "").trim();
    const sourceLabel = String(formData.get("readingTextImportSource") || "External OCR import").trim();
    const tool = String(formData.get("readingTextImportTool") || "").trim();
    const generatedAt = String(formData.get("readingTextImportGeneratedAt") || "").trim();
    if (!currentSession?.id) {
      return;
    }
    if (!text) {
      state.error = "Paste extracted text before importing.";
      render();
      return;
    }

    try {
      await runReadingRequest("importText", currentSession.id, () =>
            api(readingSessionApiPath(currentSession.id, "import-text"), {
              method: "POST",
              body: JSON.stringify({ generatedAt: generatedAt || null, sourceLabel, text, tool }),
            }),
          );
      state.readingDocumentTab = "summary";
      render();
    } catch (error) {
      state.error = error.message;
      render();
    }
    return;
  }

  const readingChatForm = event.target.closest('[data-action="submit-reading-chat-form"]');
  if (readingChatForm) {
    event.preventDefault();
    const currentSession = selectedReadingSession();
    const formData = new FormData(readingChatForm);
    const message = String(formData.get("readingChatMessage") || "").trim();
    if (!currentSession?.id || !message) {
      return;
    }

    const selectedTextContext =
      state.readingPdfSelection?.sessionId === currentSession.id && state.readingPdfSelection.quote
            ? {
                lineCount: state.readingPdfSelection.lineCount || countReadingSelectionLines(state.readingPdfSelection.quote),
                page: state.readingPdfSelection.page || null,
                quote: state.readingPdfSelection.quote,
                sourceBounds: state.readingPdfSelection.sourceBounds,
              }
            : null;
    const optimisticStamp = Date.now();
    const optimisticUserMessage = {
      createdAt: new Date(optimisticStamp).toISOString(),
      id: `chat-user-pending-${optimisticStamp}`,
      pending: true,
      role: "user",
      selection: selectedTextContext,
      sessionId: currentSession.id,
      text: message,
    };
    const optimisticTypingMessage = {
      createdAt: new Date(optimisticStamp + 1).toISOString(),
      id: `chat-assistant-typing-${optimisticStamp}`,
      pending: true,
      role: "assistant",
      sessionId: currentSession.id,
      text: "...",
      typing: true,
    };
    state.readingOptimisticChatMessages = [
      ...state.readingOptimisticChatMessages.filter((entry) => entry.sessionId !== currentSession.id),
      optimisticUserMessage,
      optimisticTypingMessage,
    ];

    const textarea = readingChatForm.querySelector('[name="readingChatMessage"]');
    if (textarea) {
      textarea.value = "";
    }
    if (!patchReadingWorkbenchPaneOnly()) {
      refreshReadingStageUI();
    }
    window.requestAnimationFrame(scrollReadingChatToBottom);

    try {
      await runReadingRequest("chat", currentSession.id, () =>
        api(readingSessionApiPath(currentSession.id, "chat"), {
          method: "POST",
          body: JSON.stringify({
            message,
            selection: selectedTextContext,
          }),
        }),
      );
    } catch (error) {
      state.error = error.message;
    } finally {
      state.readingOptimisticChatMessages = state.readingOptimisticChatMessages.filter(
        (entry) => entry.sessionId !== currentSession.id,
      );
      if (!patchReadingWorkbenchPaneOnly()) {
        refreshReadingStageUI();
      }
      window.requestAnimationFrame(scrollReadingChatToBottom);
    }
    return;
  }

  const form = event.target.closest('[data-action="submit-search"]');
  if (!form) {
    return;
  }

  event.preventDefault();
  const formData = new FormData(form);
  state.searchInput = String(formData.get("query") || "").trim();
  if (state.searchMode === "scout") {
    await startAgenticSearchRun({ query: state.searchInput });
    return;
  }

  state.searchAgentRun = null;
  state.searchAgentTransitioning = false;
  clearAgenticSearchBodyState();
  await runSearch();
});

document.addEventListener("input", (event) => {
  if (event.target.name === "query") {
    state.searchInput = event.target.value;
    return;
  }

  if (event.target.name === "scopePickerQuery") {
    state.scopePickerQuery = event.target.value;
    render();
    focusScopePickerInput();
    return;
  }

  if (event.target.name === "readingRailQuery") {
    state.readingRailQuery = event.target.value;
    refreshReadingStageUI({ preserveRailFocus: true });
    return;
  }

  if (
    event.target.name === "readingPdfSearchQuery" ||
    event.target.closest?.('[data-action="set-reading-pdf-search-query"]')
  ) {
    state.readingPdfSearchQuery = event.target.value;
    if (state.readingPdfDockPanel !== "search") {
      state.readingPdfDockPanel = "search";
    }
    if (!patchReadingPdfSelectionBarOnly()) {
      refreshReadingStageUI();
    }
    const searchInput = document.querySelector('[name="readingPdfSearchQuery"]');
    searchInput?.focus();
    return;
  }

  if (event.target.name === "minRelevance") {
    state.filters.minRelevance = Number(event.target.value);
    syncSelectedPaper();
    render();
  }
});

document.addEventListener("change", (event) => {
  if (event.target.name === "readingPdfUploadModal") {
    const [file] = Array.from(event.target.files || []);
    setReadingUploadModalFile(file || null);
    state.error = "";
    render();
    return;
  }

  if (event.target.name === "sort") {
    state.sort = event.target.value;
    syncSelectedPaper();
    render();
    return;
  }

  if (event.target.name === "venue") {
    if (event.target.checked) {
      state.filters.venues.add(event.target.value);
    } else {
      state.filters.venues.delete(event.target.value);
    }
    syncSelectedPaper();
    render();
    return;
  }

  if (event.target.name === "yearBucket") {
    if (event.target.checked) {
      state.filters.years.add(event.target.value);
    } else {
      state.filters.years.delete(event.target.value);
    }
    syncSelectedPaper();
    render();
    return;
  }

  if (event.target.name === "openAccessOnly") {
    state.filters.openAccessOnly = event.target.checked;
    syncSelectedPaper();
    render();
    return;
  }

  if (event.target.name === "savedOnly") {
    state.filters.savedOnly = event.target.checked;
    syncSelectedPaper();
    render();
  }
});

document.addEventListener("dragover", (event) => {
  if (!dragEventHasFiles(event)) {
    return;
  }

  const dropzone = event.target.closest('[data-reading-pdf-dropzone="true"]');
  if (!dropzone || state.readingUploading) {
    if (state.readingPdfDropActive) {
      state.readingPdfDropActive = false;
      refreshReadingStageUI();
    }
    return;
  }

  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
  if (!state.readingPdfDropActive) {
    state.readingPdfDropActive = true;
    refreshReadingStageUI();
  }
});

document.addEventListener("dragleave", (event) => {
  if (!state.readingPdfDropActive) {
    return;
  }

  if (event.clientX > 0 && event.clientY > 0 && event.clientX < window.innerWidth && event.clientY < window.innerHeight) {
    return;
  }

  state.readingPdfDropActive = false;
  refreshReadingStageUI();
});

document.addEventListener("drop", (event) => {
  const dropzone = event.target.closest('[data-reading-pdf-dropzone="true"]');
  if (!dropzone || state.readingUploading) {
    if (state.readingPdfDropActive) {
      state.readingPdfDropActive = false;
      refreshReadingStageUI();
    }
    return;
  }

  event.preventDefault();
  state.readingPdfDropActive = false;
  const file = getReadingPdfDropFile(event.dataTransfer);
  if (file) {
    void uploadReadingPdf(file);
    return;
  }

  state.error = "PDF 파일만 업로드할 수 있습니다.";
  refreshReadingStageUI();
});

document.addEventListener("keydown", async (event) => {
  if ((event.metaKey || event.ctrlKey) && /^[1-4]$/.test(event.key)) {
    event.preventDefault();
    const tab = WORKFLOW_TABS[Number(event.key) - 1];
    if (tab) {
      await selectWorkflowTab(tab.id);
    }
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    focusSearchInput({ forceSearchStage: true, select: true });
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    if (state.activeStage !== "search") {
      state.activeStage = "search";
      saveStorage(STORAGE_KEYS.stage, state.activeStage);
      render();
    }
    state.searchMode = "scout";
    const input = document.querySelector("#search-input");
    await startAgenticSearchRun({ query: input?.value ?? state.searchInput });
    return;
  }

  if (event.key === "Escape") {
    let needsRender = false;

    if (state.openWorkflowMenu || state.scopePicker) {
      state.openWorkflowMenu = "";
      state.scopePicker = null;
      state.scopePickerQuery = "";
      needsRender = true;
    }

    if (state.readingUploadModalOpen) {
      closeReadingUploadModal();
      needsRender = true;
    }

    if (isTabletSearchLayout()) {
      if (state.filterPanelOpen) {
        state.filterPanelOpen = false;
        needsRender = true;
      }
      if (state.previewPanelOpen) {
        state.previewPanelOpen = false;
        needsRender = true;
      }
    }

    if (state.activeStage === "reading" && state.readingRailOpen) {
      state.readingRailOpen = "";
      needsRender = true;
    }

    if (state.activeStage === "reading" && state.readingHomePreviewOpen) {
      state.readingHomePreviewOpen = false;
      needsRender = true;
    }

    if (needsRender) {
      render();
    }
  }
});

window.addEventListener("popstate", scheduleApplyBrowserRouteFromUrl);
window.addEventListener("hashchange", scheduleApplyBrowserRouteFromUrl);

let resizeTicking = false;

window.addEventListener("resize", () => {
  if (resizeTicking) {
    return;
  }

  resizeTicking = true;
  window.requestAnimationFrame(() => {
    resizeTicking = false;
    const searchLayoutChanged = syncResponsiveSearchLayout();
    const readingHomeLayoutChanged = syncResponsiveReadingHomeLayout();
    const readingRailChanged = searchLayoutChanged ? syncResponsiveReadingRail(state.searchLayout) : false;
    if (searchLayoutChanged || readingHomeLayoutChanged || readingRailChanged) {
      render();
    }
  });
});

async function boot() {
  try {
    await loadProjects();
    await loadProjectGraph();
    const project = activeProject();
    state.searchInput = activeResearchQuestion()?.prompt || project?.defaultQuery || "";
    resetSearchState();
    await loadProjectLibrary();
    await loadReadingSessions({ preserveSelection: Boolean(state.activeReadingSessionId) });
    syncReadingHomeSelection();
    const pendingSession = state.readingSessions.find((session) => session.runId && session.status !== "done");
    if (pendingSession?.runId) {
      subscribeAgentRun(pendingSession.runId);
    }
  } catch (error) {
    state.error = error.message;
  } finally {
    state.booting = false;
    renderWithViewTransition();
  }
}

bindThemeModeListener();
renderWithViewTransition();
boot();
