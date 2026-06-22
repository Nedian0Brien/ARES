let pdfjsModulePromise = null;
let activeRenderToken = 0;
let activePageObserver = null;
let activeAnnotations = [];
let activeSourceHighlight = null;
const PDF_VIEWER_STATE_KEY = '__aresReadingPdfViewerState';
const PDF_BASE_SCALE = 1.28;
const PDF_MOBILE_READING_SCALE = 1.52;
const PDF_MAX_FIT_SCALE = 2.2;

function setMessage(host, message, className = '') {
  if (!host) {
    return;
  }

  host.innerHTML = `<div class="reading-pdf-loading ${className}">${message}</div>`;
}

async function loadPdfJs(baseUrl) {
  if (!pdfjsModulePromise) {
    const moduleUrl = new URL('__vendor/pdfjs/pdf.mjs', baseUrl).href;
    pdfjsModulePromise = import(moduleUrl).then((module) => {
      module.GlobalWorkerOptions.workerSrc = new URL('__vendor/pdfjs/pdf.worker.mjs', baseUrl).href;
      return module;
    });
  }

  return pdfjsModulePromise;
}

function applyPdfPageMetrics(element, viewport) {
  const width = `${viewport.width}px`;
  const height = `${viewport.height}px`;
  const scale = String(viewport.scale || 1);

  element.style.width = width;
  element.style.height = height;
  element.style.setProperty('--scale-factor', scale);
  element.style.setProperty('--total-scale-factor', scale);
  element.style.setProperty('--user-unit', '1');
  element.style.setProperty('--scale-round-x', '1px');
  element.style.setProperty('--scale-round-y', '1px');
}

function pdfHostAvailableWidth(host) {
  if (!host) {
    return 0;
  }

  const styles = window.getComputedStyle(host);
  const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(styles.paddingRight) || 0;
  return Math.max(0, host.clientWidth - paddingLeft - paddingRight);
}

function pdfHostFitWidthKey(host) {
  return String(Math.round(pdfHostAvailableWidth(host)));
}

function resolvePdfViewport(page, host, zoom) {
  const baseViewport = page.getViewport({ scale: 1 });
  const availableWidth = pdfHostAvailableWidth(host);
  const fitScale = availableWidth > 0 ? availableWidth / baseViewport.width : PDF_BASE_SCALE;
  const isMobileViewport = window.innerWidth <= 900;
  const baseScale = isMobileViewport
    ? Math.min(PDF_MAX_FIT_SCALE, fitScale * PDF_MOBILE_READING_SCALE)
    : Math.min(PDF_MAX_FIT_SCALE, Math.max(PDF_BASE_SCALE, fitScale));
  return page.getViewport({ scale: baseScale * (zoom / 100) });
}

function scheduleIdleTask(callback) {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(callback, { timeout: 700 });
    return;
  }

  window.setTimeout(callback, 16);
}

function disconnectActivePageObserver() {
  if (!activePageObserver) {
    return;
  }

  activePageObserver.disconnect();
  activePageObserver = null;
}

function clampRatio(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, number));
}

function normalizeSourceHighlight(sourceHighlight) {
  if (!sourceHighlight || sourceHighlight.unit !== 'page-ratio') {
    return null;
  }

  const page = Math.max(1, Number(sourceHighlight.page) || 1);
  const width = Math.max(0.04, clampRatio(sourceHighlight.width, 0.84));
  const height = Math.max(0.04, clampRatio(sourceHighlight.height, 0.12));
  const highlight = {
    height,
    page,
    unit: 'page-ratio',
    width,
    x: Math.min(1 - width, clampRatio(sourceHighlight.x, 0)),
    y: Math.min(1 - height, clampRatio(sourceHighlight.y, 0)),
  };

  const rects = normalizeSourceHighlightRects(sourceHighlight.rects);
  if (rects.length) {
    highlight.rects = rects;
  }

  return highlight;
}

function normalizeSourceHighlightRects(rects) {
  if (!Array.isArray(rects)) {
    return [];
  }

  return rects
    .map((rect) => {
      const width = Math.max(0.01, clampRatio(rect?.width, 0));
      const height = Math.max(0.01, clampRatio(rect?.height, 0));
      return {
        height,
        width,
        x: Math.min(1 - width, clampRatio(rect?.x, 0)),
        y: Math.min(1 - height, clampRatio(rect?.y, 0)),
      };
    })
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .slice(0, 24);
}

