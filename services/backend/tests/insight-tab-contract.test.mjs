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
  assert.match(appJs, /data-action="create-follow-up-experiment"/);
  assert.match(appJs, /data-insight-card-id=/);
  assert.match(appJs, /createFollowUpExperimentFromInsight/);
  assert.match(appJs, /\/experiment-runs/);
  assert.match(appJs, /kind: "follow-up"/);
  assert.match(appJs, /source: "insight-follow-up"/);
  assert.match(appJs, /followUpExperimentId: runId/);
  assert.match(appJs, /state\.activeStage = "research"/);
});

test('Insight cards can be selected, edited, and deleted as durable assets', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.match(appJs, /activeInsightCardId/);
  assert.match(appJs, /data-action="select-insight-card"/);
  assert.match(appJs, /data-action="submit-insight-card-form"/);
  assert.match(appJs, /name="insightClaim"/);
  assert.match(appJs, /name="insightConfidence"/);
  assert.match(appJs, /saveInsightCardEdit/);
  assert.match(appJs, /data-action="delete-insight-card"/);
  assert.match(appJs, /deleteInsightCard/);
  assert.match(appJs, /confirmDelete: true/);
  assert.match(appJs, /reason: `Delete insight card/);
});

test('Insight cards expose Lab failure analysis fields when present', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.match(appJs, /card\.failureCause/);
  assert.match(appJs, /card\.followUpExperiment/);
  assert.match(appJs, /failure cause/);
  assert.match(appJs, /follow-up/);
});

test('Insight cards persist and render quality review criteria', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.match(appJs, /qualityCriteria/);
  assert.match(appJs, /name="insightEvidenceCoverage"/);
  assert.match(appJs, /name="insightContradictionFlag"/);
  assert.match(appJs, /name="insightFollowUpExperimentId"/);
  assert.match(appJs, /evidence coverage/);
  assert.match(appJs, /contradiction/);
  assert.match(appJs, /follow-up run/);
  assert.match(appJs, /qualityCriteria:\s*\{/);
});

test('Insight surface automatically clusters claims and evaluates quality signals', async () => {
  const [appJs, modelJs] = await Promise.all([
    readProjectFile('web/app.js'),
    readProjectFile('services/backend/lib/asset-model.mjs'),
  ]);

  assert.match(modelJs, /claimCluster/);
  assert.match(appJs, /function buildInsightClaimCluster/);
  assert.match(appJs, /function evaluateInsightQuality/);
  assert.match(appJs, /renderInsightClusterSummary/);
  assert.match(appJs, /Claim clusters/);
  assert.match(appJs, /related claims/);
  assert.match(appJs, /auto quality/);
});
