import { createReadingViewHelpers } from "./reading-view-helpers.js";

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
  maxReadingPdfUploadLabel = "100MB",
}) {
  const {
    clampValue,
    readingCategoryMeta,
    readingExcerpt,
    readingMatchSectionIndex,
    readingSectionPage,
    readingSentence,
    readingText,
  } = createReadingViewHelpers({ TOKENS });

  function readingProgress(session) {
    const sections = Array.isArray(session?.sections) ? session.sections : [];
    if (session?.summaryStatus === "done" && session?.summaryRuntimeUsed) {
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
  
  function readingSelectionLineCount(selection) {
    const explicit = Number(selection?.lineCount);
    if (Number.isFinite(explicit) && explicit > 0) {
      return Math.max(1, Math.round(explicit));
    }

    const text = String(selection?.quote || "").trim();
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

  function readingPdfSearchResults(session, query) {
    const needle = readingText(query).toLowerCase();
    if (!needle || needle.length < 2) {
      return [];
    }

    const sections = Array.isArray(session?.sections) ? session.sections : [];
    const notes = Array.isArray(session?.notes) ? session.notes : [];
    const highlights = Array.isArray(session?.highlights) ? session.highlights : [];
    const sources = [
      ...sections.map((section, index) => ({
        label: section.label || `Section ${index + 1}`,
        page: section.pageStart || section.page || readingSectionPage(index),
        text: [section.label, section.summary].filter(Boolean).join(" "),
        type: "section",
      })),
      ...notes.map((note, index) => ({
        label: note.cat || note.section || `Note ${index + 1}`,
        page: note.page || readingSectionPage(index),
        text: [note.quote, note.memo, note.text, note.body].filter(Boolean).join(" "),
        type: "note",
      })),
      ...highlights.map((highlight, index) => ({
        label: highlight.cat || highlight.section || `Highlight ${index + 1}`,
        page: highlight.page || readingSectionPage(index),
        text: [highlight.quote, highlight.text, highlight.body].filter(Boolean).join(" "),
        type: "highlight",
      })),
      {
        label: "Paper",
        page: 1,
        text: [session?.title, session?.abstract, session?.summary].filter(Boolean).join(" "),
        type: "paper",
      },
    ];

    return sources
      .map((source) => {
        const text = readingText(source.text);
        const haystack = text.toLowerCase();
        const matchIndex = haystack.indexOf(needle);
        if (matchIndex < 0) {
          return null;
        }

        const start = Math.max(0, matchIndex - 42);
        const snippet = text.slice(start, matchIndex + needle.length + 78);
        return {
          ...source,
          page: Math.max(1, Number(source.page) || 1),
          snippet: readingExcerpt(snippet, text, 132),
        };
      })
      .filter(Boolean)
      .slice(0, 8);
  }

  function isGeneratedReadingNote(note) {
    const origin = readingText(note?.origin).toLowerCase();
    if (origin !== "highlight") {
      return false;
    }

    return Boolean(
      readingText(note?.seedMethod) ||
        readingText(note?.sourceHighlightId) ||
        /^note-seed-\d+$/i.test(readingText(note?.id)),
    );
  }

  function renderReadingMessageSelectionContext(message) {
    if (message?.role !== "user" || !message?.selection?.quote) {
      return "";
    }

    const lineCount = readingSelectionLineCount(message.selection);
    const selectedLineLabel = `${lineCount || 1} ${lineCount === 1 ? "line" : "lines"} selected`;
    const pageLabel = message.selection.page ? `p.${message.selection.page}` : "p.?";

    return `
      <div class="reading-chat-message-context">
        <div class="reading-chat-selection-status is-message-context">
          <div class="reading-chat-selection-main">
            ${icon("quote", { size: 12, color: "currentColor" })}
            <span>${escapeHtml(selectedLineLabel)}</span>
            <span class="reading-chat-selection-page mono">${escapeHtml(pageLabel)}</span>
          </div>
          <div class="reading-chat-selection-preview">"${escapeHtml(readingExcerpt(message.selection.quote, "selected text", 110))}"</div>
        </div>
      </div>
    `;
  }
  
  function readingRequestActive(kind, sessionId) {
    return state.readingRequest?.kind === kind && state.readingRequest?.sessionId === sessionId;
  }

  function readingIsParsed(session) {
    return Boolean(session && session.parseStatus === "done");
  }
  
  function readingIsSummarized(session) {
    return Boolean(session && session.summaryStatus === "done" && session.summaryRuntimeUsed);
  }

  function readingSummaryFailed(session) {
    return Boolean(session && (session.summaryStatus === "error" || session.summaryGeneratedBy === "fallback"));
  }

  function renderReadingProvenancePill(source, kind = "summary") {
    const generatedBy = source?.generatedBy || source?.summaryGeneratedBy || "";
    if (!generatedBy) {
      return "";
    }

    const kindClass = kind === "section" ? "is-section" : kind === "chat" ? "is-chat" : "is-summary";
    const label =
      generatedBy === "fallback"
        ? "Needs review"
        : generatedBy === "external-ocr"
          ? "Imported text"
          : generatedBy === "built-in-ocr"
            ? "PDF text"
            : kind === "chat"
              ? "Paper-based answer"
              : "Generated summary";
    return `
      <div class="reading-provenance-pill ${escapeHtml(kindClass)}">
        <span>${escapeHtml(label)}</span>
      </div>
    `;
  }

  function readingConfidenceLabel(value) {
    const confidence = readingText(value, "none").toLowerCase();
    if (confidence === "high") {
      return "Strong evidence";
    }
    if (confidence === "medium") {
      return "Some evidence";
    }
    if (confidence === "low") {
      return "Weak evidence";
    }
    return "No evidence";
  }

  function renderReadingRetrievalPill(message) {
    const retrieval = message?.retrieval;
    if (!retrieval?.mode) {
      return "";
    }

    const label = retrieval.lowConfidence ? "Weak evidence" : "Evidence checked";
    return `
      <div class="reading-retrieval-pill ${retrieval.lowConfidence ? "is-low" : ""}">
        <span>${escapeHtml(label)}</span>
        <span>${escapeHtml(readingConfidenceLabel(retrieval.confidence))}</span>
      </div>
    `;
  }

  function renderReadingEvidenceCoverage(session) {
    const coverage = session?.evidenceCoverage;
    if (!coverage) {
      return "";
    }

    const rows = [
      ["Evidence search", coverage.retrievalReady ? "Ready" : "Not ready"],
      ["Text passages", coverage.chunkCount || 0],
      ["Sections", coverage.sectionCount || 0],
      ["Figures and tables", coverage.assetCount || 0],
      ["Located in source", coverage.sourceBoundedAssetCount || 0],
      ["Latest answer", readingConfidenceLabel(coverage.lastRetrievalConfidence)],
      ["Cited answers", coverage.citedChatCount || 0],
      ["OCR pages", coverage.ocrPageCount || 0],
      ["OCR time", Number.isFinite(Number(coverage.ocrDurationMs)) ? `${coverage.ocrDurationMs}ms` : "Not recorded"],
    ];

    return `
      <section class="reading-summary-block reading-evidence-coverage">
        <div class="reading-summary-label">${icon("quote", { size: 11, color: TOKENS.read })}<span>Evidence status</span></div>
        <div class="reading-evidence-coverage-grid">
          ${rows
            .map(
              ([label, value]) => `
                <div class="reading-evidence-coverage-item">
                  <span>${escapeHtml(label)}</span>
                  <strong class="mono">${escapeHtml(String(value))}</strong>
                </div>
              `,
            )
            .join("")}
        </div>
      </section>
    `;
  }

  function readingUnsupportedMeta(session) {
    const error = String(session?.parseError || "").trim();
    if (!session?.pdfUrl) {
      return {
        copy: "Attach a PDF or open the source link to keep reading.",
        title: "PDF needed",
      };
    }

    if (/text layer|ocr|scanned/i.test(error)) {
      return {
        copy: "The paper text is not readable yet. Paste extracted text to continue.",
        title: "More text needed",
      };
    }

    if (/download|failed to download|load failed|status/i.test(error)) {
      return {
        copy: "The PDF could not be loaded. Check the source link or try again.",
        title: "PDF could not load",
      };
    }

    return {
      copy: "The paper text is not ready. Check the source or try again.",
      title: "Paper text is not ready",
    };
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
      fullSummary: readingText(cards.fullSummary || ""),
      keyPoints,
      limit: readingExcerpt(cards.limit || limitSection?.summary || session?.warning, "한계점과 주의사항은 추가 요약 후 표시됩니다.", 220),
      method: readingExcerpt(cards.method || methodSection?.summary || session?.abstract, "No method summary.", 220),
      result: readingExcerpt(cards.result || resultSection?.summary || session?.summary, "주요 결과는 요약이 완료되면 표시됩니다.", 220),
      sectionSummaries: Array.isArray(cards.sectionSummaries) ? cards.sectionSummaries : [],
      tldr: readingExcerpt(cards.tldr || session?.summary || session?.abstract, "No summary.", 260),
    };
  }

  function renderReadingInlineMarkdown(value) {
    return escapeHtml(value).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  }

  function renderReadingFullSummary(value) {
    const text = readingText(value);
    if (!text) {
      return "";
    }

    const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
    return `
      <section class="reading-summary-block reading-full-summary">
        <div class="reading-summary-label" style="color:${TOKENS.read}">${icon("sparkles", { size: 11, color: TOKENS.read })}<span>Paper summary</span></div>
        <div class="reading-full-summary-body">
          ${blocks
            .map((block) => {
              const lines = block.split(/\n/).map((line) => line.trim()).filter(Boolean);
              if (lines.every((line) => /^[-*]\s+/.test(line))) {
                return `<ul>${lines.map((line) => `<li>${renderReadingInlineMarkdown(line.replace(/^[-*]\s+/, ""))}</li>`).join("")}</ul>`;
              }
              const heading = block.match(/^#{1,3}\s+(.+)$/);
              if (heading) {
                return `<h3>${renderReadingInlineMarkdown(heading[1])}</h3>`;
              }
              return `<p>${lines.map((line) => renderReadingInlineMarkdown(line)).join("<br>")}</p>`;
            })
            .join("")}
        </div>
      </section>
    `;
  }
  
  function deriveReadingNotes(session) {
    const notes = Array.isArray(session?.notes) ? session.notes : [];
    const sections = Array.isArray(session?.sections) ? session.sections : [];
    const cards = [];
  
    notes.filter((note) => !isGeneratedReadingNote(note)).forEach((note, index) => {
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

    return cards;
  }
  
  function deriveReadingMessages(session) {
    const persistedMessages = Array.isArray(session?.chatMessages) ? session.chatMessages : [];
    const optimisticMessages = (Array.isArray(state.readingOptimisticChatMessages) ? state.readingOptimisticChatMessages : []).filter(
      (message) => message.sessionId === session?.id,
    );

    return [...persistedMessages, ...optimisticMessages].map((message) => ({
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

  function readingAssetKindLabel(asset) {
    return asset?.kind === "Table" ? "Table" : "Figure";
  }
  
  function renderReadingAssetThumb(asset, session = null) {
    const kindLabel = readingAssetKindLabel(asset);
    if (asset.thumbPath && session?.id && asset.id) {
      const src = `api/reading-sessions/${encodeURIComponent(session.id)}/assets/${encodeURIComponent(asset.id)}/file?kind=thumb`;
      return `
        <img
          class="reading-asset-thumb-image"
          src="${escapeHtml(src)}"
          alt="${escapeHtml(asset.caption || `${kindLabel} ${asset.number || ""}`)}"
          loading="lazy"
        />
      `;
    }

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

  function renderReadingAssetSourceMap(asset) {
    const bounds = asset?.sourceBounds;
    if (!bounds || bounds.unit !== "page-ratio") {
      return "";
    }

    const pct = (value) => `${Math.round(clampValue(Number(value) || 0, 0, 1) * 1000) / 10}%`;
    return `
      <div class="reading-asset-source-map" aria-label="Source region">
        <div class="reading-asset-source-page">
          <span
            class="reading-asset-source-box"
            style="left:${pct(bounds.x)};top:${pct(bounds.y)};width:${pct(bounds.width)};height:${pct(bounds.height)}"
          ></span>
        </div>
        <div class="reading-asset-source-caption">
          <span>Source region</span>
          <strong class="mono">p.${escapeHtml(String(bounds.page || asset.page || "?"))}</strong>
        </div>
      </div>
    `;
  }

  function renderReadingAssetQuality(asset) {
    const quality = asset?.quality && typeof asset.quality === "object" ? asset.quality : null;
    if (!quality?.status) {
      return "";
    }

    const qualityLabels = {
      partial: "Partially checked",
      "source-backed": "Source checked",
      synthetic: "Preview",
    };
    const label = qualityLabels[String(quality.status)] || "Needs review";
    const score = Number(quality.score);
    const scoreLabel = Number.isFinite(score) && score > 0 ? `${Math.round(score * 100)}%` : "";

    return `
      <span class="reading-asset-quality is-${escapeHtml(String(quality.status).replace(/[^a-z0-9-]/gi, "").toLowerCase())}">
        <span>${escapeHtml(label)}</span>
        ${scoreLabel ? `<strong class="mono">${escapeHtml(scoreLabel)}</strong>` : ""}
      </span>
    `;
  }
  
  function renderReadingHomeMetricDiagram(diagram, counts = {}) {
    const dataset = [
      Number(counts.saved) || 0,
      Number(counts.ready) || 0,
      Number(counts.running) || 0,
      Number(counts.done) || 0,
    ];
    const maxValue = Math.max(...dataset, 1);
    const pct = (value, min = 0) => `${Math.round(clampValue((value / maxValue) * 100, min, 100))}%`;

    if (diagram === "saved") {
      const points = dataset.map((value, index) => {
        const x = 2 + index * 28;
        const y = 34 - clampValue((value / maxValue) * 25, 1, 25);
        return `${x} ${Math.round(y)}`;
      });
      const line = `M${points.join("L")}`;
      const fill = `${line}L86 34L2 34Z`;
      return `
        <svg class="reading-home-metric-svg" viewBox="0 0 88 42" preserveAspectRatio="none" aria-hidden="true">
          <path class="reading-home-metric-axis" d="M2 34H86"></path>
          <path class="reading-home-metric-fill" d="${fill}"></path>
          <path class="reading-home-metric-line" d="${line}"></path>
        </svg>
      `;
    }

    if (diagram === "ready") {
      return `
        <div class="reading-home-band-stack" aria-hidden="true">
          <span class="reading-home-band"><i style="width:${pct(counts.ready, 8)}"></i></span>
          <span class="reading-home-band"><i style="width:${pct(counts.running, 8)};opacity:0.82"></i></span>
          <span class="reading-home-band"><i style="width:${pct(counts.done, 8)};opacity:0.68"></i></span>
        </div>
      `;
    }

    if (diagram === "running") {
      const bars = [
        counts.ready,
        counts.running,
        counts.done,
        counts.saved,
        counts.running + counts.done,
        counts.ready + counts.running,
      ].map((value) => Math.round(clampValue(((Number(value) || 0) / maxValue) * 30, 6, 30)));
      return `
        <div class="reading-home-bars" aria-hidden="true">
          ${bars
            .map((height, index) => `<span class="reading-home-bar ${index >= 2 ? "is-active" : ""}" style="height:${height}px"></span>`)
            .join("")}
        </div>
      `;
    }

    const activeDots = Math.round(clampValue(((Number(counts.done) || 0) / maxValue) * 12, counts.done ? 1 : 0, 12));
    return `
      <div class="reading-home-dot-grid" aria-hidden="true">
        ${Array.from({ length: 12 }, (_, index) => `<span class="reading-home-dot ${index < activeDots ? "is-active" : ""}"></span>`).join("")}
      </div>
    `;
  }

  function renderReadingHomeMetricCard({ iconName, label, value, diagram, counts }) {
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
          ${renderReadingHomeMetricDiagram(diagram, counts)}
        </div>
      </article>
    `;
  }
  
  function renderReadingHomeStatusPill(item) {
    return `
      <span class="reading-home-status-pill is-${escapeHtml(item.status.bucket)}" style="background:color-mix(in srgb, ${item.status.color} 8%, transparent);border-color:color-mix(in srgb, ${item.status.color} 22%, transparent);color:${item.status.color}">
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
                    <button
                      type="button"
                      class="reading-home-preview-icon"
                      data-action="open-reading-home-source"
                      data-reading-paper-id="${escapeHtml(item.paperId)}"
                      aria-label="Open source"
                      title="Open source"
                      ${item.paper?.paperUrl || item.paper?.url || item.paper?.pdfUrl || item.session?.paperUrl || item.session?.pdfUrl ? "" : "disabled"}
                    >${icon("ext", { size: 14, color: TOKENS.t3 })}</button>
                    <button
                      type="button"
                      class="reading-home-preview-icon reading-context-trigger"
                      data-action="toggle-reading-home-preview-menu"
                      data-reading-paper-id="${escapeHtml(item.paperId)}"
                      aria-label="More preview actions"
                      aria-expanded="${state.readingHomePreviewMenuOpen ? "true" : "false"}"
                      title="More actions"
                    >${icon("moreH", { size: 14, color: TOKENS.t3 })}</button>
                    ${
                      state.readingHomePreviewMenuOpen
                        ? `
                            <div class="reading-context-menu" role="menu" aria-label="Paper actions">
                              <button type="button" class="reading-context-menu-item" data-action="open-reading-detail" data-reading-paper-id="${escapeHtml(item.paperId)}" role="menuitem">
                                ${icon(actionMeta.primaryIcon, { size: 13, color: "currentColor" })}
                                <span>${escapeHtml(actionMeta.primaryLabel)}</span>
                              </button>
                              <button type="button" class="reading-context-menu-item" data-action="open-reading-home-source" data-reading-paper-id="${escapeHtml(item.paperId)}" role="menuitem">
                                ${icon("ext", { size: 13, color: "currentColor" })}
                                <span>Open source</span>
                              </button>
                              <button type="button" class="reading-context-menu-item" data-action="copy-reading-home-paper-link" data-reading-paper-id="${escapeHtml(item.paperId)}" role="menuitem">
                                ${icon("share", { size: 13, color: "currentColor" })}
                                <span>Copy paper link</span>
                              </button>
                            </div>
                          `
                        : ""
                    }
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
          <div class="reading-home-preview-cta">
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
            <button
              type="button"
              class="btn-s"
              data-action="copy-reading-home-paper-link"
              data-reading-paper-id="${escapeHtml(item.paperId)}"
            >
              ${icon("share", { size: 13, color: "currentColor" })}
              <span>Copy link</span>
            </button>
          </div>
  
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
        </div>
      </aside>
    `;
  }

  function renderReadingUploadModal() {
    const fileName = state.readingUploadModalFileName || "";
    const fileSize = state.readingUploadModalFileSizeLabel || "";
    const open = state.readingUploadModalOpen;
    const busy = state.readingUploading;

    return `
      <div class="reading-upload-modal-overlay ${open ? "is-open" : ""}" aria-hidden="${open ? "false" : "true"}">
        <button type="button" class="reading-upload-modal-backdrop" data-action="close-reading-upload-modal" aria-label="Close PDF upload"></button>
        <div class="reading-upload-modal-panel">
          <section
            class="reading-upload-modal-surface"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reading-upload-modal-title"
            aria-describedby="reading-upload-modal-copy"
          >
            <div class="reading-upload-modal-head">
              <div>
                <div class="reading-upload-modal-kicker">Local PDF</div>
                <h2 id="reading-upload-modal-title" class="reading-upload-modal-title">Upload PDF</h2>
              </div>
              <button type="button" class="reading-upload-modal-close" data-action="close-reading-upload-modal" aria-label="Close PDF upload">
                ${icon("x", { size: 14, color: "currentColor" })}
              </button>
            </div>

            <label class="reading-upload-select ${fileName ? "has-file" : ""}">
              <input
                class="reading-upload-modal-input"
                type="file"
                name="readingPdfUploadModal"
                accept="application/pdf,.pdf"
                ${busy ? "disabled" : ""}
              />
              <span class="reading-upload-select-icon">${icon("pdf", { size: 18, color: "currentColor" })}</span>
              <span class="reading-upload-select-copy">
                <span class="reading-upload-select-title">${escapeHtml(fileName || "Choose PDF")}</span>
                <span id="reading-upload-modal-copy" class="reading-upload-select-meta">
                  ${escapeHtml(fileName ? [fileSize, "PDF"].filter(Boolean).join(" · ") : `PDF only · max ${maxReadingPdfUploadLabel}`)}
                </span>
              </span>
            </label>

            ${open && state.error ? `<div class="reading-upload-modal-error" role="alert">${escapeHtml(state.error)}</div>` : ""}

            <div class="reading-upload-modal-actions">
              <button type="button" class="btn-s" data-action="close-reading-upload-modal" ${busy ? "disabled" : ""}>Cancel</button>
              <button type="button" class="btn-p" data-action="submit-reading-upload-modal" ${!fileName || busy ? "disabled" : ""}>
                ${icon("pdf", { size: 13, color: "#ffffff" })}
                <span>${busy ? "Analyzing" : "Upload PDF"}</span>
              </button>
            </div>
          </section>
        </div>
      </div>
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
                <div class="reading-home-label">${icon("book", { size: 14, color: TOKENS.read })}<span>Read</span></div>
                <h1 class="reading-home-title">Reading Library</h1>
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
                <div class="reading-home-label">${icon("book", { size: 14, color: TOKENS.read })}<span>Read</span></div>
                <h1 class="reading-home-title">Reading Library</h1>
                <p class="reading-home-copy">Saved papers and reading sessions.</p>
              </section>
  
              <section class="reading-home-metrics">
                ${renderReadingHomeMetricCard({ iconName: "bookmark", label: "Saved", value: 0, diagram: "saved", counts })}
                ${renderReadingHomeMetricCard({ iconName: "sparkles", label: "Ready", value: 0, diagram: "ready", counts })}
                ${renderReadingHomeMetricCard({ iconName: "clock", label: "In progress", value: 0, diagram: "running", counts })}
                ${renderReadingHomeMetricCard({ iconName: "check", label: "Completed", value: 0, diagram: "done", counts })}
              </section>
  
              <section class="reading-home-empty">
                <div class="reading-home-empty-icon">${icon("bookmark", { size: 28, color: TOKENS.read })}</div>
                <div class="reading-home-empty-title">Nothing saved yet</div>
                  <div class="reading-home-empty-copy">No saved papers.</div>
                <div class="reading-home-empty-actions">
                  <button
                    type="button"
                    class="btn-p"
                    data-action="open-reading-upload-modal"
                    aria-haspopup="dialog"
                    aria-expanded="${state.readingUploadModalOpen ? "true" : "false"}"
                    ${state.readingUploading ? "disabled" : ""}
                  >
                    ${icon("pdf", { size: 13, color: "#ffffff" })}
                    <span>${state.readingUploading ? "Analyzing" : "Upload PDF"}</span>
                  </button>
                  <button type="button" class="btn-s" data-action="select-stage" data-stage-id="search">
                    ${icon("search", { size: 13, color: "currentColor" })}
                    <span>Back to Discover</span>
                  </button>
                </div>
              </section>
            </div>
          </section>
          ${renderReadingUploadModal()}
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
              <div class="reading-home-label">${icon("book", { size: 14, color: TOKENS.read })}<span>Read</span></div>
              <h1 class="reading-home-title">Reading Library</h1>
              <p class="reading-home-copy">Saved papers and reading sessions.</p>
            </section>
  
            <section class="reading-home-metrics">
              ${renderReadingHomeMetricCard({ iconName: "bookmark", label: "Saved", value: counts.saved, diagram: "saved", counts })}
              ${renderReadingHomeMetricCard({ iconName: "sparkles", label: "Ready", value: counts.ready, diagram: "ready", counts })}
              ${renderReadingHomeMetricCard({ iconName: "clock", label: "In progress", value: counts.running, diagram: "running", counts })}
              ${renderReadingHomeMetricCard({ iconName: "check", label: "Completed", value: counts.done, diagram: "done", counts })}
            </section>
  
            <section
              class="reading-home-content ${layout === "desktop" && selected ? "is-resizable" : ""}"
              style="${layout === "desktop" && selected ? `--reading-home-preview-w:${state.readingHomePreviewWidth}px` : ""}"
            >
              <article
                class="reading-home-panel reading-home-dropzone ${state.readingPdfDropActive ? "is-dragging" : ""}"
                data-reading-pdf-dropzone="true"
              >
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
                    <button
                      type="button"
                      class="reading-home-tool-btn reading-home-upload-btn ${state.readingUploading ? "is-busy" : ""}"
                      data-action="open-reading-upload-modal"
                      aria-haspopup="dialog"
                      aria-expanded="${state.readingUploadModalOpen ? "true" : "false"}"
                      ${state.readingUploading ? "disabled" : ""}
                    >
                      ${icon("pdf", { size: 12, color: "currentColor" })}
                      <span>${state.readingUploading ? "Analyzing" : "Upload PDF"}</span>
                    </button>
                    <button type="button" class="reading-home-tool-btn">
                      ${icon("filter", { size: 12, color: "currentColor" })}
                      <span>Filter</span>
                    </button>
                    <button type="button" class="reading-home-tool-btn">
                      <span>Sort: Saved newest</span>
                      ${icon("chevD", { size: 12, color: TOKENS.t3 })}
                    </button>
                  </div>
                  <div class="reading-home-drop-hint">
                    ${icon("pdf", { size: 12, color: "currentColor" })}
                    <span>${state.readingPdfDropActive ? "Drop PDF to upload" : "Drag PDF here"}</span>
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
                            <div class="reading-home-empty-copy">No papers in this filter.</div>
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
        ${renderReadingUploadModal()}
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
            <h1 class="placeholder-title">Loading reading session</h1>
            <p class="placeholder-copy">Syncing PDF status.</p>
          </section>
        </div>
      `;
    }

    if (!sessions.length) {
      return `
        <div class="reading-stage" data-ares-surface="reading-stage" data-ares-stage="reading">
          <section class="reading-empty">
            <div class="placeholder-eyebrow">Reading</div>
            <h1 class="placeholder-title">No reading session</h1>
            <p class="placeholder-copy">Open a saved paper to start.</p>
            <div class="tag-row" style="margin-top:16px">
              ${renderTag(`${project.libraryCount} saved`, TOKENS.search, true)}
              ${renderTag(`${project.queueCount} queued`, TOKENS.result, true)}
            </div>
            <div style="margin-top:20px">
              <button type="button" class="btn-p" data-action="select-stage" data-stage-id="search">Back to Discover</button>
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
    const summaryFailed = readingSummaryFailed(session);
    const split = state.readingOrientation === "vertical" ? state.readingSplitVertical : state.readingSplitHorizontal;
    const activeSectionIndex = readingActiveSectionIndex(sections);
    const docPaneStyle = state.readingWorkbenchCollapsed ? "flex:1 1 auto" : `flex:0 0 calc(${split}% - 2.5px)`;
    const wbPaneStyle = `flex:0 0 calc(${100 - split}% - 2.5px)`;
    const progress = readingProgress(session);
    const parseBusy = readingRequestActive("parse", session?.id);
    const textImportBusy = readingRequestActive("importText", session?.id);
    const summarizeBusy = readingRequestActive("summarize", session?.id);
    const extractBusy = readingRequestActive("extract", session?.id);
    const analyzeBusy =
      readingRequestActive("analyze", session?.id) ||
      parseBusy ||
      summarizeBusy ||
      extractBusy ||
      session?.parseStatus === "running" ||
      session?.summaryStatus === "running";
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

    const readingOutlinePage = (entry, index) =>
      Math.max(1, Number(entry?.pageStart || entry?.page || readingSectionPage(index)) || 1);

    const renderOutlineItems = (items, { compact = false } = {}) => {
      if (!items.length) {
        return '<div class="reading-compact-empty">No parsed sections.</div>';
      }

      return items
        .map((entry, index) => {
          const active = index === activeSectionIndex;
          const page = readingOutlinePage(entry, index);
          return `
            <button
              type="button"
              class="reading-outline-item ${active ? "is-active" : ""}"
              data-action="jump-reading-page"
              data-reading-page="${escapeHtml(String(page))}"
            >
              <span class="reading-outline-icon">${statusIcon(entry.status || "done")}</span>
              <span>${escapeHtml(entry.label || `Section ${index + 1}`)}</span>
              ${compact ? "" : `<span class="reading-outline-progress mono">${escapeHtml(String(page).padStart(2, "0"))}</span>`}
            </button>
          `;
        })
        .join("");
    };

    const renderHighlightItems = (items) => {
      if (!items.length) {
        return '<div class="reading-compact-empty">No notes.</div>';
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
                                  <span class="reading-highlight-chip" style="background:color-mix(in srgb, ${entry.color} 8%, transparent);color:${entry.color};border-color:color-mix(in srgb, ${entry.color} 22%, transparent)">
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
              ${renderReadingProvenancePill(session, "summary")}
            </section>

            ${renderReadingFullSummary(summary.fullSummary)}

            ${renderReadingEvidenceCoverage(session)}

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
                                <button
                                  type="button"
                                  class="reading-section-jump"
                                  data-action="jump-reading-page"
                                  data-reading-page="${escapeHtml(String(entry.page || ""))}"
                                  ${entry.page ? "" : "disabled"}
                                >${escapeHtml(entry.label)}${entry.page ? ` · p.${escapeHtml(String(entry.page))}` : ""} · ${escapeHtml(entry.summary)}</button>
                              </li>
                            `,
                          )
                          .join("")}
                      </ul>
                      ${renderReadingProvenancePill(session, "section")}
                    </section>
                  `
                : ""
            }
          </div>
        `
      : summaryFailed
        ? `
          <div class="reading-empty-view">
            <div class="reading-empty-icon">${icon("sparkles", { size: 24, color: TOKENS.result })}</div>
            <div class="reading-empty-title">Summary unavailable</div>
            <div class="reading-empty-copy">
              ${
                session?.summaryGeneratedBy === "fallback"
                  ? "The saved summary was not reliable enough to show. Generate a new summary to continue."
                  : "The paper text was parsed, but the summary did not finish. Try again."
              }
            </div>
            <button type="button" class="btn-p" data-action="reading-analyze-session" ${analyzeBusy ? "disabled" : ""}>
              ${icon("sparkles", { size: 13, color: "#fff" })}
              <span>${analyzeBusy ? "Analyzing..." : "Run analysis"}</span>
            </button>
          </div>
        `
      : `
            <div class="reading-empty-view">
              <div class="reading-empty-icon">${icon("sparkles", { size: 24, color: TOKENS.read })}</div>
              <div class="reading-empty-title">No summary</div>
            <div class="reading-empty-copy">Run analysis to prepare the paper summary.</div>
              <button type="button" class="btn-p" data-action="reading-analyze-session" ${analyzeBusy ? "disabled" : ""}>
                ${icon("sparkles", { size: 13, color: "#fff" })}
                <span>${analyzeBusy ? "Analyzing..." : "Analyze paper"}</span>
            </button>
          </div>
        `;

    const unsupportedMeta = readingUnsupportedMeta(session);
    const hasRememberedPdfSelection = state.readingPdfSelection?.sessionId === session.id;
    const hasDockPdfSelection = Boolean(hasRememberedPdfSelection && state.readingPdfDockSelectionActive);
    const dockZoom = Number(state.readingPdfZoom) || 100;
    const dockPanel = state.readingPdfDockPanel || "";
    const activeDockPage = Number(state.readingPdfSelection?.page || state.readingPdfTargetPage || 1) || 1;
    const dockTocItems = (sections.length ? sections : [{ label: "Document", page: 1 }]).slice(0, 8);
    const pdfSearchQuery = readingText(state.readingPdfSearchQuery);
    const pdfSearchResults = readingPdfSearchResults(session, pdfSearchQuery);
    const dockPageCount = Math.max(1, Number(session?.pageCount) || 1);
    const dockPreviewWidths = [
      [90, 70, 100, 60, 85, 100, 75, 90, 55, 80],
      [100, 80, 65, 100, 90, 70, 100, 60, 75, 85],
      [80, 100, 60, 90, 75, 100],
      [100, 70, 85, 60, 100, 80],
    ];
    const dockPreviewLine = (width) => `<div class="pgl pgl-${width}"></div>`;
    const pdfDock = `
      <div class="reading-pdf-dock-layer dock-layer ${hasDockPdfSelection ? "has-selection" : ""}">
        <div class="sel-chip ${hasDockPdfSelection ? "visible" : ""}">
          <span class="sel-chip-icon">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2.5 4h11M2.5 8h8M2.5 12h5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </span>
          <span class="sel-chip-text">"${escapeHtml(readingExcerpt(state.readingPdfSelection?.quote || "", "selected text", 84))}"</span>
          <button type="button" class="sel-chip-dismiss" data-action="clear-reading-pdf-selection" title="선택 해제" aria-label="선택 해제">
            <svg width="8" height="8" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

        <div class="pdf-dock" role="toolbar" aria-label="PDF tools">
          <button
            type="button"
            class="dock-btn ${dockPanel === "toc" ? "on" : ""}"
            data-action="toggle-reading-pdf-dock-panel"
            data-reading-pdf-dock-panel="toc"
            title="목차"
            aria-label="목차"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2.5 4h11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
              <path d="M2.5 8h7.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
              <path d="M4.5 11.5h7.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
              <path d="M4.5 14h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
          </button>

          <div class="dock-div"></div>

          <button type="button" class="dock-btn" data-action="set-reading-pdf-zoom" data-reading-pdf-zoom-delta="-10" title="축소 (-)" aria-label="축소">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3.5 8h9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
            </svg>
          </button>

          <span class="zoom-val">${escapeHtml(String(dockZoom))}%</span>

          <button type="button" class="dock-btn" data-action="set-reading-pdf-zoom" data-reading-pdf-zoom-delta="10" title="확대 (+)" aria-label="확대">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
            </svg>
          </button>

          <div class="dock-div"></div>

          <button type="button" class="dock-btn ${dockZoom === 100 ? "on" : ""}" data-action="fit-reading-pdf-zoom" title="화면에 맞추기" aria-label="화면에 맞추기">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 5.5V3a1 1 0 011-1h2.5M11.5 2H13a1 1 0 011 1v2.5M14 10.5V13a1 1 0 01-1 1h-2.5M4.5 14H3a1 1 0 01-1-1v-2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>

          <div class="dock-div"></div>

          <button
            type="button"
            class="dock-btn ${dockPanel === "search" ? "on" : ""}"
            data-action="toggle-reading-pdf-dock-panel"
            data-reading-pdf-dock-panel="search"
            title="본문 검색"
            aria-label="본문 검색"
          >
            ${icon("search", { size: 13, color: "currentColor" })}
          </button>

          <div class="dock-div"></div>

          <button
            type="button"
            class="dock-btn ${dockPanel === "pageGrid" ? "on" : ""}"
            data-action="toggle-reading-pdf-dock-panel"
            data-reading-pdf-dock-panel="pageGrid"
            title="페이지 미리보기"
            aria-label="페이지 미리보기"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="1.5" y="1.5" width="4" height="5.5" rx="0.75" stroke="currentColor" stroke-width="1.2"/>
              <rect x="6.5" y="1.5" width="4" height="5.5" rx="0.75" stroke="currentColor" stroke-width="1.2"/>
              <rect x="11.5" y="1.5" width="3" height="5.5" rx="0.75" stroke="currentColor" stroke-width="1.2"/>
              <rect x="1.5" y="9" width="4" height="5.5" rx="0.75" stroke="currentColor" stroke-width="1.2"/>
              <rect x="6.5" y="9" width="4" height="5.5" rx="0.75" stroke="currentColor" stroke-width="1.2"/>
              <rect x="11.5" y="9" width="3" height="5.5" rx="0.75" stroke="currentColor" stroke-width="1.2"/>
            </svg>
          </button>

          <div class="dock-sel-group">
            <div class="dock-div"></div>

            <button type="button" class="dock-btn dock-btn-highlight" data-action="create-reading-highlight-from-selection" title="하이라이트" aria-label="하이라이트">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M10.5 2.5L13.5 5.5L7 12H4V9L10.5 2.5Z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" fill="none"/>
                <path d="M2 14.5h12" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
                <path d="M8 4.5L11 7.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
              </svg>
              <span class="lbl-wrap"><span class="lbl">하이라이트</span></span>
            </button>

            <button type="button" class="dock-btn dock-btn-note" data-action="create-reading-note-from-selection" title="메모 추가" aria-label="메모 추가">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M12 2H4a1.5 1.5 0 00-1.5 1.5v9A1.5 1.5 0 004 14h5l4-4V3.5A1.5 1.5 0 0012 2z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>
                <path d="M5.5 6.5h5M5.5 9h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                <path d="M9 14v-4h4" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span class="lbl-wrap"><span class="lbl">메모 추가</span></span>
            </button>

            <button type="button" class="dock-btn" data-action="open-reading-note-linker" title="노트 링크" aria-label="노트 링크">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M6.5 9.5a3 3 0 004.24 0l2-2a3 3 0 00-4.24-4.24L7 4.76" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                <path d="M9.5 6.5a3 3 0 00-4.24 0l-2 2A3 3 0 007.5 12.74L9 11.24" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
              </svg>
              <span class="lbl-wrap"><span class="lbl">노트 링크</span></span>
            </button>
          </div>
        </div>
      </div>

      <div class="popup-panel toc-panel ${dockPanel === "toc" ? "visible" : ""}">
        <div class="popup-header">목차</div>
        ${dockTocItems
          .map((section, index) => {
            const page = Number(section.page || readingSectionPage(index)) || 1;
            return `
              <button
                type="button"
                class="toc-item ${page === activeDockPage ? "cur" : ""}"
                data-action="jump-reading-page"
                data-reading-page="${escapeHtml(String(page))}"
              >
                <span class="toc-num">${index === 0 && !section.page ? "—" : escapeHtml(String(index || "—"))}</span>
                <span class="toc-title">${escapeHtml(readingExcerpt(section.label || `Page ${page}`, "Section", 46))}</span>
              </button>
            `;
          })
          .join("")}
      </div>

      <div class="popup-panel pdf-search-panel ${dockPanel === "search" ? "visible" : ""}">
        <div class="popup-header">본문 검색</div>
        <div class="pdf-search-box">
          <input
            type="search"
            name="readingPdfSearchQuery"
            data-action="set-reading-pdf-search-query"
            value="${escapeHtml(pdfSearchQuery)}"
            placeholder="Search PDF"
            autocomplete="off"
          />
          <span class="mono">${escapeHtml(pdfSearchQuery ? `${pdfSearchResults.length}` : "0")}</span>
        </div>
        <div class="pdf-search-results">
          ${
            pdfSearchQuery.length < 2
              ? `<div class="pdf-search-empty">두 글자 이상 입력</div>`
              : pdfSearchResults.length
                ? pdfSearchResults
                    .map(
                      (result) => `
                        <button
                          type="button"
                          class="pdf-search-result"
                          data-action="jump-reading-pdf-search-result"
                          data-reading-page="${escapeHtml(String(result.page))}"
                        >
                          <span class="pdf-search-result-meta">
                            <span>${escapeHtml(result.label)}</span>
                            <span class="mono">p.${escapeHtml(String(result.page))}</span>
                          </span>
                          <span class="pdf-search-result-snippet">${escapeHtml(result.snippet)}</span>
                        </button>
                      `,
                    )
                    .join("")
                : `<div class="pdf-search-empty">검색 결과 없음</div>`
          }
        </div>
      </div>

      <div class="popup-panel page-grid-panel ${dockPanel === "pageGrid" ? "visible" : ""}">
        <div class="popup-header">페이지 미리보기</div>
        <div class="page-grid">
          ${Array.from({ length: dockPageCount })
            .map((_, index) => {
              const page = index + 1;
              const widths = dockPreviewWidths[index % dockPreviewWidths.length];
              return `
                <button
                  type="button"
                  class="page-grid-item ${page === activeDockPage ? "cur" : ""}"
                  data-action="jump-reading-page"
                  data-reading-page="${escapeHtml(String(page))}"
                >
                  <span class="page-grid-thumb">${widths.map(dockPreviewLine).join("")}</span>
                  <span class="page-grid-num">${escapeHtml(String(page))}</span>
                </button>
              `;
            })
            .join("")}
        </div>
      </div>
    `;
    const renderTextImportForm = () => `
      <form class="reading-text-import-form" data-action="submit-reading-text-import-form">
        <label>
          <span>Source</span>
          <input name="readingTextImportSource" value="External OCR import" ${textImportBusy ? "disabled" : ""} />
        </label>
        <div class="reading-text-import-meta">
          <label>
            <span>Tool</span>
            <input name="readingTextImportTool" placeholder="OCRmyPDF, Tesseract" ${textImportBusy ? "disabled" : ""} />
          </label>
          <label>
            <span>Generated</span>
            <input name="readingTextImportGeneratedAt" type="datetime-local" ${textImportBusy ? "disabled" : ""} />
          </label>
        </div>
        <label>
          <span>Import extracted text</span>
          <textarea name="readingTextImport" rows="5" placeholder="Paste extracted text" ${textImportBusy ? "disabled" : ""}></textarea>
        </label>
        <button type="submit" class="btn-p" ${textImportBusy ? "disabled" : ""}>
          ${icon("dl", { size: 13, color: "#fff" })}
          <span>${textImportBusy ? "Importing..." : "Import text"}</span>
        </button>
      </form>
    `;
    const pdfBody = !session?.pdfUrl
      ? `
          <div class="reading-empty-view">
            <div class="reading-empty-icon">${icon("pdf", { size: 24, color: TOKENS.t3 })}</div>
            <div class="reading-empty-title">${escapeHtml(unsupportedMeta.title)}</div>
            <div class="reading-empty-copy">${escapeHtml(unsupportedMeta.copy)}</div>
            ${renderTextImportForm()}
            <div class="reading-empty-actions">
              <button type="button" class="btn-s" data-action="open-reading-source" ${session?.paperUrl ? "" : "disabled"}>
                ${icon("ext", { size: 13, color: "currentColor" })}
                <span>Open source</span>
              </button>
              <button type="button" class="btn-s" data-action="select-stage" data-stage-id="search">
                ${icon("search", { size: 13, color: "currentColor" })}
                <span>Back to Discover</span>
              </button>
            </div>
          </div>
        `
      : `
          <div class="reading-pdf-viewer ${hasDockPdfSelection ? "has-selection-dock" : ""}">
            ${
              session?.parseStatus === "error"
                ? `
                    <div class="reading-pdf-unsupported-card">
                      <div>
                        <div class="reading-pdf-unsupported-title">${escapeHtml(unsupportedMeta.title)}</div>
                        <div class="reading-pdf-unsupported-copy">${escapeHtml(unsupportedMeta.copy)}</div>
                        ${renderTextImportForm()}
                      </div>
                      <div class="reading-pdf-unsupported-actions">
                        <button type="button" class="btn-p" data-action="reading-analyze-session" ${analyzeBusy ? "disabled" : ""}>
                          ${icon("sparkles", { size: 13, color: "#fff" })}
                          <span>${analyzeBusy ? "Analyzing..." : "Analyze paper"}</span>
                        </button>
                        <button type="button" class="btn-s" data-action="open-reading-source" ${session?.paperUrl ? "" : "disabled"}>
                          ${icon("ext", { size: 13, color: "currentColor" })}
                          <span>Open source</span>
                        </button>
                      </div>
                    </div>
                  `
                : ""
            }
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
                <div class="reading-assets-actions">
                  <button type="button" class="btn-s" data-action="reading-analyze-session" ${analyzeBusy ? "disabled" : ""}>
                    ${icon("sparkles", { size: 12, color: "currentColor" })}
                    <span>${analyzeBusy ? "Analyzing..." : "Refresh analysis"}</span>
                  </button>
                </div>
              </div>
              <div class="reading-asset-grid">
                ${visibleAssets
                  .map(
                    (asset) => `
                      <button
                        type="button"
                        class="reading-asset-card"
                        data-action="open-reading-asset-detail"
                        data-reading-asset-id="${escapeHtml(asset.id || "")}"
                      >
                        <div class="reading-asset-thumb">${renderReadingAssetThumb(asset, session)}</div>
                        <div class="reading-asset-meta">
                          <div class="reading-asset-kind" style="color:${asset.kind === "Figure" ? TOKENS.research : TOKENS.writing}">${escapeHtml(readingAssetKindLabel(asset))} ${asset.number}</div>
                          <div class="reading-asset-caption">${escapeHtml(asset.caption)}</div>
                          <div class="reading-asset-card-foot">
                            <span class="reading-asset-page mono">${asset.page ? `p.${escapeHtml(String(asset.page))}` : "page --"}</span>
                            ${renderReadingAssetQuality(asset)}
                          </div>
                        </div>
                      </button>
                    `,
                  )
                  .join("")}
              </div>
              ${(() => {
                const detailAsset =
                  assets.find((asset) => asset.id && asset.id === state.readingAssetDetailId) ||
                  visibleAssets.find((asset) => asset.id && asset.id === state.readingAssetDetailId) ||
                  null;
                if (!detailAsset) {
                  return "";
                }

                return `
                  <aside class="reading-asset-detail">
                    <div class="reading-asset-detail-head">
                      <div>
                        <div class="reading-asset-detail-kicker">${escapeHtml(detailAsset.kind)} ${escapeHtml(String(detailAsset.number || ""))}</div>
                        <h3 class="reading-asset-detail-title">${escapeHtml(detailAsset.caption || "Untitled asset")}</h3>
                      </div>
                      <button type="button" class="reading-asset-detail-close" data-action="close-reading-asset-detail" aria-label="Close asset detail">
                        ${icon("x", { size: 14, color: "currentColor" })}
                      </button>
                    </div>

                    <div class="reading-asset-detail-body">
                      <div class="reading-asset-detail-preview">
                        ${renderReadingAssetThumb(detailAsset, session)}
                        ${renderReadingAssetSourceMap(detailAsset)}
                      </div>
                      <div class="reading-asset-detail-meta">
                        <div class="reading-asset-detail-row">
                          <span>Source page</span>
                          <strong class="mono">${detailAsset.page ? `p.${escapeHtml(String(detailAsset.page))}` : "--"}</strong>
                        </div>
                        <div class="reading-asset-detail-row">
                          <span>Type</span>
                          <strong>${escapeHtml(detailAsset.kind)}</strong>
                        </div>
                        <div class="reading-asset-detail-row">
                          <span>Quality</span>
                          ${renderReadingAssetQuality(detailAsset) || "<strong>Unscored</strong>"}
                        </div>
                        ${
                          detailAsset.sourceBounds
                            ? `
                                <div class="reading-asset-detail-row">
                                  <span>Region</span>
                                  <strong class="mono">${escapeHtml(`${Math.round((detailAsset.sourceBounds.x || 0) * 100)}:${Math.round((detailAsset.sourceBounds.y || 0) * 100)} / ${Math.round((detailAsset.sourceBounds.width || 0) * 100)}x${Math.round((detailAsset.sourceBounds.height || 0) * 100)}`)}</strong>
                                </div>
                              `
                            : ""
                        }
                        ${
                          detailAsset.sourceText
                            ? `<div class="reading-asset-source-snippet">${escapeHtml(readingExcerpt(detailAsset.sourceText, "", 180))}</div>`
                            : ""
                        }
                        ${
                          detailAsset.rows?.length
                            ? `
                                <div class="reading-asset-detail-table">
                                  ${detailAsset.rows.slice(0, 5).map((row) => `
                                    <div class="reading-asset-detail-table-row">
                                      ${row.slice(0, 4).map((cell) => `<span>${escapeHtml(readingExcerpt(cell, "Cell", 30))}</span>`).join("")}
                                    </div>
                                  `).join("")}
                                </div>
                              `
                            : ""
                        }
                      </div>
                    </div>

                    <div class="reading-asset-detail-actions">
                      <button
                        type="button"
                        class="btn-p"
                        data-action="jump-reading-page"
                        data-reading-page="${escapeHtml(String(detailAsset.page || ""))}"
                        data-reading-asset-id="${escapeHtml(detailAsset.id || "")}"
                        ${detailAsset.page ? "" : "disabled"}
                      >
                        ${icon("pdf", { size: 13, color: "#fff" })}
                        <span>Go to source page</span>
                      </button>
                      <button
                        type="button"
                        class="btn-s"
                        data-action="open-reading-asset-data"
                        data-reading-asset-id="${escapeHtml(detailAsset.id || "")}"
                        ${detailAsset.dataPath ? "" : "disabled"}
                      >
                        ${icon("table", { size: 13, color: "currentColor" })}
                        <span>Open data</span>
                      </button>
                      <button
                        type="button"
                        class="btn-s"
                        data-action="copy-reading-asset-citation"
                        data-reading-asset-id="${escapeHtml(detailAsset.id || "")}"
                      >
                        ${icon("share", { size: 13, color: "currentColor" })}
                        <span>Copy citation</span>
                      </button>
                      <button
                        type="button"
                        class="btn-s"
                        data-action="create-reading-asset-evidence"
                        data-reading-asset-id="${escapeHtml(detailAsset.id || "")}"
                      >
                        ${icon("link", { size: 13, color: "currentColor" })}
                        <span>Link evidence</span>
                      </button>
                      <button type="button" class="btn-s" data-action="close-reading-asset-detail">
                        ${icon("grid", { size: 13, color: "currentColor" })}
                        <span>Back to assets</span>
                      </button>
                    </div>
                  </aside>
                `;
              })()}
            </div>
          `
        : `
            <div class="reading-empty-view">
              <div class="reading-empty-icon">${icon("grid", { size: 24, color: TOKENS.read })}</div>
              <div class="reading-empty-title">${parsed ? "No figures or tables found" : "Analysis needed"}</div>
              <div class="reading-empty-copy">${parsed ? "Run analysis again if the paper contains visual evidence." : "Run analysis to prepare summary, chat, and assets."}</div>
              <button type="button" class="btn-p" data-action="reading-analyze-session" ${analyzeBusy ? "disabled" : ""}>
                ${icon("sparkles", { size: 13, color: "#fff" })}
                <span>${analyzeBusy ? "Analyzing..." : "Analyze paper"}</span>
              </button>
            </div>
          `;

    const selectedLineCount = readingSelectionLineCount(state.readingPdfSelection);
    const selectedLineLabel = `${selectedLineCount || 1} ${selectedLineCount === 1 ? "line" : "lines"} selected`;
    const chatContextChips = hasRememberedPdfSelection
      ? `
          <div class="reading-chat-selection-status">
            <div class="reading-chat-selection-main">
              ${icon("quote", { size: 12, color: "currentColor" })}
              <span>${escapeHtml(selectedLineLabel)}</span>
              <span class="reading-chat-selection-page mono">p.${escapeHtml(String(state.readingPdfSelection.page || "?"))}</span>
            </div>
            <div class="reading-chat-selection-preview">"${escapeHtml(readingExcerpt(state.readingPdfSelection.quote, "selected text", 86))}"</div>
          </div>
        `
      : "";

    const chatBody = `
      <div class="reading-chat-wrap">
        <div class="reading-chat-body">
          ${
            !parsed
              ? `
                  <div class="reading-chat-warning">
                    ${icon("info", { size: 13, color: TOKENS.result })}
                      <div><strong>Analyze the paper</strong> to enable chat.</div>
                  </div>
                `
              : ""
          }
          ${
            messages.length
              ? messages
                  .map(
                    (message) => `
                      ${renderReadingMessageSelectionContext(message)}
                      <div class="reading-bubble ${message.role} ${message.pending ? "is-pending" : ""} ${message.typing ? "is-typing" : ""}">
                        ${
                          message.role === "assistant"
                            ? `<div class="reading-bubble-avatar">${icon("sparkles", { size: 12, color: TOKENS.read })}</div>`
                            : ""
                        }
                        <div class="reading-bubble-content">
                          ${
                            message.typing
                              ? `
                                  <span class="reading-typing-dots" aria-label="Agent is responding">
                                    <i></i>
                                    <i></i>
                                    <i></i>
                                  </span>
                                `
                              : escapeHtml(message.text)
                          }
                          ${
                            message.role === "assistant" && message.generatedBy
                              ? renderReadingProvenancePill(message, "chat")
                              : ""
                          }
                          ${message.role === "assistant" ? renderReadingRetrievalPill(message) : ""}
                          ${
                            message.role === "assistant" && !message.typing && !message.cites?.length
                              ? `
                                  <div class="reading-no-evidence-pill">
                                    ${icon("alert", { size: 12, color: "currentColor" })}
                                    <span>Insufficient evidence</span>
                                  </div>
                                `
                              : ""
                          }
                          ${
                            message.cites?.length
                              ? `<div class="reading-cite-row">${message.cites
                                  .map(
                                    (cite) => `
                                      <button
                                        type="button"
                                        class="reading-cite"
                                        data-action="jump-reading-page"
                                        data-reading-page="${escapeHtml(String(cite.pg || ""))}"
                                        ${cite.pg ? "" : "disabled"}
                                      >
                                        <span class="dot"></span>
                                        <span>${escapeHtml(cite.label)}</span>
                                        ${cite.pg ? `<span class="mono">p.${escapeHtml(String(cite.pg))}</span>` : ""}
                                      </button>
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
                    <div class="reading-empty-title">No questions yet</div>
                  </div>
                `
          }
        </div>

        <form class="reading-chat-input" data-action="submit-reading-chat-form">
          ${chatContextChips}
          <div class="reading-chat-input-box">
            <textarea name="readingChatMessage" rows="2" placeholder="${parsed ? "Ask about this paper..." : "Analyze the paper before asking"}" ${!parsed || chatBusy ? "disabled" : ""}></textarea>
            <button type="submit" class="reading-chat-send" aria-label="Send reading question" ${!parsed || chatBusy ? "disabled" : ""}>${icon("send", { size: 13, color: "#fff" })}</button>
          </div>
          <div class="reading-chat-footer">
            <span>${parsed ? "Answers include paper evidence" : "Waiting for paper text"}</span>
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
          <button type="button" class="btn-s reading-notes-research-btn" data-action="handoff-reading-to-research">${icon("flask", { size: 11, color: "currentColor" })}<span>Send to Lab</span></button>
        </div>

        ${
          notes.length
            ? notes
                .map(
                  (note) => `
                    <article class="reading-note-card" data-reading-note-id="${escapeHtml(note.id)}">
                      <div class="reading-note-head">
                        ${renderTag(note.cat, note.color, true)}
                          <button
                            type="button"
                            class="reading-note-page mono"
                            data-action="jump-reading-page"
                            data-reading-page="${escapeHtml(String(note.page || ""))}"
                            ${note.page ? "" : "disabled"}
                          >${note.page ? `p.${escapeHtml(String(note.page))}` : "page --"}</button>
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
                  <div class="reading-empty-title">No notes</div>
                  <div class="reading-empty-copy">${parsed ? "Save a passage as a note to see it here." : "Analyze the paper before adding notes."}</div>
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
        data-reading-view="detail"
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
            <button type="button" class="${parsed && summarized && assets.length ? "btn-s" : "btn-p"}" data-action="reading-analyze-session" ${analyzeBusy ? "disabled" : ""}>
              ${icon(parsed && summarized && assets.length ? "check" : "sparkles", { size: 13, color: parsed && summarized && assets.length ? "currentColor" : "#fff" })}
              <span>${analyzeBusy ? "Analyzing..." : parsed && summarized && assets.length ? "Refresh analysis" : "Analyze paper"}</span>
            </button>
            <button
              type="button"
              class="btn-ghost reading-context-trigger"
              data-action="toggle-reading-context-menu"
              aria-label="Open reading context menu"
              aria-expanded="${state.readingContextMenuOpen ? "true" : "false"}"
            >
              ${icon("moreH", { size: 14, color: "currentColor" })}
            </button>
            ${
              state.readingContextMenuOpen
                ? `
                    <div class="reading-context-menu" role="menu" aria-label="Reading actions">
                      <button type="button" class="reading-context-menu-item" data-action="open-reading-source" role="menuitem">
                        ${icon("ext", { size: 13, color: "currentColor" })}
                        <span>Open source</span>
                      </button>
                      <button type="button" class="reading-context-menu-item" data-action="copy-reading-citation" role="menuitem">
                        ${icon("share", { size: 13, color: "currentColor" })}
                        <span>Copy citation</span>
                      </button>
                      <button type="button" class="reading-context-menu-item" data-action="export-reading-notes" role="menuitem">
                        ${icon("dl", { size: 13, color: "currentColor" })}
                        <span>Export notes</span>
                      </button>
                      <div class="reading-context-menu-divider"></div>
                      <button type="button" class="reading-context-menu-item" data-action="reading-analyze-session" role="menuitem">
                        ${icon("sparkles", { size: 13, color: "currentColor" })}
                        <span>${parsed && summarized && assets.length ? "Refresh analysis" : "Analyze paper"}</span>
                      </button>
                    </div>
                  `
                : ""
            }
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
                  <span>PDF</span>
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
              ${state.readingDocumentTab === "pdf" ? pdfDock : ""}
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
