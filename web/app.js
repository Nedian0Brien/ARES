const WORKFLOW_STAGES = [
  { id: 'search', label: 'Search', sub: '논문 서치 및 수집', color: 'var(--search)' },
  { id: 'reading', label: 'Reading', sub: '구조화 리딩', color: 'var(--read)' },
  { id: 'research', label: 'Research', sub: '재현 및 실험 설계', color: 'var(--research)' },
  { id: 'result', label: 'Result', sub: '실험 결과 비교', color: 'var(--result)' },
  { id: 'insight', label: 'Insight', sub: '인사이트 정리', color: 'var(--insight)' },
  { id: 'writing', label: 'Writing', sub: '문서 초안 작성', color: 'var(--writing)' },
];

const STORAGE_KEYS = {
  stage: 'ares.stage',
  project: 'ares.project',
};

const APP_BASE_URL = new URL('./', window.location.href);

const state = {
  booting: true,
  loading: false,
  savingPaperId: '',
  queueingPaperId: '',
  error: '',
  activeStage: loadStorage(STORAGE_KEYS.stage, 'search'),
  activeProjectId: loadStorage(STORAGE_KEYS.project, ''),
  searchInput: '',
  projects: [],
  results: [],
  availableVenues: [],
  selectedPaperId: '',
  sort: 'relevance',
  searchMeta: {
    provider: 'seed',
    live: false,
    total: 0,
    query: '',
    warning: '',
  },
  filters: {
    venues: new Set(),
    years: new Set(['2024', '2023', 'earlier', 'unknown']),
    minRelevance: 60,
    openAccessOnly: false,
    savedOnly: false,
  },
};

const app = document.querySelector('#app');

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

