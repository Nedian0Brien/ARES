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

test('mobile breakpoint is documented at the same width used by runtime layout state', async () => {
  const [appJs, designSystem] = await Promise.all([
    readProjectFile('web/app.js'),
    readProjectFile('design/ARES Design System.html'),
  ]);

  assert.match(appJs, /mobileMax:\s*900/);
  assert.match(designSystem, /≤ 900px/);
});

test('mobile shell uses dynamic viewport and safe-area aware spacing', async () => {
  const styles = await readProjectFile('web/styles.css');

  assert.match(styles, /@supports\s*\(height:\s*100dvh\)/);
  assert.match(styles, /--mobile-bottom-nav-height/);
  assert.match(styles, /padding-bottom:\s*calc\(var\(--mobile-bottom-nav-height\)/);
  assert.match(styles, /html,\s*body\s*\{[\s\S]*overflow-x:\s*clip/);
  assert.match(styles, /body:has\(\.search-preview-focal:not\(\.is-empty\)\) \.bottom-nav/);
});

test('core mobile controls keep accessible touch targets and focus rings', async () => {
  const styles = await readProjectFile('web/styles.css');

  assert.match(styles, /\.btn-p:focus-visible,\s*\.btn-s:focus-visible/);
  assert.match(styles, /\.bottom-nav button:focus-visible/);
  assert.match(styles, /\.reading-pdf-dock-layer \.dock-btn[\s\S]*min-height:\s*44px/);
  assert.match(styles, /\.reading-chat-send[\s\S]*min-height:\s*44px/);
});

test('mobile search and reading surfaces avoid desktop-width table pressure', async () => {
  const styles = await readProjectFile('web/styles.css');

  assert.match(styles, /\.dashboard-tbl-row[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(styles, /\.dashboard-tbl-row[\s\S]*min-width:\s*0/);
  assert.match(styles, /\.reading-doc-pane,\s*\.reading-workbench-pane[\s\S]*min-height:\s*min\(68dvh,\s*560px\)/);
});

test('mobile content trims AI-slop copy and protects narrow labels', async () => {
  const [appJs, readingJs, searchJs, styles] = await Promise.all([
    readProjectFile('web/app.js'),
    readProjectFile('web/app/features/reading.js'),
    readProjectFile('web/app/features/search.js'),
    readProjectFile('web/styles.css'),
  ]);

  assert.doesNotMatch(appJs, /Next UI/);
  assert.doesNotMatch(appJs, /UI scaffold/);
  assert.doesNotMatch(readingJs, /여기에/);
  assert.doesNotMatch(searchJs, /여기에/);
  assert.match(searchJs, /dashboard-sbtn-label-mobile/);
  assert.match(styles, /\.dashboard-sbtn-label-desktop\s*\{[\s\S]*display:\s*none/);
  assert.match(appJs, /topbar-stage-label-mobile/);
  assert.match(styles, /\.topbar-stage-label-desktop\s*\{[\s\S]*display:\s*none/);
  assert.match(styles, /\.workflow-mode-btn small\s*\{[\s\S]*display:\s*none/);
  assert.match(styles, /\.nav-item span\s*\{[\s\S]*text-overflow:\s*ellipsis/);
});

test('mobile dev overlay stays opt-in so it cannot cover bottom navigation', async () => {
  const reactGrabDev = await readProjectFile('web/react-grab-dev.js');

  assert.match(reactGrabDev, /function isMobileViewport\(\)/);
  assert.match(reactGrabDev, /matchMedia\("\(max-width: 900px\)"\)/);
  assert.match(reactGrabDev, /grabParam === "1"[\s\S]*return true/);
  assert.match(reactGrabDev, /if \(isMobileViewport\(\)\) \{[\s\S]*return false/);
});
