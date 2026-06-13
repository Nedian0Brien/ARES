import {
  appendReadingPdfDockWithAnimation,
  patchReadingSplitPreservingPdf,
  patchStableReadingPdfDocPane,
  replaceReadingNodeIfChanged,
  syncReadingPdfDockState,
  syncReadingPopupPanelState,
  transplantStableReadingPdfHost,
} from "./reading-dom-patch.js";

export function createReadingStagePatchController({
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
}) {
  function patchReadingWorkbenchPaneOnly() {
    if (state.activeStage !== "reading" || state.readingView !== "detail") {
      return false;
    }

    const project = activeProject();
    const currentStage = document.querySelector('[data-ares-surface="reading-stage"]');
    const currentWorkbenchPane = currentStage?.querySelector(".reading-workbench-pane");
    if (!project || !currentStage || !currentWorkbenchPane) {
      return false;
    }

    const template = document.createElement("template");
    template.innerHTML = renderReadingStage(project).trim();
    const nextWorkbenchPane = template.content.querySelector(".reading-workbench-pane");
    if (!nextWorkbenchPane) {
      return false;
    }

    currentWorkbenchPane.replaceWith(nextWorkbenchPane);
    applyReadingSplitUI();
    syncAppActivePaperMetadata(currentReadingPaper(project));
    syncBrowserUrlFromState();
    return true;
  }

  function patchReadingDocumentPaneOnly() {
    if (state.activeStage !== "reading" || state.readingView !== "detail") {
      return false;
    }

    const project = activeProject();
    const currentStage = document.querySelector('[data-ares-surface="reading-stage"]');
    const currentDocPane = currentStage?.querySelector(".reading-doc-pane");
    if (!project || !currentStage || !currentDocPane) {
      return false;
    }

    const template = document.createElement("template");
    template.innerHTML = renderReadingStage(project).trim();
    const nextDocPane = template.content.querySelector(".reading-doc-pane");
    if (!nextDocPane) {
      return false;
    }

    const preservedPdfPane = state.readingDocumentTab === "pdf" && patchStableReadingPdfDocPane(currentDocPane, nextDocPane);
    if (!preservedPdfPane) {
      transplantStableReadingPdfHost(currentDocPane, nextDocPane);
      currentDocPane.replaceWith(nextDocPane);
    }
    applyReadingSplitUI();
    syncAppActivePaperMetadata(currentReadingPaper(project));

    if (state.readingDocumentTab === "pdf") {
      if (!preservedPdfPane) {
        scheduleReadingHydration();
      }
    } else {
      readingPdfController.resetSurface();
    }

    syncBrowserUrlFromState();
    return true;
  }

  function patchReadingPdfSelectionBarOnly() {
    if (state.activeStage !== "reading" || state.readingView !== "detail" || state.readingDocumentTab !== "pdf") {
      return false;
    }

    const project = activeProject();
    const currentStage = document.querySelector('[data-ares-surface="reading-stage"]');
    const currentDock = currentStage?.querySelector(".reading-pdf-dock-layer");
    const currentTocPanel = currentStage?.querySelector(".toc-panel");
    const currentSearchPanel = currentStage?.querySelector(".pdf-search-panel");
    const currentPageGridPanel = currentStage?.querySelector(".page-grid-panel");
    const currentDocPane = currentStage?.querySelector(".reading-doc-pane");
    const pdfHost = currentStage?.querySelector('[data-reading-pdf-host="true"]');
    if (!project || !currentStage || !currentDocPane || !pdfHost) {
      return false;
    }

    const template = document.createElement("template");
    template.innerHTML = renderReadingStage(project).trim();
    const nextDock = template.content.querySelector(".reading-pdf-dock-layer");
    const nextTocPanel = template.content.querySelector(".toc-panel");
    const nextSearchPanel = template.content.querySelector(".pdf-search-panel");
    const nextPageGridPanel = template.content.querySelector(".page-grid-panel");

    if (currentDock && nextDock) {
      syncReadingPdfDockState(currentDock, nextDock);
    } else if (currentDock) {
      currentDock.remove();
    } else if (nextDock) {
      appendReadingPdfDockWithAnimation(currentDocPane, nextDock);
    }

    if (currentTocPanel && nextTocPanel) {
      syncReadingPopupPanelState(currentTocPanel, nextTocPanel);
    } else if (currentTocPanel) {
      currentTocPanel.remove();
    } else if (nextTocPanel) {
      currentDocPane.appendChild(nextTocPanel);
    }

    if (currentSearchPanel && nextSearchPanel) {
      syncReadingPopupPanelState(currentSearchPanel, nextSearchPanel);
    } else if (currentSearchPanel) {
      currentSearchPanel.remove();
    } else if (nextSearchPanel) {
      currentDocPane.appendChild(nextSearchPanel);
    }

    if (currentPageGridPanel && nextPageGridPanel) {
      syncReadingPopupPanelState(currentPageGridPanel, nextPageGridPanel);
    } else if (currentPageGridPanel) {
      currentPageGridPanel.remove();
    } else if (nextPageGridPanel) {
      currentDocPane.appendChild(nextPageGridPanel);
    }

    syncAppActivePaperMetadata(currentReadingPaper(project));
    return true;
  }

  function refreshReadingStageUI(options = {}) {
    if (!patchReadingStageUI(options)) {
      render();
    }
  }

  function patchReadingPdfSelectionSurfaces() {
    const patchedDock = patchReadingPdfSelectionBarOnly();
    const patchedWorkbench = patchReadingWorkbenchPaneOnly();
    if (!patchedDock || !patchedWorkbench) {
      refreshReadingStageUI();
    }
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
      scheduleReadingHydration();
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
    replaceReadingNodeIfChanged(currentMetabar, nextMetabar);
    replaceReadingNodeIfChanged(currentIconRail, nextIconRail);

    if (currentPanel && nextPanel) {
      if (!currentPanel.isEqualNode(nextPanel)) {
        currentPanel.className = nextPanel.className;
        currentPanel.replaceChildren(...Array.from(nextPanel.childNodes));
        const nextPanelBody = currentPanel.querySelector(".reading-float-panel-body");
        if (nextPanelBody) {
          nextPanelBody.scrollTop = previousPanelScrollTop;
        }
      }
    } else if (currentPanel) {
      currentPanel.remove();
    } else if (nextPanel) {
      currentShell.insertBefore(nextPanel, currentSplit);
    }

    const shouldHydrateReadingPdf = !patchReadingSplitPreservingPdf(currentSplit, nextSplit);
    if (shouldHydrateReadingPdf) {
      currentSplit.replaceWith(nextSplit);
    }

    if (currentWorkbenchStrip && nextWorkbenchStrip) {
      replaceReadingNodeIfChanged(currentWorkbenchStrip, nextWorkbenchStrip);
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

    syncAppActivePaperMetadata(currentReadingPaper(project));
    if (shouldHydrateReadingPdf) {
      scheduleReadingHydration();
    }
    syncBrowserUrlFromState();
    return true;
  }

  return {
    patchReadingDocumentPaneOnly,
    patchReadingPdfSelectionBarOnly,
    patchReadingPdfSelectionSurfaces,
    patchReadingStageUI,
    patchReadingWorkbenchPaneOnly,
    refreshReadingStageUI,
  };
}