function normalizePdfAnnotations(annotations) {
  if (!Array.isArray(annotations)) {
    return [];
  }

  return annotations
    .map((annotation, index) => {
      const page = Math.max(1, Math.floor(Number(annotation?.page) || 1));
      const type = annotation?.type === 'highlight' ? 'highlight' : 'note';
      const label = String(annotation?.label || (type === 'highlight' ? 'Highlight' : 'Note')).trim();
      const text = String(annotation?.text || '').trim();
      const id = String(annotation?.id || `${type}-${page}-${index + 1}`).trim();
      const sourceBounds = normalizeSourceHighlight(annotation?.sourceBounds);
      return { id, label, page, sourceBounds, text, type };
    })
    .filter((annotation) => annotation.id && annotation.page > 0);
}

function applyPdfPageAnnotations(surface, pageNumber, annotations = activeAnnotations) {
  surface.querySelector('.reading-pdf-annotation-layer')?.remove();
  const page = Number(pageNumber);
  const pageAnnotations = normalizePdfAnnotations(annotations).filter((annotation) => annotation.page === page);
  if (!pageAnnotations.length) {
    return;
  }

  const layer = document.createElement('div');
  layer.className = 'reading-pdf-annotation-layer';
  layer.setAttribute('aria-label', `Annotations on page ${page}`);

  pageAnnotations.slice(0, 8).forEach((annotation, index) => {
    if (annotation.sourceBounds && Number(annotation.sourceBounds.page) === page) {
      const boxes = annotation.sourceBounds.rects?.length ? annotation.sourceBounds.rects : [annotation.sourceBounds];
      boxes.forEach((sourceBounds, rectIndex) => {
        const box = document.createElement('div');
        box.className = `reading-pdf-annotation-box is-${annotation.type}`;
        box.dataset.readingPdfAnnotationId = annotation.id;
        box.dataset.readingPdfAnnotationRectIndex = String(rectIndex);
        box.dataset.readingPdfAnnotationType = annotation.type;
        box.setAttribute('aria-label', [annotation.label, annotation.text].filter(Boolean).join(': '));
        box.style.left = `${sourceBounds.x * 100}%`;
        box.style.top = `${sourceBounds.y * 100}%`;
        box.style.width = `${sourceBounds.width * 100}%`;
        box.style.height = `${sourceBounds.height * 100}%`;
        box.title = [annotation.label, annotation.text].filter(Boolean).join(': ');
        layer.appendChild(box);
      });
      return;
    }

    const marker = document.createElement('div');
    marker.className = `reading-pdf-annotation-marker is-${annotation.type}`;
    marker.dataset.readingPdfAnnotationId = annotation.id;
    marker.dataset.readingPdfAnnotationType = annotation.type;
    marker.style.top = `${Math.min(86, 7 + index * 10)}%`;
    marker.title = [annotation.label, annotation.text].filter(Boolean).join(': ');
    marker.textContent = annotation.type === 'highlight' ? 'H' : 'N';
    layer.appendChild(marker);
  });

  if (pageAnnotations.length > 8) {
    const overflow = document.createElement('div');
    overflow.className = 'reading-pdf-annotation-marker is-overflow';
    overflow.style.top = '90%';
    overflow.textContent = `+${pageAnnotations.length - 8}`;
    layer.appendChild(overflow);
  }

  surface.appendChild(layer);
}

export function syncReadingPdfAnnotations(host, annotations = activeAnnotations) {
  activeAnnotations = normalizePdfAnnotations(annotations);
  host?.querySelectorAll?.('[data-reading-pdf-page]')?.forEach((pageNode) => {
    const surface = pageNode.querySelector('.reading-pdf-page-surface');
    if (surface) {
      applyPdfPageAnnotations(surface, pageNode.dataset.readingPdfPage);
    }
  });
}

function applyPdfPageSourceHighlight(surface, pageNumber, sourceHighlight = activeSourceHighlight) {
  surface.querySelector('.reading-pdf-source-highlight')?.remove();
  const highlight = normalizeSourceHighlight(sourceHighlight);
  if (!highlight || Number(highlight.page) !== Number(pageNumber)) {
    return;
  }

  const marker = document.createElement('div');
  marker.className = 'reading-pdf-source-highlight';
  marker.setAttribute('aria-label', `Source region on page ${pageNumber}`);
  marker.style.left = `${highlight.x * 100}%`;
  marker.style.top = `${highlight.y * 100}%`;
  marker.style.width = `${highlight.width * 100}%`;
  marker.style.height = `${highlight.height * 100}%`;
  surface.appendChild(marker);
}

