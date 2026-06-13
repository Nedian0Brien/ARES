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

test('workflow navigation is driven by four product tabs while preserving six stages', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.match(appJs, /const WORKFLOW_TABS = \[/);
  assert.match(appJs, /id:\s*"papers"[\s\S]*label:\s*"Search \+ Reading"[\s\S]*shortLabel:\s*"Read"/);
  assert.match(appJs, /id:\s*"lab"[\s\S]*label:\s*"Research \+ Result"[\s\S]*shortLabel:\s*"Lab"/);
  assert.match(appJs, /id:\s*"insight"[\s\S]*label:\s*"Insight"[\s\S]*shortLabel:\s*"Insight"/);
  assert.match(appJs, /id:\s*"writing"[\s\S]*label:\s*"Writing"[\s\S]*shortLabel:\s*"Write"/);

  assert.match(appJs, /const WORKFLOW_STAGES = \[/);
  assert.match(appJs, /id:\s*"search"[\s\S]*tabId:\s*"papers"/);
  assert.match(appJs, /id:\s*"reading"[\s\S]*tabId:\s*"papers"/);
  assert.match(appJs, /id:\s*"research"[\s\S]*tabId:\s*"lab"/);
  assert.match(appJs, /id:\s*"result"[\s\S]*tabId:\s*"lab"/);
});

test('surface feature modules exist for queue, lab, evidence, draft, and router boundaries', async () => {
  const queueModule = await readProjectFile('web/app/features/queue.js');
  const labModule = await readProjectFile('web/app/features/lab.js');
  const evidenceModule = await readProjectFile('web/app/features/evidence.js');
  const draftModule = await readProjectFile('web/app/features/draft.js');
  const routerModule = await readProjectFile('web/app/features/surface-router.js');

  assert.match(queueModule, /createQueueFeatureModel/);
  assert.match(labModule, /createLabFeatureModel/);
  assert.match(evidenceModule, /graphEvidenceItems/);
  assert.match(draftModule, /createDraftFeatureModel/);
  assert.match(routerModule, /createSurfaceRouteNormalizer/);
});


test('legacy stage ids and new tab ids normalize to compatible stage routes', async () => {
  const appJs = await readProjectFile('web/app.js');
  const routerModule = await readProjectFile('web/app/features/surface-router.js');

  assert.match(routerModule, /papers:\s*"reading"/);
  assert.match(routerModule, /lab:\s*"research"/);
  assert.match(appJs, /createSurfaceRouteNormalizer/);
  assert.match(routerModule, /search:\s*"search"/);
  assert.match(routerModule, /reading:\s*"reading"/);
  assert.match(routerModule, /research:\s*"research"/);
  assert.match(routerModule, /result:\s*"result"/);
  assert.match(routerModule, /results:\s*"result"/);
});

test('desktop and mobile workflow chrome render the four tabs instead of raw stages', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.match(appJs, /WORKFLOW_TABS\.map\(\(tab\) =>/);
  assert.doesNotMatch(appJs, /bottom-nav[\s\S]*WORKFLOW_STAGES\.map/);
  assert.match(appJs, /data-ares-tab="\$\{escapeHtml\(tab\.id\)\}"/);
  assert.match(appJs, /aria-label="\$\{escapeHtml\(tab\.label\)\}"/);
  assert.match(appJs, /topbar-stage-label">\$\{escapeHtml\(tab\.shortLabel \|\| tab\.label\)\}/);
  assert.match(appJs, /workflow-stage-label">\$\{escapeHtml\(tab\.shortLabel \|\| tab\.label\)\}/);
  assert.match(appJs, /workflow-mode-title">\$\{escapeHtml\(tab\.shortLabel \|\| tab\.label\)\}/);
  assert.doesNotMatch(appJs, /topbar-stage-label-desktop/);
});

test('product surfaces do not fall back to the legacy generic placeholder stage', async () => {
  const [appJs, stylesCss] = await Promise.all([
    readProjectFile('web/app.js'),
    readProjectStyles(),
  ]);

  assert.doesNotMatch(appJs, /function renderPlaceholderStage/);
  assert.doesNotMatch(appJs, /function placeholderMeta/);
  assert.doesNotMatch(appJs, /data-ares-surface="placeholder-stage"/);
  assert.doesNotMatch(stylesCss, /\.placeholder-stage/);
});

test('keyboard shortcuts use four top-level tabs', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.match(appJs, /\^\[1-4\]\$/);
  assert.match(appJs, /const tab = WORKFLOW_TABS\[Number\(event\.key\) - 1\]/);
  assert.match(appJs, /selectWorkflowTab\(tab\.id\)/);
});
