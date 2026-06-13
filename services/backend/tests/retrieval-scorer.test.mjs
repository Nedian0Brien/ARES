import test from 'node:test';
import assert from 'node:assert/strict';

import { createConfiguredRetrievalScorer, createHttpRetrievalScorer } from '../lib/retrieval-scorer.mjs';
import {
  buildRetrievalScorerFixture,
  summariseRetrievalScorerScores,
  validateRetrievalScorerSummary,
} from '../../../scripts/validate-retrieval-scorer.mjs';

test('configured retrieval scorer is disabled without an endpoint', () => {
  assert.equal(createConfiguredRetrievalScorer({ ARES_RETRIEVAL_SCORER_URL: '' }), null);
});

test('http retrieval scorer sends bounded chunks and returns provider scores', async () => {
  let requestUrl = '';
  let requestHeaders = {};
  let requestBody = null;
  const scorer = createHttpRetrievalScorer({
    apiKey: 'secret-token',
    endpoint: 'https://reranker.example/score',
    fetchImpl: async (url, options) => {
      requestUrl = url;
      requestHeaders = options.headers;
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        async json() {
          return {
            scores: [
              { chunkId: 'chunk-2', score: 12 },
              { id: 'chunk-1', score: 3 },
            ],
          };
        },
      };
    },
    provider: 'example-reranker',
    timeoutMs: 1000,
  });

  const scores = await scorer.scoreChunks({
    chunks: [
      { id: 'chunk-1', page: 1, sectionId: 'intro', sectionLabel: 'Intro', text: 'A'.repeat(900) },
      { id: 'chunk-2', page: 2, sectionId: 'method', sectionLabel: 'Method', text: 'adaptive skipping' },
    ],
    message: 'How does it reduce cost?',
    queryTerms: ['reduce', 'cost'],
    selection: { page: 2, quote: 'adaptive skipping' },
    session: { id: 'session-1', title: 'Demo paper' },
  });

  assert.equal(scorer.provider, 'example-reranker');
  assert.equal(requestUrl, 'https://reranker.example/score');
  assert.equal(requestHeaders.authorization, 'Bearer secret-token');
  assert.equal(requestBody.query, 'How does it reduce cost?');
  assert.deepEqual(requestBody.queryTerms, ['reduce', 'cost']);
  assert.equal(requestBody.session.id, 'session-1');
  assert.equal(requestBody.chunks[0].text.length, 800);
  assert.deepEqual(scores, [
    { chunkId: 'chunk-2', score: 12 },
    { id: 'chunk-1', score: 3 },
  ]);
});

test('http retrieval scorer reports upstream failures', async () => {
  const scorer = createHttpRetrievalScorer({
    endpoint: 'https://reranker.example/score',
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      async text() {
        return 'offline';
      },
    }),
  });

  await assert.rejects(
    () => scorer.scoreChunks({ chunks: [], message: 'hello', queryTerms: [] }),
    /Retrieval scorer request failed \(503\): offline/,
  );
});

test('retrieval scorer validator fixture has a clear expected top chunk', () => {
  const fixture = buildRetrievalScorerFixture();

  assert.equal(fixture.expectedTopChunkId, 'method-adaptive-skipping');
  assert.match(fixture.message, /reduce retrieval cost/i);
  assert.equal(fixture.chunks.length, 3);
});

test('retrieval scorer validator reports ranking and score threshold failures', () => {
  const summary = summariseRetrievalScorerScores(
    [
      { chunkId: 'baseline-results', score: 0.71 },
      { chunkId: 'method-adaptive-skipping', score: 0.4 },
    ],
    {
      expectedTopChunkId: 'method-adaptive-skipping',
      minTopScore: 0.8,
      provider: 'test-reranker',
    },
  );

  assert.equal(summary.status, 'failed');
  assert.equal(summary.topChunkId, 'baseline-results');
  assert.deepEqual(validateRetrievalScorerSummary(summary), [
    'Expected top chunk method-adaptive-skipping, received baseline-results.',
    'Expected top score >= 0.8, received 0.71.',
  ]);
});
