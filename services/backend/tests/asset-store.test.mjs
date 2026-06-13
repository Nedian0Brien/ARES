import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import { createStore } from '../lib/store.mjs';

async function createDemoStore() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ares-asset-store-'));
  const seedFile = path.join(tempDir, 'seed.json');
  const runtimeFile = path.join(tempDir, 'runtime', 'store.json');

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
            color: '#000000',
            defaultQuery: 'demo query',
            focus: 'Demo focus',
            id: 'demo',
            keywords: ['demo'],
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

  return createStore({ seedFile, runtimeFile });
}

test('file store migrates graph collections and returns project graph', async () => {
  const store = await createDemoStore();
  const graph = store.getProjectGraph('demo');

  assert.equal(graph.graphVersion, 1);
  assert.equal(graph.project.id, 'demo');
  assert.equal(graph.researchQuestions.length, 1);
  assert.equal(graph.researchQuestions[0].id, 'question-demo-default');
  assert.equal(graph.papers.length, 1);
  assert.equal(graph.papers[0].paperId, 'paper-1');
});

test('file store persists graph asset collections through generic project asset API', async () => {
  const store = await createDemoStore();
  const question = await store.upsertProjectAsset('researchQuestions', {
    prompt: 'Can adaptive reranking reduce inference cost?',
    projectId: 'demo',
    title: 'Adaptive reranking cost',
  });
  const evidence = await store.upsertProjectAsset('evidenceLinks', {
    paperId: 'paper-1',
    projectId: 'demo',
    quote: 'Adaptive skipping reduces latency.',
    sourceId: 'note-1',
    sourceType: 'note',
  });
  const packet = await store.upsertProjectAsset('readingPackets', {
    evidenceLinkIds: [evidence.id],
    keyPoints: ['Latency reduction'],
    paperId: 'paper-1',
    projectId: 'demo',
    questionId: question.id,
    summary: 'Packet summary',
  });

  const graph = store.getProjectGraph('demo');
  assert.equal(graph.researchQuestions[0].id, question.id);
  assert.equal(graph.evidenceLinks[0].quote, 'Adaptive skipping reduces latency.');
  assert.equal(graph.readingPackets[0].id, packet.id);
  assert.deepEqual(graph.readingPackets[0].evidenceLinkIds, [evidence.id]);
});

test('file store persists users, organizations, memberships, project access, and auth sessions', async () => {
  const store = await createDemoStore();

  const user = await store.upsertUser({
    email: 'owner@example.test',
    id: 'owner-user',
    name: 'Owner User',
  });
  const organization = await store.upsertOrganization({
    id: 'org-demo',
    name: 'Demo Org',
  });
  const membership = await store.upsertMembership({
    organizationId: organization.id,
    role: 'owner',
    userId: user.id,
  });
  const access = await store.upsertProjectAccess({
    projectId: 'demo',
    role: 'owner',
    userId: user.id,
  });
  const session = await store.createAuthSession({
    expiresAt: '2999-01-01T00:00:00.000Z',
    userId: user.id,
  });

  assert.equal(store.getUser(user.id).email, 'owner@example.test');
  assert.equal(store.listUsers().length, 1);
  assert.equal(store.getOrganization(organization.id).name, 'Demo Org');
  assert.deepEqual(store.listMemberships({ userId: user.id }).map((entry) => entry.id), [membership.id]);
  assert.deepEqual(store.listProjectAccess({ projectId: 'demo' }).map((entry) => entry.id), [access.id]);
  assert.equal(store.getAuthSessionByToken(session.token).userId, user.id);

  const revoked = await store.revokeAuthSession(session.token);
  assert.equal(revoked.revoked, true);
  assert.equal(store.getAuthSessionByToken(session.token), null);
});

test('file store removes deleted insight ids from draft section references', async () => {
  const store = await createDemoStore();
  const insight = await store.upsertProjectAsset('insightCards', {
    claim: 'Adaptive skipping can reduce reranker cost.',
    confidence: 'medium',
    evidenceLinkIds: ['evidence-1'],
    projectId: 'demo',
    type: 'claim',
  });
  const retainedInsight = await store.upsertProjectAsset('insightCards', {
    claim: 'Calibration remains necessary.',
    confidence: 'medium',
    evidenceLinkIds: ['evidence-2'],
    projectId: 'demo',
    type: 'claim',
  });
  const draft = await store.upsertProjectAsset('drafts', {
    projectId: 'demo',
    title: 'Demo draft',
  });
  const section = await store.upsertProjectAsset('draftSections', {
    body: 'Adaptive skipping can reduce cost when calibrated.',
    draftId: draft.id,
    evidenceLinkIds: ['evidence-1', 'evidence-2'],
    insightCardIds: [insight.id, retainedInsight.id],
    projectId: 'demo',
    sectionType: 'method',
    title: 'Method',
  });

  const deleted = await store.deleteProjectAsset('insightCards', insight.id, { projectId: 'demo' });

  assert.equal(deleted.deleted, true);
  const graph = store.getProjectGraph('demo');
  assert.ok(!graph.insightCards.some((entry) => entry.id === insight.id));
  const updatedSection = graph.draftSections.find((entry) => entry.id === section.id);
  assert.deepEqual(updatedSection.insightCardIds, [retainedInsight.id]);
});

