import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import pg from 'pg';

import { createAgentRunService } from '../lib/agent-runs.mjs';
import { createStore } from '../lib/store.mjs';

const adminUrl = process.env.ARES_POSTGRES_E2E_ADMIN_URL || '';

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function databaseUrlFor(adminConnectionString, databaseName) {
  const url = new URL(adminConnectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function createE2eDatabase() {
  const databaseName = `ares_e2e_${process.pid}_${Date.now()}`.toLowerCase();
  const pool = new pg.Pool({ connectionString: adminUrl });
  try {
    await pool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  } finally {
    await pool.end();
  }

  return {
    databaseName,
    databaseUrl: databaseUrlFor(adminUrl, databaseName),
  };
}

async function writeSeedFile(projectId) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ares-postgres-e2e-'));
  const seedFile = path.join(tempDir, 'seed.json');
  const runtimeFile = path.join(tempDir, 'runtime', 'store.json');
  await fs.writeFile(
    seedFile,
    JSON.stringify(
      {
        agentRuns: [],
        experimentRuns: [],
        insightNotes: [],
        library: {
          [projectId]: [],
        },
        projects: [
          {
            color: '#5e6ad2',
            defaultQuery: 'postgres e2e retrieval',
            focus: 'Postgres E2E focus',
            id: projectId,
            keywords: ['postgres', 'e2e'],
            name: 'Postgres E2E',
          },
        ],
        readingQueue: {
          [projectId]: [],
        },
        readingSessions: [],
        reproChecklistItems: [],
        resultComparisons: [],
        writingDrafts: [],
      },
      null,
      2,
    ),
  );

  return { runtimeFile, seedFile };
}

test('postgres store persists graph assets, cascades references, and recovers interrupted runs', { skip: !adminUrl }, async () => {
  const projectId = 'pg-e2e';
  const { databaseUrl } = await createE2eDatabase();
  const { runtimeFile, seedFile } = await writeSeedFile(projectId);
  const store = await createStore({
    backend: 'postgres',
    databaseUrl,
    runtimeFile,
    seedFile,
  });

  const paper = await store.savePaper(projectId, {
    abstract: 'Adaptive reranking can reduce retrieval cost.',
    authors: ['Postgres Tester'],
    paperId: 'pg-paper-1',
    paperUrl: 'https://example.org/pg-paper-1',
    pdfUrl: null,
    sourceName: 'E2E',
    sourceProvider: 'test',
    title: 'Postgres Store E2E Paper',
    venue: 'ARES E2E',
    year: 2026,
  });
  await store.queuePaper(projectId, paper, { status: 'queue' });
  const session = await store.upsertReadingSession({
    paperId: paper.paperId,
    projectId,
    sections: [{ id: 'abstract', label: 'Abstract', status: 'done', summary: 'Adaptive reranking summary.' }],
    status: 'done',
    summary: 'Reader summary',
    title: paper.title,
  });
  const removedEvidence = await store.upsertProjectAsset('evidenceLinks', {
    paperId: paper.paperId,
    projectId,
    quote: 'Removed evidence quote.',
    sourceId: 'note-removed',
    sourceType: 'note',
  });
  const retainedEvidence = await store.upsertProjectAsset('evidenceLinks', {
    paperId: paper.paperId,
    projectId,
    quote: 'Retained evidence quote.',
    sourceId: 'note-retained',
    sourceType: 'note',
  });
  const evidenceLinkIds = [removedEvidence.id, retainedEvidence.id];
  const packet = await store.upsertProjectAsset('readingPackets', {
    evidenceLinkIds,
    paperId: paper.paperId,
    projectId,
    readingSessionId: session.id,
    summary: 'Packet summary',
  });
  const plan = await store.upsertProjectAsset('reproductionPlans', {
    evidenceLinkIds,
    projectId,
    readingPacketId: packet.id,
    title: 'Reproduction plan',
  });
  const dossier = await store.upsertProjectAsset('resultDossiers', {
    evidenceLinkIds,
    experimentRunIds: [],
    projectId,
    title: 'Result dossier',
  });
  const insight = await store.upsertProjectAsset('insightCards', {
    claim: 'Adaptive reranking can reduce cost.',
    evidenceLinkIds,
    projectId,
    type: 'claim',
  });
  const draft = await store.upsertProjectAsset('drafts', {
    projectId,
    title: 'Draft',
  });
  const section = await store.upsertProjectAsset('draftSections', {
    body: 'Draft section body.',
    draftId: draft.id,
    evidenceLinkIds,
    insightCardIds: [insight.id],
    projectId,
    title: 'Section',
  });
  const run = await store.createAgentRun({
    agent: 'Reader agent',
    input: { paperId: paper.paperId },
    projectId,
    stage: 'reading',
    status: 'running',
    taskKind: 'create-reading-session',
  });
  const canceledRun = await store.createAgentRun({
    agent: 'Scout agent',
    cancelReason: 'user',
    cancelRequestedAt: '2026-06-12T00:03:00.000Z',
    error: 'Canceled by user.',
    finishedAt: '2026-06-12T00:03:01.000Z',
    input: { query: 'cancel me' },
    projectId,
    stage: 'search',
    status: 'canceled',
    taskKind: 'run-agentic-search',
  });

  await store.deleteProjectAsset('evidenceLinks', removedEvidence.id, { projectId });
  await store.close();

  const reopened = await createStore({
    backend: 'postgres',
    databaseUrl,
    runtimeFile,
    seedFile,
  });
  const graph = reopened.getProjectGraph(projectId);
  assert.equal(graph.papers.find((entry) => entry.paperId === paper.paperId).title, paper.title);
  assert.equal(graph.readingPackets.find((entry) => entry.id === packet.id).readingSessionId, session.id);
  assert.deepEqual(graph.readingPackets.find((entry) => entry.id === packet.id).evidenceLinkIds, [retainedEvidence.id]);
  assert.deepEqual(graph.reproductionPlans.find((entry) => entry.id === plan.id).evidenceLinkIds, [retainedEvidence.id]);
  assert.deepEqual(graph.resultDossiers.find((entry) => entry.id === dossier.id).evidenceLinkIds, [retainedEvidence.id]);
  assert.deepEqual(graph.insightCards.find((entry) => entry.id === insight.id).evidenceLinkIds, [retainedEvidence.id]);
  assert.deepEqual(graph.draftSections.find((entry) => entry.id === section.id).evidenceLinkIds, [retainedEvidence.id]);
  assert.equal(reopened.getAgentRun(run.id).status, 'running');
  assert.equal(reopened.getAgentRun(canceledRun.id).status, 'canceled');
  assert.equal(reopened.getAgentRun(canceledRun.id).cancelReason, 'user');
  assert.equal(reopened.getAgentRun(canceledRun.id).cancelRequestedAt, '2026-06-12T00:03:00.000Z');

  const agentRuns = createAgentRunService({
    rootDir: path.dirname(seedFile),
    store: reopened,
  });
  const recovered = await agentRuns.recoverInterruptedRuns();
  assert.deepEqual(recovered.map((entry) => entry.id), [run.id]);
  assert.equal(reopened.getAgentRun(run.id).status, 'error');
  assert.equal(reopened.getAgentRun(canceledRun.id).status, 'canceled');
  assert.match(reopened.getAgentRun(run.id).error, /interrupted by server restart/i);
  await reopened.close();
});
