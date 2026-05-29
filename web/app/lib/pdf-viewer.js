let pdfjsModulePromise = null;
let activeRenderToken = 0;
let activePageObserver = null;

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
  disconnectActivePageObserver();
}

async function renderPdfPage({ pageRecord, pdfjsLib, renderToken }) {
  const { page, surface, viewport, wrapper } = pageRecord;
  if (renderToken !== activeRenderToken || wrapper.dataset.renderState === 'ready') {
    return;
  }

  if (pageRecord.renderPromise) {
    await pageRecord.renderPromise;
    return;
  }

  pageRecord.renderPromise = (async () => {
    wrapper.dataset.renderState = 'rendering';
    const outputScale = window.devicePixelRatio || 1;
    const canvas = document.createElement('canvas');
    canvas.className = 'reading-pdf-canvas';
    const context = canvas.getContext('2d', { alpha: false });
    canvas.width = Math.ceil(viewport.width * outputScale);
    canvas.height = Math.ceil(viewport.height * outputScale);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    surface.replaceChildren(canvas);

    await page.render({
      canvasContext: context,
      transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null,
      viewport,
    }).promise;

    if (renderToken !== activeRenderToken) {
      return;
    }

    const textLayer = await createSelectableTextLayer({ page, pdfjsLib, viewport });
    if (renderToken !== activeRenderToken) {
      return;
    }

    surface.appendChild(textLayer);
    wrapper.dataset.renderState = 'ready';
  })().catch((error) => {
    if (renderToken !== activeRenderToken) {
      return;
    }

    wrapper.dataset.renderState = 'error';
    surface.innerHTML = `<div class="reading-pdf-loading is-error">${error instanceof Error ? error.message : String(error)}</div>`;
  });

  await pageRecord.renderPromise;
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

export async function hydrateReadingPdfSurface({ baseUrl, host, pdfUrl, targetPage = null, zoom = 100 }) {
  if (!host || !pdfUrl) {
    return;
  }

  const nextPdfUrl = String(pdfUrl);
  const nextZoom = Number.isFinite(Number(zoom)) ? Math.min(200, Math.max(50, Number(zoom))) : 100;
  const nextZoomKey = String(nextZoom);
  if (host.dataset.renderState === 'ready' && host.dataset.pdfUrl === nextPdfUrl && host.dataset.pdfZoom === nextZoomKey) {
    if (targetPage) {
      window.requestAnimationFrame(() => {
        scrollReadingPdfToPage(host, targetPage);
      });
    }
    return;
  }

  const renderToken = ++activeRenderToken;
  disconnectActivePageObserver();
  host.dataset.renderState = 'loading';
  host.dataset.pdfUrl = nextPdfUrl;
  host.dataset.pdfZoom = nextZoomKey;
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

      const viewport = page.getViewport({ scale: 1.28 * (nextZoom / 100) });
      const { surface, wrapper } = createPdfPageShell(viewport, pageNumber);
      const pageRecord = { page, surface, viewport, wrapper };
      pageRecords.push(pageRecord);
      host.appendChild(wrapper);
      if (pageNumber <= 2 || pageNumber === Number(targetPage)) {
        void renderPdfPage({ pageRecord, pdfjsLib, renderToken });
      }
    }

    observePdfPages({ host, pageRecords, pdfjsLib, renderToken });
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