test('file store removes deleted evidence ids from graph asset references', async () => {
  const store = await createDemoStore();
  const removedEvidence = await store.upsertProjectAsset('evidenceLinks', {
    paperId: 'paper-1',
    projectId: 'demo',
    quote: 'Adaptive skipping reduces latency.',
    sourceId: 'note-removed',
    sourceType: 'note',
  });
  const retainedEvidence = await store.upsertProjectAsset('evidenceLinks', {
    paperId: 'paper-1',
    projectId: 'demo',
    quote: 'Calibration remains necessary.',
    sourceId: 'note-retained',
    sourceType: 'note',
  });
  const sharedEvidenceLinkIds = [removedEvidence.id, retainedEvidence.id];

  const readingPacket = await store.upsertProjectAsset('readingPackets', {
    evidenceLinkIds: sharedEvidenceLinkIds,
    paperId: 'paper-1',
    projectId: 'demo',
    summary: 'Packet summary',
  });
  const reproductionPlan = await store.upsertProjectAsset('reproductionPlans', {
    evidenceLinkIds: sharedEvidenceLinkIds,
    projectId: 'demo',
    readingPacketId: readingPacket.id,
  });
  const resultDossier = await store.upsertProjectAsset('resultDossiers', {
    evidenceLinkIds: sharedEvidenceLinkIds,
    experimentRunIds: [],
    projectId: 'demo',
  });
  const insightCard = await store.upsertProjectAsset('insightCards', {
    claim: 'Adaptive skipping can reduce reranker cost.',
    evidenceLinkIds: sharedEvidenceLinkIds,
    projectId: 'demo',
    type: 'claim',
  });
  const draft = await store.upsertProjectAsset('drafts', {
    projectId: 'demo',
    title: 'Demo draft',
  });
  const draftSection = await store.upsertProjectAsset('draftSections', {
    body: 'Adaptive skipping can reduce cost when calibrated.',
    draftId: draft.id,
    evidenceLinkIds: sharedEvidenceLinkIds,
    insightCardIds: [insightCard.id],
    projectId: 'demo',
    title: 'Method',
  });

  const deleted = await store.deleteProjectAsset('evidenceLinks', removedEvidence.id, { projectId: 'demo' });

  assert.equal(deleted.deleted, true);
  const graph = store.getProjectGraph('demo');
  assert.ok(!graph.evidenceLinks.some((entry) => entry.id === removedEvidence.id));
  assert.deepEqual(graph.readingPackets.find((entry) => entry.id === readingPacket.id).evidenceLinkIds, [retainedEvidence.id]);
  assert.deepEqual(graph.reproductionPlans.find((entry) => entry.id === reproductionPlan.id).evidenceLinkIds, [
    retainedEvidence.id,
  ]);
  assert.deepEqual(graph.resultDossiers.find((entry) => entry.id === resultDossier.id).evidenceLinkIds, [
    retainedEvidence.id,
  ]);
  assert.deepEqual(graph.insightCards.find((entry) => entry.id === insightCard.id).evidenceLinkIds, [retainedEvidence.id]);
  assert.deepEqual(graph.draftSections.find((entry) => entry.id === draftSection.id).evidenceLinkIds, [retainedEvidence.id]);
});

test('file store deletes draft sections that belong to a deleted draft', async () => {
  const store = await createDemoStore();
  const draft = await store.upsertProjectAsset('drafts', {
    projectId: 'demo',
    title: 'Demo draft',
  });
  const retainedDraft = await store.upsertProjectAsset('drafts', {
    projectId: 'demo',
    title: 'Retained draft',
  });
  const deletedSection = await store.upsertProjectAsset('draftSections', {
    body: 'Section that should be deleted.',
    draftId: draft.id,
    projectId: 'demo',
    title: 'Deleted section',
  });
  const retainedSection = await store.upsertProjectAsset('draftSections', {
    body: 'Section that should remain.',
    draftId: retainedDraft.id,
    projectId: 'demo',
    title: 'Retained section',
  });

  const deleted = await store.deleteProjectAsset('drafts', draft.id, { projectId: 'demo' });

  assert.equal(deleted.deleted, true);
  const graph = store.getProjectGraph('demo');
  assert.ok(!graph.drafts.some((entry) => entry.id === draft.id));
  assert.ok(!graph.draftSections.some((entry) => entry.id === deletedSection.id));
  assert.ok(graph.draftSections.some((entry) => entry.id === retainedSection.id));
});
