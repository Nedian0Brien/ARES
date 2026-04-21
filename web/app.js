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

const APP_BASE_URL = new URL("./", window.location.href);
const LOCAL_GRAB_HOSTS = new Set(["127.0.0.1", "localhost"]);

const state = {
  booting: true,
  loading: false,
  savingPaperId: "",
  queueingPaperId: "",
  error: "",
  activeStage: normalizeStage(loadStorage(STORAGE_KEYS.stage, "search")),
  activeProjectId: loadStorage(STORAGE_KEYS.project, ""),
  searchInput: "",
  projects: [],
  results: [],
  availableVenues: [],
  selectedPaperId: "",
  sort: "relevance",
  workflowOpen: true,
  openWorkflowMenu: "",
  searchMeta: {
    provider: "seed",
    live: false,
    total: 0,
    query: "",
    warning: "",
  },
  filters: {
    venues: new Set(),
    years: new Set(["2024", "2023", "earlier", "unknown"]),
    minRelevance: 60,
    openAccessOnly: false,
    savedOnly: false,
  },
};

const app = document.querySelector("#app");

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

function reactGrabEnabled() {
  const params = new URLSearchParams(window.location.search);
  const grabParam = params.get("grab");
  if (grabParam === "0" || grabParam === "false" || grabParam === "off") {
    return false;
  }

  if (grabParam === "1" || grabParam === "true" || grabParam === "on") {
    return true;
  }

  return LOCAL_GRAB_HOSTS.has(window.location.hostname);
}

