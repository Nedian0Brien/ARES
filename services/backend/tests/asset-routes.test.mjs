import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { promises as fs } from 'node:fs';

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function createDataRoot() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ares-asset-routes-'));
  const seedFile = path.join(rootDir, 'data', 'store.seed.json');
  await fs.mkdir(path.dirname(seedFile), { recursive: true });
  await fs.writeFile(
    seedFile,
    JSON.stringify(
      {
        library: {
          demo: [
            {
              paperId: 'paper-1',
              savedAt: '2026-05-29T00:00:00.000Z',
              title: 'Paper 1',
              venue: 'ACL',
              year: 2026,
            },
          ],
        },
        projects: [
          {
            color: '#5e6ad2',
            defaultQuery: 'adaptive reranker',
            focus: 'Demo focus',
            id: 'demo',
            keywords: ['rag', 'reranker'],
            name: 'Demo',
          },
        ],
        readingQueue: {
          demo: [],
        },
      },
      null,
      2,
    ),
  );

  return rootDir;
}

async function waitForServer(baseUrl, attempts = 50) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(new URL('/api/health', baseUrl));
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the server is up.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error('Timed out waiting for asset route test server to boot.');
}

async function startServer(dataRootDir) {
  const port = await getFreePort();
  const child = spawn('node', ['services/backend/index.mjs'], {
    cwd: '/home/ubuntu/project/ARES',
    env: {
      ...process.env,
      ARES_DATA_ROOT_DIR: dataRootDir,
      HOST: '127.0.0.1',
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(baseUrl);

  return {
    async close() {
      child.kill('SIGTERM');
      await once(child, 'exit');
    },
    getStderr() {
      return stderr;
    },
    url: baseUrl,
  };
}

test('asset graph routes expose project graph and create graph assets', async (t) => {
  const dataRootDir = await createDataRoot();
  const server = await startServer(dataRootDir);
  t.after(async () => {
    await server.close();
  });

  const graphResponse = await fetch(new URL('/api/projects/demo/graph', server.url));
  const graph = await graphResponse.json();
  assert.equal(graphResponse.status, 200);
  assert.equal(graph.graphVersion, 1);
  assert.equal(graph.papers[0].paperId, 'paper-1');

  const planResponse = await fetch(new URL('/api/projects/demo/reproduction-plans', server.url), {
    body: JSON.stringify({
      evidenceLinkIds: ['evidence-plan'],
      handoff: {
        assetIds: ['asset-1'],
        noteIds: ['note-1'],
        readingSessionId: 'session-1',
        sectionIds: ['section-1'],
      },
      readingPacketId: 'packet-1',
      sourceRefs: [{ id: 'note-1', label: 'Selected note', type: 'readingNote' }],
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const plan = await planResponse.json();
  assert.equal(planResponse.status, 201);
  assert.equal(plan.asset.handoff.readingSessionId, 'session-1');
  assert.deepEqual(plan.asset.handoff.noteIds, ['note-1']);
  assert.deepEqual(plan.asset.sourceRefs, [{ id: 'note-1', label: 'Selected note', type: 'readingNote' }]);

  const evidenceResponse = await fetch(new URL('/api/projects/demo/evidence-links', server.url), {
    body: JSON.stringify({
      paperId: 'paper-1',
      quote: 'Adaptive skipping reduces latency.',
      sourceId: 'note-1',
      sourceType: 'note',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const evidence = await evidenceResponse.json();
  assert.equal(evidenceResponse.status, 201);

  const createResponse = await fetch(new URL('/api/projects/demo/insight-cards', server.url), {
    body: JSON.stringify({
      claim: 'Calibration controls adaptive reranking risk.',
      confidence: 'medium',
      evidenceLinkIds: [evidence.asset.id],
      type: 'claim',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const created = await createResponse.json();
  assert.equal(createResponse.status, 201);
  assert.equal(created.asset.projectId, 'demo');
  assert.equal(created.asset.claim, 'Calibration controls adaptive reranking risk.');

  const listResponse = await fetch(new URL('/api/projects/demo/insight-cards', server.url));
  const listed = await listResponse.json();
  assert.equal(listResponse.status, 200);
  assert.equal(listed.results[0].id, created.asset.id);

  const draftResponse = await fetch(new URL('/api/projects/demo/drafts', server.url), {
    body: JSON.stringify({
      title: 'Demo draft',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const draft = await draftResponse.json();
  assert.equal(draftResponse.status, 201);

  const sectionResponse = await fetch(new URL('/api/projects/demo/draft-sections', server.url), {
    body: JSON.stringify({
      body: 'Calibration controls adaptive reranking risk.',
      draftId: draft.asset.id,
      evidenceLinkIds: [evidence.asset.id],
      insightCardIds: [created.asset.id],
      title: 'Method',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const section = await sectionResponse.json();
  assert.equal(sectionResponse.status, 201);
  assert.equal(section.asset.draftId, draft.asset.id);
  assert.deepEqual(section.asset.insightCardIds, [created.asset.id]);

  const unsafeDeleteResponse = await fetch(new URL(`/api/projects/demo/insight-cards/${created.asset.id}`, server.url), {
    method: 'DELETE',
  });
  const unsafeDelete = await unsafeDeleteResponse.json();
  assert.equal(unsafeDeleteResponse.status, 409);
  assert.match(unsafeDelete.error, /confirmDelete/i);

  const deleteEvidenceResponse = await fetch(new URL(`/api/projects/demo/evidence-links/${evidence.asset.id}`, server.url), {
    body: JSON.stringify({
      confirmDelete: true,
      reason: 'Route test deletes evidence to verify cascade cleanup.',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'DELETE',
  });
  const deletedEvidence = await deleteEvidenceResponse.json();
  assert.equal(deleteEvidenceResponse.status, 200);
  assert.equal(deletedEvidence.deleted, true);
  assert.equal(deletedEvidence.audit.action, 'deleteProjectAsset');
  assert.equal(deletedEvidence.audit.confirmed, true);
  assert.match(deletedEvidence.audit.reason, /cascade cleanup/);

  const afterEvidenceDeleteInsightsResponse = await fetch(new URL('/api/projects/demo/insight-cards', server.url));
  const afterEvidenceDeleteInsights = await afterEvidenceDeleteInsightsResponse.json();
  const updatedInsight = afterEvidenceDeleteInsights.results.find((entry) => entry.id === created.asset.id);
  assert.equal(afterEvidenceDeleteInsightsResponse.status, 200);
  assert.deepEqual(updatedInsight.evidenceLinkIds, []);

  const afterEvidenceDeleteSectionsResponse = await fetch(new URL('/api/projects/demo/draft-sections', server.url));
  const afterEvidenceDeleteSections = await afterEvidenceDeleteSectionsResponse.json();
  const sectionAfterEvidenceDelete = afterEvidenceDeleteSections.results.find((entry) => entry.id === section.asset.id);
  assert.equal(afterEvidenceDeleteSectionsResponse.status, 200);
  assert.deepEqual(sectionAfterEvidenceDelete.evidenceLinkIds, []);

  const deleteResponse = await fetch(new URL(`/api/projects/demo/insight-cards/${created.asset.id}`, server.url), {
    body: JSON.stringify({
      confirmDelete: true,
      reason: 'Route test deletes insight to verify draft section cleanup.',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'DELETE',
  });
  const deleted = await deleteResponse.json();
  assert.equal(deleteResponse.status, 200);
  assert.equal(deleted.deleted, true);

  const afterDeleteResponse = await fetch(new URL('/api/projects/demo/insight-cards', server.url));
  const afterDelete = await afterDeleteResponse.json();
  assert.equal(afterDeleteResponse.status, 200);
  assert.ok(!afterDelete.results.some((entry) => entry.id === created.asset.id));

  const afterInsightDeleteSectionsResponse = await fetch(new URL('/api/projects/demo/draft-sections', server.url));
  const afterInsightDeleteSections = await afterInsightDeleteSectionsResponse.json();
  const updatedSection = afterInsightDeleteSections.results.find((entry) => entry.id === section.asset.id);
  assert.equal(afterInsightDeleteSectionsResponse.status, 200);
  assert.deepEqual(updatedSection.insightCardIds, []);

  const deleteSectionResponse = await fetch(new URL(`/api/projects/demo/draft-sections/${section.asset.id}`, server.url), {
    body: JSON.stringify({
      confirmDelete: true,
      reason: 'Route test deletes draft section directly.',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'DELETE',
  });
  const deletedSection = await deleteSectionResponse.json();
  assert.equal(deleteSectionResponse.status, 200);
  assert.equal(deletedSection.deleted, true);

  const afterSectionDeleteResponse = await fetch(new URL('/api/projects/demo/draft-sections', server.url));
  const afterSectionDelete = await afterSectionDeleteResponse.json();
  assert.equal(afterSectionDeleteResponse.status, 200);
  assert.ok(!afterSectionDelete.results.some((entry) => entry.id === section.asset.id));

  const cascadeDraftResponse = await fetch(new URL('/api/projects/demo/drafts', server.url), {
    body: JSON.stringify({
      title: 'Cascade draft',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const cascadeDraft = await cascadeDraftResponse.json();
  assert.equal(cascadeDraftResponse.status, 201);

  const cascadeSectionResponse = await fetch(new URL('/api/projects/demo/draft-sections', server.url), {
    body: JSON.stringify({
      body: 'Section removed with draft.',
      draftId: cascadeDraft.asset.id,
      title: 'Cascade section',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const cascadeSection = await cascadeSectionResponse.json();
  assert.equal(cascadeSectionResponse.status, 201);

  const deleteDraftResponse = await fetch(new URL(`/api/projects/demo/drafts/${cascadeDraft.asset.id}`, server.url), {
    body: JSON.stringify({
      confirmDelete: true,
      reason: 'Route test deletes draft to verify section cascade.',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'DELETE',
  });
  const deletedDraft = await deleteDraftResponse.json();
  assert.equal(deleteDraftResponse.status, 200);
  assert.equal(deletedDraft.deleted, true);

  const afterDraftDeleteSectionsResponse = await fetch(new URL('/api/projects/demo/draft-sections', server.url));
  const afterDraftDeleteSections = await afterDraftDeleteSectionsResponse.json();
  assert.equal(afterDraftDeleteSectionsResponse.status, 200);
  assert.ok(!afterDraftDeleteSections.results.some((entry) => entry.id === cascadeSection.asset.id));
});
