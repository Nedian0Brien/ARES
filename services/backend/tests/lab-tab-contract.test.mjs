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

test('Research + Result tab renders a Lab surface instead of generic placeholders', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.match(appJs, /function renderLabStage/);
  assert.match(appJs, /data-ares-surface="lab-stage"/);
  assert.match(appJs, /state\.activeStage === "research" \|\| state\.activeStage === "result"/);
  assert.match(appJs, /renderLabStage\(project\)/);
  assert.match(appJs, /createLabFeatureModel/);
  assert.match(appJs, /createManualExperimentRun/);
});

test('Lab surface includes user-facing plan, run, compare, and insight language', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.match(appJs, /Research \+ Result/);
  assert.match(appJs, /Reading Packet/);
  assert.match(appJs, /Result Dossier/);
  assert.match(appJs, /Plan/);
  assert.match(appJs, /Runs/);
  assert.match(appJs, /Compare/);
  assert.match(appJs, /Extract insight/);
});

test('Lab surface does not expose unsupported execution as a primary completed action', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.match(appJs, /Not connected/);
  assert.match(appJs, /data-action="create-manual-experiment-run"/);
  assert.match(appJs, /disabled[^>]*>\s*Attach result/);
  assert.match(appJs, /disabled[^>]*>\s*Run experiment/);
});

test('Lab manual runs expose editable observed results that save into the graph', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.match(appJs, /data-action="submit-lab-result-form"/);
  assert.match(appJs, /name="labObservedMetric"/);
  assert.match(appJs, /name="labRunStatus"/);
  assert.match(appJs, /saveLabExperimentResult/);
  assert.match(appJs, /result-dossiers/);
});

test('Lab result comparison stores a typed paper-to-run metric contract', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.match(appJs, /function normaliseLabMetricComparison/);
  assert.match(appJs, /function labMetricDeltaValue/);
  assert.match(appJs, /name="labPaperMetricValue"/);
  assert.match(appJs, /name="labMetricUnit"/);
  assert.match(appJs, /const deltaValue = labMetricDeltaValue/);
  assert.match(appJs, /deltaValue,/);
  assert.match(appJs, /status:\s*deltaValue === null \? "needs-review" : "measured"/);
  assert.match(appJs, /const unit = String\(metricUnit/);
  assert.match(appJs, /const paperValue = String\(paperMetricValue/);
  assert.match(appJs, /reproducedValue:\s*observedMetric/);
});

test('Failed Lab runs stay in Lab until the user explicitly creates an Insight', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.doesNotMatch(appJs, /function buildFailedRunInsightCandidate/);
  assert.doesNotMatch(appJs, /function createFailedRunInsightCandidate/);
  assert.match(appJs, /status === "error"/);
  assert.doesNotMatch(appJs, /createFailedRunInsightCandidate\(\{/);
});

test('Lab imports external run logs through a bounded parser contract', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.match(appJs, /function parseLabImportPayload/);
  assert.match(appJs, /async function importExternalExperimentRun/);
  assert.match(appJs, /data-action="submit-lab-import-form"/);
  assert.match(appJs, /name="labImportLog"/);
  assert.match(appJs, /name="labImportCommand"/);
  assert.match(appJs, /name="labImportArtifactUrl"/);
  assert.match(appJs, /kind:\s*"external-import"/);
  assert.match(appJs, /importSource:\s*"external-paste"/);
  assert.match(appJs, /artifacts:\s*parsed\.artifacts/);
  assert.match(appJs, /normaliseLabMetricComparison\(\{/);
  assert.doesNotMatch(appJs, /createFailedRunInsightCandidate\(\{/);
});

test('Reading to Lab handoff context is preserved and visible in Lab', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.match(appJs, /handoffSource:\s*"reading"/);
  assert.match(appJs, /sourceRefs/);
  assert.match(appJs, /readingSessionId/);
  assert.match(appJs, /noteIds/);
  assert.match(appJs, /sectionIds/);
  assert.match(appJs, /assetIds/);
  assert.match(appJs, /Handoff context/);
  assert.match(appJs, /handoff-note-count/);
});
