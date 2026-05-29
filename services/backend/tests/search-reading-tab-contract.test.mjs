import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..');

async function readProjectFile(relativePath) {
  return readFile(path.join(rootDir, relativePath), 'utf8');
}

test('Search + Reading tab exposes Discover, Library, and Reader modes', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.match(appJs, /function renderWorkflowModeNav/);
  assert.match(appJs, /data-ares-role="workflow-mode-nav"/);
  assert.match(appJs, /Discover/);
  assert.match(appJs, /Library/);
  assert.match(appJs, /Reader/);
  assert.match(appJs, /data-tab-id="\$\{escapeHtml\(tab\.id\)\}"/);
});

test('Search and Reading surfaces use Read tab language', async () => {
  const [searchJs, readingJs] = await Promise.all([
    readProjectFile('web/app/features/search.js'),
    readProjectFile('web/app/features/reading.js'),
  ]);

  assert.match(searchJs, /<span>Read<\/span>/);
  assert.match(searchJs, /Discover/);
  assert.match(readingJs, /<span>Read<\/span>/);
  assert.match(readingJs, /Reading Library/);
  assert.match(readingJs, /Back to Discover/);
});

test('Read library upload uses a native file input inside the visible control', async () => {
  const readingJs = await readProjectFile('web/app/features/reading.js');

  assert.match(readingJs, /<label\s+class="reading-home-tool-btn reading-home-upload-btn/);
  assert.match(readingJs, /type="file"/);
  assert.match(readingJs, /name="readingPdfUpload"/);
  assert.match(readingJs, /accept="application\/pdf,\.pdf"/);
  assert.match(readingJs, /Upload PDF/);
  assert.doesNotMatch(readingJs, /trigger-reading-pdf-upload/);
});

test('Read library accepts dragged PDF files on the worklist panel', async () => {
  const [appJs, readingJs, stylesCss] = await Promise.all([
    readProjectFile('web/app.js'),
    readProjectFile('web/app/features/reading.js'),
    readProjectFile('web/styles.css'),
  ]);

  assert.match(readingJs, /data-reading-pdf-dropzone="true"/);
  assert.match(readingJs, /Drag PDF here/);
  assert.match(readingJs, /Drop PDF to upload/);
  assert.match(stylesCss, /\.reading-home-dropzone\.is-dragging/);
  assert.match(appJs, /readingPdfDropActive/);
  assert.match(appJs, /document\.addEventListener\("dragover"/);
  assert.match(appJs, /document\.addEventListener\("drop"/);
  assert.match(appJs, /getReadingPdfDropFile/);
  assert.match(appJs, /void uploadReadingPdf\(file\)/);
});

test('Read upload sends binary PDFs and guards the 100MB client limit', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.match(appJs, /MAX_READING_PDF_UPLOAD_BYTES = 100 \* 1024 \* 1024/);
  assert.match(appJs, /MAX_READING_PDF_UPLOAD_LABEL = "100MB"/);
  assert.match(appJs, /file\.size > MAX_READING_PDF_UPLOAD_BYTES/);
  assert.match(appJs, /"content-type": "application\/pdf"/);
  assert.match(appJs, /"x-file-name": encodeURIComponent/);
  assert.match(appJs, /body: file/);
  assert.doesNotMatch(appJs, /arrayBufferToBase64/);
});

test('Agent run updates use SSE and refresh only the active stage', async () => {
  const appJs = await readProjectFile('web/app.js');
  const pollStart = appJs.indexOf('async function pollAgentRun(runId)');
  const subscribeStart = appJs.indexOf('function subscribeAgentRun(runId)');
  const resetStart = appJs.indexOf('function resetSearchState()');
  const pollAgentRunBody = appJs.slice(pollStart, subscribeStart);
  const subscribeAgentRunBody = appJs.slice(subscribeStart, resetStart);

  assert.match(appJs, /activeRunEventSource/);
  assert.match(appJs, /function subscribeAgentRun\(runId\)/);
  assert.match(appJs, /new EventSource\(appUrl\(`api\/agent-runs\/\$\{encodeURIComponent\(runId\)\}\/events`\)\.href\)/);
  assert.match(subscribeAgentRunBody, /source\.addEventListener\("run"/);
  assert.match(subscribeAgentRunBody, /void pollAgentRun\(runId\)/);
  assert.match(appJs, /function patchSearchStageUI\(\)/);
  assert.match(appJs, /function refreshActiveStageUI\(\)/);
  assert.match(pollAgentRunBody, /refreshActiveStageUI\(\)/);
  assert.doesNotMatch(pollAgentRunBody, /render\(\)/);
});

test('Backend exposes an SSE endpoint for agent run updates', async () => {
  const indexJs = await readProjectFile('services/backend/index.mjs');

  assert.match(indexJs, /function registerAgentRunEventClient/);
  assert.match(indexJs, /content-type': 'text\/event-stream; charset=utf-8'/);
  assert.match(indexJs, /sendSseEvent\(response, 'run', payload\)/);
  assert.match(indexJs, /\/api\\\/agent-runs\\\/\[\^\/\]\+\\\/events/);
  assert.match(indexJs, /agentRunService\.subscribeRun/);
});

test('PDF viewer renders long documents progressively instead of blocking on every page', async () => {
  const viewerJs = await readProjectFile('web/app/lib/pdf-viewer.js');

  assert.match(viewerJs, /function createPdfPageShell/);
  assert.match(viewerJs, /function renderPdfPage/);
  assert.match(viewerJs, /IntersectionObserver/);
  assert.match(viewerJs, /requestIdleCallback/);
  assert.match(viewerJs, /host\.appendChild\(wrapper\)/);
  assert.doesNotMatch(viewerJs, /host\.appendChild\(fragment\)/);
});

test('Reading PDF hydration is isolated behind a controller module', async () => {
  const [appJs, controllerJs] = await Promise.all([
    readProjectFile('web/app.js'),
    readProjectFile('web/app/features/reading-pdf-controller.js'),
  ]);

  assert.match(appJs, /import \{ createReadingPdfController \} from "\.\/app\/features\/reading-pdf-controller\.js"/);
  assert.match(appJs, /const readingPdfController = createReadingPdfController/);
  assert.match(controllerJs, /export function createReadingPdfController/);
  assert.match(controllerJs, /hydrateReadingPdfSurface/);
  assert.match(controllerJs, /resetReadingPdfSurface/);
  assert.match(controllerJs, /scrollReadingPdfToPage/);
  assert.doesNotMatch(appJs, /import \{ hydrateReadingPdfSurface, resetReadingPdfSurface, scrollReadingPdfToPage \}/);
});

test('Reading DOM patching is isolated from the app shell', async () => {
  const [appJs, patchJs] = await Promise.all([
    readProjectFile('web/app.js'),
    readProjectFile('web/app/features/reading-dom-patch.js'),
  ]);

  assert.match(appJs, /from "\.\/app\/features\/reading-dom-patch\.js"/);
  assert.match(patchJs, /export function captureStableReadingPdfHost/);
  assert.match(patchJs, /export function patchStableReadingPdfDocPane/);
  assert.match(patchJs, /export function patchReadingSplitPreservingPdf/);
  assert.match(patchJs, /export function syncReadingPdfDockState/);
  assert.doesNotMatch(appJs, /function matchingStableReadingPdfHosts/);
  assert.doesNotMatch(appJs, /function syncReadingElementShell/);
});

test('Reading handoff targets Lab language instead of legacy Research tab copy', async () => {
  const readingJs = await readProjectFile('web/app/features/reading.js');

  assert.match(readingJs, /Send to Lab/);
  assert.doesNotMatch(readingJs, /Send to Research/);
});
