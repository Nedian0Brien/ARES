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

test('Writing tab renders a dedicated evidence-backed drafting surface', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.match(appJs, /function renderWritingStage/);
  assert.match(appJs, /data-ares-surface="writing-stage"/);
  assert.match(appJs, /state\.activeStage === "writing"/);
  assert.match(appJs, /renderWritingStage\(project\)/);
  assert.match(appJs, /createDraftFeatureModel/);
  assert.match(appJs, /createDraftSectionFromInsight/);
});

test('Writing surface exposes Outline, Draft, Sources, and evidence bundle concepts', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.match(appJs, /Outline/);
  assert.match(appJs, /Draft/);
  assert.match(appJs, /Sources/);
  assert.match(appJs, /Evidence Bundle/);
  assert.match(appJs, /Evidence gaps/);
  assert.match(appJs, /source-linked draft/);
  assert.doesNotMatch(appJs, /AI suggestion/);
});

test('Writing actions cover generation, evidence insertion, suggestions, and export', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.match(appJs, /Generate section/);
  assert.match(appJs, /data-action="create-draft-section"/);
  assert.match(appJs, /Insert evidence/);
  assert.match(appJs, /Accept suggestion/);
  assert.match(appJs, /data-action="export-writing-draft"/);
  assert.match(appJs, /Export/);
});
