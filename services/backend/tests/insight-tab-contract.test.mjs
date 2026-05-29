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

test('Insight tab renders a dedicated evidence-to-claim surface', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.match(appJs, /function renderInsightStage/);
  assert.match(appJs, /data-ares-surface="insight-stage"/);
  assert.match(appJs, /state\.activeStage === "insight"/);
  assert.match(appJs, /renderInsightStage\(project\)/);
  assert.match(appJs, /app\/features\/evidence\.js/);
  assert.match(appJs, /graphEvidenceItems/);
  assert.match(appJs, /createInsightCardFromEvidence/);
});

test('Insight surface exposes the four synthesis modes and card anatomy', async () => {
  const appJs = await readProjectFile('web/app.js');
  const evidenceModule = await readProjectFile('web/app/features/evidence.js');

  assert.match(appJs, /Evidence/);
  assert.match(appJs, /Claims/);
  assert.match(appJs, /Hypotheses/);
  assert.match(appJs, /Decisions/);
  assert.match(appJs, /Insight Card/);
  assert.match(appJs, /linked evidence/);
  assert.match(evidenceModule, /paper quote/);
  assert.match(evidenceModule, /result delta/);
  assert.match(appJs, /confidence/);
  assert.match(appJs, /next action/);
  assert.doesNotMatch(appJs, /confidence 0\.72/);
});

test('Insight cards can move forward to Writing or back to Lab follow-up work', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.match(appJs, /Send to Writing/);
  assert.match(appJs, /Create follow-up experiment/);
  assert.match(appJs, /data-action="create-insight-card"/);
  assert.match(appJs, /data-stage-id="writing"/);
  assert.match(appJs, /data-stage-id="research"/);
});
