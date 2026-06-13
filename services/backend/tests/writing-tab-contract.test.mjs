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

test('Writing draft sections can be selected, edited, and deleted before export', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.match(appJs, /activeDraftSectionId/);
  assert.match(appJs, /data-action="select-draft-section"/);
  assert.match(appJs, /data-action="submit-draft-section-form"/);
  assert.match(appJs, /name="draftSectionTitle"/);
  assert.match(appJs, /name="draftSectionBody"/);
  assert.match(appJs, /saveDraftSectionEdit/);
  assert.match(appJs, /data-action="delete-draft-section"/);
  assert.match(appJs, /deleteDraftSection/);
  assert.match(appJs, /confirmDelete: true/);
  assert.match(appJs, /reason: `Delete draft section/);
});

test('Writing export preserves citations and warns about broken sources', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.match(appJs, /function buildWritingExportMarkdown/);
  assert.match(appJs, /function writingEvidenceCitationLine/);
  assert.match(appJs, /## Source appendix/);
  assert.match(appJs, /## Broken source warnings/);
  assert.match(appJs, /missingEvidenceLinkIds/);
  assert.match(appJs, /\[\^src-\$\{index \+ 1\}\]/);
  assert.match(appJs, /evidenceLinkIds/);
  assert.match(appJs, /copyTextToClipboard\(buildWritingExportMarkdown\(\)/);
});
