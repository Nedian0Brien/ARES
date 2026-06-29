import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { normaliseExperimentRun, normaliseReproductionPlan, normaliseResultDossier } from '../lib/asset-model.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..');

async function readProjectFile(relativePath) {
  return readFile(path.join(rootDir, relativePath), 'utf8');
}

test('Lab graph assets preserve titles for user-facing board cards', () => {
  assert.equal(normaliseReproductionPlan({ title: 'Plan title' }, { projectId: 'demo' }).title, 'Plan title');
  assert.equal(normaliseExperimentRun({ title: 'Run title' }, { projectId: 'demo' }).title, 'Run title');
  assert.equal(normaliseResultDossier({ title: 'Dossier title' }, { projectId: 'demo' }).title, 'Dossier title');
});

test('React Lab tab reads the project asset graph instead of rendering mock project counts', async () => {
  const source = await readProjectFile('web/src/tabs/lab/LabTab.jsx');

  assert.match(source, /api\('api\/projects'\)/);
  assert.match(source, /api\(`api\/projects\/\$\{encodeURIComponent\(graphProjectId\)\}\/graph`\)/);
  assert.match(source, /graphToLabState/);
  assert.match(source, /projectSummariesToLabCards/);
  assert.match(source, /labColumnCounts/);
  assert.match(source, /labExperimentCount/);
  assert.match(source, /labArtifactCount/);
  assert.match(source, /experimentRuns/);
  assert.match(source, /reproductionPlans/);
  assert.match(source, /resultDossiers/);
  assert.match(source, /hasRunnerCommand/);
  assert.match(source, /runCommand/);
  assert.match(source, /canExecute/);
  assert.match(source, /aria-label=\{`\$\{k\.title\} 실행`\}/);
  assert.match(source, /experiment-runs\/\$\{encodeURIComponent\(id\)\}\/execute/);
  assert.match(source, /runnerResult\?\.status/);
  assert.match(source, /setGraphRefresh/);
});

test('React Lab tab does not expose graph implementation labels in visible copy', async () => {
  const source = await readProjectFile('web/src/tabs/lab/LabTab.jsx');

  assert.match(source, /graphState\.loading \? '동기화 중' : '가설 · 실험 · 리포트 워크스페이스'/);
  assert.doesNotMatch(source, /asset graph/);
  assert.doesNotMatch(source, />syncing</);
});

test('React Lab workspace renders selected run and result dossier data from the graph', async () => {
  const source = await readProjectFile('web/src/tabs/lab/LabTab.jsx');

  assert.match(source, /dossiers/);
  assert.match(source, /activeDossier/);
  assert.match(source, /linkedDossierRunIds/);
  assert.match(source, /activeRun/);
  assert.match(source, /experimentRunIds\?\.\includes\(activeExperiment\?\.id\)/);
  assert.match(source, /config\?\.logs/);
  assert.match(source, /metrics/);
  assert.match(source, /comparisons/);
  assert.match(source, /designRows/);
  assert.match(source, /runSteps/);
  assert.match(source, /domainResults/);
  assert.match(source, /hypothesis/);
  assert.match(source, /<RunnerConsolePane[^>]+experiment=\{activeRun\}/);
  assert.match(source, /<ReportPane[^>]+dossier=\{activeDossier\}/);
  assert.match(source, /<ReportPane[^>]+experiment=\{activeRun\}/);
  assert.doesNotMatch(source, /RUN_STEPS\.map/);
  assert.doesNotMatch(source, /저장된 result dossier/);
});

test('React Lab workspace does not present inactive actions or unsupported success states as real results', async () => {
  const source = await readProjectFile('web/src/tabs/lab/LabTab.jsx');

  assert.match(source, /function labResultState/);
  assert.match(source, /hasResultData/);
  assert.match(source, /const verdict = labResultState\(\{ dossier, experiment \}\)/);
  assert.doesNotMatch(source, /verdict: col === 'done' \? 'supported'/);
  assert.doesNotMatch(source, /verdict: 'supported'/);
  assert.doesNotMatch(source, /className=\{`xp-verdict \$\{failure \? 'refuted' : 'supported'\}`\}/);
  assert.match(source, /const \[draft, setDraft\] = useState\(''\)/);
  assert.match(source, /const \[queuedRequest, setQueuedRequest\] = useState\(''\)/);
  assert.match(source, /const createDraftExperiment = async/);
  assert.match(source, /api\(`api\/projects\/\$\{encodeURIComponent\(activeProjectId\)\}\/experiment-runs`/);
  assert.match(source, /const createProject = async/);
  assert.match(source, /api\('api\/projects',/);
  assert.match(source, /const quickRequest = \(text\) =>/);
  assert.match(source, /const submitRequest = \(\) =>/);
  assert.match(source, /const exportReport = \(\) =>/);
  assert.match(source, /downloadJson\(`ares-lab-report-/);
  assert.match(source, /<textarea rows=\{1\} onChange=\{\(event\) => setDraft\(event\.target\.value\)\}/);
  assert.match(source, /<button className="chat-send" onClick=\{submitRequest\}/);
  assert.match(source, /<button className="pane-icon-btn" onClick=\{copyReport\}/);
  assert.match(source, /<button className="pane-icon-btn" onClick=\{exportReport\}/);
});

test('React Lab workspace renders SVG charts only from actual run metrics and dossier comparisons', async () => {
  const source = await readProjectFile('web/src/tabs/lab/LabTab.jsx');

  assert.match(source, /function metricNumber/);
  assert.match(source, /function chartRowsFromResult\(\{ comparisons, metrics \}\)/);
  assert.match(source, /comparisons\.map/);
  assert.match(source, /metricEntries\(metrics\)\.map/);
  assert.match(source, /function LabResultChart/);
  assert.match(source, /function DomainResultChart/);
  assert.match(source, /<svg[\s\S]*viewBox=/);
  assert.match(source, /실행 지표 차트/);
  assert.match(source, /도메인별 nDCG@10 개선/);
  assert.match(source, /<LabResultChart comparisons=\{comparisons\} metrics=\{experiment\?\.metrics\}/);
  assert.match(source, /<DomainResultChart rows=\{domainResults\}/);
  assert.doesNotMatch(source, /XP_DOMAINS|fixed:38\.1|oracle 상한/);
});