function icon(name) {
  const icons = {
    search:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.3-4.3"></path></svg>',
    book:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>',
    flask:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6"></path><path d="M10 3v6L4.5 18a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 9V3"></path><path d="M7 15h10"></path></svg>',
    chart:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"></path><path d="M7 14l4-4 4 4 5-5"></path></svg>',
    sparkles:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"></path></svg>',
    pen:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3l4 4L7 21H3v-4L17 3z"></path></svg>',
    external:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><path d="M15 3h6v6"></path><path d="M10 14L21 3"></path></svg>',
    arrow:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>',
    plus:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"></path></svg>',
    dot:
      '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4"></circle></svg>',
    bookmark:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"></path></svg>',
  };

  return `<span class="icon" aria-hidden="true">${icons[name] || icons.dot}</span>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function appUrl(path) {
  return new URL(String(path || '').replace(/^\/+/, ''), APP_BASE_URL);
}

function api(path, options = {}) {
  return fetch(appUrl(path), {
    headers: {
      'content-type': 'application/json',
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
    return 'unknown';
  }

  if (year >= 2024) {
    return '2024';
  }

  if (year >= 2021) {
    return '2023';
  }

  return 'earlier';
}

function stageIcon(stageId) {
  return {
    search: 'search',
    reading: 'book',
    research: 'flask',
    result: 'chart',
    insight: 'sparkles',
    writing: 'pen',
  }[stageId];
}

function formatAuthors(authors = []) {
  if (!authors.length) {
    return 'Unknown authors';
  }

  if (authors.length <= 3) {
    return authors.join(', ');
  }

  return `${authors.slice(0, 3).join(', ')} +${authors.length - 3}`;
}

function syncSelectedPaper() {
  const visible = visibleResults();
  if (!visible.length) {
    state.selectedPaperId = '';
    return;
  }

  if (!visible.some((paper) => paper.paperId === state.selectedPaperId)) {
    state.selectedPaperId = visible[0].paperId;
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

function setProjects(projects) {
  state.projects = projects;
  if (!state.activeProjectId || !projects.some((project) => project.id === state.activeProjectId)) {
    state.activeProjectId = projects[0]?.id || '';
  }

  saveStorage(STORAGE_KEYS.project, state.activeProjectId);
}

function replaceProject(project) {
  state.projects = state.projects.map((entry) => (entry.id === project.id ? project : entry));
}

async function loadProjects() {
  const payload = await api('api/projects');
  setProjects(payload.projects || []);
}

async function runSearch({ preserveSelection = false } = {}) {
  const project = activeProject();
  if (!project) {
    return;
  }

  state.loading = true;
  state.error = '';
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
      warning: payload.warning || '',
    };
    state.filters.venues = new Set(state.availableVenues);
    syncSelectedPaper();
    if (!preserveSelection) {
      state.selectedPaperId = state.results[0]?.paperId || '';
    }
    syncSelectedPaper();
  } catch (error) {
    state.error = error.message;
    state.results = [];
    state.selectedPaperId = '';
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
      const payload = await api(path, { method: 'DELETE' });
      replaceProject(payload.project);
      state.results = state.results.map((entry) => (entry.paperId === paper.paperId ? { ...entry, saved: false } : entry));
    } else {
      const payload = await api(`api/projects/${encodeURIComponent(project.id)}/library`, {
        method: 'POST',
        body: JSON.stringify({ paper }),
      });
      replaceProject(payload.project);
      state.results = state.results.map((entry) => (entry.paperId === paper.paperId ? { ...entry, saved: true } : entry));
    }

    syncSelectedPaper();
  } catch (error) {
    state.error = error.message;
  } finally {
    state.savingPaperId = '';
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
      method: 'POST',
      body: JSON.stringify({ paper }),
    });
    replaceProject(payload.project);
    state.results = state.results.map((entry) => (entry.paperId === paper.paperId ? { ...entry, queued: true } : entry));

    if (paper.paperUrl) {
      window.open(paper.paperUrl, '_blank', 'noopener,noreferrer');
    } else if (paper.pdfUrl) {
      window.open(paper.pdfUrl, '_blank', 'noopener,noreferrer');
    }
  } catch (error) {
    state.error = error.message;
  } finally {
    state.queueingPaperId = '';
    render();
  }
}

function renderSidebar() {
  const project = activeProject();

  return `
    <aside class="sidebar">
      <section class="sidebar-section">
        <div class="brand">
          <div class="brand-mark">A</div>
          <div class="brand-copy">
            <p class="eyebrow">Workspace</p>
            <p class="brand-title">ARES</p>
            <p class="brand-subtitle">Research workspace</p>
          </div>
        </div>
      </section>

      <section class="sidebar-section">
        <p class="eyebrow">Project</p>
        <div class="sidebar-projects">
          ${state.projects
            .map(
              (entry) => `
                <button
                  class="project-item ${entry.id === state.activeProjectId ? 'is-active' : ''}"
                  data-action="select-project"
                  data-project-id="${escapeHtml(entry.id)}"
                  type="button"
                >
                  <span class="project-swatch" style="background:${escapeHtml(entry.color)}"></span>
                  <span>
                    <strong>${escapeHtml(entry.name)}</strong><br />
                    <span class="muted">${entry.libraryCount} saved</span>
                  </span>
                </button>
              `,
            )
            .join('')}
        </div>
      </section>

      <section class="sidebar-section">
        <p class="eyebrow">Workflow</p>
        <div class="workflow-list">
          ${WORKFLOW_STAGES.map((stage) => {
            const active = stage.id === state.activeStage;
            return `
              <button
                class="sidebar-stage ${active ? 'is-active' : ''}"
                data-action="select-stage"
                data-stage-id="${escapeHtml(stage.id)}"
                type="button"
              >
                <span class="sidebar-stage-icon" style="color:${escapeHtml(stage.color)}">
                  ${icon(stageIcon(stage.id))}
                </span>
                <span>
                  <strong>${escapeHtml(stage.label)}</strong><br />
                  <span class="muted">${escapeHtml(stage.sub)}</span>
                </span>
              </button>
            `;
          }).join('')}
        </div>
      </section>

      <section class="sidebar-section sidebar-footer">
        <p class="eyebrow">Scout agent</p>
        <p class="brand-subtitle">
          ${project ? escapeHtml(project.name) : 'No active project'} 기준으로 논문 탐색, 필터링, 스크랩을 관리합니다.
        </p>
      </section>
    </aside>
  `;
}

function renderFilterPanel(project, visible) {
  const recentLibrary = project?.recentLibrary || [];

  return `
    <section class="panel filters-panel">
      <div class="panel-title">
        <div>
          <h2>Project Filters</h2>
          <p class="panel-copy">${escapeHtml(project.focus)}</p>
        </div>
      </div>

      <div class="chip-row">
        ${(project.keywords || []).slice(0, 4).map((keyword) => `<span class="chip is-selected">${escapeHtml(keyword)}</span>`).join('')}
      </div>

      <div class="filter-group">
        <h3>Venue</h3>
        <div class="checkbox-list">
          ${state.availableVenues.length
            ? state.availableVenues
                .map(
                  (venue) => `
                    <label class="checkbox-item">
                      <span class="checkbox-main">
                        <input
                          type="checkbox"
                          name="venue"
                          value="${escapeHtml(venue)}"
                          ${state.filters.venues.has(venue) ? 'checked' : ''}
                        />
                        <span>${escapeHtml(venue)}</span>
                      </span>
                    </label>
                  `,
                )
                .join('')
            : '<div class="empty-state">검색 결과가 들어오면 venue 필터가 채워집니다.</div>'}
        </div>
      </div>

      <div class="filter-group">
        <h3>Year</h3>
        <div class="checkbox-list">
          ${[
            ['2024', '2024-'],
            ['2023', '2021-2023'],
            ['earlier', 'Earlier'],
            ['unknown', 'Unknown'],
          ]
            .map(
              ([value, label]) => `
                <label class="checkbox-item">
                  <span class="checkbox-main">
                    <input type="checkbox" name="yearBucket" value="${value}" ${state.filters.years.has(value) ? 'checked' : ''} />
                    <span>${label}</span>
                  </span>
                </label>
              `,
            )
            .join('')}
        </div>
      </div>

      <div class="filter-group">
        <h3>Relevance</h3>
        <div class="range-row">
          <input type="range" name="minRelevance" min="0" max="100" step="1" value="${state.filters.minRelevance}" />
          <span class="chip mono">>= ${state.filters.minRelevance}</span>
        </div>
      </div>

      <div class="filter-group">
        <h3>Library</h3>
        <div class="library-metric">
          <strong>${project.libraryCount}</strong>
          <span>saved papers</span>
        </div>
        <div class="chip-row" style="margin-top:0.7rem">
          <span class="tag is-accent"><span class="dot"></span>${project.libraryCount} saved</span>
          <span class="tag">${visible.length} visible</span>
          <span class="tag">${project.queueCount} reading queue</span>
        </div>

        <div class="checkbox-list" style="margin-top:0.9rem">
          <label class="checkbox-item">
            <span class="checkbox-main">
              <input type="checkbox" name="savedOnly" ${state.filters.savedOnly ? 'checked' : ''} />
              <span>Saved only</span>
            </span>
          </label>
          <label class="checkbox-item">
            <span class="checkbox-main">
              <input type="checkbox" name="openAccessOnly" ${state.filters.openAccessOnly ? 'checked' : ''} />
              <span>Open-access only</span>
            </span>
          </label>
        </div>

        <div class="recent-list">
          ${recentLibrary.length
            ? recentLibrary
                .map(
                  (paper) => `
                    <article class="recent-item">
                      <span class="project-swatch" style="background:${escapeHtml(project.color)}"></span>
                      <div>
                        <h4>${escapeHtml(paper.title)}</h4>
                        <p>${escapeHtml(paper.venue || 'Saved reference')} · ${paper.year ? escapeHtml(String(paper.year)) : 'Year n/a'}</p>
                      </div>
                    </article>
                  `,
                )
                .join('')
            : '<div class="empty-state">아직 스크랩한 논문이 없습니다. Search 결과에서 먼저 Save 해보세요.</div>'}
        </div>
      </div>
    </section>
  `;
}

function renderResultList(visible) {
  if (state.loading) {
    return '<div class="loading-state">Scout agent가 논문 후보를 수집 중입니다...</div>';
  }

  if (!visible.length) {
    return '<div class="empty-state">현재 필터 조건에 맞는 논문이 없습니다. venue/year/relevance 조건을 조금 넓혀보세요.</div>';
  }

  return visible
    .map((paper) => {
      const selected = paper.paperId === state.selectedPaperId;
      return `
        <button class="paper-row ${selected ? 'is-selected' : ''}" type="button" data-action="select-paper" data-paper-id="${escapeHtml(paper.paperId)}">
          <div class="paper-main">
            <p class="paper-title">${escapeHtml(paper.title)}</p>
            <div class="paper-meta">
              <span>${escapeHtml(formatAuthors(paper.authors))}</span>
              <span>·</span>
              <span>${escapeHtml(paper.venue)}</span>
              <span>·</span>
              <span>${paper.year ? escapeHtml(String(paper.year)) : 'n/a'}</span>
            </div>
            <div class="paper-tags" style="margin-top:0.55rem">
              <span class="tag">${escapeHtml(paper.sourceName)}</span>
              ${paper.openAccess ? '<span class="tag is-accent">open access</span>' : ''}
              ${paper.saved ? '<span class="tag is-selected">saved</span>' : ''}
              ${paper.queued ? '<span class="tag">reading queue</span>' : ''}
              ${(paper.matchedKeywords || []).slice(0, 2).map((keyword) => `<span class="tag">${escapeHtml(keyword)}</span>`).join('')}
            </div>
          </div>

          <div class="paper-score">
            ${paper.relevance}<small>/100</small>
          </div>
        </button>
      `;
    })
    .join('');
}

function renderPreview(paper) {
  if (!paper) {
    return `
      <section class="panel preview-panel">
        <div class="empty-state">좌측 리스트에서 논문을 선택하면 abstract, key points, source link가 여기에 표시됩니다.</div>
      </section>
    `;
  }

  const openLabel = paper.pdfUrl ? 'Open PDF' : 'Open paper';
  const openHref = paper.pdfUrl || paper.paperUrl;
  const saving = state.savingPaperId === paper.paperId;
  const queueing = state.queueingPaperId === paper.paperId;

  return `
    <section class="panel preview-panel">
      <div class="preview-head">
        <p class="eyebrow">Paper Preview</p>
        <h2>${escapeHtml(paper.title)}</h2>
        <div class="paper-meta" style="margin-top:0.75rem">
          <span>${escapeHtml(formatAuthors(paper.authors))}</span>
          <span>·</span>
          <span>${escapeHtml(paper.venue)}</span>
          <span>·</span>
          <span>${paper.year ? escapeHtml(String(paper.year)) : 'n/a'}</span>
        </div>
        <div class="chip-row" style="margin-top:0.8rem">
          <span class="tag is-accent">${paper.relevance}/100 relevance</span>
          <span class="tag">${paper.citedByCount} citations</span>
          ${paper.openAccess ? '<span class="tag">OA available</span>' : '<span class="tag">closed access</span>'}
        </div>
      </div>

      <div class="preview-section">
        <h3>Abstract</h3>
        <p>${escapeHtml(paper.summary || paper.abstract || 'Abstract is not available.')}</p>
      </div>

      <div class="preview-section">
        <h3>Key points</h3>
        <ul class="preview-points">
          ${(paper.keyPoints || [])
            .map(
              (point) => `
                <li>
                  <span class="tag is-accent">${icon('dot')}</span>
                  <span>${escapeHtml(point)}</span>
                </li>
              `,
            )
            .join('')}
        </ul>
      </div>

      <div class="preview-section">
        <h3>Matched signals</h3>
        <div class="chip-row">
          ${(paper.matchedKeywords || []).length
            ? paper.matchedKeywords.map((keyword) => `<span class="chip is-selected">${escapeHtml(keyword)}</span>`).join('')
            : '<span class="chip">No explicit keyword match</span>'}
        </div>
      </div>

      <div class="preview-section">
        <h3>Sources</h3>
        <div class="preview-links">
          ${
            openHref
              ? `
                <a class="link-card" href="${escapeHtml(openHref)}" target="_blank" rel="noreferrer noopener">
                  <div>
                    <strong>${escapeHtml(openLabel)}</strong>
                    <span>${escapeHtml(paper.sourceName)}</span>
                  </div>
                  ${icon('external')}
                </a>
              `
              : '<div class="empty-state">현재 메타데이터에 외부 원문 링크가 없습니다.</div>'
          }
        </div>
      </div>

      <div class="preview-actions">
        <button
          class="button-primary button-block"
          type="button"
          data-action="toggle-save"
          data-paper-id="${escapeHtml(paper.paperId)}"
          ${saving ? 'disabled' : ''}
        >
          ${icon('bookmark')}
          ${paper.saved ? 'Remove from library' : saving ? 'Saving...' : 'Save to library'}
        </button>
        <button
          class="button-secondary button-block"
          type="button"
          data-action="queue-paper"
          data-paper-id="${escapeHtml(paper.paperId)}"
          ${queueing ? 'disabled' : ''}
        >
          ${icon('arrow')}
          ${paper.queued ? 'Open source again' : queueing ? 'Queueing...' : 'Read next'}
        </button>
      </div>
    </section>
  `;
}

function renderSearchStage(project) {
  const visible = visibleResults();
  const selected = selectedPaper();

  return `
    <div class="page-wrap">
      <div class="search-layout">
        ${renderFilterPanel(project, visible)}

        <section class="panel results-panel">
          <div class="project-focus">
            <div class="project-head">
              <span class="project-swatch" style="background:${escapeHtml(project.color)}"></span>
              <div>
                <p class="eyebrow">Search</p>
                <h1>${escapeHtml(project.name)}</h1>
              </div>
            </div>
            <p>${escapeHtml(project.focus)}</p>
          </div>

          <div class="search-toolbar">
            <form class="search-form" data-action="submit-search">
              <label class="search-input-wrap">
                ${icon('search')}
                <input
                  type="text"
                  name="query"
                  autocomplete="off"
                  spellcheck="false"
                  value="${escapeHtml(state.searchInput)}"
                  placeholder="예: rag reranker cost reduction, verifier-guided reasoning..."
                />
              </label>

              <button class="button-primary" type="submit">
                ${icon('search')}
                ${state.loading ? 'Searching...' : 'Search'}
              </button>
            </form>

            <div class="toolbar-row">
              <div class="meta">
                <span><strong>${visible.length}</strong> visible / ${state.searchMeta.total || state.results.length} results</span>
                <span>·</span>
                <span>sorted by ${escapeHtml(state.sort)}</span>
                <span>·</span>
                <span class="status-pill ${state.searchMeta.live ? 'is-live' : ''}">
                  <span class="dot ${state.searchMeta.live ? 'pulse' : ''}"></span>
                  Scout agent · ${escapeHtml(state.searchMeta.provider)}
                </span>
              </div>

              <div class="toolbar-actions">
                <select class="input-select" name="sort" aria-label="Sort results">
                  <option value="relevance" ${state.sort === 'relevance' ? 'selected' : ''}>Sort: relevance</option>
                  <option value="recent" ${state.sort === 'recent' ? 'selected' : ''}>Sort: recent</option>
                  <option value="cited" ${state.sort === 'cited' ? 'selected' : ''}>Sort: cited</option>
                </select>
              </div>
            </div>

            ${state.searchMeta.warning ? `<div class="notice">${icon('plus')}<div>${escapeHtml(state.searchMeta.warning)} Seed fallback results are shown so the screen remains usable.</div></div>` : ''}
            ${state.error ? `<div class="notice">${icon('plus')}<div>${escapeHtml(state.error)}</div></div>` : ''}
          </div>

          <div class="results-list">
            ${renderResultList(visible)}
          </div>
        </section>

        ${renderPreview(selected)}
      </div>
    </div>
  `;
}

function renderPlaceholderStage(project) {
  const stage = WORKFLOW_STAGES.find((entry) => entry.id === state.activeStage);
  return `
    <div class="page-wrap">
      <section class="panel placeholder-panel">
        <div class="workflow-placeholder">
          <div>
            <p class="eyebrow">${escapeHtml(stage.label)}</p>
            <h2>${escapeHtml(stage.sub)} 준비 중</h2>
            <p class="panel-copy">
              Search 탭에서 저장한 논문을 기준으로 다음 단계의 데이터 모델을 연결할 예정입니다.
              현재 활성 프로젝트는 <strong>${escapeHtml(project.name)}</strong> 입니다.
            </p>
          </div>

          <div class="workflow-grid">
            <article class="workflow-card">
              <h3>What is already working</h3>
              <p>프로젝트별 논문 검색, 필터링, 스크랩 저장, reading queue 연결이 실제 데이터 흐름으로 동작합니다.</p>
            </article>

            <article class="workflow-card">
              <h3>Next implementation target</h3>
              <p>Reading 탭에서는 저장된 논문을 섹션 단위로 읽고, 요약/재현 포인트 추출 구조를 연결하면 됩니다.</p>
            </article>
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderMobileTopbar(project) {
  const stage = WORKFLOW_STAGES.find((entry) => entry.id === state.activeStage) || WORKFLOW_STAGES[0];
  return `
    <header class="mobile-topbar">
      <div class="brand">
        <div class="brand-mark">A</div>
        <div class="brand-copy">
          <p class="brand-title">${escapeHtml(project ? project.name : 'ARES')}</p>
          <p class="brand-subtitle">${escapeHtml(stage.label)} · ${escapeHtml(stage.sub)}</p>
        </div>
      </div>
      <span class="status-pill ${state.searchMeta.live ? 'is-live' : ''}">
        <span class="dot ${state.searchMeta.live ? 'pulse' : ''}"></span>
        Scout
      </span>
    </header>
  `;
}

function renderBottomNav() {
  return `
    <nav class="bottom-nav" aria-label="Workflow tabs">
      ${WORKFLOW_STAGES.map((stage) => {
        const active = stage.id === state.activeStage;
        return `
          <button
            type="button"
            class="${active ? 'is-active' : ''}"
            data-action="select-stage"
            data-stage-id="${escapeHtml(stage.id)}"
          >
            ${icon(stageIcon(stage.id))}
            <span>${escapeHtml(stage.label)}</span>
          </button>
        `;
      }).join('')}
    </nav>
  `;
}

function render() {
  const project = activeProject();
  if (!project) {
    app.innerHTML = '<div class="page-wrap"><section class="panel"><div class="empty-state">프로젝트 정보를 불러오지 못했습니다.</div></section></div>';
    return;
  }

  const stageContent = state.activeStage === 'search' ? renderSearchStage(project) : renderPlaceholderStage(project);

  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar()}
      <main class="workspace">
        ${renderMobileTopbar(project)}
        ${stageContent}
      </main>
      ${renderBottomNav()}
    </div>
  `;
}

document.addEventListener('click', async (event) => {
  const trigger = event.target.closest('[data-action]');
  if (!trigger) {
    return;
  }

  const action = trigger.dataset.action;

  if (action === 'select-stage') {
    state.activeStage = trigger.dataset.stageId;
    saveStorage(STORAGE_KEYS.stage, state.activeStage);
    render();
    return;
  }

  if (action === 'select-project') {
    state.activeProjectId = trigger.dataset.projectId;
    saveStorage(STORAGE_KEYS.project, state.activeProjectId);
    state.searchInput = activeProject()?.defaultQuery || '';
    await runSearch();
    return;
  }

  if (action === 'select-paper') {
    state.selectedPaperId = trigger.dataset.paperId;
    render();
    return;
  }

  if (action === 'toggle-save') {
    const paper = state.results.find((entry) => entry.paperId === trigger.dataset.paperId);
    if (paper) {
      await savePaper(paper);
    }
    return;
  }

  if (action === 'queue-paper') {
    const paper = state.results.find((entry) => entry.paperId === trigger.dataset.paperId);
    if (paper) {
      await queuePaper(paper);
    }
  }
});

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-action="submit-search"]');
  if (!form) {
    return;
  }

  event.preventDefault();
  const formData = new FormData(form);
  state.searchInput = String(formData.get('query') || '').trim();
  await runSearch();
});

document.addEventListener('input', (event) => {
  if (event.target.name === 'query') {
    state.searchInput = event.target.value;
    return;
  }

  if (event.target.name === 'minRelevance') {
    state.filters.minRelevance = Number(event.target.value);
    syncSelectedPaper();
    render();
  }
});

document.addEventListener('change', (event) => {
  if (event.target.name === 'sort') {
    state.sort = event.target.value;
    syncSelectedPaper();
    render();
    return;
  }

  if (event.target.name === 'venue') {
    if (event.target.checked) {
      state.filters.venues.add(event.target.value);
    } else {
      state.filters.venues.delete(event.target.value);
    }
    syncSelectedPaper();
    render();
    return;
  }

  if (event.target.name === 'yearBucket') {
    if (event.target.checked) {
      state.filters.years.add(event.target.value);
    } else {
      state.filters.years.delete(event.target.value);
    }
    syncSelectedPaper();
    render();
    return;
  }

  if (event.target.name === 'savedOnly') {
    state.filters.savedOnly = event.target.checked;
    syncSelectedPaper();
    render();
    return;
  }

  if (event.target.name === 'openAccessOnly') {
    state.filters.openAccessOnly = event.target.checked;
    syncSelectedPaper();
    render();
  }
});

async function boot() {
  try {
    await loadProjects();
    const project = activeProject();
    state.searchInput = project?.defaultQuery || '';
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
