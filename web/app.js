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
  results: [],
  availableVenues: [],
  readingSessions: [],
  activeReadingSessionId: "",
  activeReadingRunId: "",
  selectedPaperId: "",
  sort: "relevance",
  searchMode: "keyword",
  searchLayout: INITIAL_SEARCH_LAYOUT,
  filterPanelOpen: false,
  previewPanelOpen: INITIAL_SEARCH_LAYOUT !== "tablet",
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

function syncResponsiveSearchLayout(nextLayout = detectSearchLayout()) {
  const previousLayout = state.searchLayout;
  if (previousLayout === nextLayout) {
    return false;
  }

  state.searchLayout = nextLayout;

  if (nextLayout === "tablet") {
    state.filterPanelOpen = false;
    state.previewPanelOpen = false;
    state.scopePicker = null;
    state.scopePickerQuery = "";
    return true;
  }

  if (previousLayout === "tablet" && nextLayout === "desktop") {
    state.filterPanelOpen = false;
    state.previewPanelOpen = true;
    return true;
  }

  if (previousLayout === "tablet" && nextLayout === "mobile") {
    state.filterPanelOpen = false;
    state.previewPanelOpen = Boolean(state.selectedPaperId);
    return true;
  }

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

function selectedReadingSession() {
  const sessions = sortReadingSessions(state.readingSessions);
  return sessions.find((session) => session.id === state.activeReadingSessionId) || sessions[0] || null;
}

function syncSelectedReadingSession() {
  const sessions = sortReadingSessions(state.readingSessions);
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
  state.filterPanelOpen = false;

  if (isTabletSearchLayout()) {
    state.previewPanelOpen = false;
  }
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
    } else {
      const payload = await api(`api/projects/${encodeURIComponent(project.id)}/library`, {
        method: "POST",
        body: JSON.stringify({ paper }),
      });
      replaceProject(payload.project);
      state.results = state.results.map((entry) => (entry.paperId === paper.paperId ? { ...entry, saved: true } : entry));
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

function uniqueValues(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function venueColor(venue) {
  const value = String(venue || "").toLowerCase();
  if (value.includes("emnlp")) {
    return TOKENS.research;
  }
  if (value.includes("acl") || value.includes("naacl")) {
    return TOKENS.read;
  }
  if (value.includes("neurips")) {
    return TOKENS.writing;
  }
  if (value.includes("icml")) {
    return TOKENS.result;
  }
  if (value.includes("iclr")) {
    return TOKENS.insight;
  }
  if (value.includes("arxiv")) {
    return TOKENS.t3;
  }
  return TOKENS.t3;
}

function renderVenueTag(venue) {
  return renderTag(venue || "Unknown", venueColor(venue));
}

function resolveScopeCatalogItem(type, id) {
  const groups = SEARCH_TARGET_CATALOG[type] || {};
  return [...(groups.popular || []), ...(groups.recent || [])].find((item) => item.id === id) || null;
}

function searchPlaceholder(mode) {
  return mode === "scout" ? "의미 기반으로 논문을 찾아볼까요?" : "키워드, 저자, 제목으로 검색";
}

function searchYearOptions() {
  const buckets = ["2025", "2024", "2023", "earlier"];
  if (state.results.some((paper) => yearBucket(paper.year) === "unknown")) {
    buckets.push("unknown");
  }
  return buckets;
}

function renderPulseDot(color = TOKENS.search, size = 6) {
  return `<span class="pd" style="background:${color};width:${size}px;height:${size}px"></span>`;
}

function relevanceColor(value) {
  if (value >= 90) {
    return TOKENS.search;
  }
  if (value >= 75) {
    return TOKENS.read;
  }
  return TOKENS.t3;
}

function renderRelevanceBar(value) {
  return `
    <span class="paper-relevance-bar">
      <span class="paper-relevance-bar-fill" style="width:${Math.max(0, Math.min(100, Number(value) || 0))}%;background:${relevanceColor(value)}"></span>
    </span>
  `;
}

function paperReason(paper) {
  const matched = uniqueValues(paper.matchedKeywords || []).slice(0, 2);
  const parts = [];
  if (matched.length) {
    parts.push(`matched ${matched.map((keyword) => `"${keyword}"`).join(" · ")}`);
  }
  if (paper.citedByCount) {
    parts.push(`cited by ${paper.citedByCount}`);
  }
  if (paper.openAccess) {
    parts.push("open access");
  }
  return parts.join(" · ") || "semantic similarity match";
}

function paperMatchesScope(paper, scope) {
  const venue = String(paper.venue || "").toLowerCase();
  const authors = (paper.authors || []).map((author) => String(author).toLowerCase());
  const haystack = `${paper.title || ""} ${paper.summary || paper.abstract || ""} ${(paper.keywords || []).join(" ")}`.toLowerCase();
  const label = String(scope.label || "").toLowerCase();
  const meta = scope.meta || {};

  if (scope.type === "conference") {
    return venue.includes(String(meta.venue || scope.label || "").toLowerCase());
  }

  if (scope.type === "author") {
    return authors.some((author) => author.includes(label));
  }

  const anchor = String(meta.inst || scope.label || "").toLowerCase().split(" ")[0];
  return Boolean(anchor) && haystack.includes(anchor);
}

function paperInScope(paper) {
  return state.searchScopes.some((scope) => paperMatchesScope(paper, scope));
}

function renderSearchNotice(message) {
  return `<div class="notice">${icon("plus", { size: 14, color: TOKENS.result })}<div>${escapeHtml(message)}</div></div>`;
}

function renderSearchModeToggle() {
  return `
    <div class="hero-submit" aria-label="Search mode">
      ${Object.entries(SEARCH_MODES)
        .map(([id, config]) => {
          const active = state.searchMode === id;
          const actionAttrs = active ? "" : `data-action="set-search-mode" data-search-mode="${escapeHtml(id)}"`;
          return `
            <button
              type="${active ? "submit" : "button"}"
              class="hero-submit-btn ${active ? "active" : ""}"
              data-mode="${escapeHtml(id)}"
              title="${escapeHtml(config.ctaLabel)}"
              aria-label="${escapeHtml(config.ctaLabel)}"
              ${actionAttrs}
              ${state.loading ? "disabled" : ""}
            >
              ${icon(config.icon, { size: 14.5 })}
              <span class="expand">
                <span class="hero-submit-label hero-submit-label-desktop">${escapeHtml(config.ctaLabel)}</span>
                <span class="hero-submit-label hero-submit-label-mobile">${escapeHtml(config.compactLabel)}</span>
                <span class="go" aria-hidden="true">${icon("ctaArrow", { size: 13 })}</span>
              </span>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderSearchScopeChip(scope, compact = false) {
  const config = SEARCH_TARGET_TYPES[scope.type] || SEARCH_TARGET_TYPES.conference;
  const prefix = compact ? "filter-scope-chip" : "scope-chip";
  const shortLabel = config.label.slice(0, 4).toUpperCase();

  return `
    <span class="${prefix}" style="border-color:${config.color}40;background:${config.color}08">
      ${compact ? "" : icon(config.icon, { size: 11, color: config.color })}
      ${compact ? "" : `<span class="scope-chip-type" style="color:${config.color}">${escapeHtml(shortLabel)}</span>`}
      <span class="${compact ? "filter-scope-chip-label" : "scope-chip-label"}">${escapeHtml(scope.label)}</span>
      <button type="button" class="${compact ? "x" : "x-btn"}" data-action="remove-scope" data-scope-id="${escapeHtml(scope.id)}" aria-label="Remove scope">
        ${icon("x", { size: compact ? 9 : 10 })}
      </button>
    </span>
  `;
}

function renderSearchFilterSection(label, iconName, sectionKey, bodyMarkup, activeCount = 0) {
  const open = Boolean(state.filterSections[sectionKey]);
  return `
    <section class="search-filter-section">
      <button type="button" class="sec-hdr" data-action="toggle-filter-section" data-filter-section="${escapeHtml(sectionKey)}">
        <span class="sec-hdr-copy">
          ${icon(iconName, { size: 11, color: TOKENS.t3 })}
          <span>${escapeHtml(label)}</span>
          ${activeCount > 0 ? `<span class="filter-count mono">${activeCount}</span>` : ""}
        </span>
        ${icon(open ? "chevD" : "chevR", { size: 11, color: TOKENS.t3 })}
      </button>
      <div class="sec-body ${open ? "" : "closed"}">${bodyMarkup}</div>
    </section>
  `;
}

function renderSearchFilterPanel(project, visible) {
  const savedVisibleCount = visible.filter((paper) => paper.saved).length;
  const newVisibleCount = Math.max(visible.length - savedVisibleCount, 0);
  const tabletDrawer = isTabletSearchLayout();

  if (!state.filterPanelOpen) {
    return `
      <aside class="sidebar-collapsed-strip" data-ares-surface="search-filters" data-ares-stage="search">
        <button type="button" class="panel-toggle-btn" data-action="toggle-filter-panel" title="필터 펼치기">
          ${icon("chevR", { size: 13, color: TOKENS.t2 })}
        </button>
        <div class="collapsed-strip-divider"></div>
        <button type="button" class="panel-toggle-btn" data-action="toggle-filter-panel" title="Scope">
          ${icon("globe", { size: 12, color: TOKENS.t2 })}
        </button>
        <button type="button" class="panel-toggle-btn" data-action="toggle-filter-panel" title="Venue">
          ${icon("filter", { size: 12, color: TOKENS.t2 })}
        </button>
        <button type="button" class="panel-toggle-btn" data-action="toggle-filter-panel" title="Year">
          ${icon("clock", { size: 12, color: TOKENS.t2 })}
        </button>
        <button type="button" class="panel-toggle-btn" data-action="toggle-filter-panel" title="Relevance">
          ${icon("dot", { size: 12, color: TOKENS.t2 })}
        </button>
      </aside>
    `;
  }

  const scopeMarkup = Object.entries(SEARCH_TARGET_TYPES)
    .map(([type, config]) => {
      const activeScopes = state.searchScopes.filter((scope) => scope.type === type);
      return `
        <div class="filter-scope-type">
          <div class="filter-scope-type-hdr">
            ${icon(config.icon, { size: 11, color: config.color })}
            <span>${escapeHtml(config.label)}</span>
            ${activeScopes.length ? `<span class="mono" style="color:${config.color}">· ${activeScopes.length}</span>` : ""}
          </div>
          <div class="filter-scope-chip-row">
            ${activeScopes.map((scope) => renderSearchScopeChip(scope, true)).join("")}
          </div>
          <button
            type="button"
            class="scope-add"
            data-action="open-scope-picker"
            data-scope-tab="${escapeHtml(type)}"
            data-scope-source="sidebar"
          >
            ${icon("plus", { size: 10 })}
            <span>Add ${escapeHtml(config.label.toLowerCase())}</span>
          </button>
        </div>
      `;
    })
    .join("");

  const venueMarkup = state.availableVenues.length
    ? state.availableVenues
        .map((venue) => {
          const checked = state.filters.venues.has(venue);
          return `
            <label class="filter-option ${checked ? "is-checked" : ""}">
              <input class="sr-only" type="checkbox" name="venue" value="${escapeHtml(venue)}" ${checked ? "checked" : ""} />
              <span class="filter-option-box">${checked ? icon("check", { size: 9, color: "#ffffff" }) : ""}</span>
              <span class="filter-option-dot" style="background:${venueColor(venue)}"></span>
              <span>${escapeHtml(venue)}</span>
            </label>
          `;
        })
        .join("")
    : '<div class="empty-state compact-empty">검색 결과가 들어오면 venue 필터가 채워집니다.</div>';

  const yearMarkup = searchYearOptions()
    .map((bucket) => {
      const checked = state.filters.years.has(bucket);
      return `
        <label class="filter-option ${checked ? "is-checked" : ""}">
          <input class="sr-only" type="checkbox" name="yearBucket" value="${escapeHtml(bucket)}" ${checked ? "checked" : ""} />
          <span class="filter-option-box">${checked ? icon("check", { size: 9, color: "#ffffff" }) : ""}</span>
          <span>${escapeHtml(yearBucketLabel(bucket))}</span>
        </label>
      `;
    })
    .join("");

  const relevanceMarkup = `
    <input class="filter-range" type="range" name="minRelevance" min="0" max="100" step="1" value="${state.filters.minRelevance}" />
    <div class="filter-range-value mono">≥ ${state.filters.minRelevance}%</div>
  `;

  return `
    ${tabletDrawer ? '<div class="panel-backdrop panel-backdrop-left" data-action="close-filter-panel" aria-hidden="true"></div>' : ""}
    <aside class="search-filters search-filters-focal${tabletDrawer ? " panel-drawer panel-drawer-left" : ""}" data-ares-surface="search-filters" data-ares-stage="search">
      <div class="search-filters-header">
        <span class="filter-eyebrow">Filters</span>
        <button type="button" class="panel-toggle-btn" data-action="${tabletDrawer ? "close-filter-panel" : "toggle-filter-panel"}" title="필터 접기">
          ${icon("chevL", { size: 13, color: TOKENS.t2 })}
        </button>
      </div>

      ${renderSearchFilterSection("Scope", "globe", "scope", scopeMarkup, state.searchScopes.length)}
      ${renderSearchFilterSection("Venue", "filter", "venue", venueMarkup, state.filters.venues.size)}
      ${renderSearchFilterSection("Year", "clock", "year", yearMarkup, state.filters.years.size)}
      ${renderSearchFilterSection("Relevance", "dot", "rel", relevanceMarkup)}

      <section class="filter-divider filter-library-card">
        <div class="filter-group-title">Library</div>
        <div class="library-metric">
          <span class="library-metric-value">${project.libraryCount}</span>
          <span class="library-metric-label">papers</span>
        </div>
        <div class="tag-row filter-library-tags">
          ${renderTag(`${project.libraryCount} saved`, TOKENS.search, true)}
          ${renderTag(`${newVisibleCount} new`)}
        </div>
      </section>
    </aside>
  `;
}

function renderSearchHero(visible, totalResults) {
  return `
    <div class="hero-wrap">
      <form class="hero-input ${escapeHtml(state.searchMode)}" data-action="submit-search">
        <span class="hero-lead-icon" aria-hidden="true">${icon("heroSearch", { size: 16, color: TOKENS.t3 })}</span>
        <input
          id="search-input"
          type="text"
          name="query"
          autocomplete="off"
          spellcheck="false"
          value="${escapeHtml(state.searchInput)}"
          placeholder="${escapeHtml(searchPlaceholder(state.searchMode))}"
        />
        ${renderSearchModeToggle()}
      </form>

      <div class="hero-meta ${escapeHtml(state.searchMode)}">
        <div class="hero-meta-scope">
          ${state.searchScopes.length ? "" : '<span class="scope-empty">everywhere</span>'}
          ${state.searchScopes.map((scope) => renderSearchScopeChip(scope)).join("")}
          <button
            type="button"
            class="scope-add"
            data-action="open-scope-picker"
            data-scope-tab="conference"
            data-scope-source="hero"
          >
            ${icon("plus", { size: 10 })}
            <span>Add target</span>
          </button>
        </div>
      </div>

      ${state.searchMeta.warning ? renderSearchNotice(state.searchMeta.warning) : ""}
      ${state.error ? renderSearchNotice(state.error) : ""}
    </div>
  `;
}

function renderSearchResultRow(paper) {
  const selected = paper.paperId === state.selectedPaperId;
  const inScope = paperInScope(paper);
  const reason = paperReason(paper);
  const relevance = Number(paper.relevance || 0);

  return `
    <button
      type="button"
      class="paper-row ${selected ? "is-selected" : ""}"
      data-action="select-paper"
      data-paper-id="${escapeHtml(paper.paperId)}"
      data-ares-surface="paper-row"
      data-ares-role="paper-row"
      data-ares-stage="search"
      data-ares-paper-id="${escapeHtml(paper.paperId)}"
      data-ares-paper-title="${escapeHtml(paper.title)}"
    >
      <span class="paper-venue-bar" style="background:${venueColor(paper.venue)};opacity:${selected ? "1" : "0.32"}"></span>
      <span class="paper-content">
        <span class="paper-main">
          <span class="paper-title">${escapeHtml(paper.title)}</span>
          <span class="paper-meta">
            <span class="paper-authors">${escapeHtml(formatAuthors(paper.authors))}</span>
            <span class="paper-meta-separator">·</span>
            ${renderVenueTag(paper.venue)}
            <span class="paper-year mono">${escapeHtml(String(paper.year || "n/a"))}</span>
            <span class="paper-meta-separator">·</span>
            <span class="paper-cites">
              ${icon("quote", { size: 11, color: TOKENS.t3 })}
              <span>${escapeHtml(String(paper.citedByCount || 0))}</span>
            </span>
            ${paper.openAccess ? renderTag("open access", TOKENS.search) : ""}
            ${paper.saved ? renderTag("saved", TOKENS.read, true) : ""}
            ${paper.queued ? renderTag("reading queue", TOKENS.result) : ""}
            ${inScope ? renderTag("in scope", TOKENS.search, true) : ""}
          </span>
          <span class="paper-summary">${escapeHtml(paper.summary || paper.abstract || "Abstract metadata is not available yet.")}</span>
          ${
            state.searchMode === "scout"
              ? `<span class="reasoning-line paper-reasoning">${icon("sparkles", { size: 10, color: TOKENS.search })}<span>scout · ${escapeHtml(reason)}</span></span>`
              : ""
          }
        </span>
        <span class="paper-score-wrap">
          <span class="paper-score mono" style="color:${relevanceColor(relevance)}">${escapeHtml(String(relevance))}</span>
          ${renderRelevanceBar(relevance)}
          <span class="paper-score-label">${state.searchMode === "scout" ? "relevance" : "match"}</span>
        </span>
      </span>
    </button>
  `;
}

function renderSearchResultsList(visible) {
  if (state.loading) {
    return state.searchMode === "scout"
      ? '<div class="loading-state search-results-empty">Scout agent가 논문 후보를 수집 중입니다...</div>'
      : '<div class="loading-state search-results-empty">OpenAlex에서 논문 후보를 불러오는 중입니다...</div>';
  }

  if (!state.hasSearched) {
    return '<div class="empty-state search-results-empty">검색어를 입력하고 Search를 눌러 논문을 찾아보세요.</div>';
  }

  if (!visible.length) {
    return '<div class="empty-state search-results-empty">현재 필터 조건에 맞는 논문이 없습니다. venue, year, relevance 조건을 조금 넓혀보세요.</div>';
  }

  return visible.map((paper) => renderSearchResultRow(paper)).join("");
}

function renderSearchPreview(paper) {
  const tabletDrawer = isTabletSearchLayout();
  const previewDrawerClass = tabletDrawer ? " panel-drawer panel-drawer-right" : "";
  const previewCloseAction = tabletDrawer ? "close-preview-panel" : "toggle-preview-panel";
  const previewBackdropAction = tabletDrawer ? "close-preview-panel" : "close-preview-modal";

  if (!state.previewPanelOpen) {
    const emptyCls = paper ? "" : " is-empty";
    return `
      <aside class="preview-collapsed-strip${emptyCls}" data-ares-surface="search-preview" data-ares-stage="search">
        <button type="button" class="panel-toggle-btn" data-action="toggle-preview-panel" title="프리뷰 펼치기">
          ${icon("chevL", { size: 13, color: TOKENS.t2 })}
        </button>
        <div class="collapsed-strip-divider"></div>
        <button type="button" class="panel-toggle-btn" data-action="toggle-preview-panel" title="Paper preview">
          ${icon("book", { size: 12, color: TOKENS.t2 })}
        </button>
      </aside>
    `;
  }

  if (!paper) {
    return `
      ${tabletDrawer ? `<div class="preview-backdrop panel-backdrop panel-backdrop-right" data-action="${previewBackdropAction}" aria-hidden="true"></div>` : ""}
      <aside class="search-preview search-preview-focal is-empty${previewDrawerClass}" data-ares-surface="search-preview" data-ares-stage="search">
        <div class="search-preview-header search-preview-header-focal">
          <div class="preview-heading">
            <div class="preview-eyebrow">Paper</div>
            <div class="preview-title">Select a paper</div>
          </div>
          <button type="button" class="panel-toggle-btn" data-action="${previewCloseAction}" title="프리뷰 접기">
            ${icon("chevR", { size: 13, color: TOKENS.t2 })}
          </button>
        </div>
        <div class="empty-state search-preview-empty">리스트에서 논문을 선택하면 프리뷰가 여기에 표시됩니다.</div>
      </aside>
    `;
  }

  const previewTags = uniqueValues([...(paper.matchedKeywords || []).slice(0, 4), paper.openAccess ? "open access" : ""]).filter(Boolean);
  const saveLabel = paper.saved ? "Remove" : state.savingPaperId === paper.paperId ? "Saving..." : "Save";
  const readLabel = state.readingStartingPaperId === paper.paperId ? "Starting..." : "Read";

  return `
    <div class="preview-backdrop${tabletDrawer ? " panel-backdrop panel-backdrop-right" : ""}" data-action="${previewBackdropAction}" aria-hidden="true"></div>
    <aside class="search-preview search-preview-focal${previewDrawerClass}" data-ares-surface="search-preview" data-ares-stage="search" data-ares-paper-id="${escapeHtml(paper.paperId)}" data-ares-paper-title="${escapeHtml(paper.title)}">
      <div class="search-preview-header search-preview-header-focal">
        <div class="preview-heading">
          <div class="preview-eyebrow">Paper</div>
          <div class="preview-title">${escapeHtml(paper.title)}</div>
          <div class="tag-row">
            ${renderTag(formatAuthors(paper.authors))}
            ${renderVenueTag(paper.venue)}
            ${renderTag(`${paper.citedByCount || 0} cites`)}
            ${paper.openAccess ? renderTag("open access", TOKENS.search) : ""}
          </div>
        </div>
        <button type="button" class="panel-toggle-btn preview-close-desktop" data-action="${previewCloseAction}" title="프리뷰 접기">
          ${icon("chevR", { size: 13, color: TOKENS.t2 })}
        </button>
        <button type="button" class="panel-toggle-btn preview-close-mobile" data-action="close-preview-modal" title="닫기" aria-label="닫기">
          ${icon("x", { size: 14, color: TOKENS.t2 })}
        </button>
      </div>

      <div class="search-preview-body">
        <section class="preview-section">
          <div class="preview-section-title">Abstract</div>
          <div class="preview-copy">${escapeHtml(paper.summary || paper.abstract || "Abstract is not available.")}</div>
        </section>

        <section class="preview-section">
          <div class="preview-section-title">Why relevant</div>
          <div class="reasoning-line preview-reasoning-line">
            ${icon("sparkles", { size: 11, color: TOKENS.search })}
            <span>${escapeHtml(paperReason(paper))}</span>
          </div>
        </section>

        <section class="preview-section">
          <div class="preview-section-title">Tags</div>
          <div class="tag-row">
            ${previewTags.map((tag) => renderTag(tag)).join("")}
          </div>
        </section>
      </div>

      <div class="search-preview-footer">
        <button
          type="button"
          class="btn-p"
          data-action="toggle-save"
          data-paper-id="${escapeHtml(paper.paperId)}"
          ${state.savingPaperId === paper.paperId ? "disabled" : ""}
        >
          ${icon("bookmark", { size: 12, color: "#ffffff" })}
          <span>${escapeHtml(saveLabel)}</span>
        </button>
        <button
          type="button"
          class="btn-s"
          data-action="queue-paper"
          data-paper-id="${escapeHtml(paper.paperId)}"
          ${state.readingStartingPaperId === paper.paperId ? "disabled" : ""}
        >
          <span>${escapeHtml(readLabel)}</span>
          ${icon("arrowR", { size: 12, color: "currentColor" })}
        </button>
      </div>
    </aside>
  `;
}

function renderSearchScopePicker() {
  if (!state.scopePicker) {
    return "";
  }

  const { tab, left, top } = state.scopePicker;
  const config = SEARCH_TARGET_TYPES[tab] || SEARCH_TARGET_TYPES.conference;
  const catalog = SEARCH_TARGET_CATALOG[tab] || {};
  const query = state.scopePickerQuery.trim().toLowerCase();
  const activeIds = new Set(state.searchScopes.map((scope) => scope.id));
  const filterItems = (items = []) => items.filter((item) => !query || item.label.toLowerCase().includes(query));
  const popular = filterItems(catalog.popular);
  const recent = filterItems(catalog.recent);

  const renderPickerItem = (item, active = false) => {
    const metaLine =
      item.kind === "lab"
        ? "Research lab"
        : item.kind === "corp"
          ? "Industry"
          : item.inst
            ? `@ ${item.inst}`
            : item.venue
              ? `venue: ${item.venue}`
              : "";

    if (active) {
      return `
        <div class="popover-item active">
          ${icon(config.icon, { size: 13, color: config.color })}
          <div class="popover-item-copy">
            <div class="popover-item-title">${escapeHtml(item.label)}</div>
            ${metaLine ? `<div class="popover-item-meta">${escapeHtml(metaLine)}</div>` : ""}
          </div>
          ${icon("check", { size: 12, color: TOKENS.search })}
        </div>
      `;
    }

    return `
      <button
        type="button"
        class="popover-item"
        data-action="add-scope"
        data-scope-id="${escapeHtml(item.id)}"
        data-scope-type="${escapeHtml(tab)}"
        data-scope-label="${escapeHtml(item.label)}"
      >
        ${icon(config.icon, { size: 13, color: config.color })}
        <div class="popover-item-copy">
          <div class="popover-item-title">${escapeHtml(item.label)}</div>
          ${metaLine ? `<div class="popover-item-meta">${escapeHtml(metaLine)}</div>` : ""}
        </div>
        ${icon("plus", { size: 12, color: TOKENS.t3 })}
      </button>
    `;
  };

  return `
    <div class="popover scope-picker-popover" style="position:fixed;left:${Math.round(left)}px;top:${Math.round(top)}px">
      <div class="popover-search">
        ${icon("search", { size: 13, color: TOKENS.t3 })}
        <input name="scopePickerQuery" value="${escapeHtml(state.scopePickerQuery)}" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(config.label)} 이름 검색…" />
      </div>
      <div class="popover-tabs">
        ${Object.entries(SEARCH_TARGET_TYPES)
          .map(([type, entry]) => {
            const active = tab === type;
            return `
              <button
                type="button"
                class="popover-tab ${active ? "active" : ""}"
                data-action="switch-scope-picker-tab"
                data-scope-tab="${escapeHtml(type)}"
              >
                ${icon(entry.icon, { size: 11, color: active ? TOKENS.tx : TOKENS.t3 })}
                <span>${escapeHtml(entry.label)}</span>
              </button>
            `;
          })
          .join("")}
      </div>
      <div class="popover-list">
        ${popular.length ? '<div class="popover-section">Popular</div>' : ""}
        ${popular.map((item) => renderPickerItem(item, activeIds.has(item.id))).join("")}
        ${recent.length ? '<div class="popover-section popover-section-recent">Recent</div>' : ""}
        ${recent.map((item) => renderPickerItem(item, activeIds.has(item.id))).join("")}
        ${popular.length || recent.length ? "" : '<div class="popover-empty">일치하는 타겟이 없습니다.</div>'}
      </div>
      <div class="popover-footer">
        <span class="popover-tip">Tip: scope을 좁힐수록 Scout 비용이 줄어듭니다</span>
        <span class="popover-footer-spacer"></span>
        <button type="button" class="btn-g popover-close-btn" data-action="close-scope-picker">Close</button>
      </div>
    </div>
  `;
}

function renderSearchStage(project) {
  const visible = visibleResults();
  const selected = selectedPaper();
  const totalResults = state.searchMeta.total || state.results.length;

  return `
    <div class="search-stage" data-ares-surface="search-stage" data-ares-stage="search" data-search-layout="${escapeHtml(state.searchLayout)}">
      ${renderSearchFilterPanel(project, visible)}

      <section class="results-pane results-pane-focal" data-ares-surface="search-results" data-ares-stage="search">
        ${renderSearchHero(visible, totalResults)}

        <div class="results-list">
          <div class="results-list-inner">
            <div class="results-summary-row">
              <div class="results-summary-copy">
                <span class="results-summary-count">${escapeHtml(String(visible.length))} results</span>
                <span class="results-summary-sub">· Sorted by ${state.searchMode === "scout" ? "relevance" : "citations"}</span>
                ${state.searchScopes.length ? `<span class="results-summary-sub">· scoped to ${state.searchScopes.length} target${state.searchScopes.length > 1 ? "s" : ""}</span>` : ""}
              </div>
              <div class="results-summary-actions">
                <button type="button" class="btn-g results-summary-btn">${icon("layers", { size: 12, color: "currentColor" })}<span>Group</span></button>
                <button type="button" class="btn-g results-summary-btn">${icon("dl", { size: 12, color: "currentColor" })}<span>Export</span></button>
              </div>
            </div>

            ${renderSearchResultsList(visible)}
          </div>
        </div>
      </section>

      ${renderSearchPreview(selected)}
      ${renderSearchScopePicker()}
    </div>
  `;
}

function readingProgress(session) {
  const sections = Array.isArray(session?.sections) ? session.sections : [];
  if (!sections.length) {
    return 0;
  }

  const doneCount = sections.filter((section) => section.status === "done").length;
  return Math.round((doneCount / sections.length) * 100);
}

function renderReadingStage(project) {
  const sessions = sortReadingSessions(state.readingSessions);
  const session = selectedReadingSession();

  if (state.readingLoading && !sessions.length) {
    return `
      <div class="reading-stage" data-ares-surface="reading-stage" data-ares-stage="reading">
        <section class="reading-empty">
          <div class="placeholder-eyebrow">Reading</div>
          <h1 class="placeholder-title">Reader agent가 세션을 준비 중입니다</h1>
          <p class="placeholder-copy">논문 메타데이터와 요약을 구조화해 ReadingSession으로 정리하고 있습니다.</p>
        </section>
      </div>
    `;
  }

  if (!sessions.length) {
    return `
      <div class="reading-stage" data-ares-surface="reading-stage" data-ares-stage="reading">
        <section class="reading-empty">
          <div class="placeholder-eyebrow">Reading</div>
          <h1 class="placeholder-title">구조화 리딩 세션이 아직 없습니다</h1>
          <p class="placeholder-copy">
            Search 탭에서 <strong>Read</strong>를 누르면 논문별 ReadingSession이 생성되고,
            여기에서 섹션 진행도와 Reader agent 요약을 이어서 볼 수 있습니다.
          </p>
          <div class="tag-row" style="margin-top:16px">
            ${renderTag(`${project.libraryCount} saved`, TOKENS.search, true)}
            ${renderTag(`${project.queueCount} queued`, TOKENS.result, true)}
          </div>
          <div style="margin-top:20px">
            <button type="button" class="btn-p" data-action="select-stage" data-stage-id="search">Back to Search</button>
          </div>
        </section>
      </div>
    `;
  }

  const sections = Array.isArray(session?.sections) ? session.sections : [];
  const highlights = Array.isArray(session?.highlights) ? session.highlights : [];
  const reproParams = Array.isArray(session?.reproParams) ? session.reproParams : [];
  const notes = Array.isArray(session?.notes) ? session.notes : [];
  const progress = readingProgress(session);
  const statusTag = renderTag(session?.status || "queue", statusColor(session?.status || "queue"), session?.status === "done");

  return `
    <div class="reading-stage" data-ares-surface="reading-stage" data-ares-stage="reading">
      <aside class="reading-rail" data-ares-surface="reading-rail" data-ares-stage="reading">
        <div class="reading-rail-card">
          <div class="reading-rail-eyebrow">Reading queue</div>
          <div class="reading-rail-title">${escapeHtml(project.name)}</div>
          <div class="reading-rail-meta">
            <span>${sessions.length} session${sessions.length > 1 ? "s" : ""}</span>
            ${state.activeReadingRunId ? '<span class="pd" style="background:var(--result)"></span><span>agent running</span>' : ""}
          </div>
        </div>

        <div class="reading-session-list">
          ${sessions
            .map((entry) => {
              const active = entry.id === session?.id;
              return `
                <button
                  type="button"
                  class="reading-session-item ${active ? "is-active" : ""}"
                  data-action="select-reading-session"
                  data-reading-session-id="${escapeHtml(entry.id)}"
                >
                  <div class="reading-session-item-top">
                    <span class="reading-session-status">${statusIcon(entry.status)}</span>
                    <span class="reading-session-progress mono">${readingProgress(entry)}%</span>
                  </div>
                  <div class="reading-session-item-title">${escapeHtml(entry.title)}</div>
                  <div class="reading-session-item-meta">
                    <span>${escapeHtml(entry.venue || "Unknown venue")}</span>
                    <span>·</span>
                    <span>${escapeHtml(String(entry.year || "n/a"))}</span>
                  </div>
                </button>
              `;
            })
            .join("")}
        </div>
      </aside>

      <section class="reading-main" data-ares-surface="reading-main" data-ares-stage="reading">
        <div class="reading-hero">
          <div>
            <div class="placeholder-eyebrow">Reader session</div>
            <h1 class="reading-title">${escapeHtml(session?.title || "Untitled paper")}</h1>
            <p class="reading-summary">${escapeHtml(session?.summary || "Reader summary is being prepared.")}</p>
          </div>
          <div class="reading-hero-meta">
            ${statusTag}
            <div class="reading-progress-ring">
              <span class="mono">${progress}%</span>
              <div class="reading-progress-bar"><span style="width:${progress}%"></span></div>
            </div>
          </div>
        </div>

        <div class="reading-grid">
          <section class="reading-card">
            <div class="reading-card-title">Section progress</div>
            <div class="reading-section-list">
              ${sections
                .map(
                  (entry) => `
                    <article class="reading-section-item">
                      <div class="reading-section-head">
                        <span class="reading-section-label">${escapeHtml(entry.label)}</span>
                        ${renderTag(entry.status, statusColor(entry.status), entry.status === "done")}
                      </div>
                      <p>${escapeHtml(entry.summary || "Summary pending.")}</p>
                    </article>
                  `,
                )
                .join("")}
            </div>
          </section>

          <section class="reading-card">
            <div class="reading-card-title">Highlights</div>
            <div class="reading-highlight-list">
              ${highlights.length
                ? highlights
                    .map(
                      (highlight) => `
                        <article class="reading-highlight">
                          <div class="reading-highlight-meta">
                            ${renderTag(highlight.type || "note", TOKENS.read, true)}
                            <span>${escapeHtml(highlight.section || "paper")}</span>
                          </div>
                          <p>${escapeHtml(highlight.text || "")}</p>
                        </article>
                      `,
                    )
                    .join("")
                : '<div class="empty-state compact-empty">핵심 하이라이트가 생성되면 여기에 표시됩니다.</div>'}
            </div>
          </section>
        </div>
      </section>

      <aside class="reader-agent-panel" data-ares-surface="reader-agent-panel" data-ares-stage="reading">
        <div class="agent-panel-header">
          <div class="agent-panel-status">
            ${statusIcon(session?.status || "queue")}
            <span>Reader agent</span>
          </div>
          ${statusTag}
        </div>

        <div class="agent-panel-body">
          <section class="agent-panel-section" style="border-left-color:${TOKENS.read}">
            <div class="agent-panel-eyebrow" style="color:${TOKENS.read};margin-bottom:4px">Reproduction params</div>
            <div class="reading-param-list">
              ${reproParams.length
                ? reproParams
                    .map(
                      (param) => `
                        <div class="reading-param-row">
                          <span>${escapeHtml(param.label || "Param")}</span>
                          <span class="mono">${escapeHtml(param.value || "n/a")}</span>
                        </div>
                      `,
                    )
                    .join("")
                : '<div class="empty-state compact-empty">아직 추출된 재현 파라미터가 없습니다.</div>'}
            </div>
          </section>

          <section class="agent-panel-section" style="border-left-color:${TOKENS.result}">
            <div class="agent-panel-eyebrow" style="color:${TOKENS.result};margin-bottom:4px">Reader notes</div>
            <div class="reading-note-list">
              ${notes.length
                ? notes
                    .map(
                      (note) => `
                        <article class="reading-note">
                          <div class="reading-note-label">${escapeHtml(note.label || "Note")}</div>
                          <p>${escapeHtml(note.value || "")}</p>
                        </article>
                      `,
                    )
                    .join("")
                : '<div class="empty-state compact-empty">요약 노트가 준비되면 여기에 쌓입니다.</div>'}
            </div>
          </section>

          <section class="agent-panel-metrics">
            <div class="agent-panel-eyebrow" style="margin-bottom:8px">Paper links</div>
            <div class="reading-link-list">
              ${session?.paperUrl ? `<a class="reading-link" href="${escapeHtml(session.paperUrl)}" target="_blank" rel="noreferrer">Paper · ${escapeHtml(compactLink(session.paperUrl))}</a>` : ""}
              ${session?.pdfUrl ? `<a class="reading-link" href="${escapeHtml(session.pdfUrl)}" target="_blank" rel="noreferrer">PDF · ${escapeHtml(compactLink(session.pdfUrl))}</a>` : ""}
              ${!session?.paperUrl && !session?.pdfUrl ? '<div class="empty-state compact-empty">외부 링크가 없습니다.</div>' : ""}
            </div>
          </section>
        </div>

        <div class="agent-panel-footer">
          <button type="button" class="btn-s" data-action="select-stage" data-stage-id="search">Back to Search</button>
          <button type="button" class="btn-p" data-action="select-stage" data-stage-id="research">Send to Research</button>
        </div>
      </aside>
    </div>
  `;
}

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
  const project = activeProject();

  if (!project) {
    renderShell(state.error || (state.booting ? "프로젝트 정보를 불러오는 중입니다." : "프로젝트 정보를 불러오지 못했습니다."));
    return;
  }

  const selected = state.activeStage === "search" ? selectedPaper() : null;
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
      await loadReadingSessions({ preserveSelection: true });
    }
    render();
    return;
  }

  if (action === "select-project") {
    clearActiveRunPoll();
    state.activeProjectId = trigger.dataset.projectId;
    state.scopePicker = null;
    saveStorage(STORAGE_KEYS.project, state.activeProjectId);
    state.searchInput = activeProject()?.defaultQuery || "";
    resetSearchState();
    await loadReadingSessions({ preserveSelection: false });
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

  if (action === "select-reading-session") {
    state.activeReadingSessionId = trigger.dataset.readingSessionId || "";
    render();
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
    if (syncResponsiveSearchLayout()) {
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
    await loadReadingSessions({ preserveSelection: false });
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
