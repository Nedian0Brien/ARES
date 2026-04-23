let pdfjsModulePromise = null;
let activeRenderToken = 0;

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

function createCanvasPage() {
  const wrapper = document.createElement('article');
  wrapper.className = 'reading-pdf-canvas-page';

  const canvas = document.createElement('canvas');
  canvas.className = 'reading-pdf-canvas';
  wrapper.appendChild(canvas);
  return { canvas, wrapper };
}

export function resetReadingPdfSurface() {
  activeRenderToken += 1;
}

export async function hydrateReadingPdfSurface({ baseUrl, host, pdfUrl }) {
  if (!host || !pdfUrl) {
    return;
  }

  const renderToken = ++activeRenderToken;
  host.dataset.renderState = 'loading';
  setMessage(host, 'PDF를 불러오는 중입니다…');

  try {
    const pdfjsLib = await loadPdfJs(baseUrl);
    const response = await fetch(pdfUrl, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`PDF load failed with ${response.status}`);
    }

    const pdfBytes = await response.arrayBuffer();
    if (renderToken !== activeRenderToken) {
      return;
    }

    const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
    const pdf = await loadingTask.promise;
    if (renderToken !== activeRenderToken) {
      return;
    }

    host.innerHTML = '';
    host.dataset.renderState = 'ready';
    const fragment = document.createDocumentFragment();

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      if (renderToken !== activeRenderToken) {
        return;
      }

      const { canvas, wrapper } = createCanvasPage();
      const viewport = page.getViewport({ scale: 1.28 });
      const outputScale = window.devicePixelRatio || 1;
      const context = canvas.getContext('2d', { alpha: false });
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      await page.render({
        canvasContext: context,
        transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null,
        viewport,
      }).promise;

      const meta = document.createElement('div');
      meta.className = 'reading-pdf-canvas-meta';
      meta.textContent = `Page ${pageNumber}`;
      wrapper.appendChild(meta);
      fragment.appendChild(wrapper);
    }

    host.appendChild(fragment);
  } catch (error) {
    if (renderToken !== activeRenderToken) {
      return;
    }

    host.dataset.renderState = 'error';
    setMessage(host, error instanceof Error ? error.message : String(error), 'is-error');
  }
}