export function syncReadingPdfSourceHighlight(host, sourceHighlight = activeSourceHighlight) {
  activeSourceHighlight = normalizeSourceHighlight(sourceHighlight);
  host?.querySelectorAll?.('[data-reading-pdf-page]')?.forEach((pageNode) => {
    const surface = pageNode.querySelector('.reading-pdf-page-surface');
    if (surface) {
      applyPdfPageSourceHighlight(surface, pageNode.dataset.readingPdfPage);
    }
  });
}

function createPdfPageShell(viewport, pageNumber) {
  const wrapper = document.createElement('article');
  wrapper.className = 'reading-pdf-canvas-page';
  wrapper.dataset.readingPdfPage = String(pageNumber);
  wrapper.dataset.renderState = 'pending';

  const surface = document.createElement('div');
  surface.className = 'reading-pdf-page-surface';
  applyPdfPageMetrics(surface, viewport);

  const placeholder = document.createElement('div');
  placeholder.className = 'reading-pdf-page-placeholder';
  placeholder.textContent = `Page ${pageNumber}`;
  surface.appendChild(placeholder);

  const meta = document.createElement('div');
  meta.className = 'reading-pdf-canvas-meta';
  meta.textContent = `Page ${pageNumber}`;

  wrapper.appendChild(surface);
  wrapper.appendChild(meta);
  return { surface, wrapper };
}

function createPdfPagePlaceholder(pageNumber) {
  const placeholder = document.createElement('div');
  placeholder.className = 'reading-pdf-page-placeholder';
  placeholder.textContent = `Page ${pageNumber}`;
  return placeholder;
}

function getPdfViewerState(host) {
  return host?.[PDF_VIEWER_STATE_KEY] || null;
}

function setPdfViewerState(host, viewerState) {
  if (host) {
    host[PDF_VIEWER_STATE_KEY] = viewerState;
  }
}

function clearPdfViewerState(host) {
  if (host?.[PDF_VIEWER_STATE_KEY]) {
    delete host[PDF_VIEWER_STATE_KEY];
  }
}

async function createSelectableTextLayer({ page, pdfjsLib, viewport }) {
  const layer = document.createElement('div');
  layer.className = 'reading-pdf-text-layer textLayer';
  layer.dataset.readingSelectableText = 'true';
  applyPdfPageMetrics(layer, viewport);

  const textLayer = new pdfjsLib.TextLayer({
    container: layer,
    textContentSource: page.streamTextContent({
      disableNormalization: true,
      includeMarkedContent: true,
    }),
    viewport,
  });
  await textLayer.render();

  return layer;
}

export function scrollReadingPdfToPage(host, pageNumber) {
  if (!host || !pageNumber) {
    return false;
  }

  const target = host.querySelector(`[data-reading-pdf-page="${Number(pageNumber)}"]`);
  if (!target) {
    return false;
  }

  target.scrollIntoView({ block: 'start', behavior: 'smooth' });
  target.classList.add('is-targeted');
  window.setTimeout(() => {
    target.classList.remove('is-targeted');
  }, 1400);
  return true;
}

export function resetReadingPdfSurface() {
  activeRenderToken += 1;
  activeAnnotations = [];
  activeSourceHighlight = null;
  disconnectActivePageObserver();
}

