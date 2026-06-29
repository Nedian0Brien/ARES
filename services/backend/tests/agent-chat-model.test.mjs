import assert from 'node:assert/strict';
import test from 'node:test';

import { ASSET_COLLECTIONS, normaliseAsset } from '../lib/asset-model.mjs';

test('agent chat model registers thread and message asset collections', () => {
  assert.ok(ASSET_COLLECTIONS.includes('agentThreads'));
  assert.ok(ASSET_COLLECTIONS.includes('agentMessages'));
});

test('agent chat model normalizes thread context and saved message ids', () => {
  const thread = normaliseAsset(
    'agentThreads',
    {
      contextScope: { library: ['paper-1'], wiki: ['wiki-1'] },
      display: { group: '오늘', scope: '4 papers · Wiki · Note', when: 'now' },
      messageIds: ['message-1', 'message-2'],
      projectId: 'demo',
      savedMessageIds: ['message-2'],
      title: 'Cross-paper synthesis',
    },
    { now: '2026-06-29T00:00:00.000Z' },
  );

  assert.equal(thread.projectId, 'demo');
  assert.equal(thread.status, 'active');
  assert.equal(thread.title, 'Cross-paper synthesis');
  assert.deepEqual(thread.contextScope, { library: ['paper-1'], wiki: ['wiki-1'] });
  assert.deepEqual(thread.display, { group: '오늘', scope: '4 papers · Wiki · Note', when: 'now' });
  assert.deepEqual(thread.messageIds, ['message-1', 'message-2']);
  assert.deepEqual(thread.savedMessageIds, ['message-2']);
});

test('agent chat model normalizes assistant messages with trace, citations, and artifacts', () => {
  const message = normaliseAsset(
    'agentMessages',
    {
      artifacts: [{ id: 'artifact-1', target: 'wiki' }],
      citations: [{ evidenceLinkId: 'evidence-1', locator: { page: 3 } }],
      content: 'Grounded answer',
      display: {
        contextChips: [{ icon: 'book', label: 'Library 5' }],
        sections: [
          {
            kind: 'paragraph',
            parts: [{ text: 'Grounded ' }, { bold: true, text: 'answer' }, { citationId: 'evidence-1' }],
            text: 'Grounded answer',
          },
        ],
        traceSummary: '4단계로 추론하고 16개 출처를 확인함',
      },
      projectId: 'demo',
      role: 'assistant',
      threadId: 'thread-1',
      trace: [{ label: 'retrieved evidence', status: 'done' }],
    },
    { now: '2026-06-29T00:00:00.000Z' },
  );

  assert.equal(message.projectId, 'demo');
  assert.equal(message.role, 'assistant');
  assert.equal(message.text, 'Grounded answer');
  assert.equal(message.threadId, 'thread-1');
  assert.deepEqual(message.trace, [{ label: 'retrieved evidence', status: 'done' }]);
  assert.deepEqual(message.citations, [{ evidenceLinkId: 'evidence-1', locator: { page: 3 } }]);
  assert.deepEqual(message.artifacts, [{ id: 'artifact-1', target: 'wiki' }]);
  assert.deepEqual(message.display, {
    contextChips: [{ icon: 'book', label: 'Library 5' }],
    sections: [
      {
        kind: 'paragraph',
        parts: [{ text: 'Grounded ' }, { bold: true, text: 'answer' }, { citationId: 'evidence-1' }],
        text: 'Grounded answer',
      },
    ],
    traceSummary: '4단계로 추론하고 16개 출처를 확인함',
  });
});

test('agent chat model falls back unsupported roles to user messages', () => {
  const message = normaliseAsset('agentMessages', {
    role: 'tool',
    text: 'Internal tool output should not become a first-class chat role.',
  });

  assert.equal(message.role, 'user');
  assert.equal(message.text, 'Internal tool output should not become a first-class chat role.');
});
