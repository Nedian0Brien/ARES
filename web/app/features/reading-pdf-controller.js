import { hydrateReadingPdfSurface, resetReadingPdfSurface, scrollReadingPdfToPage } from "../lib/pdf-viewer.js";

function readingText(value) {
  return String(value || "").trim();
}

function annotationPage(entry, fallback) {
  const page = Number(entry?.page || entry?.pageStart || fallback);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function buildAnnotationText(entry) {
  return [entry?.quote, entry?.memo, entry?.text, entry?.body]
    .map(readingText)
    .filter(Boolean)
    .join(" — ");
}

function buildReadingPdfAnnotations(session) {
  const notes = Array.isArray(session?.notes) ? session.notes : [];
  const highlights = Array.isArray(session?.highlights) ? session.highlights : [];
  return [
    ...notes.map((note, index) => ({
      id: readingText(note.id) || `note-${index + 1}`,
      label: readingText(note.cat || note.section) || `Note ${index + 1}`,
      page: annotationPage(note, index + 1),
      sourceBounds: note.sourceBounds,
      text: buildAnnotationText(note),
      type: "note",
    })),
    ...highlights.map((highlight, index) => ({
      id: readingText(highlight.id) || `highlight-${index + 1}`,
      label: readingText(highlight.cat || highlight.section) || `Highlight ${index + 1}`,
      page: annotationPage(highlight, index + 1),
      sourceBounds: highlight.sourceBounds,
      text: buildAnnotationText(highlight),
      type: "highlight",
    })),
  ];
}

export function createReadingPdfController({
  appUrl,
  baseUrl,
  getSession,
  getState,
  readingSessionApiPath,
}) {
  function shouldShowPdf() {
    const state = getState();
    return state.activeStage === "reading" && state.readingView === "detail" && state.readingDocumentTab === "pdf";
  }

  async function hydrateIfNeeded() {
    if (!shouldShowPdf()) {
      resetReadingPdfSurface();
      return;
    }

    const state = getState();
    const session = getSession();
    const host = document.querySelector('[data-reading-pdf-host="true"]');
    if (!session?.id || !session.pdfUrl || !host) {
      resetReadingPdfSurface();
      return;
    }

    await hydrateReadingPdfSurface({
      annotations: buildReadingPdfAnnotations(session),
      baseUrl,
      host,
      pdfUrl: appUrl(readingSessionApiPath(session.id, "pdf")).href,
      sourceHighlight: state.readingPdfSourceHighlight,
      targetPage: state.readingPdfTargetPage,
      zoom: state.readingPdfZoom,
    });
  }

  function scheduleHydration() {
    window.requestAnimationFrame(() => {
      void hydrateIfNeeded();
    });
  }

  function resetSurface() {
    resetReadingPdfSurface();
  }

  function scrollToPage(page) {
    const host = document.querySelector('[data-reading-pdf-host="true"]');
    return scrollReadingPdfToPage(host, page);
  }

  return {
    hydrateIfNeeded,
    resetSurface,
    scheduleHydration,
    scrollToPage,
  };
}
