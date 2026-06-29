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
  'web/src/styles/tokens.css',
];

async function readProjectStyles() {
  const chunks = await Promise.all(STYLE_FILES.map((relativePath) => readProjectFile(relativePath)));
  return chunks.join('\n');
}

test('specification documents four top-level tabs with six preserved workflow modes', async () => {
  const specification = await readProjectFile('docs/specification.md');

  assert.match(specification, /4개 상위 탭/);
  assert.match(specification, /Search \+ Reading/);
  assert.match(specification, /Research \+ Result/);
  assert.match(specification, /기존 6단계는 하위 모드/);
  assert.doesNotMatch(specification, /워크스페이스 셸과 6단계 워크플로우 화면으로 구성된다/);
});

test('React four-tab controls expose keyboard and screen reader contracts', async () => {
  const app = await readProjectFile('web/src/App.jsx');
  const productRail = await readProjectFile('web/src/components/ProductRail.jsx');
  const labTab = await readProjectFile('web/src/tabs/lab/LabTab.jsx');
  const wikiTab = await readProjectFile('web/src/tabs/wiki/WikiTab.jsx');

  assert.match(productRail, /<nav className="icon-rail" aria-label="주요 작업 영역">/);
  assert.match(productRail, /aria-controls="ares-workspace-panel"/);
  assert.match(productRail, /aria-current=\{tab===t\.id \? 'page' : undefined\}/);
  assert.match(productRail, /aria-label=\{`\$\{t\.lbl\} 작업 영역 열기`\}/);
  assert.match(app, /id="ares-workspace-panel" role="main" aria-label=\{TAB_PANEL_LABELS\[tab\]/);

  assert.match(labTab, /role="listitem"/);
  assert.match(labTab, /role="list"/);
  assert.match(labTab, /aria-labelledby=\{headerId\}/);
  assert.match(labTab, /aria-pressed=\{view==='board'\}/);
  assert.match(labTab, /aria-pressed=\{view==='workspace'\}/);

  assert.match(wikiTab, /aria-label="Wiki 그래프"/);
  assert.match(wikiTab, /role="button"/);
  assert.match(wikiTab, /tabIndex=\{0\}/);
  assert.match(wikiTab, /onKeyDown=\{\(event\) => onNodeKeyDown\(event, node\.id\)\}/);
  assert.match(wikiTab, /aria-pressed=\{view===v\}/);
});

test('new four-tab controls keep explicit focus-visible affordances', async () => {
  const styles = await readProjectStyles();

  assert.match(styles, /\.rail-btn:focus-visible/);
  assert.match(styles, /\.seg button:focus-visible/);
  assert.match(styles, /\.pane-tab:focus-visible/);
  assert.match(styles, /\.kan-open:focus-visible/);
  assert.match(styles, /\.kan-run:focus-visible/);
  assert.match(styles, /\.gsvg2 \[role="button"\]:focus-visible/);
});

test('design system reflects four-tab shortcuts and mobile tab count', async () => {
  const designSystem = await readProjectFile('design/ARES Design System.html');

  assert.match(designSystem, /4 workflow tabs/);
  assert.match(designSystem, /⌘1–⌘4/);
  assert.match(designSystem, /4 tabs/);
  assert.doesNotMatch(designSystem, /6 stage icons/);
});
