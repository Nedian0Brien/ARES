import { appUrl } from './api';

type PdfViewport = {
  height: number;
  width: number;
};

type PdfTextItem = {
  str?: string;
};

type PdfPage = {
  getTextContent: () => Promise<{ items?: PdfTextItem[] }>;
  getViewport: (options: { scale: number }) => PdfViewport;
  render: (options: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }) => { promise: Promise<void> };
};

type PdfDocument = {
  getPage: (pageNumber: number) => Promise<PdfPage>;
  numPages: number;
};

type PdfJsModule = {
  GlobalWorkerOptions: {
    workerSrc: string;
  };
  getDocument: (options: { url: string }) => { promise: Promise<PdfDocument> };
};

let pdfjsModulePromise: Promise<PdfJsModule> | null = null;

function showPdfMessage(host: HTMLElement, message: string, className = '') {
  host.innerHTML = `<div class="reading-pdf-loading ${className}">${message}</div>`;
}

async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfjsModulePromise) {
    const moduleUrl = appUrl('__vendor/pdfjs/pdf.mjs').href;
    pdfjsModulePromise = import(/* @vite-ignore */ moduleUrl).then((module) => {
      const pdfjs = module as PdfJsModule;
      pdfjs.GlobalWorkerOptions.workerSrc = appUrl('__vendor/pdfjs/pdf.worker.mjs').href;
      return pdfjs;
    });
  }
  return pdfjsModulePromise;
}

function hostAvailableWidth(host: HTMLElement): number {
  const rect = host.getBoundingClientRect();
  return Math.max(280, Math.floor(rect.width || host.clientWidth || 720) - 48);
}

function createTextLayer(pageNode: HTMLElement, textItems: PdfTextItem[]) {
  const layer = document.createElement('div');
  layer.className = 'reading-pdf-text-layer textLayer';
  const text = textItems.map((item) => item.str || '').filter(Boolean).join(' ').trim();
  if (text) {
    const span = document.createElement('span');
    span.textContent = text;
    layer.appendChild(span);
  }
  pageNode.appendChild(layer);
}

async function renderPage({
  host,
  page,
  pageNumber,
  zoom,
}: {
  host: HTMLElement;
  page: PdfPage;
  pageNumber: number;
  zoom: number;
}) {
  const initialViewport = page.getViewport({ scale: 1 });
  const scale = Math.max(0.3, (hostAvailableWidth(host) / initialViewport.width) * (zoom / 100));
  const viewport = page.getViewport({ scale });
  const wrapper = document.createElement('div');
  wrapper.className = 'reading-pdf-canvas-page';
  wrapper.dataset.readingPdfPage = String(pageNumber);
  const surface = document.createElement('div');
  surface.className = 'reading-pdf-page-surface';
  surface.style.width = `${Math.round(viewport.width)}px`;
  surface.style.height = `${Math.round(viewport.height)}px`;
  const canvas = document.createElement('canvas');
  canvas.className = 'reading-pdf-canvas';
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${Math.round(viewport.width)}px`;
  canvas.style.height = `${Math.round(viewport.height)}px`;
  surface.appendChild(canvas);
  wrapper.appendChild(surface);
  const meta = document.createElement('div');
  meta.className = 'reading-pdf-canvas-meta';
  meta.textContent = `Page ${pageNumber}`;
  wrapper.appendChild(meta);
  host.appendChild(wrapper);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('PDF canvas is unavailable.');
  }
  await page.render({ canvasContext: context, viewport }).promise;
  const textContent = await page.getTextContent().catch(() => ({ items: [] }));
  createTextLayer(surface, textContent.items || []);
}

export async function hydrateReactReadingPdfSurface({
  host,
  pdfUrl,
  zoom = 100,
}: {
  host: HTMLElement | null;
  pdfUrl: string;
  zoom?: number;
}) {
  if (!host || !pdfUrl) {
    return;
  }
  if (host.dataset.renderState === 'ready' && host.dataset.pdfUrl === pdfUrl && host.dataset.pdfZoom === String(zoom)) {
    return;
  }
  host.dataset.renderState = 'loading';
  host.dataset.pdfUrl = pdfUrl;
  host.dataset.pdfZoom = String(zoom);
  showPdfMessage(host, 'PDF를 불러오는 중입니다...');
  try {
    const pdfjs = await loadPdfJs();
    const pdf = await pdfjs.getDocument({ url: pdfUrl }).promise;
    host.innerHTML = '';
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      await renderPage({ host, page, pageNumber, zoom });
    }
    host.dataset.renderState = 'ready';
  } catch (error) {
    host.dataset.renderState = 'error';
    showPdfMessage(host, error instanceof Error ? error.message : 'PDF를 불러오지 못했습니다.', 'is-error');
  }
}
