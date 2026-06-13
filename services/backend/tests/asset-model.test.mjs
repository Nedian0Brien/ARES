import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ASSET_COLLECTIONS,
  normaliseAsset,
  normaliseEvidenceLink,
  normaliseExperimentRun,
  normaliseInsightCard,
  normalisePaper,
  normaliseReadingPacket,
  normaliseReproductionPlan,
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
      readingSessionId: 'reading-session-1',
      sections: [{ id: 'intro', label: 'Intro' }],
      summary: 'Summary',
    },
    { projectId: 'demo' },
  );

  assert.equal(packet.projectId, 'demo');
  assert.equal(packet.paperId, 'paper-1');
  assert.equal(packet.readingSessionId, 'reading-session-1');
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

test('normaliseReproductionPlan preserves Reading handoff context', () => {
  const plan = normaliseReproductionPlan(
    {
      evidenceLinkIds: ['evidence-1'],
      handoff: {
        assetIds: ['asset-1'],
        noteIds: ['note-1'],
        readingSessionId: 'session-1',
        sectionIds: ['section-1'],
      },
      readingPacketId: 'packet-1',
      sourceRefs: [{ id: 'note-1', label: 'Selected note', type: 'readingNote' }],
    },
    { projectId: 'demo' },
  );

  assert.equal(plan.projectId, 'demo');
  assert.equal(plan.readingPacketId, 'packet-1');
  assert.deepEqual(plan.handoff.noteIds, ['note-1']);
  assert.deepEqual(plan.handoff.assetIds, ['asset-1']);
  assert.deepEqual(plan.handoff.sectionIds, ['section-1']);
  assert.equal(plan.handoff.readingSessionId, 'session-1');
  assert.deepEqual(plan.sourceRefs, [{ id: 'note-1', label: 'Selected note', type: 'readingNote' }]);
});

test('normaliseInsightCard preserves Lab failure traceability', () => {
  const insight = normaliseInsightCard(
    {
      claim: 'Run failed because the tokenizer vocabulary was missing.',
      evidenceLinkIds: ['evidence-1'],
      experimentRunIds: ['run-1'],
      failureCause: 'Tokenizer vocabulary missing',
      followUpExperiment: 'Retry with the paper tokenizer artifact mounted.',
      resultDossierIds: ['dossier-1'],
      sourceRefs: [{ id: 'run-1', label: 'Manual run', type: 'experimentRun' }],
      type: 'hypothesis',
    },
    { projectId: 'demo' },
  );

  assert.equal(insight.projectId, 'demo');
  assert.equal(insight.failureCause, 'Tokenizer vocabulary missing');
  assert.equal(insight.followUpExperiment, 'Retry with the paper tokenizer artifact mounted.');
  assert.deepEqual(insight.experimentRunIds, ['run-1']);
  assert.deepEqual(insight.resultDossierIds, ['dossier-1']);
  assert.deepEqual(insight.sourceRefs, [{ id: 'run-1', label: 'Manual run', type: 'experimentRun' }]);
});

test('normaliseInsightCard stores quality criteria for review gates', () => {
  const insight = normaliseInsightCard(
    {
      claim: 'The ablation supports the routing change.',
      claimCluster: {
        evidenceLinkCount: 2,
        id: 'cluster-ablation-routing',
        label: 'ablation routing',
        relatedInsightCardIds: ['insight-1', 'insight-2'],
        sharedTerms: ['ablation', 'routing'],
      },
      qualityCriteria: {
        contradictionFlag: 'none',
        evidenceCoverage: 'strong',
        followUpExperimentId: 'run-next',
      },
    },
    { projectId: 'demo' },
  );

  assert.deepEqual(insight.qualityCriteria, {
    contradictionFlag: 'none',
    evidenceCoverage: 'strong',
    followUpExperimentId: 'run-next',
  });
  assert.deepEqual(insight.claimCluster, {
    evidenceLinkCount: 2,
    id: 'cluster-ablation-routing',
    label: 'ablation routing',
    relatedInsightCardIds: ['insight-1', 'insight-2'],
    sharedTerms: ['ablation', 'routing'],
  });
});

test('normaliseInsightCard stores review workflow status and reviewer assignment', () => {
  const accepted = normaliseInsightCard(
    {
      claim: 'The reranker improves low-overlap retrieval.',
      reviewDueAt: '2026-06-20',
      reviewer: 'reviewer@example.com',
      reviewNote: 'Check against the ablation table before drafting.',
      status: 'accepted',
    },
    { projectId: 'demo' },
  );
  const fallback = normaliseInsightCard({ claim: 'Needs review', status: 'done' }, { projectId: 'demo' });

  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.reviewer, 'reviewer@example.com');
  assert.equal(accepted.reviewDueAt, '2026-06-20');
  assert.equal(accepted.reviewNote, 'Check against the ablation table before drafting.');
  assert.equal(fallback.status, 'candidate');
});

test('normaliseInsightCard stores contradiction traces and dismiss reasons', () => {
  const insight = normaliseInsightCard(
    {
      claim: 'The method improves all retrieval settings.',
      contradictionTraces: [
        {
          dismissReason: 'Different dataset split.',
          quote: 'The sparse-only setting regressed by 2 points.',
          runLogPointer: { line: 42, runId: 'run-1' },
          sourceRef: { id: 'evidence-1', label: 'Ablation table', type: 'evidenceLink' },
        },
      ],
      status: 'needs-review',
    },
    { projectId: 'demo' },
  );

  assert.deepEqual(insight.contradictionTraces, [
    {
      dismissReason: 'Different dataset split.',
      quote: 'The sparse-only setting regressed by 2 points.',
      runLogPointer: { line: 42, runId: 'run-1' },
      sourceRef: { id: 'evidence-1', label: 'Ablation table', type: 'evidenceLink' },
    },
  ]);
});

test('normaliseExperimentRun preserves external import boundary metadata', () => {
  const run = normaliseExperimentRun(
    {
      artifacts: [{ label: 'metrics.json', type: 'json', url: 'file:///tmp/metrics.json' }],
      config: {
        command: 'python eval.py --dataset demo',
        importSource: 'external-paste',
        rawLog: 'accuracy: 0.842',
      },
      kind: 'external-import',
      metrics: { accuracy: '0.842' },
      status: 'done',
    },
    { projectId: 'demo' },
  );

  assert.equal(run.kind, 'external-import');
  assert.equal(run.config.importSource, 'external-paste');
  assert.equal(run.config.command, 'python eval.py --dataset demo');
  assert.equal(run.config.rawLog, 'accuracy: 0.842');
  assert.deepEqual(run.artifacts, [{ label: 'metrics.json', type: 'json', url: 'file:///tmp/metrics.json' }]);
  assert.deepEqual(run.metrics, { accuracy: '0.842' });
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
