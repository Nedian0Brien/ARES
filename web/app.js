import { createSearchFeature } from "./app/features/search.js";
import { createReadingFeature } from "./app/features/reading.js";

const TOKENS = {
  bg: "#fbfbfa",
  sb: "#f5f5f4",
  s1: "#ffffff",
  s2: "#f7f7f6",
  s3: "#f0efed",
  b1: "#e8e8e6",
  b2: "#d4d4d2",
  tx: "#0a0a0b",
  t2: "#4a4a50",
  t3: "#8a8a92",
  t4: "#b0b0b8",
  search: "#5e9c6f",
  read: "#5e6ad2",
  research: "#8957c9",
  result: "#c07b3a",
  insight: "#c04e68",
  writing: "#3aa3a3",
};

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

const WORKFLOW_STAGES = [
  { id: "search", label: "Search", sub: "논문 서치 및 수집", color: TOKENS.search, icon: "search", kbd: "1" },
  { id: "reading", label: "Reading", sub: "AI 논문 리딩", color: TOKENS.read, icon: "book", kbd: "2" },
  { id: "research", label: "Research", sub: "재현연구 및 실험", color: TOKENS.research, icon: "flask", kbd: "3" },
  { id: "result", label: "Result", sub: "결과 도출 및 정리", color: TOKENS.result, icon: "chart", kbd: "4" },
  { id: "insight", label: "Insight", sub: "인사이트 취합", color: TOKENS.insight, icon: "sparkles", kbd: "5" },
  { id: "writing", label: "Writing", sub: "논문 작성 보조", color: TOKENS.writing, icon: "pen", kbd: "6" },
];

const STAGE_ALIASES = {
  read: "reading",
  results: "result",
  insights: "insight",
};

const STORAGE_KEYS = {
  stage: "ares.stage",
  project: "ares.project",
};

const SEARCH_MODE_TRANSITION_MS = 280;
const SEARCH_LAYOUT_BREAKPOINTS = {
  mobileMax: 900,
  tabletMax: 1279,
};
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
const INITIAL_SEARCH_LAYOUT = detectSearchLayout();
const INITIAL_FILTER_PANEL_OPEN = INITIAL_SEARCH_LAYOUT === "desktop";
const INITIAL_PREVIEW_PANEL_OPEN = false;
const INITIAL_READING_HOME_LAYOUT = detectReadingHomeLayout();

const state = {
  booting: true,
  hasSearched: false,
  loading: false,
  readingLoading: false,
  savingPaperId: "",
  readingStartingPaperId: "",
  error: "",
  activeStage: normalizeStage(loadStorage(STORAGE_KEYS.stage, "search")),
  activeProjectId: loadStorage(STORAGE_KEYS.project, ""),
  searchInput: "",
  projects: [],
  projectLibrary: [],
  results: [],
  availableVenues: [],
  readingSessions: [],
  activeReadingSessionId: "",
  activeReadingRunId: "",
  readingView: "home",
  readingDocumentTab: "pdf",
  readingWorkbenchTab: "chat",
  readingRailOpen: "overview",
  readingWorkbenchCollapsed: false,
  readingOrientation: defaultReadingOrientation(),
  readingSplitHorizontal: 62,
  readingSplitVertical: 62,
  readingRailQuery: "",
  readingAssetsFilter: "all",
  readingParsedSessionIds: new Set(),
  readingSummarizedSessionIds: new Set(),
  readingHomeFilter: "all",
  readingHomeSelectedPaperId: "",
  readingHomePreviewOpen: false,
  readingHomePreviewWidth: 420,
  readingHomeLayout: INITIAL_READING_HOME_LAYOUT,
  selectedPaperId: "",
  sort: "relevance",
  searchMode: "keyword",
  searchLayout: INITIAL_SEARCH_LAYOUT,
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
  openWorkflowMenu: "",
  searchMeta: {
    provider: "seed",
    live: false,
    total: 0,
    query: "",
    warning: "",
    searchMode: "keyword",
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

const app = document.querySelector("#app");
let modalClosing = false;
let activeRunPollTimer = 0;
let readingResizeDrag = null;
let readingResizeFrame = 0;
let readingHomeResizeDrag = null;

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

function normalizeStage(stageId) {
  const resolved = STAGE_ALIASES[stageId] || stageId;
  return WORKFLOW_STAGES.some((stage) => stage.id === resolved) ? resolved : "search";
}

function stageById(stageId) {
  return WORKFLOW_STAGES.find((stage) => stage.id === stageId) || WORKFLOW_STAGES[0];
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
  const style = color ? ` style="background:${color}12;color:${color};border-color:${color}30"` : "";
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
      throw new Error(payload.error || `Request failed with ${response.status}`);
    }

    return response.json();
  });
}

