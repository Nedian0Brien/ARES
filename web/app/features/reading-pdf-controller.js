import { hydrateReadingPdfSurface, resetReadingPdfSurface, scrollReadingPdfToPage } from "../lib/pdf-viewer.js";

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
      baseUrl,
      host,
      pdfUrl: appUrl(readingSessionApiPath(session.id, "pdf")).href,
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
