import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ASSET_COLLECTIONS,
  normaliseAsset,
  normaliseEvidenceLink,
  normalisePaper,
  normaliseReadingPacket,
} from '../lib/asset-model.mjs';

test('asset collection registry includes legacy and graph collections', () => {
  assert.ok(ASSET_COLLECTIONS.includes('readingSessions'));
  assert.ok(ASSET_COLLECTIONS.includes('researchQuestions'));
  assert.ok(ASSET_COLLECTIONS.includes('readingPackets'));
  assert.ok(ASSET_COLLECTIONS.includes('evidenceLinks'));
  assert.ok(ASSET_COLLECTIONS.includes('resultDossiers'));
  assert.ok(ASSET_COLLECTIONS.includes('draftSections'));
});

test('normalisePaper maps legacy paper records into graph shape', () => {
  const paper = normalisePaper(
    {
      authors: ['A', 'B'],
      paperId: 'paper-1',
      paperUrl: 'https://example.org/paper',
      pdfUrl: 'https://example.org/paper.pdf',
      sourceProvider: 'seed',
      title: 'Demo Paper',
      venue: 'ACL',
      year: '2026',
    },
    { projectId: 'demo' },
  );

  assert.equal(paper.id, 'paper-1');
  assert.equal(paper.projectId, 'demo');
  assert.equal(paper.url, 'https://example.org/paper');
  assert.equal(paper.year, 2026);
  assert.deepEqual(paper.authors, ['A', 'B']);
});

test('normaliseReadingPacket keeps evidence and source ids explicit', () => {
  const packet = normaliseReadingPacket(
    {
      evidenceLinkIds: ['evidence-1'],
      keyPoints: ['Point'],
      notes: [{ id: 'note-1', body: 'Note' }],
      paperId: 'paper-1',
      sections: [{ id: 'intro', label: 'Intro' }],
      summary: 'Summary',
    },
    { projectId: 'demo' },
  );

  assert.equal(packet.projectId, 'demo');
  assert.equal(packet.paperId, 'paper-1');
  assert.deepEqual(packet.evidenceLinkIds, ['evidence-1']);
  assert.equal(packet.sections[0].id, 'intro');
});

test('normaliseEvidenceLink records locator without requiring a page', () => {
  const evidence = normaliseEvidenceLink(
    {
      quote: 'Selected PDF text',
      sourceId: 'note-1',
      sourceType: 'note',
    },
    { projectId: 'demo' },
  );

  assert.equal(evidence.projectId, 'demo');
  assert.equal(evidence.sourceType, 'note');
  assert.equal(evidence.page, null);
  assert.equal(evidence.quote, 'Selected PDF text');
});

test('normaliseAsset dispatches graph-specific contracts', () => {
  const insight = normaliseAsset('insightCards', {
    claim: 'Latency savings depend on calibration quality.',
    confidence: 'high',
    evidenceLinkIds: ['evidence-1'],
    projectId: 'demo',
    type: 'hypothesis',
  });

  assert.equal(insight.type, 'hypothesis');
  assert.equal(insight.claim, 'Latency savings depend on calibration quality.');
  assert.deepEqual(insight.evidenceLinkIds, ['evidence-1']);
});