function activeProject() {
  return state.projects.find((project) => project.id === state.activeProjectId) || state.projects[0] || null;
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
    summary: session.summary || session.abstract || "",
    title: session.title || "Untitled paper",
    updatedAt: session.updatedAt || session.startedAt || session.createdAt || "",
    venue: session.venue || "Unknown venue",
    year: session.year ?? null,
  };
}

function readingHomeStatusMeta(paper, session) {
  const sessionStatus = String(session?.status || "").toLowerCase();
  if (sessionStatus === "done") {
    return { bucket: "done", label: "Completed", color: TOKENS.search };
  }

  if (sessionStatus === "running") {
    return { bucket: "running", label: "In progress", color: TOKENS.result };
  }

  if (sessionStatus === "queue") {
    return { bucket: "running", label: "Queued", color: TOKENS.result };
  }

  if (sessionStatus === "todo") {
    return { bucket: "ready", label: "Ready", color: TOKENS.read };
  }

  if (paper?.pdfUrl || session?.pdfUrl) {
    return { bucket: "ready", label: "Ready", color: TOKENS.read };
  }

  return { bucket: "saved", label: "Saved", color: TOKENS.t3 };
}

function readingHomeActionMeta(item) {
  if (item?.session?.status === "running") {
    return {
      primaryLabel: "Resume Reading",
      primaryIcon: "book",
      secondaryLabel: "Back to Search",
      secondaryIcon: "search",
    };
  }

  if (item?.session?.status === "done") {
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

async function pollAgentRun(runId) {
  clearActiveRunPoll();
  if (!runId) {
    state.activeReadingRunId = "";
    return;
  }

  state.activeReadingRunId = runId;

  try {
    const payload = await api(`api/agent-runs/${encodeURIComponent(runId)}`);
    const run = payload.run || null;
    if (!run) {
      state.activeReadingRunId = "";
      return;
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

    if (run.status !== "done") {
      activeRunPollTimer = window.setTimeout(() => {
        void pollAgentRun(runId);
      }, 1200);
      return;
    }

    state.activeReadingRunId = "";
  } catch (error) {
    state.error = error.message;
    activeRunPollTimer = window.setTimeout(() => {
      void pollAgentRun(runId);
    }, 1800);
  } finally {
    render();
  }
}

function resetSearchState() {
  state.hasSearched = false;
  state.loading = false;
  state.error = "";
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

async function runSearch({ preserveSelection = false } = {}) {
  const project = activeProject();
  if (!project) {
    return;
  }

  state.hasSearched = true;
  state.loading = true;
  state.error = "";
  render();

  try {
    const query = state.searchInput.trim();
    const payload = await api("api/search", {
      method: "POST",
      body: JSON.stringify({
        projectId: project.id,
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

    const payload = await api("api/agent-runs", {
      method: "POST",
      body: JSON.stringify({
        projectId: project.id,
        stage: "reading",
        taskKind: "create-reading-session",
        assetRefs: [{ type: "paper", id: paper.paperId, label: paper.title }],
        input: {
          paper,
          paperId: paper.paperId,
        },
      }),
    });
    state.results = state.results.map((entry) => (entry.paperId === paper.paperId ? { ...entry, queued: true } : entry));
    state.activeStage = "reading";
    state.readingView = "detail";
    saveStorage(STORAGE_KEYS.stage, state.activeStage);
    await loadProjects();
    await loadReadingSessions({ preserveSelection: false });
    await pollAgentRun(payload.run?.id || "");
  } catch (error) {
    state.error = error.message;
  } finally {
    state.readingStartingPaperId = "";
    render();
  }
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
    saveStorage(STORAGE_KEYS.stage, state.activeStage);
    render();
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

function placeholderMeta(project, stage) {
  const base = {
    reading: {
      agent: "Reader agent",
      status: project.queueCount ? "queue" : "todo",
      summary: "Search 단계에서 저장한 논문을 읽기 큐로 넘기면 섹션 단위 리딩과 하이라이트 추출 UI가 이 자리에 연결됩니다.",
      notes: [
        ["Ready input", "저장된 논문 메타데이터, 초록, 키포인트, 외부 링크가 이미 Search 단계에서 확보됩니다."],
        ["Next UI", "본문/하이라이트/에이전트 요약 3열 레이아웃으로 이어질 준비가 되어 있습니다."],
      ],
    },
    research: {
      agent: "Reproduction agent",
      status: "todo",
      summary: "재현 단계에서는 코드 링크, 환경 메모, 체크리스트, 실험 러너 상태를 같은 디자인 시스템 위에서 연결하게 됩니다.",
      notes: [
        ["Ready input", "논문 요약과 key points는 실험 체크리스트의 초기 seed로 활용할 수 있습니다."],
        ["Next UI", "좌측 체크리스트 패널과 우측 실험 테이블 레이아웃이 이어질 예정입니다."],
      ],
    },
    result: {
      agent: "Experiment agent",
      status: "todo",
      summary: "결과 비교 단계는 재현 실험과 원 논문의 metric delta를 card + table 패턴으로 정리하는 화면으로 이어집니다.",
      notes: [
        ["Ready input", "저장 논문과 reading queue 정보는 결과 비교 리포트의 출발점으로 사용할 수 있습니다."],
        ["Next UI", "상단 metric card, 하단 비교 표, 요약 insight 카드가 배치됩니다."],
      ],
    },
    insight: {
      agent: "Analyst agent",
      status: "todo",
      summary: "인사이트 단계는 실험 결과를 근거로 후속 연구 가설과 검증 메모를 구조화하는 레이어입니다.",
      notes: [
        ["Ready input", "Search에서 쌓인 주제 키워드와 저장 논문 목록이 insight clustering의 재료가 됩니다."],
        ["Next UI", "좌측 insight card와 우측 memo panel이 함께 배치될 예정입니다."],
      ],
    },
    writing: {
      agent: "Writing agent",
      status: "todo",
      summary: "작성 단계는 논문 섹션별 초안을 생성하고 export 액션을 연결하는 편집 화면으로 이어집니다.",
      notes: [
        ["Ready input", "Search 결과와 후속 단계의 요약 산출물이 writing prompt의 컨텍스트가 됩니다."],
        ["Next UI", "좌측 section navigator와 우측 본문 편집 캔버스로 확장됩니다."],
      ],
    },
  };

  return base[stage.id];
}

function renderSidebar() {
  const workflowRows = state.workflowOpen
    ? WORKFLOW_STAGES.map((stage) => {
        const active = stage.id === state.activeStage;
        const menuOpen = state.openWorkflowMenu === stage.id;
        const iconBackground = active ? stage.color : `${stage.color}1a`;
        const iconColor = active ? "#ffffff" : stage.color;

        return `
          <div class="workflow-item ${active ? "is-active" : ""} ${menuOpen ? "menu-open" : ""}" data-ares-role="workflow-row" data-ares-stage="${escapeHtml(stage.id)}">
            <button type="button" class="workflow-stage-btn hov" data-action="select-stage" data-stage-id="${escapeHtml(stage.id)}" data-ares-role="workflow-stage" data-ares-stage="${escapeHtml(stage.id)}">
              <span class="workflow-stage-icon" style="background:${iconBackground};color:${iconColor}">
                ${icon(stage.icon, { size: 13 })}
              </span>
              <span class="workflow-stage-copy">
                <span class="workflow-stage-label">${escapeHtml(stage.label)}</span>
              </span>
            </button>
            <div class="workflow-side-actions">
              <button
                type="button"
                class="sidebar-icon-btn"
                aria-label="${escapeHtml(stage.label)} context menu"
                data-action="toggle-workflow-menu"
                data-stage-id="${escapeHtml(stage.id)}"
              >
                ${icon("moreH", { size: 14 })}
              </button>
              ${
                menuOpen
                  ? `
                    <div class="sidebar-menu">
                      <button type="button" class="sidebar-menu-item" data-action="select-stage" data-stage-id="${escapeHtml(stage.id)}">Open stage</button>
                      <button type="button" class="sidebar-menu-item" data-action="copy-stage-link" data-stage-id="${escapeHtml(stage.id)}">Copy deep link</button>
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

  return `
    <aside class="desktop-sidebar" data-ares-surface="sidebar" data-ares-role="navigation">
      <section class="sidebar-section">
        <button type="button" class="workspace-switch hov">
          <span class="brand-mark">A</span>
          <span class="brand-copy">
            <span class="brand-title">ARES</span>
            <span class="brand-subtitle">Research workspace</span>
          </span>
          ${icon("chevD", { size: 13, color: TOKENS.t3 })}
        </button>
      </section>

      <section class="sidebar-section">
        <button type="button" class="sidebar-action hov-soft" data-action="focus-search">
          ${icon("search", { size: 13.5, color: TOKENS.t3 })}
          <span class="sidebar-action-label">Search</span>
          ${renderKbd("⌘K")}
        </button>
        <button type="button" class="sidebar-action hov-soft" data-action="focus-search">
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

      <section class="sidebar-section">
        <button type="button" class="sidebar-account hov">
          <span class="account-mark">DK</span>
          <span class="brand-copy">
            <span class="account-name">Dokyung</span>
            <span class="account-plan">Pro plan</span>
          </span>
          ${icon("settings", { size: 13, color: TOKENS.t3 })}
        </button>
      </section>
    </aside>
  `;
}

function renderTopbar() {
  const stage = stageById(state.activeStage);
  return `
    <header class="main-topbar" data-ares-surface="topbar" data-ares-stage="${escapeHtml(stage.id)}">
      <div class="topbar-stage">
        <span class="topbar-stage-badge" style="background:${stage.color}">
          ${icon(stage.icon, { size: 13, color: "#ffffff" })}
        </span>
        <span class="topbar-stage-label">${escapeHtml(stage.label)}</span>
        <span class="topbar-separator">·</span>
        <span class="topbar-stage-sub">${escapeHtml(stage.sub)}</span>
      </div>
      <div class="topbar-actions">
        <button type="button" class="btn-s">${icon("share", { size: 12 })} Share</button>
        <button type="button" class="btn-s">${icon("filter", { size: 12 })} Filter</button>
      </div>
    </header>
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
});

const { renderSearchPreview, renderSearchStage, resolveScopeCatalogItem, searchPlaceholder } = searchFeature;

const readingFeature = createReadingFeature({
  state,
  TOKENS,
  icon,
  escapeHtml,
  renderTag,
  statusColor,
  formatAuthors,
  effectiveReadingSessions,
  selectedReadingSession,
  readingHomeItems,
  readingHomeCounts,
  filterReadingHomeItems,
  readingHomeActionMeta,
});

const { renderReadingStage } = readingFeature;

function renderPlaceholderStage(project) {
  const stage = stageById(state.activeStage);
  const meta = placeholderMeta(project, stage);
  const statusTag = renderTag(meta.status, statusColor(meta.status), meta.status === "done");

  return `
    <div class="placeholder-stage" data-ares-surface="placeholder-stage" data-ares-stage="${escapeHtml(stage.id)}">
      <section class="placeholder-main" data-ares-surface="placeholder-main" data-ares-stage="${escapeHtml(stage.id)}">
        <div class="placeholder-main-inner">
          <div class="placeholder-eyebrow">${escapeHtml(stage.label)}</div>
          <h1 class="placeholder-title">${escapeHtml(stage.sub)}</h1>
          <p class="placeholder-copy">
            Search 탭에서 저장한 논문을 기준으로 다음 단계의 데이터 모델을 연결할 예정입니다.
            현재 활성 프로젝트는 <strong>${escapeHtml(project.name)}</strong> 입니다.
          </p>

          <div class="placeholder-grid">
            <article class="placeholder-card">
              <div class="placeholder-card-label">Current foundation</div>
              <h3>Search data is already working</h3>
              <p>프로젝트별 논문 검색, 필터링, 스크랩 저장, reading queue 연결이 실제 데이터 흐름으로 동작합니다.</p>
            </article>

            <article class="placeholder-card">
              <div class="placeholder-card-label">Next implementation target</div>
              <h3>${escapeHtml(stage.label)} UI scaffold</h3>
              <p>${escapeHtml(meta.summary)}</p>
            </article>
          </div>

          <div class="placeholder-tint" style="background:${stage.color}0a;border:1px solid ${stage.color}28">
            <div class="placeholder-card-label" style="color:${stage.color};margin-bottom:8px">${escapeHtml(meta.agent)}</div>
            <p>${escapeHtml(meta.notes[0][1])}</p>
          </div>
        </div>
      </section>

      <aside class="agent-panel" data-ares-surface="agent-panel" data-ares-stage="${escapeHtml(stage.id)}">
        <div class="agent-panel-header">
          <div class="agent-panel-status">
            ${statusIcon(meta.status)}
            <span>${escapeHtml(meta.agent)}</span>
          </div>
          ${statusTag}
        </div>

        <div class="agent-panel-body">
          ${meta.notes
            .map(
              ([label, copy]) => `
                <section class="agent-panel-section" style="border-left-color:${stage.color}">
                  <div class="agent-panel-eyebrow" style="color:${stage.color};margin-bottom:4px">${escapeHtml(label)}</div>
                  <p>${escapeHtml(copy)}</p>
                </section>
              `,
            )
            .join("")}

          <section class="agent-panel-metrics">
            <div class="agent-panel-eyebrow" style="margin-bottom:8px">Project metrics</div>
            <div class="agent-panel-metric-row">
              <span style="color:${TOKENS.t2}">Saved papers</span>
              <span class="mono" style="color:${TOKENS.tx}">${project.libraryCount}</span>
            </div>
            <div class="agent-panel-metric-row">
              <span style="color:${TOKENS.t2}">Reading queue</span>
              <span class="mono" style="color:${TOKENS.tx}">${project.queueCount}</span>
            </div>
            <div class="agent-panel-metric-row">
              <span style="color:${TOKENS.t2}">Focus keywords</span>
              <span class="mono" style="color:${TOKENS.tx}">${escapeHtml((project.keywords || []).slice(0, 2).join(", ") || "n/a")}</span>
            </div>
          </section>
        </div>

        <div class="agent-panel-footer">
          <button type="button" class="btn-p" data-action="select-stage" data-stage-id="search">Back to Search</button>
        </div>
      </aside>
    </div>
  `;
}

function renderBottomNav() {
  return `
    <nav class="bottom-nav" aria-label="Workflow tabs" data-ares-surface="bottom-nav" data-ares-role="navigation">
      ${WORKFLOW_STAGES.map((stage) => {
        const active = stage.id === state.activeStage;
        return `
          <button
            type="button"
            class="${active ? "is-active" : ""}"
            data-action="select-stage"
            data-stage-id="${escapeHtml(stage.id)}"
            style="--stage-color:${stage.color};--stage-tint:${stage.color}12"
            data-ares-role="bottom-stage"
            data-ares-stage="${escapeHtml(stage.id)}"
          >
            ${icon(stage.icon, { size: 17, color: active ? stage.color : TOKENS.t3 })}
            <span>${escapeHtml(stage.label)}</span>
          </button>
        `;
      }).join("")}
    </nav>
  `;
}

function renderShell(message) {
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
        : renderPlaceholderStage(project);

  app.innerHTML = `
    <div
      class="app-shell"
      data-ares-app="true"
      data-active-stage="${escapeHtml(state.activeStage)}"
      data-active-project-id="${escapeHtml(project.id)}"
      data-active-project-name="${escapeHtml(project.name)}"
      data-active-paper-id="${escapeHtml(selected?.paperId || "")}"
      data-active-paper-title="${escapeHtml(selected?.title || "")}"
    >
      ${renderSidebar()}
      <main class="workspace" data-ares-surface="workspace" data-ares-stage="${escapeHtml(state.activeStage)}">
        ${renderTopbar()}
        <div class="stage-wrap" data-ares-surface="stage-wrap" data-ares-stage="${escapeHtml(state.activeStage)}">${stageContent}</div>
      </main>
      ${renderBottomNav()}
    </div>
  `;
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

function patchReadingStageUI({ preserveRailFocus = false } = {}) {
  if (state.activeStage !== "reading") {
    return false;
  }

  const project = activeProject();
  const currentStage = document.querySelector('[data-ares-surface="reading-stage"]');
  if (!project || !currentStage) {
    return false;
  }

  const template = document.createElement("template");
  template.innerHTML = renderReadingStage(project).trim();
  const nextStage = template.content.firstElementChild;
  if (!nextStage) {
    return false;
  }

  const currentView = currentStage.dataset.readingView || "";
  const nextView = nextStage.dataset.readingView || "";
  if (currentView !== "detail" || nextView !== "detail") {
    currentStage.replaceWith(nextStage);
    syncAppActivePaperMetadata(currentReadingPaper(project));
    return true;
  }

  const currentMetabar = currentStage.querySelector(".reading-metabar");
  const nextMetabar = nextStage.querySelector(".reading-metabar");
  const currentShell = currentStage.querySelector(".reading-shell-main");
  const nextShell = nextStage.querySelector(".reading-shell-main");
  if (!currentMetabar || !nextMetabar || !currentShell || !nextShell) {
    return false;
  }

  const focusedRailQuery =
    preserveRailFocus && document.activeElement?.matches?.('[name="readingRailQuery"]')
      ? {
          start: document.activeElement.selectionStart ?? null,
          end: document.activeElement.selectionEnd ?? null,
          direction: document.activeElement.selectionDirection ?? "none",
        }
      : null;

  const currentIconRail = currentShell.querySelector(".reading-icon-rail");
  const nextIconRail = nextShell.querySelector(".reading-icon-rail");
  const currentSplit = currentShell.querySelector(".reading-split");
  const nextSplit = nextShell.querySelector(".reading-split");
  if (!currentIconRail || !nextIconRail || !currentSplit || !nextSplit) {
    return false;
  }

  const currentPanel = currentShell.querySelector(".reading-float-panel");
  const nextPanel = nextShell.querySelector(".reading-float-panel");
  const previousPanelScrollTop = currentPanel?.querySelector(".reading-float-panel-body")?.scrollTop ?? 0;
  const currentWorkbenchStrip = currentShell.querySelector(".reading-wb-strip");
  const nextWorkbenchStrip = nextShell.querySelector(".reading-wb-strip");

  currentStage.dataset.readingOrientation = nextStage.dataset.readingOrientation || "";
  currentMetabar.replaceWith(nextMetabar);
  currentIconRail.replaceWith(nextIconRail);

  if (currentPanel && nextPanel) {
    currentPanel.className = nextPanel.className;
    currentPanel.replaceChildren(...Array.from(nextPanel.childNodes));
    const nextPanelBody = currentPanel.querySelector(".reading-float-panel-body");
    if (nextPanelBody) {
      nextPanelBody.scrollTop = previousPanelScrollTop;
    }
  } else if (currentPanel) {
    currentPanel.remove();
  } else if (nextPanel) {
    currentShell.insertBefore(nextPanel, currentSplit);
  }

  currentSplit.replaceWith(nextSplit);

  if (currentWorkbenchStrip && nextWorkbenchStrip) {
    currentWorkbenchStrip.replaceWith(nextWorkbenchStrip);
  } else if (currentWorkbenchStrip) {
    currentWorkbenchStrip.remove();
  } else if (nextWorkbenchStrip) {
    currentShell.appendChild(nextWorkbenchStrip);
  }

  if (focusedRailQuery) {
    window.requestAnimationFrame(() => {
      const input = document.querySelector('[name="readingRailQuery"]');
      if (!input) {
        return;
      }

      input.focus();
      if (focusedRailQuery.start !== null && focusedRailQuery.end !== null) {
        input.setSelectionRange(focusedRailQuery.start, focusedRailQuery.end, focusedRailQuery.direction);
      }
    });
  }

  return true;
}

function refreshReadingStageUI(options = {}) {
  if (!patchReadingStageUI(options)) {
    render();
  }
}

function previewSearchModeSwitch(nextMode) {
  const hero = document.querySelector(".hero-input");
  if (!hero) {
    return Promise.resolve();
  }

  const currentMode = hero.classList.contains("scout") ? "scout" : "keyword";
  if (currentMode === nextMode) {
    return Promise.resolve();
  }

  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      hero.classList.remove("scout", "keyword");
      hero.classList.add(nextMode);

      const activeButton = hero.querySelector(".hero-submit-btn.active");
      const nextButton = hero.querySelector(`.hero-submit-btn[data-mode="${nextMode}"]`);
      activeButton?.classList.remove("active");
      nextButton?.classList.add("active");

      const input = hero.querySelector("#search-input");
      if (input) {
        input.placeholder = searchPlaceholder(nextMode);
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
    state.activeStage = normalizeStage(trigger.dataset.stageId);
    state.scopePicker = null;
    saveStorage(STORAGE_KEYS.stage, state.activeStage);
    if (state.activeStage === "reading") {
      state.readingView = "home";
      state.readingHomePreviewOpen = false;
      await loadReadingSessions({ preserveSelection: true });
      syncReadingHomeSelection();
    }
    render();
    return;
  }

  if (action === "select-project") {
    clearActiveRunPoll();
    state.activeProjectId = trigger.dataset.projectId;
    state.projectLibrary = [];
    state.scopePicker = null;
    saveStorage(STORAGE_KEYS.project, state.activeProjectId);
    state.searchInput = activeProject()?.defaultQuery || "";
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

  if (action === "set-reading-home-filter") {
    state.readingHomeFilter = trigger.dataset.readingHomeFilter || "all";
    syncReadingHomeSelection();
    refreshReadingStageUI();
    return;
  }

  if (action === "select-reading-home-paper") {
    state.readingHomeSelectedPaperId = trigger.dataset.readingPaperId || "";
    if (state.readingHomeLayout !== "desktop") {
      state.readingHomePreviewOpen = true;
    }
    refreshReadingStageUI();
    return;
  }

  if (action === "close-reading-home-preview") {
    state.readingHomePreviewOpen = false;
    refreshReadingStageUI();
    return;
  }

  if (action === "open-reading-detail") {
    await openReadingDetailForPaper(trigger.dataset.readingPaperId || "");
    return;
  }

  if (action === "select-reading-session") {
    state.readingView = "detail";
    state.activeReadingSessionId = trigger.dataset.readingSessionId || "";
    state.readingHomeSelectedPaperId = selectedReadingSession()?.paperId || state.readingHomeSelectedPaperId;
    refreshReadingStageUI();
    return;
  }

  if (action === "back-reading-home") {
    state.readingView = "home";
    state.readingHomeSelectedPaperId = selectedReadingSession()?.paperId || state.readingHomeSelectedPaperId;
    state.readingHomePreviewOpen = false;
    syncReadingHomeSelection();
    refreshReadingStageUI();
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
    state.readingDocumentTab = trigger.dataset.readingDocumentTab || "pdf";
    refreshReadingStageUI();
    return;
  }

  if (action === "set-reading-workbench-tab") {
    state.readingWorkbenchTab = trigger.dataset.readingWorkbenchTab || "chat";
    state.readingWorkbenchCollapsed = false;
    refreshReadingStageUI();
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
      state.readingParsedSessionIds.add(currentSession.id);
      refreshReadingStageUI();
    }
    return;
  }

  if (action === "reading-summarize-session") {
    const currentSession = selectedReadingSession();
    if (currentSession?.id) {
      state.readingSummarizedSessionIds.add(currentSession.id);
      state.readingParsedSessionIds.add(currentSession.id);
      state.readingDocumentTab = "summary";
      refreshReadingStageUI();
    }
    return;
  }

  if (action === "focus-search") {
    state.scopePicker = null;
    focusSearchInput({ forceSearchStage: true, select: true });
    return;
  }

  if (action === "set-search-mode") {
    event.preventDefault();
    const nextMode = trigger.dataset.searchMode === "keyword" ? "keyword" : "scout";
    if (nextMode === state.searchMode) {
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
    const url = `${window.location.origin}${window.location.pathname}#${stageId}`;
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

document.addEventListener("submit", async (event) => {
  const form = event.target.closest('[data-action="submit-search"]');
  if (!form) {
    return;
  }

  event.preventDefault();
  const formData = new FormData(form);
  state.searchInput = String(formData.get("query") || "").trim();
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

  if (event.target.name === "minRelevance") {
    state.filters.minRelevance = Number(event.target.value);
    syncSelectedPaper();
    render();
  }
});

document.addEventListener("change", (event) => {
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

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && /^[1-6]$/.test(event.key)) {
    event.preventDefault();
    const stage = WORKFLOW_STAGES[Number(event.key) - 1];
    if (stage) {
      state.activeStage = stage.id;
      if (stage.id === "reading") {
        state.readingView = "home";
        state.readingHomePreviewOpen = false;
        syncReadingHomeSelection();
      }
      saveStorage(STORAGE_KEYS.stage, state.activeStage);
      render();
    }
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    focusSearchInput({ forceSearchStage: true, select: true });
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
    if (searchLayoutChanged || readingHomeLayoutChanged) {
      render();
    }
  });
});

async function boot() {
  try {
    await loadProjects();
    const project = activeProject();
    state.searchInput = project?.defaultQuery || "";
    resetSearchState();
    await loadProjectLibrary();
    await loadReadingSessions({ preserveSelection: false });
    syncReadingHomeSelection();
    const pendingSession = state.readingSessions.find((session) => session.runId && session.status !== "done");
    if (pendingSession?.runId) {
      void pollAgentRun(pendingSession.runId);
    }
    render();
  } catch (error) {
    state.error = error.message;
    render();
  } finally {
    state.booting = false;
  }
}

render();
boot();
