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

const STYLE_FILES = [
  'web/styles.css',
  'web/styles/base.css',
  'web/styles/lab.css',
  'web/styles/insight.css',
  'web/styles/writing.css',
  'web/styles/reading.css',
  'web/styles/search.css',
];

async function readProjectStyles() {
  const chunks = await Promise.all(STYLE_FILES.map((relativePath) => readProjectFile(relativePath)));
  return chunks.join('\n');
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

  assert.match(searchJs, /<span>Queue<\/span>/);
  assert.match(searchJs, /Research Queue/);
  assert.match(readingJs, /<span>Read<\/span>/);
  assert.match(readingJs, /Reading Library/);
  assert.match(readingJs, /Back to Discover/);
});

test('Visible dashboard controls are wired actions or non-interactive status text', async () => {
  const [appJs, searchJs, stylesCss] = await Promise.all([
    readProjectFile('web/app.js'),
    readProjectFile('web/app/features/search.js'),
    readProjectStyles(),
  ]);

  assert.match(appJs, /data-action="copy-stage-link"[\s\S]*Share/);
  assert.match(appJs, /data-action="toggle-filter-panel"[\s\S]*Filter/);
  assert.match(appJs, /<div class="workspace-switch"/);
  assert.match(appJs, /<div class="sidebar-account"/);
  assert.match(searchJs, /<span>7D<\/span><span class="active">30D<\/span><span>90D<\/span><span>ALL<\/span>/);
  assert.match(searchJs, /<span class="dashboard-f-chip active">전체/);
  assert.match(searchJs, /<span class="dashboard-tool-btn">/);
  assert.match(searchJs, /<span class="dashboard-page-btn">‹<\/span>/);
  assert.match(searchJs, /<span class="btn-g results-summary-btn">/);
  assert.match(stylesCss, /\.dashboard-toggle-group span/);
  assert.doesNotMatch(searchJs, /<button type="button">7D<\/button>/);
  assert.doesNotMatch(searchJs, /<button type="button" class="dashboard-f-chip/);
  assert.doesNotMatch(searchJs, /<button type="button" class="dashboard-tool-btn/);
  assert.doesNotMatch(searchJs, /<button type="button" class="dashboard-page-btn/);
  assert.doesNotMatch(searchJs, /<button type="button" class="btn-g results-summary-btn/);
  assert.doesNotMatch(appJs, /<button type="button" class="workspace-switch/);
  assert.doesNotMatch(appJs, /<button type="button" class="sidebar-account/);
});

test('Theme switcher persists light, dark, and system modes through shared CSS tokens', async () => {
  const [appJs, stylesCss] = await Promise.all([
    readProjectFile('web/app.js'),
    readProjectStyles(),
  ]);

  assert.match(appJs, /themeMode: "ares\.theme\.mode"/);
  assert.match(appJs, /const THEME_MODES = \["light", "dark", "system"\]/);
  assert.match(appJs, /function applyThemeMode\(mode = state\.themeMode\)/);
  assert.match(appJs, /root\.dataset\.theme = resolved/);
  assert.match(appJs, /data-action="set-theme-mode"/);
  assert.match(appJs, /aria-pressed="\$\{active \? "true" : "false"\}"/);
  assert.match(stylesCss, /html\[data-theme="dark"\]/);
  assert.match(stylesCss, /--control-strong-bg:/);
  assert.match(stylesCss, /--hover-control-bg:/);
  assert.match(stylesCss, /\.theme-switcher-btn\.is-active/);
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
    readProjectStyles(),
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

test('Reading home preview exposes wired paper actions instead of inert bookmark buttons', async () => {
  const [appJs, readingJs] = await Promise.all([
    readProjectFile('web/app.js'),
    readProjectFile('web/app/features/reading.js'),
  ]);

  assert.match(readingJs, /data-action="toggle-reading-home-preview-menu"/);
  assert.match(readingJs, /data-action="open-reading-home-source"/);
  assert.match(readingJs, /data-action="copy-reading-home-paper-link"/);
  assert.match(readingJs, /data-action="open-reading-detail"/);
  assert.match(appJs, /if \(action === "toggle-reading-home-preview-menu"\)/);
  assert.match(appJs, /if \(action === "open-reading-home-source"\)/);
  assert.match(appJs, /if \(action === "copy-reading-home-paper-link"\)/);
  assert.doesNotMatch(readingJs, /<button type="button" class="btn-s" aria-label="Add bookmark"/);
  assert.doesNotMatch(readingJs, /<button type="button" class="reading-home-preview-icon" aria-label="Add bookmark"/);
});

test('Reading home metric diagrams are driven by current library counts', async () => {
  const readingJs = await readProjectFile('web/app/features/reading.js');

  assert.match(readingJs, /function renderReadingHomeMetricDiagram/);
  assert.match(readingJs, /renderReadingHomeMetricCard\(\{[^}]*counts[^}]*\}\)/);
  assert.match(readingJs, /dataset = \[/);
  assert.match(readingJs, /counts\.saved/);
  assert.match(readingJs, /counts\.ready/);
  assert.match(readingJs, /counts\.running/);
  assert.match(readingJs, /counts\.done/);
  assert.doesNotMatch(readingJs, /M2 25L14 24L26 21L38 17L50 19L62 14L74 12L86 9/);
  assert.doesNotMatch(readingJs, /\[12, 22, 16, 30, 18, 26\]/);
});

test('Reading asset detail exposes source-backed files for thumbnails and table data', async () => {
  const [appJs, readingJs, readingRoutesJs] = await Promise.all([
    readProjectFile('web/app.js'),
    readProjectFile('web/app/features/reading.js'),
    readProjectFile('services/backend/routes/reading-routes.mjs'),
  ]);

  assert.match(readingJs, /reading-asset-thumb-image/);
  assert.match(readingJs, /kind=thumb/);
  assert.match(readingJs, /data-action="open-reading-asset-data"/);
  assert.match(readingJs, /renderReadingAssetSourceMap/);
  assert.match(readingJs, /renderReadingAssetQuality/);
  assert.match(readingJs, /reading-asset-quality/);
  assert.match(readingJs, /sourceBounds/);
  assert.match(readingJs, /sourceText/);
  assert.match(readingJs, /reading-asset-source-map/);
  assert.match(appJs, /if \(action === "open-reading-asset-data"\)/);
  assert.match(appJs, /file\?kind=data/);
  assert.match(readingRoutesJs, /\/api\\\/reading-sessions\\\/\[\^\/\]\+\\\/assets\\\/\[\^\/\]\+\\\/file/);
  assert.match(readingRoutesJs, /url\.searchParams\.get\('kind'\) \|\| 'thumb'/);
});

test('Reading asset source jumps render a PDF source highlight overlay', async () => {
  const [appJs, readingJs, controllerJs, viewerJs, stylesCss] = await Promise.all([
    readProjectFile('web/app.js'),
    readProjectFile('web/app/features/reading.js'),
    readProjectFile('web/app/features/reading-pdf-controller.js'),
    readProjectFile('web/app/lib/pdf-viewer.js'),
    readProjectStyles(),
  ]);

  assert.match(readingJs, /data-reading-asset-id="\$\{escapeHtml\(detailAsset\.id \|\| ""\)\}"/);
  assert.match(appJs, /readingPdfSourceHighlight/);
  assert.match(appJs, /sourceBounds/);
  assert.match(controllerJs, /sourceHighlight: state\.readingPdfSourceHighlight/);
  assert.match(viewerJs, /reading-pdf-source-highlight/);
  assert.match(viewerJs, /syncReadingPdfSourceHighlight/);
  assert.match(stylesCss, /\.reading-pdf-source-highlight/);
});

test('Reader PDF view renders page-level annotation markers from notes and highlights', async () => {
  const [controllerJs, viewerJs, stylesCss] = await Promise.all([
    readProjectFile('web/app/features/reading-pdf-controller.js'),
    readProjectFile('web/app/lib/pdf-viewer.js'),
    readProjectStyles(),
  ]);

  assert.match(controllerJs, /annotations: buildReadingPdfAnnotations\(session\)/);
  assert.match(controllerJs, /type: "note"/);
  assert.match(controllerJs, /type: "highlight"/);
  assert.match(viewerJs, /reading-pdf-annotation-layer/);
  assert.match(viewerJs, /reading-pdf-annotation-marker/);
  assert.match(viewerJs, /syncReadingPdfAnnotations/);
  assert.match(stylesCss, /\.reading-pdf-annotation-layer/);
  assert.match(stylesCss, /\.reading-pdf-annotation-marker/);
});

test('Reader PDF selection notes preserve page-ratio highlight boxes', async () => {
  const [appJs, controllerJs, viewerJs, stylesCss] = await Promise.all([
    readProjectFile('web/app.js'),
    readProjectFile('web/app/features/reading-pdf-controller.js'),
    readProjectFile('web/app/lib/pdf-viewer.js'),
    readProjectStyles(),
  ]);

  assert.match(appJs, /function captureReadingSelectionSourceBounds/);
  assert.match(appJs, /rects: normalizeReadingSelectionRects/);
  assert.match(appJs, /sourceBounds: selection\.sourceBounds/);
  assert.match(controllerJs, /sourceBounds: note\.sourceBounds/);
  assert.match(viewerJs, /reading-pdf-annotation-box/);
  assert.match(viewerJs, /annotation\.sourceBounds\.rects/);
  assert.match(viewerJs, /annotation\.sourceBounds/);
  assert.match(stylesCss, /\.reading-pdf-annotation-box/);
});

test('Reading asset detail can copy citations and create linked evidence', async () => {
  const [appJs, readingJs] = await Promise.all([
    readProjectFile('web/app.js'),
    readProjectFile('web/app/features/reading.js'),
  ]);

  assert.match(readingJs, /data-action="copy-reading-asset-citation"/);
  assert.match(readingJs, /data-action="create-reading-asset-evidence"/);
  assert.match(readingJs, /reading-asset-detail-table/);
  assert.match(appJs, /function readingAssetCitationText/);
  assert.match(appJs, /if \(action === "copy-reading-asset-citation"\)/);
  assert.match(appJs, /if \(action === "create-reading-asset-evidence"\)/);
  assert.match(appJs, /api\/projects\/\$\{encodeURIComponent\(project\.id\)\}\/evidence-links/);
  assert.match(appJs, /type:\s*"readingAsset"/);
});

test('Reader chat marks assistant answers with no citations as insufficient evidence', async () => {
  const readingJs = await readProjectFile('web/app/features/reading.js');

  assert.match(readingJs, /message\.role === "assistant" && !message\.typing && !message\.cites\?\.length/);
  assert.match(readingJs, /reading-no-evidence-pill/);
  assert.match(readingJs, /Insufficient evidence/);
});

test('Reader chat context label reflects hybrid retrieval instead of lexical-only retrieval', async () => {
  const readingJs = await readProjectFile('web/app/features/reading.js');

  assert.match(readingJs, /Context: hybrid retrieval chunks/);
  assert.doesNotMatch(readingJs, /Context: lexical retrieval top-K chunks/);
});

test('Reader chat exposes retrieval confidence telemetry', async () => {
  const [readingJs, styles] = await Promise.all([
    readProjectFile('web/app/features/reading.js'),
    readProjectStyles(),
  ]);

  assert.match(readingJs, /renderReadingRetrievalPill/);
  assert.match(readingJs, /Low confidence retrieval/);
  assert.match(readingJs, /Hybrid retrieval/);
  assert.match(readingJs, /retrieval\.minEvidenceScore/);
  assert.match(readingJs, /min \$\{escapeHtml\(String\(minEvidenceScore\)\)\}/);
  assert.match(styles, /\.reading-retrieval-pill/);
  assert.match(styles, /\.reading-retrieval-pill\.is-low/);
});

test('Reader retrieval scorer can be configured through server environment', async () => {
  const [envExample, indexJs, readme, runtimeDoc, scorerJs] = await Promise.all([
    readProjectFile('.env.example'),
    readProjectFile('services/backend/index.mjs'),
    readProjectFile('README.md'),
    readProjectFile('docs/backend-runtime-overview.md'),
    readProjectFile('services/backend/lib/retrieval-scorer.mjs'),
  ]);

  assert.match(indexJs, /createConfiguredRetrievalScorer/);
  assert.match(indexJs, /retrievalScorer,\s*\n\s*rootDir:/);
  assert.match(envExample, /ARES_RETRIEVAL_SCORER_PROVIDER=local-cross-encoder/);
  assert.match(envExample, /ARES_RETRIEVAL_SCORER_URL=/);
  assert.match(envExample, /ARES_RETRIEVAL_SCORER_API_KEY=/);
  assert.match(envExample, /ARES_RETRIEVAL_SCORER_TIMEOUT_MS=2500/);
  assert.match(readme, /local-cross-encoder/);
  assert.match(readme, /validate-retrieval-scorer\.mjs/);
  assert.match(readme, /npm run smoke:retrieval-scorer/);
  assert.match(runtimeDoc, /ARES_RETRIEVAL_SCORER_PROVIDER/);
  assert.match(runtimeDoc, /npm run smoke:deploy/);
  assert.match(scorerJs, /ARES_RETRIEVAL_SCORER_URL/);
  assert.match(scorerJs, /ARES_RETRIEVAL_SCORER_API_KEY/);
  assert.match(scorerJs, /ARES_RETRIEVAL_SCORER_TIMEOUT_MS/);
  assert.match(scorerJs, /scoreChunks/);
});

test('Reader summary exposes evidence coverage report', async () => {
  const [readingJs, styles] = await Promise.all([
    readProjectFile('web/app/features/reading.js'),
    readProjectStyles(),
  ]);

  assert.match(readingJs, /evidenceCoverage/);
  assert.match(readingJs, /reading-evidence-coverage/);
  assert.match(readingJs, /Retrieval ready/);
  assert.match(readingJs, /Source-bounded assets/);
  assert.match(styles, /\.reading-evidence-coverage/);
});

test('Reader summary and note export preserve generation provenance', async () => {
  const [appJs, readingJs] = await Promise.all([
    readProjectFile('web/app.js'),
    readProjectFile('web/app/features/reading.js'),
  ]);

  assert.match(readingJs, /function renderReadingProvenancePill/);
  assert.match(readingJs, /kindClass = kind === "section" \? "is-section"/);
  assert.match(readingJs, /renderReadingProvenancePill\(session,\s*"section"\)/);
  assert.match(appJs, /function readingGenerationProvenanceLine/);
  assert.match(appJs, /## Generation provenance/);
  assert.match(appJs, /Summary:\s*\$\{readingGenerationProvenanceLine\(session,\s*"summary"\)\}/);
  assert.match(appJs, /Chat turns:/);
  assert.match(appJs, /readingGenerationProvenanceLine\(message,\s*"chat"\)/);
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
  assert.match(subscribeAgentRunBody, /source\.addEventListener\("progress"/);
  assert.match(subscribeAgentRunBody, /applyAgentRunProgressEvent/);
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
  assert.match(indexJs, /sendSseEvent\(response, 'progress'/);
  assert.match(indexJs, /sendSseEvent\(response, 'run', payload\)/);
  assert.match(indexJs, /\/api\\\/agent-runs\\\/\[\^\/\]\+\\\/events/);
  assert.match(indexJs, /agentRunService\.subscribeRun/);
});

test('Backend replays stored agent progress before the live run snapshot', async () => {
  const indexJs = await readProjectFile('services/backend/index.mjs');
  const registerStart = indexJs.indexOf('function registerAgentRunEventClient');
  const collectStart = indexJs.indexOf('async function collectDirectories');
  const registerBody = indexJs.slice(registerStart, collectStart);
  const progressIndex = registerBody.indexOf("sendSseEvent(response, 'progress'");
  const runIndex = registerBody.indexOf('sendRun(initialPayload)');

  assert.ok(progressIndex >= 0, 'progress replay event must be sent on SSE connect');
  assert.ok(runIndex >= 0, 'run snapshot must still be sent on SSE connect');
  assert.ok(progressIndex < runIndex, 'stored progress should replay before the run snapshot');
});

test('Agent run UI treats canceled runs as terminal', async () => {
  const appJs = await readProjectFile('web/app.js');
  const terminalStart = appJs.indexOf('function isTerminalAgentRunStatus(status)');
  const progressStart = appJs.indexOf('function readingProgress(session)');
  const terminalBody = appJs.slice(terminalStart, progressStart);

  assert.match(terminalBody, /status === "canceled"/);
  assert.match(appJs, /searchRun\.status === "canceled" \? "Canceled"/);
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

test('Reader PDF tools expose document search, page thumbnails, and zoom controls', async () => {
  const [appJs, readingJs] = await Promise.all([
    readProjectFile('web/app.js'),
    readProjectFile('web/app/features/reading.js'),
  ]);

  assert.match(appJs, /readingPdfSearchQuery/);
  assert.match(appJs, /set-reading-pdf-search-query/);
  assert.match(appJs, /jump-reading-pdf-search-result/);
  assert.match(readingJs, /data-reading-pdf-dock-panel="search"/);
  assert.match(readingJs, /name="readingPdfSearchQuery"/);
  assert.match(readingJs, /class="pdf-search-result/);
  assert.match(readingJs, /page-grid-panel/);
  assert.match(readingJs, /data-action="set-reading-pdf-zoom"/);
  assert.match(readingJs, /data-action="fit-reading-pdf-zoom"/);
});

test('Reader exposes built-in OCR and manual text import recovery paths', async () => {
  const [appJs, envExample, packageJson, readingJs, indexJs, readingRoutesJs] = await Promise.all([
    readProjectFile('web/app.js'),
    readProjectFile('.env.example'),
    readProjectFile('package.json'),
    readProjectFile('web/app/features/reading.js'),
    readProjectFile('services/backend/index.mjs'),
    readProjectFile('services/backend/routes/reading-routes.mjs'),
  ]);

  assert.match(packageJson, /"tesseract\.js"/);
  assert.match(indexJs, /ARES_OCR_MAX_PAGES/);
  assert.match(readingRoutesJs, /import-text/);
  assert.match(envExample, /ARES_OCR_MAX_PAGES=12/);
  assert.match(appJs, /submit-reading-text-import-form/);
  assert.match(appJs, /readingTextImport/);
  assert.match(appJs, /readingTextImportTool/);
  assert.match(appJs, /readingTextImportGeneratedAt/);
  assert.match(appJs, /ocrProvenance/);
  assert.match(appJs, /OCR pages/);
  assert.match(appJs, /OCR latency/);
  assert.match(appJs, /readingSessionApiPath\(currentSession\.id, "import-text"\)/);
  assert.match(readingJs, /name="readingTextImport"/);
  assert.match(readingJs, /name="readingTextImportTool"/);
  assert.match(readingJs, /name="readingTextImportGeneratedAt"/);
  assert.match(readingJs, /data-action="submit-reading-text-import-form"/);
  assert.match(readingJs, /Built-in OCR/);
  assert.match(readingJs, /External OCR/);
  assert.match(readingJs, /OCR pages/);
  assert.match(readingJs, /OCR latency/);
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
