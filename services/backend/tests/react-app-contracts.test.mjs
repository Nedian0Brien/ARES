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

function assertHasContractObject(source, contract) {
  const valuePattern = (value) => {
    const text = String(value).replace(/[+]/g, '\\+');
    return text.startsWith('TOKENS.') ? text.replace('.', '\\.') : `['"]${text}['"]`;
  };
  const objectPattern = new RegExp(
    Object.entries(contract)
      .map(([key, value]) => `${key}:\\s*${valuePattern(value)}`)
      .join('[\\s\\S]*'),
  );
  assert.match(source, objectPattern);
}

test('React workflow contract preserves legacy ARES tabs and stage metadata', async () => {
  const workflow = await readProjectFile('apps/web/src/app/workflow.ts');

  for (const tab of [
    { id: 'papers', label: 'Search + Reading', shortLabel: 'Read', sub: '논문 수집과 이해', color: 'TOKENS.read', iconName: 'book', kbd: '1', defaultStage: 'reading' },
    { id: 'lab', label: 'Research + Result', shortLabel: 'Lab', sub: '재현 설계와 결과 비교', color: 'TOKENS.research', iconName: 'flask', kbd: '2', defaultStage: 'research' },
    { id: 'insight', label: 'Insight', shortLabel: 'Insight', sub: '해석, 가설, 결정', color: 'TOKENS.insight', iconName: 'sparkles', kbd: '3', defaultStage: 'insight' },
    { id: 'writing', label: 'Writing', shortLabel: 'Write', sub: '문서 조립과 초안화', color: 'TOKENS.writing', iconName: 'pen', kbd: '4', defaultStage: 'writing' },
  ]) {
    assertHasContractObject(workflow, tab);
  }

  for (const stage of [
    { id: 'search', tabId: 'papers', modeLabel: 'Discover', label: 'Search', sub: '논문 서치 및 수집', color: 'TOKENS.search', iconName: 'search', kbd: '1' },
    { id: 'reading', tabId: 'papers', modeLabel: 'Library', label: 'Reading', sub: 'AI 논문 리딩', color: 'TOKENS.read', iconName: 'book', kbd: '2' },
    { id: 'research', tabId: 'lab', modeLabel: 'Plan', label: 'Research', sub: '재현연구 및 실험', color: 'TOKENS.research', iconName: 'flask', kbd: '3' },
    { id: 'result', tabId: 'lab', modeLabel: 'Compare', label: 'Result', sub: '결과 도출 및 정리', color: 'TOKENS.result', iconName: 'chart', kbd: '4' },
    { id: 'insight', tabId: 'insight', modeLabel: 'Claims', label: 'Insight', sub: '인사이트 취합', color: 'TOKENS.insight', iconName: 'sparkles', kbd: '5' },
    { id: 'writing', tabId: 'writing', modeLabel: 'Draft', label: 'Writing', sub: '논문 작성 보조', color: 'TOKENS.writing', iconName: 'pen', kbd: '6' },
  ]) {
    assertHasContractObject(workflow, stage);
  }

  assert.match(workflow, /papers:\s*['"]reading['"]/);
  assert.match(workflow, /results:\s*['"]result['"]/);
  assert.match(workflow, /insights:\s*['"]insight['"]/);
  assert.match(workflow, /\?\s*\(resolved as WorkflowStageId\)\s*:\s*['"]search['"]/);
});

test('React route contract keeps legacy hash detail routes', async () => {
  const router = await readProjectFile('apps/web/src/app/router.ts');

  assert.match(router, /export function parseAresRoute/);
  assert.match(router, /segments\[index\] === ['"]projects['"]/);
  assert.match(router, /segments\[index\] === ['"]agent['"]/);
  assert.match(router, /segments\[index\] === ['"]sessions['"]/);
  assert.match(router, /readingView = ['"]detail['"]/);
  assert.match(router, /params\.has\(['"]workbench['"]\)/);
  assert.match(router, /readingAssetsFilter = params\.get\(['"]assets['"]\) \|\| ['"]all['"]/);
  assert.match(router, /readingAssetDetailId = params\.get\(['"]asset['"]\) \|\| ['"]['"]/);
});

test('React API contract preserves legacy base URL and upload errors', async () => {
  const api = await readProjectFile('apps/web/src/app/api.ts');

  assert.match(api, /PROXY_DEV_PATH_PATTERN = \/\^\\\/proxy\\\/\\d\+\(\?:\\\/\|\$\)\//);
  assert.match(api, /current\.pathname\.endsWith\(['"]\/index\.html['"]\)/);
  assert.match(api, /LOCAL_GRAB_HOSTS\.has\(current\.hostname\)/);
  assert.match(api, /return new URL\(String\(path \|\| ['"]['"]\)\.replace\(\^?\/?\/\+?/);
  assert.match(api, /Upload a PDF up to \$\{MAX_READING_PDF_UPLOAD_LABEL\}\./);
  assert.match(api, /projectSearchPath/);
  assert.match(api, /readingSessionPath/);
});

test('React shadcn tokens include ARES interaction, shadow, and bottom nav variables', async () => {
  const globals = await readProjectFile('apps/web/src/styles/globals.css');

  for (const token of [
    '--on-accent',
    '--control-strong-bg',
    '--control-strong-hover-bg',
    '--hover-bg',
    '--hover-soft-bg',
    '--hover-row-bg',
    '--hover-control-bg',
    '--active-muted-bg',
    '--scrollbar-thumb',
    '--shadow-popover',
    '--shadow-menu',
    '--viewport-bottom-occlusion',
    '--bottom-nav-shell-height',
    '--bottom-nav-bg',
    '--bottom-nav-border',
    '--bottom-nav-shadow',
    '--bottom-nav-indicator-bg',
  ]) {
    assert.match(globals, new RegExp(`${token}:`));
  }

  assert.match(globals, /--primary-foreground:\s*var\(--on-accent\)/);
  assert.match(globals, /html\[data-theme="dark"\],\n\.dark/);
  assert.match(globals, /\.workflow-list\s*\{[\s\S]*align-content:\s*start;[\s\S]*grid-auto-rows:\s*max-content;/);
});

test('React chrome keeps legacy ARES shell landmarks instead of generic cards', async () => {
  const appChrome = await readProjectFile('apps/web/src/components/chrome/AppChrome.tsx');
  const globals = await readProjectFile('apps/web/src/styles/globals.css');

  for (const marker of [
    'className="app-shell"',
    'className="desktop-sidebar"',
    'className="main-topbar"',
    'className="stage-wrap"',
    'className="bottom-nav"',
    'data-ares-surface="workspace"',
  ]) {
    assert.match(appChrome, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.doesNotMatch(appChrome, /from ['"]@\/components\/ui\/card['"]/);
  assert.doesNotMatch(appChrome, /from ['"]@\/components\/ui\/tabs['"]/);
  assert.match(globals, /\.desktop-sidebar[\s\S]*width:\s*232px;/);
  assert.match(globals, /\.main-topbar[\s\S]*height:\s*44px;/);
  assert.match(globals, /\.bottom-nav[\s\S]*border-radius:\s*999px;/);
});

test('React initial state contract mirrors legacy app state keys without demo data', async () => {
  const state = await readProjectFile('apps/web/src/app/state.ts');
  const app = await readProjectFile('apps/web/src/App.tsx');

  for (const key of [
    'booting',
    'hasSearched',
    'readingUploading',
    'activeStage',
    'activeProjectId',
    'projectGraph',
    'projectLibrary',
    'readingSessions',
    'activeReadingSessionId',
    'readingDocumentTab',
    'readingWorkbenchCollapsed',
    'searchMode',
    'filterPanelOpen',
    'sidebarCollapsed',
    'themeMode',
    'searchMeta',
    'filters',
  ]) {
    assert.match(state, new RegExp(`${key}:`));
  }

  assert.match(state, /years:\s*new Set\(\[['"]2025['"], ['"]2024['"], ['"]2023['"], ['"]earlier['"], ['"]unknown['"]\]\)/);
  assert.doesNotMatch(state, /recentPapers|labRuns|PDF preview|Reader workbench/);
  assert.doesNotMatch(app, /recentPapers|labRuns|PDF preview|Reader workbench/);
});

test('React Search and Reading surfaces use real ARES APIs and legacy surface classes', async () => {
  const [api, app, searchStage, readingHome, readingDetail, pdfViewer, globals] = await Promise.all([
    readProjectFile('apps/web/src/app/api.ts'),
    readProjectFile('apps/web/src/App.tsx'),
    readProjectFile('apps/web/src/components/search/SearchStage.tsx'),
    readProjectFile('apps/web/src/components/reading/ReadingHomeStage.tsx'),
    readProjectFile('apps/web/src/components/reading/ReadingDetailStage.tsx'),
    readProjectFile('apps/web/src/app/pdfViewer.ts'),
    readProjectFile('apps/web/src/styles/globals.css'),
  ]);

  for (const apiName of [
    'listProjectLibrary',
    'listReadingSessions',
    'searchPapers',
    'savePaperToLibrary',
    'removePaperFromLibrary',
    'createReadingSession',
  ]) {
    assert.match(api, new RegExp(`export function ${apiName}`));
    assert.match(app, new RegExp(apiName));
  }

  for (const marker of [
    'data-ares-surface="search-stage"',
    'className="results-pane results-pane-focal"',
    'data-ares-role="paper-row"',
    'className="search-preview',
    'data-ares-surface="reading-stage"',
    'className="reading-home',
    'className="reading-home-row',
    'data-reading-pdf-dropzone="true"',
    'data-reading-view="detail"',
    'data-reading-pdf-host="true"',
    'className="reading-pdf-dock-layer dock-layer"',
  ]) {
    assert.match(`${searchStage}\n${readingHome}\n${readingDetail}`, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(pdfViewer, /__vendor\/pdfjs\/pdf\.mjs/);
  assert.match(pdfViewer, /reading-pdf-canvas/);
  assert.match(pdfViewer, /reading-pdf-text-layer/);
  assert.match(app, /state\.activeStage === ['"]search['"]/);
  assert.match(app, /state\.activeStage === ['"]reading['"]/);
  assert.match(app, /state\.readingView === ['"]detail['"]/);
  assert.doesNotMatch(app, /<StagePlaceholder state=\{state\} \/>[\s\S]*state\.activeStage === ['"]search['"]/);
  assert.match(globals, /\.search-stage\s*\{[\s\S]*display:\s*flex;/);
  assert.match(globals, /\.reading-home-table-head,[\s\S]*\.reading-home-row\s*\{[\s\S]*grid-template-columns:/);
  assert.match(globals, /\.reading-stage\[data-reading-view="detail"\]/);
});

test('React Lab, Insight, and Writing surfaces use project graph data instead of placeholders', async () => {
  const [api, app, lab, insight, writing, readingDetail, globals] = await Promise.all([
    readProjectFile('apps/web/src/app/api.ts'),
    readProjectFile('apps/web/src/App.tsx'),
    readProjectFile('apps/web/src/components/lab/LabStage.tsx'),
    readProjectFile('apps/web/src/components/insight/InsightStage.tsx'),
    readProjectFile('apps/web/src/components/writing/WritingStage.tsx'),
    readProjectFile('apps/web/src/components/reading/ReadingDetailStage.tsx'),
    readProjectFile('apps/web/src/styles/globals.css'),
  ]);

  assert.match(api, /export function loadProjectGraph/);
  assert.match(api, /export function upsertProjectAsset/);
  assert.match(api, /export function runReadingAnalysisStep/);
  assert.match(api, /export function sendReadingChatMessage/);
  assert.match(api, /export function createReadingNote/);
  assert.match(api, /export function updateReadingNote/);
  assert.match(api, /export function deleteReadingNote/);
  assert.match(app, /loadProjectGraph\(activeProject\.id\)/);
  assert.match(app, /addEventListener\?\.\(['"]hashchange['"]/);
  assert.match(app, /addEventListener\?\.\(['"]popstate['"]/);
  assert.match(app, /function analyzeReadingSession/);
  assert.match(app, /function sendReadingQuestion/);
  assert.match(app, /function createReaderNote/);
  assert.match(app, /function saveReaderNote/);
  assert.match(app, /function deleteReaderNote/);
  assert.match(app, /function createManualExperimentRun/);
  assert.match(app, /function createInsightCardFromEvidence/);
  assert.match(app, /function createFollowUpExperimentFromInsight/);
  assert.match(app, /function createDraftSectionFromInsight/);
  assert.match(app, /function exportWritingDraft/);
  assert.match(app, /upsertProjectAsset[\s\S]*['"]experiment-runs['"]/);
  assert.match(app, /upsertProjectAsset[\s\S]*['"]insight-cards['"]/);
  assert.match(app, /upsertProjectAsset[\s\S]*['"]draft-sections['"]/);
  assert.match(app, /buildDraftExportBundle/);
  assert.match(app, /state\.activeStage === ['"]research['"] \|\| state\.activeStage === ['"]result['"]/);
  assert.match(app, /state\.activeStage === ['"]insight['"]/);
  assert.match(app, /state\.activeStage === ['"]writing['"]/);

  for (const marker of [
    'data-ares-surface="lab-stage"',
    'Reading Packet',
    'Result Dossier',
    'data-ares-surface="insight-stage"',
    'Evidence to decisions',
    'Insight Card',
    'data-ares-surface="writing-stage"',
    'source-linked draft',
    'Evidence Bundle',
  ]) {
    assert.match(`${lab}\n${insight}\n${writing}`, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(readingDetail, /className="reading-chat-input"/);
  assert.match(readingDetail, /className="reading-note-card"/);
  assert.match(readingDetail, /onSendQuestion\(session, message\)/);
  assert.match(readingDetail, /onSaveNote\(session, id/);

  assert.match(lab, /onClick=\{onCreateManualRun\}/);
  assert.match(insight, /onClick=\{onCreateInsightCard\}/);
  assert.match(insight, /onClick=\{onCreateFollowUpExperiment\}/);
  assert.match(writing, /onClick=\{onCreateDraftSection\}/);
  assert.match(writing, /onClick=\{onExportDraft\}/);
  assert.match(globals, /\.reading-empty-view\s*\{/);
  assert.match(globals, /\.reading-chat-input-box\s*\{/);
  assert.match(globals, /\.reading-note-editor\s*\{/);
  assert.match(globals, /\.lab-stage,[\s\S]*\.insight-stage/);
  assert.match(globals, /\.writing-stage\s*\{[\s\S]*grid-template-columns:\s*250px minmax\(0, 1fr\) 300px;/);
  assert.doesNotMatch(`${lab}\n${insight}\n${writing}`, /recentPapers|labRuns|PDF preview|Reader workbench/);
});
