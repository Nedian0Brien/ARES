function directReadingChildByClass(root, className) {
  return Array.from(root?.children || []).find((child) => child.classList?.contains(className)) || null;
}

function syncReadingElementShell(currentElement, nextElement) {
  currentElement.className = nextElement.className;

  for (const attribute of Array.from(currentElement.attributes)) {
    if (attribute.name !== "class" && !nextElement.hasAttribute(attribute.name)) {
      currentElement.removeAttribute(attribute.name);
    }
  }

  for (const attribute of Array.from(nextElement.attributes)) {
    if (attribute.name !== "class") {
      currentElement.setAttribute(attribute.name, attribute.value);
    }
  }
}

export function replaceReadingNodeIfChanged(currentNode, nextNode) {
  if (!currentNode || !nextNode) {
    return false;
  }

  if (currentNode.isEqualNode(nextNode)) {
    return false;
  }

  currentNode.replaceWith(nextNode);
  return true;
}

function activeReadingPaneTab(pane, attributeName) {
  return pane?.querySelector(`.pane-tab.active[${attributeName}]`)?.getAttribute(attributeName) || "";
}

function readingPdfHostSignature(host) {
  if (!host) {
    return null;
  }

  const sessionId = host.dataset.readingSessionId || "";
  const sourcePdfUrl = host.dataset.readingPdfUrl || "";
  if (!sessionId || !sourcePdfUrl) {
    return null;
  }

  return { sessionId, sourcePdfUrl };
}

export function captureStableReadingPdfHost() {
  const host = document.querySelector('[data-reading-pdf-host="true"]');
  const signature = readingPdfHostSignature(host);
  if (!host || !signature) {
    return null;
  }

  return { host, signature };
}

export function restoreStableReadingPdfHost(preserved) {
  if (!preserved?.host || !preserved.signature) {
    return false;
  }

  const nextHost = document.querySelector('[data-reading-pdf-host="true"]');
  const nextSignature = readingPdfHostSignature(nextHost);
  if (
    !nextHost ||
    !nextSignature ||
    nextSignature.sessionId !== preserved.signature.sessionId ||
    nextSignature.sourcePdfUrl !== preserved.signature.sourcePdfUrl
  ) {
    return false;
  }

  nextHost.replaceWith(preserved.host);
  return true;
}

function matchingStableReadingPdfHosts(currentDocPane, nextDocPane) {
  if (!currentDocPane || !nextDocPane) {
    return null;
  }

  const currentDocumentTab = activeReadingPaneTab(currentDocPane, "data-reading-document-tab");
  const nextDocumentTab = activeReadingPaneTab(nextDocPane, "data-reading-document-tab");
  if (currentDocumentTab !== "pdf" || nextDocumentTab !== "pdf") {
    return null;
  }

  const currentPdfHost = currentDocPane.querySelector('[data-reading-pdf-host="true"]');
  const nextPdfHost = nextDocPane.querySelector('[data-reading-pdf-host="true"]');
  const currentSignature = readingPdfHostSignature(currentPdfHost);
  const nextSignature = readingPdfHostSignature(nextPdfHost);
  if (
    !currentPdfHost ||
    !nextPdfHost ||
    !currentSignature ||
    !nextSignature ||
    currentSignature.sessionId !== nextSignature.sessionId ||
    currentSignature.sourcePdfUrl !== nextSignature.sourcePdfUrl
  ) {
    return null;
  }

  return { currentPdfHost, nextPdfHost };
}

export function transplantStableReadingPdfHost(currentDocPane, nextDocPane) {
  const match = matchingStableReadingPdfHosts(currentDocPane, nextDocPane);
  if (!match) {
    return false;
  }

  match.nextPdfHost.replaceWith(match.currentPdfHost);
  return true;
}

export function syncReadingPdfDockState(currentDock, nextDock) {
  const currentHadSelection = currentDock.classList.contains("has-selection");
  const nextHasSelection = nextDock.classList.contains("has-selection");
  const currentChip = currentDock.querySelector(".sel-chip");
  const nextChip = nextDock.querySelector(".sel-chip");
  const currentChipText = currentDock.querySelector(".sel-chip-text");
  const nextChipText = nextDock.querySelector(".sel-chip-text");
  const currentZoom = currentDock.querySelector(".zoom-val");
  const nextZoom = nextDock.querySelector(".zoom-val");

  if (currentChipText && nextChipText) {
    currentChipText.textContent = nextChipText.textContent;
  }

  if (currentZoom && nextZoom) {
    currentZoom.textContent = nextZoom.textContent;
  }

  currentDock.querySelectorAll(".dock-btn").forEach((button, index) => {
    const nextButton = nextDock.querySelectorAll(".dock-btn")[index];
    if (!nextButton) {
      return;
    }

    button.className = nextButton.className;
    if (nextButton.hasAttribute("disabled")) {
      button.setAttribute("disabled", "");
    } else {
      button.removeAttribute("disabled");
    }
  });

  if (nextHasSelection && !currentHadSelection) {
    currentDock.classList.add("has-selection");
    currentChip?.classList.add("visible");
  } else {
    currentDock.classList.toggle("has-selection", nextHasSelection);
    currentChip?.classList.toggle("visible", nextChip?.classList.contains("visible") || nextHasSelection);
  }
}

