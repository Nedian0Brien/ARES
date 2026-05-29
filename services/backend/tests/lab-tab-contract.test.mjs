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
  assert.match(appJs, /createManualExperimentRun/);
});

test('Lab surface includes Plan, Runs, Compare, and Result Dossier language', async () => {
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