async function renderPdfPage({ force = false, pageRecord, pdfjsLib, renderToken }) {
  const { page, surface, viewport, wrapper } = pageRecord;
  if (renderToken !== activeRenderToken || (!force && wrapper.dataset.renderState === 'ready')) {
    return;
  }

  if (!force && pageRecord.renderPromise) {
    await pageRecord.renderPromise;
    return;
  }

  const renderPromise = (async () => {
    wrapper.dataset.renderState = 'rendering';
    const outputScale = window.devicePixelRatio || 1;
    const existingCanvas = force ? null : surface.querySelector('.reading-pdf-canvas');
    const canvas = existingCanvas || document.createElement('canvas');
    canvas.className = 'reading-pdf-canvas';
    const context = canvas.getContext('2d', { alpha: false });
    canvas.width = Math.ceil(viewport.width * outputScale);
    canvas.height = Math.ceil(viewport.height * outputScale);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    if (!existingCanvas) {
      surface.replaceChildren(canvas);
    } else {
      surface.querySelector('.reading-pdf-text-layer')?.remove();
      surface.querySelector('.reading-pdf-annotation-layer')?.remove();
      surface.querySelector('.reading-pdf-source-highlight')?.remove();
    }

    const renderTask = page.render({
      canvasContext: context,
      transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null,
      viewport,
    });
    pageRecord.renderTask = renderTask;
    await renderTask.promise;
    pageRecord.renderTask = null;

    if (renderToken !== activeRenderToken) {
      return;
    }

    const textLayer = await createSelectableTextLayer({ page, pdfjsLib, viewport });
    if (renderToken !== activeRenderToken) {
      return;
    }

    surface.appendChild(textLayer);
    applyPdfPageAnnotations(surface, wrapper.dataset.readingPdfPage);
    applyPdfPageSourceHighlight(surface, wrapper.dataset.readingPdfPage);
    wrapper.dataset.renderState = 'ready';
  })().catch((error) => {
    if (renderToken !== activeRenderToken) {
      return;
    }

    wrapper.dataset.renderState = 'error';
    surface.innerHTML = `<div class="reading-pdf-loading is-error">${error instanceof Error ? error.message : String(error)}</div>`;
  }).finally(() => {
    if (pageRecord.renderPromise === renderPromise) {
      pageRecord.renderPromise = null;
    }
  });
  pageRecord.renderPromise = renderPromise;

  await pageRecord.renderPromise;
}

function updatePdfPageRecordZoom(pageRecord, host, zoom) {
  const pageNumber = Number(pageRecord.wrapper.dataset.readingPdfPage) || 1;
  const viewport = resolvePdfViewport(pageRecord.page, host, zoom);
  pageRecord.viewport = viewport;
  applyPdfPageMetrics(pageRecord.surface, viewport);
  pageRecord.renderTask?.cancel?.();
  pageRecord.renderTask = null;
  pageRecord.renderPromise = null;
  pageRecord.wrapper.dataset.renderState = 'pending';

  const canvas = pageRecord.surface.querySelector('.reading-pdf-canvas');
  if (canvas) {
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
  } else if (!pageRecord.surface.querySelector('.reading-pdf-page-placeholder')) {
    pageRecord.surface.replaceChildren(createPdfPagePlaceholder(pageNumber));
  }
}

function rescaleHydratedPdfPages({ host, pageRecords, pdfjsLib, targetPage, zoom }) {
  if (!pageRecords?.length) {
    return false;
  }

  const previousZoom = Number(host.dataset.pdfZoom || 100) || 100;
  const previousScrollTop = host.scrollTop;
  const previousPageWidth = Number.parseFloat(pageRecords[0]?.surface?.style?.width || '') || 0;
  const renderToken = ++activeRenderToken;
  disconnectActivePageObserver();
  host.dataset.pdfZoom = String(zoom);
  host.dataset.pdfFitWidth = pdfHostFitWidthKey(host);
  host.dataset.renderState = 'ready';

  pageRecords.forEach((pageRecord) => {
    updatePdfPageRecordZoom(pageRecord, host, zoom);
    if (
      Number(pageRecord.wrapper.dataset.readingPdfPage) <= 2 ||
      Number(pageRecord.wrapper.dataset.readingPdfPage) === Number(targetPage) ||
      Number(pageRecord.wrapper.dataset.readingPdfPage) === Number(activeSourceHighlight?.page)
    ) {
      void renderPdfPage({ force: true, pageRecord, pdfjsLib, renderToken });
    }
  });

  const nextPageWidth = Number.parseFloat(pageRecords[0]?.surface?.style?.width || '') || 0;
  const scrollRatio = previousPageWidth > 0 && nextPageWidth > 0 ? nextPageWidth / previousPageWidth : zoom / previousZoom;
  host.scrollTop = Math.round(previousScrollTop * scrollRatio);
  observePdfPages({ host, pageRecords, pdfjsLib, renderToken });
  syncReadingPdfAnnotations(host, activeAnnotations);
  syncReadingPdfSourceHighlight(host, activeSourceHighlight);
  if (targetPage) {
    window.requestAnimationFrame(() => {
      scrollReadingPdfToPage(host, targetPage);
    });
  }
  return true;
}

