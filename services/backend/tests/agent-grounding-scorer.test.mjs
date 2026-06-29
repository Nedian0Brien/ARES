import assert from 'node:assert/strict';
import test from 'node:test';

import { createAgentGroundingScorer, selectAgentGroundingCandidates } from '../lib/agent-grounding-scorer.mjs';

test('agent grounding scorer ranks cross-document evidence for the latest question', async () => {
  const context = {
    chatMessages: [
      {
        role: 'user',
        text: 'Which evidence supports adaptive reranking latency?',
      },
    ],
    collections: {
      evidenceLinks: [
        {
          id: 'evidence-adaptive',
          locator: { page: 4 },
          paperId: 'paper-adaptive',
          quote: 'Adaptive reranking reduces latency when confidence is high.',
          sourceType: 'note',
          title: 'Adaptive reranking note',
        },
        {
          id: 'evidence-unrelated',
          paperId: 'paper-ui',
          quote: 'Mobile layout polish improves touch targets.',
          sourceType: 'note',
          title: 'Mobile UI note',
        },
      ],
      readingPackets: [
        {
          id: 'packet-adaptive',
          keyPoints: ['Latency drops when reranking is skipped for confident queries.'],
          paperId: 'paper-adaptive',
          title: 'Adaptive packet',
        },
      ],
    },
    papers: [
      {
        abstract: 'A paper about adaptive reranking latency.',
        paperId: 'paper-adaptive',
        title: 'Adaptive Reranking',
      },
    ],
    wikiPages: [
      {
        body: [{ text: 'Confidence gates decide when to skip the reranker.' }],
        id: 'wiki-confidence',
        title: 'Confidence gate',
      },
    ],
  };

  const candidates = selectAgentGroundingCandidates(context, { limit: 3 });
  const scorer = createAgentGroundingScorer();
  const result = await scorer.score(context, { limit: 3 });

  assert.equal(candidates[0].id, 'evidence-adaptive');
  assert.equal(result.ok, true);
  assert.equal(result.scorer, 'local-lexical');
  assert.equal(result.candidates.length, 3);
  assert.equal(result.candidates[0].id, 'evidence-adaptive');
  assert.equal(result.candidates[0].evidenceLinkId, 'evidence-adaptive');
  assert.equal(result.candidates[0].locator.page, 4);
  assert.ok(result.candidates[0].score > result.candidates.at(-1).score);
});

test('agent grounding scorer reports local health without external provider state', async () => {
  const scorer = createAgentGroundingScorer();
  const health = await scorer.checkHealth();

  assert.deepEqual(health, {
    mode: 'local',
    ok: true,
    scorer: 'local-lexical',
  });
});
