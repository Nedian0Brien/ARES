// Reading-specific rendering and presentational helpers.
export function createReadingFeature({
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
}) {
  function readingProgress(session) {
    const sections = Array.isArray(session?.sections) ? session.sections : [];
    if (session?.summaryStatus === "done") {
      return 100;
    }

    if (session?.parseStatus === "done" && !sections.length) {
      return 100;
    }

    if (!sections.length) {
      return 0;
    }
  
    const doneCount = sections.filter((section) => section.status === "done").length;
    return Math.round((doneCount / sections.length) * 100);
  }
  
  function clampValue(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  
  function readingText(value, fallback = "") {
    const text = String(value ?? "").trim();
    return text || fallback;
  }
  
  function readingExcerpt(value, fallback = "", limit = 220) {
    const text = readingText(value, fallback).replace(/\s+/g, " ").trim();
    if (!text) {
      return "";
    }
  
    if (text.length <= limit) {
      return text;
    }
  
    return `${text.slice(0, limit - 1).trimEnd()}…`;
  }
  
  function readingSentence(value, fallback = "") {
    const text = readingText(value, fallback).replace(/\s+/g, " ").trim();
    if (!text) {
      return "";
    }
  
    const match = text.match(/^(.{0,240}?[.!?])(?:\s|$)/);
    return match ? match[1] : text;
  }
  
  function readingCategoryMeta(type) {
    const key = String(type || "note").trim().toLowerCase();
    return {
      claim: { label: "Claim", color: TOKENS.research },
      method: { label: "Method", color: TOKENS.read },
      result: { label: "Result", color: TOKENS.search },
      limit: { label: "Limit", color: TOKENS.result },
      note: { label: "Note", color: TOKENS.writing },
      summary: { label: "Summary", color: TOKENS.read },
    }[key] || { label: "Note", color: TOKENS.writing };
  }
  
  function readingSectionPage(index) {
    return Math.max(1, index + 1);
  }
  
  function readingRequestActive(kind, sessionId) {
    return state.readingRequest?.kind === kind && state.readingRequest?.sessionId === sessionId;
  }

  function readingIsParsed(session) {
    return Boolean(session && session.parseStatus === "done");
  }
  
  function readingIsSummarized(session) {
    return Boolean(session && session.summaryStatus === "done");
  }
  
  function filterReadingSessions(sessions = []) {
    const query = state.readingRailQuery.trim().toLowerCase();
    if (!query) {
      return sessions;
    }
  
    return sessions.filter((session) =>
      `${session.title || ""} ${(session.authors || []).join(" ")} ${session.venue || ""}`.toLowerCase().includes(query),
    );
  }
  
  function readingActiveSectionIndex(sections = []) {
    const methodIndex = sections.findIndex((section) => /method|approach|architecture/i.test(section.label || ""));
    if (methodIndex >= 0) {
      return methodIndex;
    }
  
    const pendingIndex = sections.findIndex((section) => section.status === "running" || section.status === "queue");
    if (pendingIndex >= 0) {
      return pendingIndex;
    }
  
    return Math.min(2, Math.max(sections.length - 1, 0));
  }
  
  function readingMatchSectionIndex(sections = [], value = "") {
    const lowered = String(value || "").trim().toLowerCase();
    if (!lowered) {
      return -1;
    }
  
    return sections.findIndex((section) => {
      const id = String(section.id || "").toLowerCase();
      const label = String(section.label || "").toLowerCase();
      return id === lowered || label === lowered || label.includes(lowered) || lowered.includes(id);
    });
  }
  
  function deriveReadingSummary(session) {
    const sections = Array.isArray(session?.sections) ? session.sections : [];
    const cards = session?.summaryCards || {};
    const keyPoints = (Array.isArray(cards.keyPoints) ? cards.keyPoints : session?.keyPoints || [])
      .map((entry) => readingSentence(entry))
      .filter(Boolean)
      .slice(0, 4);
    const methodSection = sections.find((entry) => /method|approach|setup/i.test(entry.label || "")) || sections[0] || null;
    const resultSection =
      sections.find((entry) => /result|experiment|evaluation/i.test(entry.label || "")) || sections[1] || methodSection;
    const limitSection =
      sections.find((entry) => /limit|discussion|conclusion/i.test(entry.label || "")) || sections.at(-1) || methodSection;

    return {
      keyPoints,
      limit: readingExcerpt(cards.limit || limitSection?.summary || session?.warning, "한계점과 주의사항은 추가 요약 후 표시됩니다.", 220),
      method: readingExcerpt(cards.method || methodSection?.summary || session?.abstract, "핵심 방법 설명이 준비되면 여기에 표시됩니다.", 220),
      result: readingExcerpt(cards.result || resultSection?.summary || session?.summary, "주요 결과는 요약이 완료되면 표시됩니다.", 220),
      sectionSummaries: Array.isArray(cards.sectionSummaries) ? cards.sectionSummaries : [],
      tldr: readingExcerpt(cards.tldr || session?.summary || session?.abstract, "요약이 아직 준비되지 않았습니다.", 260),
    };
  }
  
  function deriveReadingNotes(session) {
    const notes = Array.isArray(session?.notes) ? session.notes : [];
    const sections = Array.isArray(session?.sections) ? session.sections : [];
    const cards = [];
  
    notes.forEach((note, index) => {
      const quote = readingExcerpt(note.quote, "", 190);
      const memo = readingExcerpt(note.body, "", 220);
      const meta = readingCategoryMeta(note.kind);
      const sectionIndex = readingMatchSectionIndex(sections, note.sectionId);
      cards.push({
        id: note.id || `${session?.id || "reading"}-note-${index}`,
        cat: meta.label,
        color: meta.color,
        page: note.page || (sectionIndex >= 0 ? readingSectionPage(sectionIndex + 1) : 1),
        quote: quote || "Quote 없음",
        sectionId: note.sectionId || "",
        text: quote || memo || "Quote 없음",
        memo: memo || "메모를 입력해 저장하세요.",
      });
    });
  
    if (cards.length) {
      return cards;
    }

    const highlights = Array.isArray(session?.highlights) ? session.highlights : [];
    return highlights.slice(0, 6).map((highlight, index) => {
      const meta = readingCategoryMeta(highlight.type);
      const sectionIndex = readingMatchSectionIndex(sections, highlight.sectionId || highlight.section);
      return {
        color: meta.color,
        cat: meta.label,
        id: highlight.id || `${session?.id || "reading"}-highlight-${index}`,
        memo: "Parse 단계에서 추출된 하이라이트입니다. Notes 탭에서 편집 가능한 메모로 저장할 수 있습니다.",
        page: highlight.page || (sectionIndex >= 0 ? readingSectionPage(sectionIndex + 1) : 1),
        quote: readingExcerpt(highlight.quote || highlight.text, "Highlight pending", 190),
        sectionId: highlight.sectionId || highlight.section || "",
        text: readingExcerpt(highlight.quote || highlight.text, "Highlight pending", 190),
      };
    });
  }
  
  function deriveReadingMessages(session) {
    return (Array.isArray(session?.chatMessages) ? session.chatMessages : []).map((message) => ({
      ...message,
      cites: Array.isArray(message.citations)
        ? message.citations.map((citation) => ({
            label: citation.label || citation.sectionId || "Citation",
            pg: citation.page || null,
            quote: citation.quote || "",
          }))
        : [],
    }));
  }
  
  function deriveReadingAssets(session) {
    return (Array.isArray(session?.assets) ? session.assets : []).map((asset, index) => ({
      ...asset,
      caption: readingExcerpt(asset.caption, `Asset ${index + 1}`, 80),
      kind: String(asset.kind || "figure").toLowerCase() === "table" ? "Table" : "Figure",
      number: Number(asset.number) || index + 1,
      page: asset.page || null,
      rows: Array.isArray(asset.rows) ? asset.rows : [],
    }));
  }
  
  function renderReadingAssetThumb(asset) {
    if (asset.kind === "Table") {
      const rows = Array.isArray(asset.rows) ? asset.rows.slice(0, 3) : [];
      return `
        <div class="reading-asset-thumb-table">
          <div class="reading-asset-thumb-table-head">
            ${(rows[0] || [readingExcerpt(asset.caption, "Field", 14), "Value", "Note"])
              .slice(0, 3)
              .map((cell) => `<span>${escapeHtml(readingExcerpt(cell, "Cell", 14))}</span>`)
              .join("")}
          </div>
          ${rows.slice(1).map((row) => `
            <div class="reading-asset-thumb-table-row">
              ${row.slice(0, 3).map((cell) => `<span>${escapeHtml(readingExcerpt(cell, "Cell", 14))}</span>`).join("")}
            </div>
          `).join("")}
        </div>
      `;
    }
  
    return `
      <div class="reading-asset-thumb-figure">
        <span class="reading-asset-thumb-bar" style="height:34%"></span>
        <span class="reading-asset-thumb-bar" style="height:58%"></span>
        <span class="reading-asset-thumb-bar" style="height:74%"></span>
        <span class="reading-asset-thumb-bar" style="height:46%"></span>
        <span class="reading-asset-thumb-axis"></span>
      </div>
    `;
  }
  
  function renderReadingHomeMetricCard({ iconName, label, value, diagram }) {
    const renderDiagram = () => {
      if (diagram === "saved") {
        return `
          <svg class="reading-home-metric-svg" viewBox="0 0 88 42" preserveAspectRatio="none" aria-hidden="true">
            <path class="reading-home-metric-axis" d="M2 34H86"></path>
            <path class="reading-home-metric-fill" d="M2 34L2 25L14 24L26 21L38 17L50 19L62 14L74 12L86 9L86 34Z"></path>
            <path class="reading-home-metric-line" d="M2 25L14 24L26 21L38 17L50 19L62 14L74 12L86 9"></path>
          </svg>
        `;
      }
  
      if (diagram === "ready") {
        return `
          <div class="reading-home-band-stack" aria-hidden="true">
            <span class="reading-home-band"><i style="width:78%"></i></span>
            <span class="reading-home-band"><i style="width:62%;opacity:0.82"></i></span>
            <span class="reading-home-band"><i style="width:44%;opacity:0.68"></i></span>
          </div>
        `;
      }
  
      if (diagram === "running") {
        return `
          <div class="reading-home-bars" aria-hidden="true">
            ${[12, 22, 16, 30, 18, 26]
              .map((height, index) => `<span class="reading-home-bar ${index >= 2 ? "is-active" : ""}" style="height:${height}px"></span>`)
              .join("")}
          </div>
        `;
      }
  
      return `
        <div class="reading-home-dot-grid" aria-hidden="true">
          ${Array.from({ length: 12 }, (_, index) => `<span class="reading-home-dot ${index < 9 ? "is-active" : ""}"></span>`).join("")}
        </div>
      `;
    };
  
    return `
      <article class="reading-home-metric">
        <div class="reading-home-metric-main">
          <div class="reading-home-metric-label-row">
            <span class="reading-home-metric-icon">${icon(iconName, { size: 14, color: "currentColor" })}</span>
            <span class="reading-home-metric-label">${escapeHtml(label)}</span>
          </div>
          <div class="reading-home-metric-value">${escapeHtml(String(value))}</div>
        </div>
        <div class="reading-home-metric-diagram">
          ${renderDiagram()}
        </div>
      </article>
    `;
  }
  
  function renderReadingHomeStatusPill(item) {
    return `
      <span class="reading-home-status-pill is-${escapeHtml(item.status.bucket)}" style="background:${item.status.color}12;border-color:${item.status.color}30;color:${item.status.color}">
        <span class="dot"></span>
        <span>${escapeHtml(item.status.label)}</span>
      </span>
    `;
  }
  
  function renderReadingHomePreviewPanel(item, { surface = "desktop" } = {}) {
    if (!item) {
      return "";
    }
  
    const actionMeta = readingHomeActionMeta(item);
    const primaryLabel =
      !item.session && state.readingStartingPaperId === item.paperId ? "Starting..." : actionMeta.primaryLabel;
    const summaryCopy =
      item.abstract || "Abstract metadata is not available yet. Open Reading to generate structured notes.";
  
    return `
      <aside class="reading-home-preview ${surface === "desktop" ? "is-desktop" : `is-${surface}`}" data-ares-surface="reading-home-preview">
        <div class="reading-home-preview-scroll">
          <div class="reading-home-preview-header">
            <div class="reading-home-preview-meta">
              <span class="reading-home-preview-badge">${escapeHtml(item.venue)}</span>
              <span class="reading-home-preview-badge">
                <span>${item.hasPdf ? "PDF" : "No PDF"}</span>
                ${item.hasPdf ? icon("check", { size: 11, color: TOKENS.search }) : icon("dot", { size: 10, color: TOKENS.t4 })}
              </span>
            </div>
            ${
              surface === "desktop"
                ? `
                  <div class="reading-home-preview-icon-row">
                    <button type="button" class="reading-home-preview-icon">${icon("bookmark", { size: 14, color: TOKENS.t3 })}</button>
                    <button type="button" class="reading-home-preview-icon">${icon("moreH", { size: 14, color: TOKENS.t3 })}</button>
                  </div>
                `
                : `
                  <button type="button" class="reading-home-preview-close" data-action="close-reading-home-preview" aria-label="Close preview">
                    ${icon("x", { size: 14, color: TOKENS.tx })}
                  </button>
                `
            }
          </div>
  
          <h2 class="reading-home-preview-title">${escapeHtml(item.title)}</h2>
          <div class="reading-home-preview-authors">${escapeHtml(item.authorsLabel || "Unknown authors")}</div>
  
          <section class="reading-home-preview-section">
            <div class="reading-home-preview-section-title">Abstract</div>
            <p class="reading-home-preview-copy">${escapeHtml(readingExcerpt(summaryCopy, summaryCopy, 520))}</p>
          </section>
  
          <section class="reading-home-preview-section">
            <div class="reading-home-preview-section-title">Keywords</div>
            <div class="tag-row reading-home-preview-terms">
              ${
                item.tags.length
                  ? item.tags.map((tag) => renderTag(tag)).join("")
                  : renderTag("No tags", TOKENS.t3)
              }
            </div>
          </section>
  
          <section class="reading-home-preview-stat-grid">
            <article class="reading-home-preview-stat">
              <div class="reading-home-preview-stat-label">Status</div>
              <div class="reading-home-preview-stat-value">${renderReadingHomeStatusPill(item)}</div>
            </article>
            <article class="reading-home-preview-stat">
              <div class="reading-home-preview-stat-label">Progress</div>
              <div class="reading-home-preview-stat-value">${escapeHtml(String(item.progress))}%</div>
            </article>
            <article class="reading-home-preview-stat">
              <div class="reading-home-preview-stat-label">Sections</div>
              <div class="reading-home-preview-stat-value">${escapeHtml(String(item.sectionCount || 0))}</div>
            </article>
            <article class="reading-home-preview-stat">
              <div class="reading-home-preview-stat-label">Notes</div>
              <div class="reading-home-preview-stat-value">${escapeHtml(String(item.noteCount || 0))}</div>
            </article>
            <article class="reading-home-preview-stat">
              <div class="reading-home-preview-stat-label">Saved</div>
              <div class="reading-home-preview-stat-value mono">${escapeHtml(item.savedLabel)}</div>
            </article>
            <article class="reading-home-preview-stat">
              <div class="reading-home-preview-stat-label">Last activity</div>
              <div class="reading-home-preview-stat-value mono">${escapeHtml(item.lastActivityLabel)}</div>
            </article>
          </section>
  
          <div class="reading-home-preview-footer">
            <button
              type="button"
              class="btn-p"
              data-action="open-reading-detail"
              data-reading-paper-id="${escapeHtml(item.paperId)}"
              ${!item.session && state.readingStartingPaperId === item.paperId ? "disabled" : ""}
            >
              ${icon(actionMeta.primaryIcon, { size: 13, color: "#ffffff" })}
              <span>${escapeHtml(primaryLabel)}</span>
            </button>
            <button type="button" class="btn-s" data-action="select-stage" data-stage-id="search">
              ${icon(actionMeta.secondaryIcon, { size: 13, color: "currentColor" })}
              <span>${escapeHtml(actionMeta.secondaryLabel)}</span>
            </button>
          </div>
        </div>
      </aside>
    `;
  }
  
  function renderReadingHomeStage(project) {
    const items = readingHomeItems(project);
    const counts = readingHomeCounts(items);
    const visible = filterReadingHomeItems(items);
    const layout = state.readingHomeLayout;
    const selected = visible.find((item) => item.paperId === state.readingHomeSelectedPaperId) || visible[0] || null;
    const overlayOpen = layout !== "desktop" && state.readingHomePreviewOpen && selected;
  
    if (state.readingLoading && !items.length) {
      return `
        <div class="reading-stage reading-stage-home" data-ares-surface="reading-stage" data-ares-stage="reading" data-reading-view="home" data-reading-home-layout="${escapeHtml(layout)}">
          <section class="reading-home reading-home--loading">
            <div class="reading-home-inner">
              <div class="reading-home-hero">
                <div class="reading-home-label">${icon("book", { size: 14, color: TOKENS.read })}<span>Reading Workflow</span></div>
                <h1 class="reading-home-title">Library</h1>
                <p class="reading-home-copy">Syncing saved papers and reading sessions.</p>
              </div>
            </div>
          </section>
        </div>
      `;
    }
  
    if (!items.length) {
      return `
        <div class="reading-stage reading-stage-home" data-ares-surface="reading-stage" data-ares-stage="reading" data-reading-view="home" data-reading-home-layout="${escapeHtml(layout)}">
          <section class="reading-home">
            <div class="reading-home-inner">
              <section class="reading-home-hero">
                <div class="reading-home-label">${icon("book", { size: 14, color: TOKENS.read })}<span>Reading Workflow</span></div>
                <h1 class="reading-home-title">Library</h1>
                <p class="reading-home-copy">Search에서 저장한 논문이 여기에 쌓입니다.</p>
              </section>
  
              <section class="reading-home-metrics">
                ${renderReadingHomeMetricCard({ iconName: "bookmark", label: "Saved", value: 0, diagram: "saved" })}
                ${renderReadingHomeMetricCard({ iconName: "sparkles", label: "Ready", value: 0, diagram: "ready" })}
                ${renderReadingHomeMetricCard({ iconName: "clock", label: "In progress", value: 0, diagram: "running" })}
                ${renderReadingHomeMetricCard({ iconName: "check", label: "Completed", value: 0, diagram: "done" })}
              </section>
  
              <section class="reading-home-empty">
                <div class="reading-home-empty-icon">${icon("bookmark", { size: 28, color: TOKENS.read })}</div>
                <div class="reading-home-empty-title">Nothing saved yet</div>
                <div class="reading-home-empty-copy">Search에서 Save를 누르면 여기에 논문이 나타난다.</div>
                <div style="margin-top:18px">
                  <button type="button" class="btn-p" data-action="select-stage" data-stage-id="search">
                    ${icon("search", { size: 13, color: "#ffffff" })}
                    <span>Go to Search</span>
                  </button>
                </div>
              </section>
            </div>
          </section>
        </div>
      `;
    }
  
    return `
      <div
        class="reading-stage reading-stage-home"
        data-ares-surface="reading-stage"
        data-ares-stage="reading"
        data-reading-view="home"
        data-reading-home-layout="${escapeHtml(layout)}"
      >
        <section class="reading-home">
          <div class="reading-home-inner">
            <section class="reading-home-hero">
              <div class="reading-home-label">${icon("book", { size: 14, color: TOKENS.read })}<span>Reading Workflow</span></div>
              <h1 class="reading-home-title">Library</h1>
              <p class="reading-home-copy">수집한 논문을 AI 에이전트와 함께 읽고 분석하세요.</p>
            </section>
  
            <section class="reading-home-metrics">
              ${renderReadingHomeMetricCard({ iconName: "bookmark", label: "Saved", value: counts.saved, diagram: "saved" })}
              ${renderReadingHomeMetricCard({ iconName: "sparkles", label: "Ready", value: counts.ready, diagram: "ready" })}
              ${renderReadingHomeMetricCard({ iconName: "clock", label: "In progress", value: counts.running, diagram: "running" })}
              ${renderReadingHomeMetricCard({ iconName: "check", label: "Completed", value: counts.done, diagram: "done" })}
            </section>
  
            <section
              class="reading-home-content ${layout === "desktop" && selected ? "is-resizable" : ""}"
              style="${layout === "desktop" && selected ? `--reading-home-preview-w:${state.readingHomePreviewWidth}px` : ""}"
            >
              <article class="reading-home-panel">
                <div class="reading-home-panel-head">
                  <div class="reading-home-panel-title-wrap">
                    <span class="reading-home-panel-kicker">Worklist</span>
                    <h2 class="reading-home-panel-title">Saved papers</h2>
                  </div>
                </div>
  
                <div class="reading-home-list-tools">
                  <div class="reading-home-filter-row">
                    ${[
                      { id: "all", label: "All papers", count: counts.saved },
                      { id: "ready", label: "Ready", count: counts.ready },
                      { id: "running", label: "In progress", count: counts.running },
                      { id: "done", label: "Completed", count: counts.done },
                      { id: "noPdf", label: "No PDF", count: counts.noPdf },
                    ]
                      .map(
                        (filter) => `
                          <button
                            type="button"
                            class="reading-home-filter-chip ${state.readingHomeFilter === filter.id ? "is-on" : ""}"
                            data-action="set-reading-home-filter"
                            data-reading-home-filter="${escapeHtml(filter.id)}"
                          >
                            <span>${escapeHtml(filter.label)}</span>
                            <span class="reading-home-filter-count mono">${escapeHtml(String(filter.count))}</span>
                          </button>
                        `,
                      )
                      .join("")}
                  </div>
  
                  <div class="reading-home-tool-row">
                    <button type="button" class="reading-home-tool-btn">
                      ${icon("filter", { size: 12, color: "currentColor" })}
                      <span>Filter</span>
                    </button>
                    <button type="button" class="reading-home-tool-btn">
                      <span>Sort: Saved newest</span>
                      ${icon("chevD", { size: 12, color: TOKENS.t3 })}
                    </button>
                  </div>
                </div>
  
                <div class="reading-home-table">
                  <div class="reading-home-table-head">
                    <span>Title / Authors</span>
                    <span>Venue</span>
                    <span>Saved</span>
                    <span>PDF</span>
                    <span>Status</span>
                    <span></span>
                  </div>
  
                  ${
                    visible.length
                      ? visible
                          .map(
                            (item) => `
                              <button
                                type="button"
                                class="reading-home-row ${selected?.paperId === item.paperId ? "is-selected" : ""}"
                                data-action="select-reading-home-paper"
                                data-reading-paper-id="${escapeHtml(item.paperId)}"
                              >
                                <span class="reading-home-row-main">
                                  <span class="reading-home-row-file">${icon("pdf", { size: 16, color: selected?.paperId === item.paperId ? TOKENS.read : TOKENS.t3 })}</span>
                                  <span class="reading-home-row-copy">
                                    <span class="reading-home-row-title">${escapeHtml(item.title)}</span>
                                    <span class="reading-home-row-authors">${escapeHtml(item.authorsLabel)}</span>
                                    <span class="reading-home-row-mobile-meta">
                                      <span>${escapeHtml(item.venue)}</span>
                                      <span class="mono">${escapeHtml(item.savedLabel)}</span>
                                      <span class="reading-home-pdf-chip ${item.hasPdf ? "is-on" : "is-off"}">
                                        ${item.hasPdf ? icon("check", { size: 11, color: TOKENS.search }) : '<span class="mono">--</span>'}
                                        <span>${item.hasPdf ? "PDF" : "No PDF"}</span>
                                      </span>
                                      ${renderReadingHomeStatusPill(item)}
                                    </span>
                                  </span>
                                </span>
                                <span class="reading-home-cell">${escapeHtml(item.venue)}</span>
                                <span class="reading-home-cell mono">${escapeHtml(item.savedLabel)}</span>
                                <span class="reading-home-pdf-chip ${item.hasPdf ? "is-on" : "is-off"}">
                                  ${item.hasPdf ? icon("check", { size: 12, color: TOKENS.search }) : '<span class="mono">--</span>'}
                                  <span>${item.hasPdf ? "PDF" : "Missing"}</span>
                                </span>
                                <span class="reading-home-status-cell">${renderReadingHomeStatusPill(item)}</span>
                                <span class="reading-home-row-menu">${icon("chevR", { size: 13, color: TOKENS.t3 })}</span>
                              </button>
                            `,
                          )
                          .join("")
                      : `
                          <div class="reading-home-table-empty">
                            <div class="reading-home-empty-icon">${icon("book", { size: 28, color: TOKENS.read })}</div>
                            <div class="reading-home-empty-title">No papers in this slice</div>
                            <div class="reading-home-empty-copy">현재 필터와 일치하는 저장 논문이 없습니다.</div>
                          </div>
                        `
                  }
  
                  <div class="reading-home-table-foot">
                    <span>Showing ${escapeHtml(String(visible.length))} of ${escapeHtml(String(items.length))}</span>
                    <span class="mono">${escapeHtml(project.name)}</span>
                  </div>
                </div>
              </article>
  
              ${
                layout === "desktop" && selected
                  ? `
                      <div class="reading-home-resizer-wrap" aria-hidden="true">
                        <button
                          type="button"
                          class="reading-home-resizer"
                          data-action="start-reading-home-resize"
                          aria-label="Resize preview panel"
                        ></button>
                      </div>
                      ${renderReadingHomePreviewPanel(selected)}
                    `
                  : ""
              }
            </section>
          </div>
        </section>
  
        ${
          layout !== "desktop"
            ? `
                <div class="reading-home-preview-overlay is-${layout === "tablet" ? "drawer" : "modal"} ${overlayOpen ? "is-open" : ""}">
                  <button type="button" class="reading-home-preview-backdrop" data-action="close-reading-home-preview" aria-label="Close preview"></button>
                  <div class="reading-home-preview-panel">
                    <div class="reading-home-preview-surface" role="dialog" aria-modal="true" aria-label="Paper preview">
                      ${selected ? renderReadingHomePreviewPanel(selected, { surface: layout === "tablet" ? "drawer" : "modal" }) : ""}
                    </div>
                  </div>
                </div>
              `
            : ""
        }
      </div>
    `;
  }
  
  function renderReadingDetailStage(project) {
    const sessions = effectiveReadingSessions(project);
    const session = selectedReadingSession();

    if (state.readingLoading && !sessions.length) {
      return `
        <div class="reading-stage" data-ares-surface="reading-stage" data-ares-stage="reading">
          <section class="reading-empty">
            <div class="placeholder-eyebrow">Reading</div>
            <h1 class="placeholder-title">Reading session을 불러오는 중입니다</h1>
            <p class="placeholder-copy">저장된 세션과 PDF 상태를 동기화하고 있습니다.</p>
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
              Search 탭에서 저장한 논문을 열면 Reading 세션이 생성되고,
              여기서 Parse paper, Summarize, Chat, Notes, Assets를 이어서 사용할 수 있습니다.
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

    const filteredSessions = filterReadingSessions(sessions);
    const sections = Array.isArray(session?.sections) ? session.sections : [];
    const notes = deriveReadingNotes(session);
    const messages = deriveReadingMessages(session);
    const assets = deriveReadingAssets(session);
    const summary = deriveReadingSummary(session);
    const parsed = readingIsParsed(session);
    const summarized = readingIsSummarized(session);
    const split = state.readingOrientation === "vertical" ? state.readingSplitVertical : state.readingSplitHorizontal;
    const activeSectionIndex = readingActiveSectionIndex(sections);
    const docPaneStyle = state.readingWorkbenchCollapsed ? "flex:1 1 auto" : `flex:0 0 calc(${split}% - 2.5px)`;
    const wbPaneStyle = `flex:0 0 calc(${100 - split}% - 2.5px)`;
    const progress = readingProgress(session);
    const parseBusy = readingRequestActive("parse", session?.id);
    const summarizeBusy = readingRequestActive("summarize", session?.id);
    const extractBusy = readingRequestActive("extract", session?.id);
    const chatBusy = readingRequestActive("chat", session?.id);
    const noteBusy = readingRequestActive("note", session?.id);
    const figureCount = assets.filter((entry) => entry.kind === "Figure").length;
    const tableCount = assets.filter((entry) => entry.kind === "Table").length;
    const visibleAssets =
      state.readingAssetsFilter === "all"
        ? assets
        : assets.filter((entry) => entry.kind.toLowerCase() === state.readingAssetsFilter);
    const categoryRows = [
      readingCategoryMeta("method"),
      readingCategoryMeta("result"),
      readingCategoryMeta("limit"),
      readingCategoryMeta("claim"),
      readingCategoryMeta("note"),
      readingCategoryMeta("summary"),
    ].map((entry) => ({
      ...entry,
      count: notes.filter((note) => note.cat === entry.label).length,
    }));
    const railTitle = {
      overview: "Overview",
      library: "Library",
      outline: "Outline",
      highlight: "Highlights",
    }[state.readingRailOpen] || "Overview";
    const railIcon = {
      overview: "layers",
      library: "book",
      outline: "list",
      highlight: "highlight",
    }[state.readingRailOpen] || "layers";
    const parseStatusLabel = {
      done: "Parsed",
      error: "Parse error",
      running: "Parsing",
      idle: "Raw PDF",
    }[session?.parseStatus || "idle"];
    const parseStatusColor = {
      done: TOKENS.read,
      error: TOKENS.result,
      running: TOKENS.result,
      idle: TOKENS.t3,
    }[session?.parseStatus || "idle"];

    const renderLibraryItems = (items) => {
      if (!items.length) {
        return '<div class="reading-compact-empty">조건에 맞는 논문이 없습니다.</div>';
      }

      return items
        .map((entry) => {
          const active = entry.id === session?.id;
          const entryProgress = readingProgress(entry);
          return `
            <button
              type="button"
              class="reading-lib-item ${active ? "is-active" : ""}"
              data-action="select-reading-session"
              data-reading-session-id="${escapeHtml(entry.id)}"
            >
              <div class="reading-lib-title">${escapeHtml(entry.title || "Untitled paper")}</div>
              <div class="reading-lib-meta">
                <span>${escapeHtml(formatAuthors(entry.authors || []))}</span>
                <span style="color:${TOKENS.t4}">·</span>
                <span>${escapeHtml(entry.venue || "Unknown venue")}</span>
              </div>
              ${entryProgress > 0 && entryProgress < 100 ? `<div class="reading-lib-bar"><i style="width:${entryProgress}%"></i></div>` : ""}
              ${
                entryProgress === 100
                  ? `<div class="reading-lib-status">${icon("check", { size: 10, color: TOKENS.search })}<span>done</span></div>`
                  : ""
              }
            </button>
          `;
        })
        .join("");
    };

    const renderOutlineItems = (items, { compact = false } = {}) => {
      if (!items.length) {
        return '<div class="reading-compact-empty">섹션 구조가 아직 준비되지 않았습니다.</div>';
      }

      return items
        .map((entry, index) => {
          const active = index === activeSectionIndex;
          return `
            <button type="button" class="reading-outline-item ${active ? "is-active" : ""}">
              <span class="reading-outline-icon">${statusIcon(entry.status || "done")}</span>
              <span>${escapeHtml(entry.label || `Section ${index + 1}`)}</span>
              ${compact ? "" : `<span class="reading-outline-progress mono">${escapeHtml(String(entry.pageStart || readingSectionPage(index + 1)).padStart(2, "0"))}</span>`}
            </button>
          `;
        })
        .join("");
    };

    const renderHighlightItems = (items) => {
      if (!items.length) {
        return '<div class="reading-compact-empty">노트가 아직 생성되지 않았습니다.</div>';
      }

      return items
        .map(
          (entry) => `
            <button type="button" class="reading-highlight-item">
              <span class="reading-highlight-rail" style="background:${entry.color}"></span>
              <span class="reading-highlight-copy">
                <span class="reading-highlight-text">${escapeHtml(entry.text)}</span>
                <span class="reading-highlight-page mono">p.${escapeHtml(String(entry.page || 1))}</span>
              </span>
            </button>
          `,
        )
        .join("");
    };

    const floatPanel =
      state.readingRailOpen
        ? `
            <aside class="reading-float-panel ${state.readingRailOpen === "overview" ? "is-wide" : ""}">
              <div class="reading-float-panel-head">
                <div class="reading-float-panel-title">
                  ${icon(railIcon, { size: 14, color: TOKENS.read })}
                  <span>${escapeHtml(railTitle)}</span>
                </div>
                <button type="button" class="reading-float-panel-close" data-action="close-reading-rail">
                  ${icon("x", { size: 13, color: "currentColor" })}
                </button>
              </div>

              ${
                state.readingRailOpen === "overview"
                  ? `
                      <div class="reading-float-panel-body is-overview">
                        <section class="reading-float-section">
                          <div class="reading-float-section-head">
                            ${icon("book", { size: 11, color: TOKENS.read })}
                            <span>Library</span>
                            <span class="count">${sessions.length}</span>
                            <button type="button" class="more" data-action="set-reading-rail" data-reading-rail="library">All →</button>
                          </div>
                          ${renderLibraryItems(filteredSessions.slice(0, 3))}
                        </section>

                        <section class="reading-float-section">
                          <div class="reading-float-section-head">
                            ${icon("list", { size: 11, color: TOKENS.read })}
                            <span>Outline</span>
                            <span class="count" style="color:${TOKENS.read};font-weight:600">${progress}%</span>
                            <button type="button" class="more" data-action="set-reading-rail" data-reading-rail="outline">Full →</button>
                          </div>
                          <div class="reading-mini-progress"><i style="width:${progress}%"></i></div>
                          ${renderOutlineItems(sections.slice(0, 5), { compact: true })}
                        </section>

                        <section class="reading-float-section">
                          <div class="reading-float-section-head">
                            ${icon("highlight", { size: 11, color: TOKENS.read })}
                            <span>Highlights</span>
                            <span class="count">${notes.length}</span>
                            <button type="button" class="more" data-action="set-reading-rail" data-reading-rail="highlight">All →</button>
                          </div>
                          <div class="reading-highlight-category-row">
                            ${categoryRows
                              .map(
                                (entry) => `
                                  <span class="reading-highlight-chip" style="background:${entry.color}12;color:${entry.color};border-color:${entry.color}30">
                                    <span class="dot" style="background:${entry.color}"></span>
                                    <span>${escapeHtml(entry.label)}</span>
                                    <span class="mono">${entry.count}</span>
                                  </span>
                                `,
                              )
                              .join("")}
                          </div>
                          ${renderHighlightItems(notes.slice(0, 3))}
                        </section>
                      </div>
                    `
                  : ""
              }

              ${
                state.readingRailOpen === "library"
                  ? `
                      <div class="reading-float-search">
                        ${icon("search", { size: 12, color: "currentColor" })}
                        <input type="text" name="readingRailQuery" value="${escapeHtml(state.readingRailQuery)}" placeholder="Filter papers…" />
                        ${renderKbd("⌘K")}
                      </div>
                      <div class="reading-float-panel-body">${renderLibraryItems(filteredSessions)}</div>
                    `
                  : ""
              }

              ${
                state.readingRailOpen === "outline"
                  ? `
                      <div class="reading-outline-panel-meta">
                        <div class="reading-outline-panel-label">Reading progress</div>
                        <div class="reading-mini-progress"><i style="width:${progress}%"></i></div>
                        <div class="reading-outline-progress mono">${progress}%</div>
                      </div>
                      <div class="reading-float-panel-body">${renderOutlineItems(sections)}</div>
                    `
                  : ""
              }

              ${
                state.readingRailOpen === "highlight"
                  ? `
                      <div class="reading-float-panel-body reading-highlight-panel">
                        <div class="reading-highlight-panel-label">Categories</div>
                        ${categoryRows
                          .map(
                            (entry) => `
                              <button type="button" class="reading-highlight-category-btn">
                                <span class="swatch" style="background:${entry.color}"></span>
                                <span>${escapeHtml(entry.label)}</span>
                                <span class="mono">${entry.count}</span>
                              </button>
                            `,
                          )
                          .join("")}
                        <div class="reading-highlight-divider"></div>
                        <div class="reading-highlight-panel-label">Recent</div>
                        ${renderHighlightItems(notes.slice(0, 5))}
                      </div>
                    `
                  : ""
              }
            </aside>
          `
        : "";

    const summaryBody = summarized
      ? `
          <div class="reading-summary-wrap">
            <section class="reading-summary-block">
              <div class="reading-summary-label">${icon("sparkles", { size: 11, color: TOKENS.read })}<span>TL;DR</span></div>
              <div class="reading-summary-body">${escapeHtml(summary.tldr)}</div>
            </section>

            <section class="reading-summary-block">
              <div class="reading-summary-label" style="color:${TOKENS.search}">${icon("dot", { size: 8, color: TOKENS.search })}<span>Key points</span></div>
              <ul class="reading-summary-list">
                ${summary.keyPoints
                  .map(
                    (entry) => `
                      <li>
                        <span class="bullet" style="background:${TOKENS.search}"></span>
                        <span>${escapeHtml(entry)}</span>
                      </li>
                    `,
                  )
                  .join("")}
              </ul>
            </section>

            <section class="reading-summary-block">
              <div class="reading-summary-label" style="color:${TOKENS.read}">${icon("dot", { size: 8, color: TOKENS.read })}<span>Method</span></div>
              <div class="reading-summary-body">${escapeHtml(summary.method)}</div>
            </section>

            <section class="reading-summary-block">
              <div class="reading-summary-label" style="color:${TOKENS.research}">${icon("dot", { size: 8, color: TOKENS.research })}<span>Result</span></div>
              <div class="reading-summary-body">${escapeHtml(summary.result)}</div>
            </section>

            <section class="reading-summary-block">
              <div class="reading-summary-label" style="color:${TOKENS.result}">${icon("dot", { size: 8, color: TOKENS.result })}<span>Limit</span></div>
              <div class="reading-summary-body">${escapeHtml(summary.limit)}</div>
            </section>

            ${
              summary.sectionSummaries.length
                ? `
                    <section class="reading-summary-block">
                      <div class="reading-summary-label" style="color:${TOKENS.t2}">${icon("list", { size: 11, color: TOKENS.t2 })}<span>Sections</span></div>
                      <ul class="reading-summary-list">
                        ${summary.sectionSummaries
                          .map(
                            (entry) => `
                              <li>
                                <span class="bullet" style="background:${TOKENS.t3}"></span>
                                <span>${escapeHtml(entry.label)}${entry.page ? ` · p.${escapeHtml(String(entry.page))}` : ""} · ${escapeHtml(entry.summary)}</span>
                              </li>
                            `,
                          )
                          .join("")}
                      </ul>
                    </section>
                  `
                : ""
            }
          </div>
        `
      : `
          <div class="reading-empty-view">
            <div class="reading-empty-icon">${icon("sparkles", { size: 24, color: TOKENS.read })}</div>
            <div class="reading-empty-title">요약이 아직 생성되지 않았습니다</div>
            <div class="reading-empty-copy">Parse paper 후 <strong>Summarize</strong>를 실행하면 TL;DR, Key Points, Method, Result, Limit 카드가 저장됩니다.</div>
            <button type="button" class="btn-p" data-action="reading-summarize-session" ${!parsed || summarizeBusy ? "disabled" : ""}>
              ${icon("sparkles", { size: 13, color: "#fff" })}
              <span>${summarizeBusy ? "Summarizing..." : "Generate summary"}</span>
            </button>
          </div>
        `;

    const pdfBody = !session?.pdfUrl
      ? `
          <div class="reading-empty-view">
            <div class="reading-empty-icon">${icon("pdf", { size: 24, color: TOKENS.t3 })}</div>
            <div class="reading-empty-title">PDF URL이 없는 논문입니다</div>
            <div class="reading-empty-copy">v1은 <strong>pdfUrl</strong> 기반 논문만 완전 지원합니다. 이 세션은 metadata-only 상태로 유지됩니다.</div>
          </div>
        `
      : `
          <div class="reading-pdf-viewer">
            <div class="reading-pdf-viewer-head">
              <div class="reading-pdf-viewer-meta">
                ${renderTag(parseStatusLabel, parseStatusColor, session?.parseStatus === "done")}
                ${summarized ? renderTag("Summary ready", TOKENS.read, true) : ""}
                ${session?.pageCount ? renderTag(`${session.pageCount} pages`) : ""}
              </div>
              <div class="reading-pdf-viewer-copy">
                ${session?.parseError ? `<span class="reading-pdf-viewer-warning">${escapeHtml(session.parseError)}</span>` : `<span>실제 PDF를 렌더링합니다.</span>`}
              </div>
            </div>
            <div
              class="reading-pdf-canvas-root"
              data-reading-pdf-host="true"
              data-reading-session-id="${escapeHtml(session.id)}"
              data-reading-pdf-url="${escapeHtml(session.pdfUrl || "")}"
            >
              <div class="reading-pdf-loading">PDF를 불러오는 중입니다…</div>
            </div>
          </div>
        `;

    const assetsBody =
      parsed && visibleAssets.length
        ? `
            <div class="reading-assets-wrap">
              <div class="reading-assets-toolbar">
                <button type="button" class="${state.readingAssetsFilter === "all" ? "btn-p" : "btn-s"}" style="padding:3px 9px;font-size:11.5px" data-action="set-reading-assets-filter" data-reading-assets-filter="all">All ${assets.length}</button>
                <button type="button" class="${state.readingAssetsFilter === "figure" ? "btn-p" : "btn-s"}" style="padding:3px 9px;font-size:11.5px" data-action="set-reading-assets-filter" data-reading-assets-filter="figure">${icon("image", { size: 11, color: "currentColor" })}<span>Figures ${figureCount}</span></button>
                <button type="button" class="${state.readingAssetsFilter === "table" ? "btn-p" : "btn-s"}" style="padding:3px 9px;font-size:11.5px" data-action="set-reading-assets-filter" data-reading-assets-filter="table">${icon("table", { size: 11, color: "currentColor" })}<span>Tables ${tableCount}</span></button>
              </div>
              <div class="reading-asset-grid">
                ${visibleAssets
                  .map(
                    (asset) => `
                      <article class="reading-asset-card">
                        <div class="reading-asset-thumb">${renderReadingAssetThumb(asset)}</div>
                        <div class="reading-asset-meta">
                          <div class="reading-asset-kind" style="color:${asset.kind === "Figure" ? TOKENS.research : TOKENS.writing}">${escapeHtml(asset.kind)} ${asset.number}</div>
                          <div class="reading-asset-caption">${escapeHtml(asset.caption)}</div>
                          <div class="reading-asset-page mono">${asset.page ? `p.${escapeHtml(String(asset.page))}` : "page n/a"}</div>
                        </div>
                      </article>
                    `,
                  )
                  .join("")}
              </div>
            </div>
          `
        : `
            <div class="reading-empty-view">
              <div class="reading-empty-icon">${icon("grid", { size: 24, color: TOKENS.read })}</div>
              <div class="reading-empty-title">${parsed ? "추출된 에셋이 아직 없습니다" : "에셋 추출 전입니다"}</div>
              <div class="reading-empty-copy">${parsed ? "Extract를 다시 실행하면 cached PDF를 기준으로 figure/table candidates를 재계산합니다." : "Assets는 Parse paper가 끝난 뒤 생성됩니다."}</div>
              <button type="button" class="btn-p" data-action="reading-extract-assets" ${!parsed || extractBusy ? "disabled" : ""}>
                ${icon("grid", { size: 13, color: "#fff" })}
                <span>${extractBusy ? "Extracting..." : "Extract assets"}</span>
              </button>
            </div>
          `;

    const chatBody = `
      <div class="reading-chat-wrap">
        <div class="reading-chat-body">
          ${
            !parsed
              ? `
                  <div class="reading-chat-warning">
                    ${icon("info", { size: 13, color: TOKENS.result })}
                    <div><strong>Parse paper</strong> 후에만 채팅이 활성화됩니다. 현재는 본문 청크와 인용이 준비되지 않았습니다.</div>
                  </div>
                `
              : ""
          }
          ${
            messages.length
              ? messages
                  .map(
                    (message) => `
                      <div class="reading-bubble ${message.role}">
                        ${
                          message.role === "assistant"
                            ? `<div class="reading-bubble-avatar">${icon("sparkles", { size: 12, color: TOKENS.read })}</div>`
                            : ""
                        }
                        <div class="reading-bubble-content">
                          ${escapeHtml(message.text)}
                          ${
                            message.cites?.length
                              ? `<div class="reading-cite-row">${message.cites
                                  .map(
                                    (cite) => `
                                      <span class="reading-cite">
                                        <span class="dot"></span>
                                        <span>${escapeHtml(cite.label)}</span>
                                        ${cite.pg ? `<span class="mono">p.${escapeHtml(String(cite.pg))}</span>` : ""}
                                      </span>
                                    `,
                                  )
                                  .join("")}</div>`
                              : ""
                          }
                        </div>
                      </div>
                    `,
                  )
                  .join("")
              : `
                  <div class="reading-empty-view" style="height:auto;min-height:100%">
                    <div class="reading-empty-icon">${icon("chat", { size: 24, color: TOKENS.read })}</div>
                    <div class="reading-empty-title">Reader chat이 아직 없습니다</div>
                    <div class="reading-empty-copy">질문을 보내면 본문 청크와 인용이 함께 저장됩니다.</div>
                  </div>
                `
          }
        </div>

        <form class="reading-chat-input" data-action="submit-reading-chat-form">
          <div class="reading-chat-chips">
            <span class="reading-chip">${icon("pdf", { size: 10, color: "currentColor" })}<span>${escapeHtml(sections[activeSectionIndex]?.label || "Current section")}</span></span>
            ${notes[0]?.quote ? `<span class="reading-chip">${icon("quote", { size: 10, color: "currentColor" })}<span>${escapeHtml(readingExcerpt(notes[0].quote, "note", 42))}</span></span>` : ""}
          </div>
          <div class="reading-chat-input-box">
            <textarea name="readingChatMessage" rows="2" placeholder="${parsed ? "논문에게 질문하기…" : "Parse paper 후 질문할 수 있습니다"}" ${!parsed || chatBusy ? "disabled" : ""}></textarea>
            <button type="submit" class="reading-chat-send" ${!parsed || chatBusy ? "disabled" : ""}>${icon("send", { size: 13, color: "#fff" })}</button>
          </div>
          <div class="reading-chat-footer">
            <span>${parsed ? "Context: lexical retrieval top-K chunks" : "Context unavailable until parse completes"}</span>
            <span class="mono">${chatBusy ? "running" : "reader-agent"}</span>
          </div>
        </form>
      </div>
    `;

    const notesBody = `
      <div class="reading-notes-wrap">
        <div class="reading-notes-toolbar">
          <span class="reading-mini-label">All notes</span>
          <button type="button" class="btn-s" style="padding:3px 8px;font-size:11.5px" data-action="create-reading-note" ${noteBusy ? "disabled" : ""}>${icon("plus", { size: 11, color: "currentColor" })}<span>New note</span></button>
          <button type="button" class="btn-s" style="padding:3px 8px;font-size:11.5px;margin-left:auto;color:${TOKENS.research}" data-action="select-stage" data-stage-id="research">${icon("flask", { size: 11, color: "currentColor" })}<span>Send to Research</span></button>
        </div>

        ${
          notes.length
            ? notes
                .map(
                  (note) => `
                    <article class="reading-note-card" data-reading-note-id="${escapeHtml(note.id)}">
                      <div class="reading-note-head">
                        ${renderTag(note.cat, note.color, true)}
                        <span class="reading-note-page mono">${note.page ? `p.${escapeHtml(String(note.page))}` : "page n/a"}</span>
                      </div>
                      <div class="reading-note-quote">"${escapeHtml(note.quote || note.text || "Quote 없음")}"</div>
                      <textarea class="reading-note-editor" name="readingNoteBody" rows="4" placeholder="메모를 입력하세요…" ${noteBusy ? "disabled" : ""}>${escapeHtml(note.memo || "")}</textarea>
                      <div class="reading-note-actions">
                        <button type="button" class="btn-ghost" style="padding:2px 6px;font-size:11px" data-action="save-reading-note" data-note-id="${escapeHtml(note.id)}" ${noteBusy ? "disabled" : ""}>${icon("pen", { size: 11, color: "currentColor" })}<span>Save</span></button>
                        <button type="button" class="btn-ghost" style="padding:2px 6px;font-size:11px" data-action="ask-ai-from-note" data-note-id="${escapeHtml(note.id)}" ${!parsed || chatBusy ? "disabled" : ""}>${icon("chat", { size: 11, color: "currentColor" })}<span>Ask AI</span></button>
                        <button type="button" class="btn-ghost" style="padding:2px 6px;font-size:11px;margin-left:auto;color:${TOKENS.result}" data-action="delete-reading-note" data-note-id="${escapeHtml(note.id)}" ${noteBusy ? "disabled" : ""}>${icon("x", { size: 11, color: "currentColor" })}<span>Delete</span></button>
                      </div>
                    </article>
                  `,
                )
                .join("")
            : `
                <div class="reading-empty-view" style="height:auto;min-height:100%">
                  <div class="reading-empty-icon">${icon("note", { size: 24, color: TOKENS.read })}</div>
                  <div class="reading-empty-title">노트가 아직 없습니다</div>
                  <div class="reading-empty-copy">${parsed ? "하이라이트 seed가 비어 있습니다. New note로 수동 메모를 추가할 수 있습니다." : "Parse paper 후 하이라이트 기반 노트 seed가 생성됩니다."}</div>
                </div>
              `
        }
      </div>
    `;

    return `
      <div
        class="reading-stage"
        data-ares-surface="reading-stage"
        data-ares-stage="reading"
        data-reading-orientation="${escapeHtml(state.readingOrientation)}"
      >
        <div class="reading-metabar">
          <div class="reading-metabar-copy">
            <div class="reading-metabar-title">${escapeHtml(session?.title || "Untitled paper")}</div>
            <div class="reading-metabar-byline">
              <span>${escapeHtml(formatAuthors(session?.authors || []))}</span>
              <span style="color:${TOKENS.t4}">·</span>
              ${renderTag(session?.venue || "Unknown venue")}
              ${renderTag(parseStatusLabel, parseStatusColor, session?.parseStatus === "done")}
              ${summarized ? renderTag("Summary ready", TOKENS.read, true) : ""}
              ${session?.summaryError ? renderTag("Summary error", TOKENS.result, true) : ""}
            </div>
          </div>

          <div class="reading-metabar-actions">
            <button type="button" class="${parsed ? "btn-s" : "btn-p"}" data-action="reading-parse-session" ${parseBusy ? "disabled" : ""}>
              ${icon(parsed ? "check" : "sparkles", { size: 13, color: parsed ? "currentColor" : "#fff" })}
              <span>${parseBusy ? "Parsing..." : parsed ? "Re-parse" : "Parse paper"}</span>
            </button>
            <button type="button" class="btn-s" data-action="reading-summarize-session" ${!parsed || summarizeBusy ? "disabled" : ""}>
              ${icon("sparkles", { size: 13, color: TOKENS.read })}
              <span>${summarizeBusy ? "Summarizing..." : summarized ? "Re-summarize" : "Summarize"}</span>
            </button>
            <button type="button" class="btn-s" data-action="reading-extract-assets" ${!parsed || extractBusy ? "disabled" : ""}>
              ${icon("grid", { size: 13, color: "currentColor" })}
              <span>${extractBusy ? "Extracting..." : "Extract"}</span>
            </button>
            <button type="button" class="btn-ghost" aria-label="Open reading context menu">
              ${icon("moreH", { size: 14, color: "currentColor" })}
            </button>
          </div>
        </div>

        <div class="reading-shell-main">
          <div class="reading-icon-rail">
            ${[
              { id: "overview", iconName: "layers", label: "Overview" },
              { id: "library", iconName: "book", label: "Library", count: sessions.length },
              { id: "outline", iconName: "list", label: "Outline" },
              { id: "highlight", iconName: "highlight", label: "Notes", count: notes.length },
            ]
              .map(
                (entry, index) => `
                  <button
                    type="button"
                    class="reading-rail-btn ${state.readingRailOpen === entry.id ? "is-active" : ""}"
                    data-action="set-reading-rail"
                    data-reading-rail="${escapeHtml(entry.id)}"
                    title="${escapeHtml(entry.label)}"
                  >
                    ${icon(entry.iconName, { size: 16, color: "currentColor" })}
                    <span class="lbl">${escapeHtml(entry.label)}</span>
                    ${entry.count ? `<span class="badge mono">${entry.count}</span>` : ""}
                  </button>
                  ${index === 0 ? '<div class="reading-rail-divider"></div>' : ""}
                `,
              )
              .join("")}
            <div class="reading-rail-spacer"></div>
            <button
              type="button"
              class="reading-rail-btn ${state.readingWorkbenchCollapsed ? "is-active" : ""}"
              data-action="toggle-reading-workbench-collapse"
              title="${state.readingWorkbenchCollapsed ? "Show workbench" : "Hide workbench"}"
            >
              ${icon("sidebar", {
                size: 16,
                color: "currentColor",
                className: state.readingWorkbenchCollapsed ? "" : "reading-sidebar-flip",
              })}
              <span class="lbl reading-small-label">${state.readingWorkbenchCollapsed ? "show" : "hide"}</span>
            </button>
          </div>

          ${floatPanel}

          <div class="reading-split ${state.readingOrientation === "vertical" ? "is-vertical" : ""}">
            <section class="reading-pane reading-doc-pane" style="${docPaneStyle}">
              <div class="pane-hdr">
                <button
                  type="button"
                  class="pane-tab ${state.readingDocumentTab === "summary" ? "active" : ""}"
                  data-action="set-reading-document-tab"
                  data-reading-document-tab="summary"
                >
                  ${icon("sparkles", { size: 13, color: state.readingDocumentTab === "summary" ? TOKENS.read : TOKENS.t3 })}
                  <span>Summary</span>
                  ${summarized ? '<span class="reading-pane-dot"></span>' : ""}
                </button>
                <button
                  type="button"
                  class="pane-tab ${state.readingDocumentTab === "pdf" ? "active" : ""}"
                  data-action="set-reading-document-tab"
                  data-reading-document-tab="pdf"
                >
                  ${icon("pdf", { size: 13, color: state.readingDocumentTab === "pdf" ? TOKENS.tx : TOKENS.t3 })}
                  <span>PDF Document</span>
                  <span class="reading-pane-meta mono">${escapeHtml(String(session?.pageCount || "PDF"))}</span>
                </button>
                <button
                  type="button"
                  class="pane-tab ${state.readingDocumentTab === "assets" ? "active" : ""}"
                  data-action="set-reading-document-tab"
                  data-reading-document-tab="assets"
                >
                  ${icon("grid", { size: 13, color: state.readingDocumentTab === "assets" ? TOKENS.tx : TOKENS.t3 })}
                  <span>Assets</span>
                  <span class="reading-pane-meta mono">${assets.length}</span>
                </button>

                <div class="pane-actions">
                  <div class="reading-orient-group" title="Pane orientation">
                    <button
                      type="button"
                      class="reading-orient-btn ${state.readingOrientation === "horizontal" ? "is-on" : ""}"
                      data-action="set-reading-orientation"
                      data-reading-orientation="horizontal"
                      title="Side by side"
                    >
                      ${icon("columns", { size: 13, color: "currentColor" })}
                    </button>
                    <button
                      type="button"
                      class="reading-orient-btn ${state.readingOrientation === "vertical" ? "is-on" : ""}"
                      data-action="set-reading-orientation"
                      data-reading-orientation="vertical"
                      title="Stacked"
                    >
                      ${icon("rows", { size: 13, color: "currentColor" })}
                    </button>
                  </div>
                </div>
              </div>

              <div class="pane-body">
                ${state.readingDocumentTab === "pdf" ? pdfBody : state.readingDocumentTab === "assets" ? assetsBody : summaryBody}
              </div>
            </section>

            ${
              state.readingWorkbenchCollapsed
                ? ""
                : `
                    <div
                      class="reading-resize-handle ${state.readingOrientation === "vertical" ? "is-vertical" : "is-horizontal"}"
                      data-action="start-reading-resize"
                      data-reading-resize-axis="${escapeHtml(state.readingOrientation)}"
                    ></div>

                    <section class="reading-pane reading-workbench-pane" style="${wbPaneStyle}">
                      <div class="pane-hdr">
                        ${[
                          ["chat", "Chat", "chat", messages.length],
                          ["notes", "Notes", "note", notes.length],
                        ]
                          .map(
                            ([id, label, iconName, count]) => `
                              <button
                                type="button"
                                class="pane-tab ${state.readingWorkbenchTab === id ? "active" : ""}"
                                data-action="set-reading-workbench-tab"
                                data-reading-workbench-tab="${id}"
                              >
                                ${icon(iconName, {
                                  size: 13,
                                  color: state.readingWorkbenchTab === id ? TOKENS.tx : TOKENS.t3,
                                })}
                                <span>${label}</span>
                                <span class="reading-pane-meta mono">${count}</span>
                              </button>
                            `,
                          )
                          .join("")}

                        <div class="pane-actions">
                          <button type="button" class="pane-icon-btn" data-action="toggle-reading-workbench-collapse">
                            ${icon("chevR", { size: 13, color: "currentColor" })}
                          </button>
                        </div>
                      </div>

                      <div class="pane-body">
                        ${state.readingWorkbenchTab === "chat" ? chatBody : notesBody}
                      </div>
                    </section>
                  `
            }
          </div>

          ${
            state.readingWorkbenchCollapsed
              ? `
                  <div class="reading-wb-strip">
                    ${[
                      ["chat", "chat", messages.length],
                      ["notes", "note", notes.length],
                    ]
                      .map(
                        ([id, iconName, count]) => `
                          <button type="button" class="reading-rail-btn" data-action="open-reading-workbench" data-reading-workbench-tab="${id}">
                            ${icon(iconName, { size: 15, color: "currentColor" })}
                            ${count ? `<span class="badge mono">${count}</span>` : ""}
                          </button>
                        `,
                      )
                      .join("")}
                    <div class="reading-rail-spacer"></div>
                    <button type="button" class="reading-rail-btn" data-action="toggle-reading-workbench-collapse">
                      ${icon("chevL", { size: 15, color: "currentColor" })}
                    </button>
                  </div>
                `
              : ""
          }
        </div>
      </div>
    `;
  }
  
  function renderReadingStage(project) {
    const hasDetailSession = effectiveReadingSessions(project).length > 0;
    if (state.readingView === "detail" && hasDetailSession) {
      return renderReadingDetailStage(project);
    }
  
    return renderReadingHomeStage(project);
  }

  return {
    renderReadingStage,
  };
}
