import assert from 'node:assert/strict';
import path from 'node:path';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..');

async function readProjectFile(relativePath) {
  return readFile(path.join(rootDir, relativePath), 'utf8');
}

test('overimplementation audit guard is backed by executable regression coverage', async () => {
  const [
    audit,
    agentRunsTest,
    readingServiceTest,
    labRoutesTest,
    insightContractTest,
    writingContractTest,
    wikiRoutesTest,
    agentChatRoutesTest,
  ] = await Promise.all([
    readProjectFile('docs/overimplementation-audit.md'),
    readProjectFile('services/backend/tests/agent-runs.test.mjs'),
    readProjectFile('services/backend/tests/reading-service.test.mjs'),
    readProjectFile('services/backend/tests/lab-routes-contract.test.mjs'),
    readProjectFile('services/backend/tests/insight-tab-contract.test.mjs'),
    readProjectFile('services/backend/tests/writing-tab-contract.test.mjs'),
    readProjectFile('services/backend/tests/wiki-routes-contract.test.mjs'),
    readProjectFile('services/backend/tests/agent-chat-routes-contract.test.mjs'),
  ]);

  assert.match(audit, /parse highlight/i);
  assert.match(audit, /AgentRun fallback persistence/i);
  assert.match(audit, /Lab failed run to Insight/i);
  assert.match(audit, /Insight auto quality and clusters/i);
  assert.match(audit, /Writing draft section from accepted insight/i);

  assert.match(agentRunsTest, /runtime failure does not persist stage fallback assets/);
  assert.match(agentRunsTest, /without creating fallback output/);
  assert.match(readingServiceTest, /do not save generated prose when agent runtime is unavailable/);
  assert.match(labRoutesTest, /approval-required runner state without a fake dossier/);
  assert.match(insightContractTest, /keeps derived clusters separate from saved card edits/);
  assert.match(writingContractTest, /requires an existing draft instead of creating one implicitly/);
  assert.match(wikiRoutesTest, /without bypassing auth or storing synthesize fallbacks/);
  assert.match(agentChatRoutesTest, /only save assets through explicit export/);
});

test('removed fallback asset paths stay absent from product code', async () => {
  const [agentRuns, readingModel, labRoutes, agentChatRoutes, appJs, draftFeature] = await Promise.all([
    readProjectFile('services/backend/lib/agent-runs.mjs'),
    readProjectFile('services/backend/lib/reading-model.mjs'),
    readProjectFile('services/backend/routes/lab-routes.mjs'),
    readProjectFile('services/backend/routes/agent-chat-routes.mjs'),
    readProjectFile('web/app.js'),
    readProjectFile('web/app/features/draft.js'),
  ]);

  await assert.rejects(access(path.join(rootDir, 'services/backend/lib/agent-run-fallbacks.mjs')), /ENOENT/);
  assert.doesNotMatch(agentRuns, /agent-run-fallbacks|persistFallback|fallbackOutput/i);
  assert.match(agentRuns, /outputRef:\s*\[\]/);
  assert.match(agentRuns, /createdAssetIds:\s*\[\]/);
  assert.match(agentRuns, /status:\s*'error'/);

  assert.match(readingModel, /origin === 'highlight'/);
  assert.match(readingModel, /seedMethod/);
  assert.match(readingModel, /note-seed-/);

  assert.match(labRoutes, /approval_required/);
  assert.match(labRoutes, /let resultDossier = null/);
  assert.doesNotMatch(labRoutes, /insightCards/);

  assert.match(agentChatRoutes, /savedAssetInput\(target/);
  assert.match(agentChatRoutes, /assistantGenerated:\s*false/);
  assert.match(agentChatRoutes, /assistantGenerated:\s*true/);

  assert.match(appJs, /state\.error = "Link evidence before creating an insight card\."/);
  assert.match(appJs, /buildInsightClaimCluster/);
  assert.match(appJs, /enrichInsightCardForQuality/);
  assert.match(draftFeature, /acceptedInsightCards: insightCards\.filter/);
  assert.match(draftFeature, /Create a draft section before export/);
});

test('health endpoint contract exposes runtime, storage, and grounding readiness', async () => {
  const [indexJs, authAccessTest, agentChatRoutesTest] = await Promise.all([
    readProjectFile('services/backend/index.mjs'),
    readProjectFile('services/backend/tests/auth-access.test.mjs'),
    readProjectFile('services/backend/tests/agent-chat-routes-contract.test.mjs'),
  ]);

  assert.match(indexJs, /requestPath === '\/api\/health'/);
  assert.match(indexJs, /ok:\s*true/);
  assert.match(indexJs, /profileDetails:\s*profiles/);
  assert.match(indexJs, /storage,/);
  assert.match(indexJs, /grounding,/);
  assert.match(authAccessTest, /healthResponse\.headers\.get\('x-request-id'\)/);
  assert.match(agentChatRoutesTest, /health\.grounding/);
});
