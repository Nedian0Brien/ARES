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
  assert.deepEqual(graph.researchQuestions, []);
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

