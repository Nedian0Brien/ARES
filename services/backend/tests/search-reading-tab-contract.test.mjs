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

test('Reading handoff targets Lab language instead of legacy Research tab copy', async () => {
  const readingJs = await readProjectFile('web/app/features/reading.js');

  assert.match(readingJs, /Send to Lab/);
  assert.doesNotMatch(readingJs, /Send to Research/);
});