export function patchStableReadingPdfDocPane(currentDocPane, nextDocPane) {
  const match = matchingStableReadingPdfHosts(currentDocPane, nextDocPane);
  if (!match) {
    return false;
  }

  syncReadingElementShell(currentDocPane, nextDocPane);

  const currentHeader = directReadingChildByClass(currentDocPane, "pane-hdr");
  const nextHeader = directReadingChildByClass(nextDocPane, "pane-hdr");
  if (currentHeader && nextHeader) {
    replaceReadingNodeIfChanged(currentHeader, nextHeader);
  } else if (currentHeader) {
    currentHeader.remove();
  } else if (nextHeader) {
    currentDocPane.insertBefore(nextHeader, currentDocPane.firstChild);
  }

  const currentBody = directReadingChildByClass(currentDocPane, "pane-body");
  const nextBody = directReadingChildByClass(nextDocPane, "pane-body");
  if (!currentBody || !nextBody) {
    return false;
  }

  syncReadingElementShell(currentBody, nextBody);

  const currentViewer = currentBody.querySelector(".reading-pdf-viewer");
  const nextViewer = nextBody.querySelector(".reading-pdf-viewer");
  if (!currentViewer || !nextViewer) {
    return false;
  }

  syncReadingElementShell(currentViewer, nextViewer);

  const currentUnsupportedCard = currentViewer.querySelector(".reading-pdf-unsupported-card");
  const nextUnsupportedCard = nextViewer.querySelector(".reading-pdf-unsupported-card");
  if (currentUnsupportedCard && nextUnsupportedCard) {
    replaceReadingNodeIfChanged(currentUnsupportedCard, nextUnsupportedCard);
  } else if (currentUnsupportedCard) {
    currentUnsupportedCard.remove();
  } else if (nextUnsupportedCard) {
    currentViewer.insertBefore(nextUnsupportedCard, match.currentPdfHost);
  }

  const currentDock = directReadingChildByClass(currentDocPane, "reading-pdf-dock-layer");
  const nextDock = directReadingChildByClass(nextDocPane, "reading-pdf-dock-layer");
  if (currentDock && nextDock) {
    syncReadingPdfDockState(currentDock, nextDock);
  } else if (currentDock) {
    currentDock.remove();
  } else if (nextDock) {
    currentDocPane.appendChild(nextDock);
  }

  return true;
}

export function patchReadingSplitPreservingPdf(currentSplit, nextSplit) {
  const currentDocPane = directReadingChildByClass(currentSplit, "reading-doc-pane");
  const nextDocPane = directReadingChildByClass(nextSplit, "reading-doc-pane");
  if (!patchStableReadingPdfDocPane(currentDocPane, nextDocPane)) {
    return false;
  }

  const currentHandle = directReadingChildByClass(currentSplit, "reading-resize-handle");
  const nextHandle = directReadingChildByClass(nextSplit, "reading-resize-handle");
  const currentWorkbenchPane = directReadingChildByClass(currentSplit, "reading-workbench-pane");
  const nextWorkbenchPane = directReadingChildByClass(nextSplit, "reading-workbench-pane");

  syncReadingElementShell(currentSplit, nextSplit);

  if (currentHandle && nextHandle) {
    currentHandle.replaceWith(nextHandle);
  } else if (currentHandle) {
    currentHandle.remove();
  } else if (nextHandle) {
    nextDocPane.insertAdjacentElement("afterend", nextHandle);
  }

  if (currentWorkbenchPane && nextWorkbenchPane) {
    currentWorkbenchPane.replaceWith(nextWorkbenchPane);
  } else if (currentWorkbenchPane) {
    currentWorkbenchPane.remove();
  } else if (nextWorkbenchPane) {
    currentSplit.appendChild(nextWorkbenchPane);
  }

  return true;
}

export function syncReadingPopupPanelState(currentPanel, nextPanel) {
  if (currentPanel.innerHTML !== nextPanel.innerHTML) {
    currentPanel.innerHTML = nextPanel.innerHTML;
  }
  currentPanel.className = nextPanel.className;
}

export function appendReadingPdfDockWithAnimation(parent, dock) {
  const nextHasSelection = dock.classList.contains("has-selection");
  const chip = dock.querySelector(".sel-chip");
  if (nextHasSelection) {
    dock.classList.remove("has-selection");
    chip?.classList.remove("visible");
  }

  parent.appendChild(dock);

  if (nextHasSelection) {
    window.requestAnimationFrame(() => {
      dock.classList.add("has-selection");
      chip?.classList.add("visible");
    });
  }
}
