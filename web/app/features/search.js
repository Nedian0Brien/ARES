// Search-specific rendering and presentational helpers.
export function createSearchFeature({
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
}) {
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
  
  function renderDashboardSearchModeToggle() {
    return `
      <div class="dashboard-submit" aria-label="Search mode">
        ${Object.entries(SEARCH_MODES)
          .map(([id, config]) => {
            const active = state.searchMode === id;
            const actionAttrs = active ? "" : `data-action="set-search-mode" data-search-mode="${escapeHtml(id)}"`;
            return `
              <button
                type="${active ? "submit" : "button"}"
                class="dashboard-sbtn ${active ? "active" : ""}"
                data-mode="${escapeHtml(id)}"
                title="${escapeHtml(config.ctaLabel)}"
                aria-label="${escapeHtml(config.ctaLabel)}"
                ${actionAttrs}
                ${state.loading ? "disabled" : ""}
              >
                ${icon(config.icon, { size: 14.5 })}
                <span class="dashboard-sbtn-copy">
                  <span>${escapeHtml(config.ctaLabel)}</span>
                  ${icon("ctaArrow", { size: 13 })}
                </span>
              </button>
            `;
          })
          .join("")}
      </div>
    `;
  }
  
  function renderDashboardScopeChip(scope) {
    return `
      <span class="dashboard-scope-chip">
        <span>${escapeHtml(scope.label)}</span>
        <button type="button" class="dashboard-scope-chip-remove" data-action="remove-scope" data-scope-id="${escapeHtml(scope.id)}" aria-label="Remove scope">
          ×
        </button>
      </span>
    `;
  }
  
  function renderDashboardSegmentBar(segments = [], total, { dashedRemainder = false } = {}) {
    const safeTotal = Math.max(Number(total) || 0, 0);
    const safeSegments = segments.filter((segment) => Number(segment?.count) > 0);
    const used = safeSegments.reduce((sum, segment) => sum + Number(segment.count || 0), 0);
    const remainder = Math.max(safeTotal - used, 0);
  
    return `
      <div class="dashboard-kc-seg">
        ${safeSegments
          .map(
            (segment) =>
              `<span class="s" style="width:${dashboardPercent(Number(segment.count || 0), safeTotal || used || 1)}%; background:${segment.color}"></span>`,
          )
          .join("")}
        ${
          dashedRemainder
            ? `<span class="dashed" style="${remainder ? "" : "flex:1"}"></span>`
            : remainder
              ? `<span class="s" style="width:${dashboardPercent(remainder, safeTotal)}%; background:${TOKENS.t4}"></span>`
              : ""
        }
      </div>
    `;
  }
  
  function renderDashboardWorklistRow(row, index) {
    const { paper, queued, folderLabel, folderColor, tags, savedLabel } = row;
    const pdfCollected = Boolean(paper.pdfUrl);
  
    return `
      <button
        type="button"
        class="dashboard-tbl-row data ${index === 0 ? "selected" : ""}"
        data-action="open-reading-paper"
        data-paper-id="${escapeHtml(paper.paperId)}"
      >
        <span class="dashboard-tbl-title">
          <span class="t">${escapeHtml(paper.title || "Untitled paper")}</span>
          <span class="a">${escapeHtml(formatAuthors(paper.authors || []))}</span>
        </span>
        <span class="dashboard-venue"><span class="vbar" style="background:${venueColor(paper.venue)}"></span>${escapeHtml(paper.venue || "Unknown")}</span>
        <span class="dashboard-year mono">${escapeHtml(savedLabel)}</span>
        <span>
          ${
            folderLabel
              ? `<span class="dashboard-cell-folder"><span class="swatch" style="background:${folderColor || TOKENS.research}"></span>${escapeHtml(folderLabel)}</span>`
              : '<span class="dashboard-cell-folder empty">+ 폴더 지정</span>'
          }
        </span>
        <span class="dashboard-cell-tags">
          ${
            tags.length
              ? tags.map((tag) => `<span class="dashboard-tag-pill auto">${escapeHtml(tag)}</span>`).join("")
              : '<span class="dashboard-tag-pill muted">No tags</span>'
          }
          <span class="dashboard-tag-add">+</span>
        </span>
        <span><span class="dashboard-cell-queue ${queued ? "on" : ""}">${queued ? '<span class="dot"></span>queued' : "—"}</span></span>
        <span>
          <span class="dashboard-cell-pdf ${pdfCollected ? "on" : "empty"}">
            ${pdfCollected ? `${icon("check", { size: 11, color: "currentColor" })}수집됨` : "drop"}
          </span>
        </span>
      </button>
    `;
  }

  function activeSearchAgentRun() {
    return state.searchAgentRun && typeof state.searchAgentRun === "object" ? state.searchAgentRun : null;
  }

  function agenticRunQuery(run) {
    return String(run?.input?.query || run?.query || state.searchInput || "").trim();
  }

  function agenticRunScopes(run) {
    const source = Array.isArray(run?.input?.scopes) && run.input.scopes.length ? run.input.scopes : state.searchScopes;
    return source.filter(Boolean);
  }

  function agenticRunIdLabel(run) {
    const raw = String(run?.id || "").trim();
    if (!raw) {
      return "Run 준비 중";
    }

    const compact = raw.replace(/^run[-_]?/i, "");
    return `Run #${compact.slice(-4).toUpperCase()}`;
  }

  function agenticRunElapsed(run) {
    const started = Date.parse(run?.startedAt || run?.createdAt || "");
    if (!Number.isFinite(started)) {
      return "1s";
    }

    const elapsedSeconds = Math.max(1, Math.round((Date.now() - started) / 1000));
    if (elapsedSeconds < 60) {
      return `${elapsedSeconds}s`;
    }

    return `${Math.floor(elapsedSeconds / 60)}m ${String(elapsedSeconds % 60).padStart(2, "0")}s`;
  }

  function agenticRunFailed(run) {
    return run?.status === "error" || Boolean(run?.error);
  }

  function agenticRunStatusLabel(run) {
    if (agenticRunFailed(run)) {
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

  function agenticProgressEvents(run) {
    return Array.isArray(run?.progressEvents)
      ? run.progressEvents.filter((event) => event && typeof event === "object").slice(-8)
      : [];
  }

  function agenticProgressKindLabel(type) {
    const value = String(type || "").toLowerCase();
    if (value === "tool") {
      return "Tool";
    }
    if (value === "agent_message") {
      return "Agent";
    }
    if (value === "agent") {
      return "Scout";
    }
    if (value === "error") {
      return "Error";
    }
    return "Run";
  }

  function renderAgenticProgressTimeline(run) {
    const events = agenticProgressEvents(run);
    if (!events.length) {
      return "";
    }

    return `
      <div class="agent-trace" aria-label="Agentic Search live trace">
        ${events.map((event) => {
          const type = String(event.type || "status").toLowerCase();
          const status = String(event.status || "running").toLowerCase();
          const label = String(event.label || agenticProgressKindLabel(type)).trim();
          const detail = String(event.detail || event.command || "").trim();
          return `
            <div class="agent-trace-item ${escapeHtml(type)} ${escapeHtml(status)}">
              <span class="agent-trace-dot"></span>
              <span class="agent-trace-copy">
                <span class="agent-trace-k">${escapeHtml(agenticProgressKindLabel(type))}</span>
                <span class="agent-trace-title">${escapeHtml(label)}</span>
                ${detail ? `<span class="agent-trace-detail">${escapeHtml(detail)}</span>` : ""}
              </span>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderAgenticRunBadge(run) {
    const statusLabel = agenticRunFailed(run) ? "Failed" : run?.status === "done" ? "Done" : run?.status === "queue" ? "Queued" : "Live";
    return `
      <div class="run-badge" aria-live="off">
        <span class="dot"></span>
        ${escapeHtml(statusLabel)} · ${escapeHtml(agenticRunStatusLabel(run))} · ${escapeHtml(agenticRunElapsed(run))}
      </div>
    `;
  }

  function renderAgenticRunStage(project) {
    const run = activeSearchAgentRun();
    const query = agenticRunQuery(run) || project?.defaultQuery || "Agentic Search query";
    const scopes = agenticRunScopes(run);
    const scopeLabel = scopes.length ? scopes.map((scope) => scope.label || scope.id).filter(Boolean).join(" · ") : "Project-wide";
    const failed = agenticRunFailed(run);
    const progressEvents = agenticProgressEvents(run);
    const latestProgress = progressEvents.at(-1);
    const stageLine = failed
      ? "Scout failed"
      : run?.status === "done"
        ? "Reader phase complete"
        : latestProgress?.label || (run?.status === "queue" ? "Scout queued" : "Scout running");
    const summary = String(run?.outputSummary || "").trim();
    const warning = String(run?.warning || run?.error || "").trim();

    return `
      <div class="run-inner">
        <div class="run-inline-badge">${renderAgenticRunBadge(run)}</div>
        <div class="q-block">
          <div class="q-run-line">
            <span class="badge">Agentic Search</span>
            <span>${escapeHtml(agenticRunIdLabel(run))} · 4단계 계획 (Reader → Reproduction → Experiment → Analyst)</span>
            <span class="live-mark"><span class="dot"></span>${failed ? "오류" : run?.status === "done" ? "완료" : "진행 중"}</span>
          </div>
          <h1 class="q-text" tabindex="-1">${escapeHtml(query)}</h1>
          <div class="q-pills">
            <span class="q-pill">${icon("clock", { size: 11, color: "currentColor" })}<span>예상 4분</span></span>
            <span class="q-pill">${icon("globe", { size: 11, color: "currentColor" })}<span>${escapeHtml(scopeLabel)}</span></span>
            <span class="q-pill">${icon("book", { size: 11, color: "currentColor" })}<span>${failed ? "결과 저장 안 됨" : "Reading 큐에 자동 저장"}</span></span>
            <span class="q-pill">${icon("history", { size: 11, color: "currentColor" })}<span>${failed ? "실패 상태 체크포인트" : "중간 결과 자동 체크포인트"}</span></span>
          </div>
        </div>

        <div class="phase-divider">
          <div class="pd-inner"><span class="pd-tag">${failed || run?.status !== "done" ? "SCOUT" : "READER"}</span> 정의·지표 정렬 · ${escapeHtml(stageLine)}</div>
        </div>

        <div class="phase-card">
          <div class="pc-h">
            ${icon("search", { size: 12, color: "currentColor" })}
            ${failed ? "Agentic search failed" : "핵심 정의 추출"}
            <span class="step-cur">${escapeHtml(agenticRunStatusLabel(run))} sources</span>
          </div>
          <ul class="pc-bullets">
            <li><b>Query intent</b> — ${escapeHtml(query)}</li>
            <li><b>Scope</b> — ${escapeHtml(scopeLabel)}</li>
            <li>${summary ? escapeHtml(summary) : 'OpenAlex와 프로젝트 라이브러리를 기준으로 후보 논문을 수집하고 있습니다.'}<span class="pc-stream-cursor"></span></li>
            ${warning ? `<li><b>Runtime note</b> — ${escapeHtml(warning)}</li>` : ""}
          </ul>
          ${renderAgenticProgressTimeline(run)}
        </div>
      </div>
    `;
  }

  function renderAgenticLiveRegion(run) {
    if (!run) {
      return "";
    }

    const latest = agenticProgressEvents(run).at(-1);
    return `<div class="search-agentic-live sr-only" aria-live="polite">${escapeHtml(agenticRunFailed(run) ? `${agenticRunIdLabel(run)} 실패. ${run.error || run.outputSummary || "Agentic Search 오류"}` : latest ? `${agenticRunIdLabel(run)} ${latest.label || "진행 중"}. ${latest.detail || ""}` : `${agenticRunIdLabel(run)} 시작. Scout 단계 진행 중`)}</div>`;
  }
  
  function renderSearchDashboard(project) {
    const library = dashboardLibraryItems();
    const totalCollected = library.length;
    const recentCount = dashboardRecentCount(library, 7, ["savedAt", "updatedAt", "createdAt"]);
    const taggedCount = library.filter((paper) => dashboardPaperTags(paper).length > 0).length;
    const pdfCount = library.filter((paper) => Boolean(paper.pdfUrl)).length;
    const actualSessions = actualReadingSessions(project);
    const queuedPaperIds = dashboardQueuedPaperIds(project);
    const queueCount = Math.max(project?.queueCount || 0, queuedPaperIds.size);
    const venueBreakdown = dashboardVenueBreakdown(library);
    const venueCount = venueBreakdown.length;
    const topVenue = venueBreakdown[0] || { venue: "Unknown", count: 0 };
    const folderGroups = (() => {
      const groups = new Map();
      library.forEach((paper) => {
        const label = String(paper?.folder || paper?.folderName || paper?.collectionName || "").trim();
        if (!label) {
          return;
        }
  
        const current = groups.get(label) || { label, count: 0, color: paper?.folderColor || "" };
        current.count += 1;
        current.color ||= paper?.folderColor || "";
        groups.set(label, current);
      });
      return [...groups.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
    })();
    const folderPalette = [TOKENS.research, TOKENS.search, TOKENS.result, TOKENS.writing, TOKENS.read, "#a67c3f"];
    const folderSegments = folderGroups.slice(0, 6).map((group, index) => ({
      ...group,
      color: group.color || folderPalette[index % folderPalette.length],
    }));
    const folderCount = folderGroups.reduce((sum, group) => sum + group.count, 0);
    const unclassifiedCount = Math.max(totalCollected - folderCount, 0);
    const totalSeries = dashboardCumulativeCounts(library, 30, ["savedAt", "updatedAt", "createdAt"]);
    const totalAreaPath = dashboardAreaPath(totalSeries, 120, 34, { padTop: 2, padBottom: 4 });
    const totalLinePath = dashboardSeriesPath(totalSeries, 120, 34, { padTop: 2, padBottom: 4 });
    const queueSeries = dashboardDailyCounts(
      actualSessions.filter((session) => ["queue", "running"].includes(session.status)),
      7,
      ["updatedAt", "queuedAt", "createdAt"],
    );
    const venueSegments = (() => {
      if (!venueBreakdown.length) {
        return [];
      }
  
      const leading = venueBreakdown.slice(0, 4).map((entry, index) => ({
        count: entry.count,
        color: [TOKENS.tx, TOKENS.read, TOKENS.search, TOKENS.result][index % 4],
      }));
      const remainder = venueBreakdown.slice(4).reduce((sum, entry) => sum + entry.count, 0);
      if (remainder) {
        leading.push({ count: remainder, color: TOKENS.t4 });
      }
      return leading;
    })();
    const worklistRows = library.slice(0, 8).map((paper) => {
      const tags = dashboardPaperTags(paper).slice(0, 2);
      return {
        paper,
        queued: queuedPaperIds.has(paper.paperId),
        folderLabel: String(paper?.folder || paper?.folderName || paper?.collectionName || "").trim(),
        folderColor: paper?.folderColor || "",
        tags,
        savedLabel: dashboardRelativeAge(paper.savedAt || paper.updatedAt || paper.createdAt),
      };
    });
    const recentWorkCount = dashboardRecentCount(library, 7, ["savedAt", "updatedAt", "createdAt"]);
    const totalPages = Math.max(1, Math.ceil(totalCollected / 8));
    const pageButtons = Array.from({ length: Math.min(totalPages, 3) }, (_, index) => index + 1);
    const queueRecentCount = dashboardRecentCount(
      actualSessions.filter((session) => ["queue", "running"].includes(session.status)),
      7,
      ["updatedAt", "queuedAt", "createdAt"],
    );
    const worklistRangeLabel =
      totalCollected > 0 ? `1-${worklistRows.length} of ${totalCollected}` : "0 of 0";
    const agentRun = activeSearchAgentRun();
    const hasAgentRun = Boolean(agentRun);
  
    return `
      <div class="search-stage search-stage-dashboard search-agentic-entry" data-ares-surface="search-stage" data-ares-stage="search" data-search-layout="${escapeHtml(state.searchLayout)}" data-agentic-run-active="${hasAgentRun ? "true" : "false"}">
        <div class="stage-home" ${hasAgentRun ? 'inert aria-hidden="true"' : 'aria-hidden="false"'}>
        <section class="search-dashboard" data-ares-surface="search-dashboard" data-ares-stage="search">
          <section class="dashboard-hero-wrap">
            <div class="search-home-hero">
              <div class="search-home-label">${icon("search", { size: 14, color: TOKENS.search })}<span>Search Workflow</span></div>
              <h1 class="search-home-title">Search</h1>
              <p class="search-home-copy">대상 학회와 키워드를 기준으로 논문을 수집하고 Reading으로 넘깁니다.</p>
            </div>
  
            <form class="dashboard-hero ${escapeHtml(state.searchMode)}" data-action="submit-search">
              <span class="dashboard-lead-icon" aria-hidden="true">${icon("heroSearch", { size: 16, color: TOKENS.t3 })}</span>
              <input
                id="search-input"
                type="text"
                name="query"
                autocomplete="off"
                spellcheck="false"
                value="${escapeHtml(state.searchInput)}"
                placeholder="${escapeHtml(searchPlaceholder(state.searchMode))}"
              />
              ${renderDashboardSearchModeToggle()}
            </form>
  
            <div class="dashboard-scope-row">
              <span class="dashboard-scope-label">Target</span>
              ${state.searchScopes.map((scope) => renderDashboardScopeChip(scope)).join("")}
              <button
                type="button"
                class="dashboard-scope-add"
                data-action="open-scope-picker"
                data-scope-tab="conference"
                data-scope-source="hero"
              >
                <span>+</span>
                <span>Add target</span>
              </button>
            </div>
  
            ${state.searchMeta.warning ? renderSearchNotice(state.searchMeta.warning) : ""}
            ${state.error ? renderSearchNotice(state.error) : ""}
          </section>
  
          <div class="dashboard-sec-head">
            <h2>Overview</h2>
            <span class="hint">프로젝트 라이브러리 · 최근 30일</span>
          </div>
          <div class="dashboard-kpi-grid">
            <div class="dashboard-kpi">
              <div class="dashboard-kpi-label">총 수집</div>
              <div class="dashboard-kpi-val">${escapeHtml(String(totalCollected))}</div>
              <div class="dashboard-kpi-sub"><span class="up">+${escapeHtml(String(recentCount))}</span> · 지난 7일</div>
              <div class="dashboard-kpi-chart">
                <svg class="dashboard-kc-area" viewBox="0 0 120 34" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="dashboardKpiArea" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stop-color="#2a2a2e" stop-opacity="0.14"></stop>
                      <stop offset="100%" stop-color="#2a2a2e" stop-opacity="0"></stop>
                    </linearGradient>
                  </defs>
                  <path d="${totalAreaPath || "M0,34 L120,34 L120,34 L0,34 Z"}" fill="url(#dashboardKpiArea)"></path>
                  <path d="${totalLinePath || "M0,34 L120,34"}" fill="none" stroke="#2a2a2e" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
                <div class="dashboard-kpi-chart-legend"><span>30d ago</span><span>today</span></div>
              </div>
            </div>
  
            <div class="dashboard-kpi">
              <div class="dashboard-kpi-label">폴더 지정</div>
              <div class="dashboard-kpi-val">${escapeHtml(String(folderCount))}<span class="of">/${escapeHtml(String(totalCollected))}</span></div>
              <div class="dashboard-kpi-sub"><span class="down">${escapeHtml(String(unclassifiedCount))}</span> 미분류</div>
              <div class="dashboard-kpi-chart">
                ${renderDashboardSegmentBar(folderSegments, totalCollected, { dashedRemainder: true })}
                <div class="dashboard-kpi-chart-legend"><span>${escapeHtml(`${folderGroups.length} 폴더 · ${dashboardPercent(folderCount, totalCollected)}%`)}</span><span style="color:var(--warn)">미분류 ${escapeHtml(String(dashboardPercent(unclassifiedCount, totalCollected)))}%</span></div>
              </div>
            </div>
  
            <div class="dashboard-kpi">
              <div class="dashboard-kpi-label">Reading queue</div>
              <div class="dashboard-kpi-val">${escapeHtml(String(queueCount))}</div>
              <div class="dashboard-kpi-sub"><span class="up">+${escapeHtml(String(queueRecentCount))}</span> · 대기 중</div>
              <div class="dashboard-kpi-chart">
                <div class="dashboard-kc-bars">
                  ${queueSeries
                    .map((value, index) => {
                      const height = queueSeries.some(Boolean) ? Math.max(8, dashboardPercent(value, Math.max(...queueSeries, 1))) : 8;
                      return `<span class="b ${index < Math.max(0, queueSeries.length - 2) ? "dim" : ""}" style="height:${height}%"></span>`;
                    })
                    .join("")}
                </div>
                <div class="dashboard-kpi-chart-legend"><span>Mon</span><span>Sun</span></div>
              </div>
            </div>
  
            <div class="dashboard-kpi">
              <div class="dashboard-kpi-label">수집 출처</div>
              <div class="dashboard-kpi-val">${escapeHtml(String(venueCount))} <span class="of">venues</span></div>
              <div class="dashboard-kpi-sub">${escapeHtml(topVenue.venue)} ${escapeHtml(String(topVenue.count))} · 최다</div>
              <div class="dashboard-kpi-chart">
                ${renderDashboardSegmentBar(venueSegments, totalCollected)}
                <div class="dashboard-kpi-chart-legend"><span>${escapeHtml(venueBreakdown.slice(0, 3).map((entry) => entry.venue).join(" · ") || "No venue data")}</span><span>${escapeHtml(venueBreakdown.length > 3 ? "Other" : "")}</span></div>
              </div>
            </div>
  
            <div class="dashboard-kpi">
              <div class="dashboard-kpi-label">PDF 수집</div>
              <div class="dashboard-kpi-val">${escapeHtml(String(pdfCount))}<span class="of">/${escapeHtml(String(totalCollected))}</span></div>
              <div class="dashboard-kpi-sub"><span class="down">${escapeHtml(String(Math.max(totalCollected - pdfCount, 0)))}</span> 없음</div>
              <div class="dashboard-kpi-chart">
                ${renderDashboardSegmentBar([{ count: pdfCount, color: TOKENS.search }], totalCollected, { dashedRemainder: true })}
                <div class="dashboard-kpi-chart-legend"><span>수집 ${escapeHtml(String(dashboardPercent(pdfCount, totalCollected)))}%</span><span style="color:var(--warn)">미수집 ${escapeHtml(String(dashboardPercent(Math.max(totalCollected - pdfCount, 0), totalCollected)))}%</span></div>
              </div>
            </div>
          </div>
  
          <div class="dashboard-sec-head">
            <h2>Analytics</h2>
            <span class="hint">수집 흐름 · 정리 진행도</span>
          </div>
          <div class="dashboard-chart-row">
            <article class="dashboard-card">
              <div class="dashboard-card-head">
                <div>
                  <div class="dashboard-card-title">수집 추이</div>
                  <div class="dashboard-card-sub">기간별 수집 논문 수</div>
                </div>
                <div class="dashboard-toggle-group">
                  <button type="button">7D</button><button type="button" class="active">30D</button><button type="button">90D</button><button type="button">ALL</button>
                </div>
              </div>
              <svg class="dashboard-chart-area" viewBox="0 0 640 170" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="dashboardAreaMain" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stop-color="#5e9c6f" stop-opacity="0.18"></stop>
                    <stop offset="100%" stop-color="#5e9c6f" stop-opacity="0"></stop>
                  </linearGradient>
                </defs>
                <g stroke="#efeeeb" stroke-width="1">
                  <line x1="0" y1="32" x2="640" y2="32"></line>
                  <line x1="0" y1="82" x2="640" y2="82"></line>
                  <line x1="0" y1="132" x2="640" y2="132"></line>
                </g>
                <path d="${dashboardAreaPath(totalSeries, 640, 170, { padTop: 22, padBottom: 18 }) || "M0,170 L640,170 L640,170 L0,170 Z"}" fill="url(#dashboardAreaMain)"></path>
                <path d="${dashboardSeriesPath(totalSeries, 640, 170, { padTop: 22, padBottom: 18 }) || "M0,170 L640,170"}" fill="none" stroke="#5e9c6f" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
                <g font-family="Inter,sans-serif" font-size="10" fill="#b0b0b8">
                  <text x="0" y="164">30d ago</text>
                  <text x="214" y="164">20d</text>
                  <text x="428" y="164">10d</text>
                  <text x="602" y="164">Today</text>
                </g>
              </svg>
            </article>
  
            <article class="dashboard-card">
              <div class="dashboard-card-head">
                <div>
                  <div class="dashboard-card-title">워크플로우 상태</div>
                  <div class="dashboard-card-sub">수집 → Reading</div>
                </div>
              </div>
              <div class="dashboard-funnel">
                <div class="dashboard-funnel-row"><span class="dashboard-funnel-label">수집됨</span><div class="dashboard-funnel-bar"><span style="width:100%; background:#2a2a2e"></span></div><span class="dashboard-funnel-val mono">${escapeHtml(String(totalCollected))}</span><span class="dashboard-funnel-pct mono">100%</span></div>
                <div class="dashboard-funnel-row"><span class="dashboard-funnel-label">폴더 지정</span><div class="dashboard-funnel-bar"><span style="width:${dashboardPercent(folderCount, totalCollected)}%; background:${folderSegments[0]?.color || TOKENS.research}"></span></div><span class="dashboard-funnel-val mono">${escapeHtml(String(folderCount))}</span><span class="dashboard-funnel-pct mono">${escapeHtml(String(dashboardPercent(folderCount, totalCollected)))}%</span></div>
                <div class="dashboard-funnel-row"><span class="dashboard-funnel-label">태그 생성</span><div class="dashboard-funnel-bar"><span style="width:${dashboardPercent(taggedCount, totalCollected)}%; background:${TOKENS.read}"></span></div><span class="dashboard-funnel-val mono">${escapeHtml(String(taggedCount))}</span><span class="dashboard-funnel-pct mono">${escapeHtml(String(dashboardPercent(taggedCount, totalCollected)))}%</span></div>
                <div class="dashboard-funnel-row"><span class="dashboard-funnel-label">Reading 큐</span><div class="dashboard-funnel-bar"><span style="width:${dashboardPercent(queueCount, totalCollected)}%; background:${TOKENS.writing}"></span></div><span class="dashboard-funnel-val mono">${escapeHtml(String(queueCount))}</span><span class="dashboard-funnel-pct mono">${escapeHtml(String(dashboardPercent(queueCount, totalCollected)))}%</span></div>
                <div class="dashboard-funnel-row"><span class="dashboard-funnel-label">PDF 수집</span><div class="dashboard-funnel-bar"><span style="width:${dashboardPercent(pdfCount, totalCollected)}%; background:${TOKENS.search}"></span></div><span class="dashboard-funnel-val mono">${escapeHtml(String(pdfCount))}</span><span class="dashboard-funnel-pct mono">${escapeHtml(String(dashboardPercent(pdfCount, totalCollected)))}%</span></div>
              </div>
            </article>
          </div>
  
          <div class="dashboard-tbl-head">
            <h2>Worklist</h2>
            <div class="dashboard-filter-chips">
              <button type="button" class="dashboard-f-chip active">전체<span class="n">${escapeHtml(String(totalCollected))}</span></button>
              <button type="button" class="dashboard-f-chip">폴더 미분류<span class="n">${escapeHtml(String(unclassifiedCount))}</span></button>
              <button type="button" class="dashboard-f-chip">Reading 대기<span class="n">${escapeHtml(String(queueCount))}</span></button>
              <button type="button" class="dashboard-f-chip">PDF 없음<span class="n">${escapeHtml(String(Math.max(totalCollected - pdfCount, 0)))}</span></button>
              <button type="button" class="dashboard-f-chip">최근 수집<span class="n">${escapeHtml(String(recentWorkCount))}</span></button>
            </div>
            <div class="dashboard-tool">
              <button type="button" class="dashboard-tool-btn">
                ${icon("filter", { size: 11, color: "currentColor" })}
                최근 수집순
              </button>
            </div>
          </div>
  
          <div class="dashboard-tbl">
            <div class="dashboard-tbl-row header">
              <span>Title · Authors</span>
              <span>Venue</span>
              <span>Saved</span>
              <span>Folder</span>
              <span>Tags</span>
              <span>Reading</span>
              <span>PDF</span>
            </div>
            ${
              worklistRows.length
                ? worklistRows.map((row, index) => renderDashboardWorklistRow(row, index)).join("")
                : '<div class="empty-state dashboard-worklist-empty">저장된 논문이 아직 없습니다. 검색 결과에서 Save를 누르면 이 Worklist에 논문이 쌓입니다.</div>'
            }
            <div class="dashboard-tbl-foot">
              <span>${escapeHtml(worklistRangeLabel)}</span>
              <div class="dashboard-page-btns">
                <button type="button" class="dashboard-page-btn">‹</button>
                ${pageButtons
                  .map((page) => `<button type="button" class="dashboard-page-btn ${page === 1 ? "active" : ""}">${page}</button>`)
                  .join("")}
                <button type="button" class="dashboard-page-btn">›</button>
              </div>
            </div>
          </div>
        </section>
  
        ${renderSearchScopePicker()}
        </div>
        <div class="stage-run" aria-hidden="${hasAgentRun ? "false" : "true"}">
          ${renderAgenticRunStage(project)}
        </div>
        ${renderAgenticLiveRegion(agentRun)}
      </div>
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
        <div class="results-back-row">
          <button
            type="button"
            class="results-back-btn"
            data-action="clear-search"
            aria-label="검색 홈으로 돌아가기"
            title="검색 홈으로"
          >
            ${icon("chevL", { size: 12, color: "currentColor" })}
            <span>검색 홈</span>
          </button>
        </div>
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
    if (!state.hasSearched) {
      return renderSearchDashboard(project);
    }
  
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

  return {
    renderSearchPreview,
    renderSearchStage,
    resolveScopeCatalogItem,
    searchPlaceholder,
  };
}