function observePdfPages({ host, pageRecords, pdfjsLib, renderToken }) {
  disconnectActivePageObserver();

  if (typeof window.IntersectionObserver !== 'function') {
    pageRecords.forEach((pageRecord) => {
      scheduleIdleTask(() => {
        void renderPdfPage({ pageRecord, pdfjsLib, renderToken });
      });
    });
    return;
  }

  activePageObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        observer.unobserve(entry.target);
        const pageRecord = pageRecords.find((record) => record.wrapper === entry.target);
        if (!pageRecord) {
          return;
        }

        scheduleIdleTask(() => {
          void renderPdfPage({ pageRecord, pdfjsLib, renderToken });
        });
      });
    },
    {
      root: host,
      rootMargin: '900px 0px',
      threshold: 0.01,
    },
  );

  pageRecords.forEach((pageRecord) => {
    activePageObserver.observe(pageRecord.wrapper);
  });
}

export async function hydrateReadingPdfSurface({ annotations = [], baseUrl, host, pdfUrl, sourceHighlight = null, targetPage = null, zoom = 100 }) {
  if (!host || !pdfUrl) {
    return;
  }

  const nextPdfUrl = String(pdfUrl);
  const nextZoom = Number.isFinite(Number(zoom)) ? Math.min(200, Math.max(50, Number(zoom))) : 100;
  const nextZoomKey = String(nextZoom);
  const nextFitWidthKey = pdfHostFitWidthKey(host);
  activeAnnotations = normalizePdfAnnotations(annotations);
  activeSourceHighlight = normalizeSourceHighlight(sourceHighlight);
  if (
    host.dataset.renderState === 'ready' &&
    host.dataset.pdfUrl === nextPdfUrl &&
    (host.dataset.pdfZoom !== nextZoomKey || host.dataset.pdfFitWidth !== nextFitWidthKey)
  ) {
    const viewerState = getPdfViewerState(host);
    if (
      viewerState?.pdfUrl === nextPdfUrl &&
      rescaleHydratedPdfPages({
        host,
        pageRecords: viewerState.pageRecords,
        pdfjsLib: viewerState.pdfjsLib,
        targetPage,
        zoom: nextZoom,
      })
    ) {
      return;
    }
  }

  if (host.dataset.renderState === 'ready' && host.dataset.pdfUrl === nextPdfUrl && host.dataset.pdfZoom === nextZoomKey) {
    syncReadingPdfAnnotations(host, activeAnnotations);
    syncReadingPdfSourceHighlight(host, activeSourceHighlight);
    if (targetPage) {
      window.requestAnimationFrame(() => {
        scrollReadingPdfToPage(host, targetPage);
      });
    }
    return;
  }

  const renderToken = ++activeRenderToken;
  disconnectActivePageObserver();
  clearPdfViewerState(host);
  host.dataset.renderState = 'loading';
  host.dataset.pdfUrl = nextPdfUrl;
  host.dataset.pdfZoom = nextZoomKey;
  host.dataset.pdfFitWidth = nextFitWidthKey;
  setMessage(host, 'PDF를 불러오는 중입니다…');

  try {
    const pdfjsLib = await loadPdfJs(baseUrl);
    const loadingTask = pdfjsLib.getDocument({ url: pdfUrl });
    const pdf = await loadingTask.promise;
    if (renderToken !== activeRenderToken) {
      return;
    }

    host.innerHTML = '';
    host.dataset.renderState = 'ready';
    const pageRecords = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      if (renderToken !== activeRenderToken) {
        return;
      }

      const viewport = resolvePdfViewport(page, host, nextZoom);
      const { surface, wrapper } = createPdfPageShell(viewport, pageNumber);
      const pageRecord = { page, surface, viewport, wrapper };
      pageRecords.push(pageRecord);
      host.appendChild(wrapper);
      if (pageNumber <= 2 || pageNumber === Number(targetPage) || pageNumber === Number(activeSourceHighlight?.page)) {
        void renderPdfPage({ pageRecord, pdfjsLib, renderToken });
      }
    }

    observePdfPages({ host, pageRecords, pdfjsLib, renderToken });
    setPdfViewerState(host, { pageRecords, pdf, pdfjsLib, pdfUrl: nextPdfUrl });
    syncReadingPdfAnnotations(host, activeAnnotations);
    syncReadingPdfSourceHighlight(host, activeSourceHighlight);
    if (targetPage) {
      window.requestAnimationFrame(() => {
        scrollReadingPdfToPage(host, targetPage);
      });
    }
  } catch (error) {
    if (renderToken !== activeRenderToken) {
      return;
    }

    host.dataset.renderState = 'error';
    setMessage(host, error instanceof Error ? error.message : String(error), 'is-error');
  }
}