function icon(name, { size = 16, color = "currentColor", className = "" } = {}) {
  const icons = {
    search:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.3-4.3"></path></svg>',
    book:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>',
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
    chevD:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>',
    plus:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"></path></svg>',
    filter:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 3H2l8 9.5V19l4 2v-8.5L22 3z"></path></svg>',
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

  if (year >= 2024) {
    return "2024";
  }

  if (year >= 2021) {
    return "2023";
  }

  return "earlier";
}

function yearBucketLabel(bucket) {
  return {
    2024: "2024",
    2023: "2021-2023",
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

  const sorter = {
    relevance: (left, right) => (right.relevance || 0) - (left.relevance || 0) || (right.citedByCount || 0) - (left.citedByCount || 0),
    recent: (left, right) => (right.year || 0) - (left.year || 0) || (right.relevance || 0) - (left.relevance || 0),
    cited: (left, right) => (right.citedByCount || 0) - (left.citedByCount || 0) || (right.relevance || 0) - (left.relevance || 0),
  }[state.sort];

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

async function runSearch({ preserveSelection = false } = {}) {
  const project = activeProject();
  if (!project) {
    return;
  }

  state.loading = true;
  state.error = "";
  render();

  try {
    const query = state.searchInput.trim();
    const params = new URLSearchParams({
      projectId: project.id,
      q: query,
    });
    const payload = await api(`api/search?${params.toString()}`);

    replaceProject(payload.project);
    state.results = payload.results || [];
    state.availableVenues = payload.availableVenues || [];
    state.searchMeta = {
      provider: payload.provider,
      live: payload.live,
      total: payload.total,
      query: payload.query,
      warning: payload.warning || "",
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

async function queuePaper(paper) {
  state.queueingPaperId = paper.paperId;
  render();

  try {
    const project = activeProject();
    if (!project) {
      return;
    }

    const payload = await api(`api/projects/${encodeURIComponent(project.id)}/queue`, {
      method: "POST",
      body: JSON.stringify({ paper }),
    });
    replaceProject(payload.project);
    state.results = state.results.map((entry) => (entry.paperId === paper.paperId ? { ...entry, queued: true } : entry));

    if (paper.paperUrl) {
      window.open(paper.paperUrl, "_blank", "noopener,noreferrer");
    } else if (paper.pdfUrl) {
      window.open(paper.pdfUrl, "_blank", "noopener,noreferrer");
    }
  } catch (error) {
    state.error = error.message;
  } finally {
    state.queueingPaperId = "";
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
  const grabHint = reactGrabEnabled()
    ? `
      <div class="grab-hint" role="note" aria-label="React Grab is enabled in local development">
        ${icon("sparkles", { size: 12, color: TOKENS.read })}
        <span>Grab enabled</span>
        <span class="grab-hint-copy mono">Cmd/Ctrl+C</span>
      </div>
    `
    : "";
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
        ${grabHint}
        <button type="button" class="btn-s">${icon("share", { size: 12 })} Share</button>
        <button type="button" class="btn-s">${icon("filter", { size: 12 })} Filter</button>
      </div>
    </header>
  `;
}

function renderFilterCheck(name, value, label, checked) {
  return `
    <label class="filter-check ${checked ? "is-checked" : ""}">
      <input class="sr-only" type="checkbox" name="${escapeHtml(name)}" value="${escapeHtml(value)}" ${checked ? "checked" : ""} />
      <span class="filter-check-box">${checked ? icon("check", { size: 9, color: "#ffffff" }) : ""}</span>
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

function renderFilterPanel(project, visible) {
  const savedVisibleCount = visible.filter((paper) => paper.saved).length;
  const newVisibleCount = Math.max(visible.length - savedVisibleCount, 0);
  const venueMarkup = state.availableVenues.length
    ? state.availableVenues
        .map((venue) => renderFilterCheck("venue", venue, venue, state.filters.venues.has(venue)))
        .join("")
    : '<div class="empty-state" style="padding:6px 0">검색 결과가 들어오면 venue 필터가 채워집니다.</div>';

  const yearMarkup = ["2024", "2023", "earlier", "unknown"]
    .map((bucket) => renderFilterCheck("yearBucket", bucket, yearBucketLabel(bucket), state.filters.years.has(bucket)))
    .join("");

  return `
    <aside class="search-filters" data-ares-surface="search-filters" data-ares-stage="search">
      <div class="filter-eyebrow">Filter</div>

      <section class="filter-group">
        <div class="filter-group-title">Venue</div>
        ${venueMarkup}
      </section>

      <section class="filter-group">
        <div class="filter-group-title">Year</div>
        ${yearMarkup}
      </section>

      <section class="filter-group">
        <div class="filter-group-title">Relevance</div>
        <input class="filter-range" type="range" name="minRelevance" min="0" max="100" step="1" value="${state.filters.minRelevance}" />
        <div class="filter-range-value mono">&gt;= ${state.filters.minRelevance}%</div>
      </section>

      <section class="filter-group">
        <div class="filter-group-title">Scope</div>
        ${renderFilterCheck("openAccessOnly", "true", "Open access only", state.filters.openAccessOnly)}
        ${renderFilterCheck("savedOnly", "true", "Saved only", state.filters.savedOnly)}
      </section>

      <section class="filter-divider">
        <div class="filter-group-title">Library</div>
        <div class="library-metric">
          <span class="library-metric-value">${project.libraryCount}</span>
          <span class="library-metric-label">papers</span>
        </div>
        <div class="library-project-name">${escapeHtml(project.name)}</div>
        <div class="tag-row" style="margin-top:8px">
          ${renderTag(`${project.libraryCount} saved`, TOKENS.search, true)}
          ${renderTag(`${newVisibleCount} new`)}
        </div>
      </section>
    </aside>
  `;
}

function renderResultRow(paper) {
  const selected = paper.paperId === state.selectedPaperId;
  const tags = [
    renderTag(paper.venue || "Unknown venue"),
    paper.openAccess ? renderTag("open access", TOKENS.search) : "",
    paper.saved ? renderTag("saved", TOKENS.read) : "",
    paper.queued ? renderTag("reading queue", TOKENS.result) : "",
    ...(paper.matchedKeywords || []).slice(0, 2).map((keyword) => renderTag(keyword)),
  ]
    .filter(Boolean)
    .join("");

  return `
    <button
      type="button"
      class="paper-row hov-row ${selected ? "is-selected" : ""}"
      data-action="select-paper"
      data-paper-id="${escapeHtml(paper.paperId)}"
      data-ares-surface="paper-row"
      data-ares-role="paper-row"
      data-ares-stage="search"
      data-ares-paper-id="${escapeHtml(paper.paperId)}"
      data-ares-paper-title="${escapeHtml(paper.title)}"
    >
      <div class="paper-main">
        <div class="paper-title">${escapeHtml(paper.title)}</div>
        <div class="paper-meta">
          <span class="paper-authors">${escapeHtml(formatAuthors(paper.authors))}</span>
          <span class="paper-meta-separator">·</span>
          <span class="tag-row">${tags}</span>
        </div>
      </div>
      <div class="paper-score mono">${escapeHtml(String(paper.relevance || 0))}%</div>
    </button>
  `;
}

function renderResultList(visible) {
  if (state.loading) {
    return '<div class="loading-state">Scout agent가 논문 후보를 수집 중입니다...</div>';
  }

  if (!visible.length) {
    return '<div class="empty-state">현재 필터 조건에 맞는 논문이 없습니다. venue/year/relevance 조건을 조금 넓혀보세요.</div>';
  }

  return visible.map((paper) => renderResultRow(paper)).join("");
}

function renderPreview(paper) {
  if (!paper) {
    return `
      <aside class="search-preview" data-ares-surface="search-preview" data-ares-stage="search">
        <div class="search-preview-header">
          <div class="preview-eyebrow">Paper</div>
          <div class="preview-title">Select a paper</div>
        </div>
        <div class="empty-state">좌측 리스트에서 논문을 선택하면 abstract, key points, source link가 여기에 표시됩니다.</div>
      </aside>
    `;
  }

  const points = (paper.keyPoints && paper.keyPoints.length ? paper.keyPoints : [paper.summary || "Key points are not available yet."])
    .map((point) => `<div class="preview-point">${icon("dot", { size: 6, color: TOKENS.search })}<span>${escapeHtml(point)}</span></div>`)
    .join("");

  const sourceHref = paper.pdfUrl || paper.paperUrl;
  const sourceCard = sourceHref
    ? `
      <a class="preview-card" href="${escapeHtml(sourceHref)}" target="_blank" rel="noreferrer noopener">
        ${icon(sourceHref.includes("github.com") ? "git" : "ext", { size: 14, color: TOKENS.t2 })}
        <span class="preview-card-value mono">${escapeHtml(compactLink(sourceHref))}</span>
        ${icon("ext", { size: 13, color: TOKENS.t3 })}
      </a>
    `
    : "";

  const saveLabel = paper.saved ? "Remove" : state.savingPaperId === paper.paperId ? "Saving..." : "Save";
  const readLabel = state.queueingPaperId === paper.paperId ? "Queueing..." : "Read";

  return `
    <aside class="search-preview" data-ares-surface="search-preview" data-ares-stage="search" data-ares-paper-id="${escapeHtml(paper.paperId)}" data-ares-paper-title="${escapeHtml(paper.title)}">
      <div class="search-preview-header">
        <div class="preview-eyebrow">Paper</div>
        <div class="preview-title">${escapeHtml(paper.title)}</div>
        <div class="tag-row">
          ${renderTag(formatAuthors(paper.authors))}
          ${renderTag(paper.venue || "Unknown venue")}
          ${paper.openAccess ? renderTag("open access", TOKENS.search) : ""}
        </div>
      </div>

      <div class="search-preview-body">
        <section class="preview-section">
          <div class="preview-section-title">Abstract</div>
          <div class="preview-copy">${escapeHtml(paper.summary || paper.abstract || "Abstract is not available.")}</div>
        </section>

        <section class="preview-section">
          <div class="preview-section-title">Key points</div>
          ${points}
        </section>

        ${sourceCard}
      </div>

      <div class="search-preview-footer">
        <button
          type="button"
          class="btn-p"
          data-action="toggle-save"
          data-paper-id="${escapeHtml(paper.paperId)}"
          ${state.savingPaperId === paper.paperId ? "disabled" : ""}
        >
          ${saveLabel}
        </button>
        <button
          type="button"
          class="btn-s"
          data-action="queue-paper"
          data-paper-id="${escapeHtml(paper.paperId)}"
          ${state.queueingPaperId === paper.paperId ? "disabled" : ""}
        >
          ${readLabel} ${icon("arrowR", { size: 12 })}
        </button>
      </div>
    </aside>
  `;
}

function renderSearchStage(project) {
  const visible = visibleResults();
  const selected = selectedPaper();
  const totalResults = state.searchMeta.total || state.results.length;

  return `
    <div class="search-stage" data-ares-surface="search-stage" data-ares-stage="search">
      ${renderFilterPanel(project, visible)}

      <section class="results-pane" data-ares-surface="search-results" data-ares-stage="search">
        <div class="search-toolbar">
          <form class="search-form" data-action="submit-search">
            <label class="search-input">
              ${icon("search", { size: 15, color: TOKENS.t3 })}
              <input
                id="search-input"
                type="text"
                name="query"
                autocomplete="off"
                spellcheck="false"
                value="${escapeHtml(state.searchInput)}"
                placeholder="예: rag reranker cost reduction, verifier-guided reasoning..."
              />
              ${renderKbd("⌘K")}
            </label>
            <button type="submit" class="btn-p">${state.loading ? "Searching..." : "Search"}</button>
          </form>

          <div class="search-meta-row">
            <div class="search-meta">
              <span><strong>${escapeHtml(String(totalResults))} results</strong></span>
              <span>·</span>
              <span>Sorted by ${escapeHtml(state.sort)}</span>
              <span>·</span>
              <span class="search-agent">
                <span class="search-agent-dot pulse"></span>
                Scout agent${state.searchMeta.provider ? ` · ${escapeHtml(state.searchMeta.provider)}` : ""}
              </span>
            </div>
            <select class="sort-select" name="sort" aria-label="Sort results">
              <option value="relevance" ${state.sort === "relevance" ? "selected" : ""}>Sort: relevance</option>
              <option value="recent" ${state.sort === "recent" ? "selected" : ""}>Sort: recent</option>
              <option value="cited" ${state.sort === "cited" ? "selected" : ""}>Sort: cited</option>
            </select>
          </div>

          ${state.searchMeta.warning ? `<div class="notice">${icon("plus", { size: 14, color: TOKENS.result })}<div>${escapeHtml(state.searchMeta.warning)}</div></div>` : ""}
          ${state.error ? `<div class="notice">${icon("plus", { size: 14, color: TOKENS.result })}<div>${escapeHtml(state.error)}</div></div>` : ""}
        </div>

        <div class="results-list">${renderResultList(visible)}</div>
      </section>

      ${renderPreview(selected)}
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
  const project = activeProject();

  if (!project) {
    renderShell(state.error || (state.booting ? "프로젝트 정보를 불러오는 중입니다." : "프로젝트 정보를 불러오지 못했습니다."));
    return;
  }

  const selected = state.activeStage === "search" ? selectedPaper() : null;
  const stageContent = state.activeStage === "search" ? renderSearchStage(project) : renderPlaceholderStage(project);

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

document.addEventListener("click", async (event) => {
  const trigger = event.target.closest("[data-action]");
  if (!trigger) {
    if (state.openWorkflowMenu && !event.target.closest(".sidebar-menu")) {
      state.openWorkflowMenu = "";
      render();
    }
    return;
  }

  const action = trigger.dataset.action;

  if (action !== "toggle-workflow-menu" && action !== "dismiss-workflow-menu") {
    state.openWorkflowMenu = "";
  }

  if (action === "select-stage") {
    state.activeStage = normalizeStage(trigger.dataset.stageId);
    saveStorage(STORAGE_KEYS.stage, state.activeStage);
    render();
    return;
  }

  if (action === "select-project") {
    state.activeProjectId = trigger.dataset.projectId;
    saveStorage(STORAGE_KEYS.project, state.activeProjectId);
    state.searchInput = activeProject()?.defaultQuery || "";
    await runSearch();
    return;
  }

  if (action === "select-paper") {
    state.selectedPaperId = trigger.dataset.paperId;
    render();
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
      await queuePaper(paper);
    }
    return;
  }

  if (action === "focus-search") {
    focusSearchInput({ forceSearchStage: true, select: true });
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

  if (event.key === "Escape" && state.openWorkflowMenu) {
    state.openWorkflowMenu = "";
    render();
  }
});

async function boot() {
  try {
    await loadProjects();
    const project = activeProject();
    state.searchInput = project?.defaultQuery || "";
    await runSearch();
  } catch (error) {
    state.error = error.message;
    render();
  } finally {
    state.booting = false;
  }
}

render();
boot();
