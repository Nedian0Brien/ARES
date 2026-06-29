import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ASSET_COLLECTIONS,
  buildInsightQualityReport,
  diffDraftRevisionSections,
  normaliseAsset,
  normaliseActivityEvent,
  normaliseCommentThread,
  normaliseDraftRevision,
  normaliseEvidenceLink,
  normaliseExperimentRun,
  normaliseInsightCard,
  normaliseNotification,
  normalisePaper,
  normaliseReadingPacket,
  normaliseReproductionPlan,
  normaliseResultDossier,
} from '../lib/asset-model.mjs';

test('asset collection registry includes legacy and graph collections', () => {
  assert.ok(ASSET_COLLECTIONS.includes('readingSessions'));
  assert.ok(ASSET_COLLECTIONS.includes('researchQuestions'));
  assert.ok(ASSET_COLLECTIONS.includes('readingPackets'));
  assert.ok(ASSET_COLLECTIONS.includes('evidenceLinks'));
  assert.ok(ASSET_COLLECTIONS.includes('resultDossiers'));
  assert.ok(ASSET_COLLECTIONS.includes('draftSections'));
  assert.ok(ASSET_COLLECTIONS.includes('draftRevisions'));
  assert.ok(ASSET_COLLECTIONS.includes('commentThreads'));
  assert.ok(ASSET_COLLECTIONS.includes('activityEvents'));
  assert.ok(ASSET_COLLECTIONS.includes('notifications'));
});

test('normalisePaper maps legacy paper records into graph shape', () => {
  const paper = normalisePaper(
    {
      authors: ['A', 'B'],
      paperId: 'paper-1',
      paperUrl: 'https://example.org/paper',
      pdfUrl: 'https://example.org/paper.pdf',
      display: { labTitle: 'Short Demo', labOrder: 1 },
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
  assert.deepEqual(paper.display, { labTitle: 'Short Demo', labOrder: 1 });
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

test('buildInsightQualityReport calculates evidence coverage, source diversity, and unresolved contradictions', () => {
  const report = buildInsightQualityReport(
    normaliseInsightCard(
      {
        claim: 'Dense reranking improves the final answer quality.',
        contradictionTraces: [
          {
            dismissReason: '',
            quote: 'Sparse retrieval performs better on the citation subset.',
            sourceRef: { id: 'evidence-2', label: 'Citation subset', type: 'evidenceLink' },
          },
          {
            dismissReason: 'Different corpus version.',
            quote: 'A prior run showed no improvement.',
            sourceRef: { id: 'run-1', label: 'Prior run', type: 'experimentRun' },
          },
        ],
        evidenceLinkIds: ['evidence-1', 'evidence-2'],
        sourceRefs: [
          { id: 'evidence-1', label: 'Reader note', type: 'evidenceLink' },
          { id: 'run-1', label: 'Lab run', type: 'experimentRun' },
          { id: 'paper-1', label: 'Paper', type: 'paper' },
        ],
      },
      { projectId: 'demo' },
    ),
  );

  assert.deepEqual(report, {
    evidenceCoverage: 'strong',
    evidenceLinkCount: 2,
    sourceDiversity: 3,
    sourceTypes: ['evidenceLink', 'experimentRun', 'paper'],
    unresolvedContradictionCount: 1,
  });
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
      title: 'External eval import',
    },
    { projectId: 'demo' },
  );

  assert.equal(run.kind, 'external-import');
  assert.equal(run.config.importSource, 'external-paste');
  assert.equal(run.config.command, 'python eval.py --dataset demo');
  assert.equal(run.config.rawLog, 'accuracy: 0.842');
  assert.deepEqual(run.artifacts, [{ label: 'metrics.json', type: 'json', url: 'file:///tmp/metrics.json' }]);
  assert.deepEqual(run.metrics, { accuracy: '0.842' });
  assert.equal(run.title, 'External eval import');
});

test('normaliseExperimentRun preserves Lab workspace progress and report context', () => {
  const run = normaliseExperimentRun(
    {
      designRows: [
        { icon: 'note', label: '데이터셋', value: 'BEIR-13 + FiQA + NFCorpus' },
      ],
      elapsed: '2m 14s',
      progressLabel: '5/5',
      reportSummary: '가설 지지됨 · 차트 · 결과표 · 분석 포함',
      runSteps: [
        { status: 'done', st: '도메인별 τ* 그리드서치', so: '13 domains · τ* 0.35–0.70' },
      ],
      status: 'done',
      tags: ['BEIR held-out'],
      title: 'auto-τ regression',
    },
    { projectId: 'demo' },
  );

  assert.deepEqual(run.tags, ['BEIR held-out']);
  assert.equal(run.progressLabel, '5/5');
  assert.equal(run.elapsed, '2m 14s');
  assert.equal(run.reportSummary, '가설 지지됨 · 차트 · 결과표 · 분석 포함');
  assert.deepEqual(run.designRows, [
    { icon: 'note', label: '데이터셋', value: 'BEIR-13 + FiQA + NFCorpus' },
  ]);
  assert.deepEqual(run.runSteps, [
    { status: 'done', st: '도메인별 τ* 그리드서치', so: '13 domains · τ* 0.35–0.70' },
  ]);
});

test('normaliseResultDossier preserves Lab report fields used by the workspace', () => {
  const dossier = normaliseResultDossier(
    {
      analysis:
        '5개 미관측 도메인 전부에서 τ̂가 고정 τ=0.6을 상회했고 oracle 상한의 약 78%를 회복했습니다.',
      domainResults: [
        { domain: 'FiQA', fixed: 38.1, ours: 40.3, oracle: 40.8 },
      ],
      designSummary: '가설을 정리하고 실험을 설계했습니다.',
      executionSummary: '파이프라인을 실행했습니다.',
      hypothesis: 'τ를 도메인 난이도(첫 단계 recall)로 회귀하면 nDCG@10을 유지할 수 있다.',
      prompt: 'τ를 도메인 난이도로 회귀하면 nDCG@10을 유지할 수 있는지 검증해줘.',
      resultLabel: '고정 τ 대비 개선',
      subtitle: '가설 검증 실험 · BEIR held-out 5 domains · nDCG@10',
      tags: ['BEIR held-out'],
      title: 'auto-τ regression',
      verdict: 'supported',
      verdictText: 'held-out에서 고정 τ 대비 +1.3 nDCG',
      versionLabel: 'v1',
    },
    { projectId: 'demo' },
  );

  assert.deepEqual(dossier.tags, ['BEIR held-out']);
  assert.equal(dossier.verdict, 'supported');
  assert.equal(dossier.versionLabel, 'v1');
  assert.equal(dossier.subtitle, '가설 검증 실험 · BEIR held-out 5 domains · nDCG@10');
  assert.equal(dossier.resultLabel, '고정 τ 대비 개선');
  assert.equal(dossier.hypothesis, 'τ를 도메인 난이도(첫 단계 recall)로 회귀하면 nDCG@10을 유지할 수 있다.');
  assert.equal(dossier.prompt, 'τ를 도메인 난이도로 회귀하면 nDCG@10을 유지할 수 있는지 검증해줘.');
  assert.equal(dossier.designSummary, '가설을 정리하고 실험을 설계했습니다.');
  assert.equal(dossier.executionSummary, '파이프라인을 실행했습니다.');
  assert.equal(dossier.verdictText, 'held-out에서 고정 τ 대비 +1.3 nDCG');
  assert.match(dossier.analysis, /oracle 상한/);
  assert.deepEqual(dossier.domainResults, [{ domain: 'FiQA', fixed: 38.1, ours: 40.3, oracle: 40.8 }]);
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

test('normaliseDraftRevision stores version snapshots and section diffs', () => {
  const revision = normaliseDraftRevision(
    {
      authorId: 'user-1',
      changeSummary: 'Tightened recommendation and added limitations.',
      draftId: 'draft-1',
      previousRevisionId: 'revision-1',
      previousSections: [
        {
          body: 'Old body',
          evidenceLinkIds: ['evidence-1'],
          id: 'section-1',
          title: 'Recommendation',
        },
        {
          body: 'Removed body',
          id: 'section-removed',
          title: 'Removed',
        },
      ],
      sections: [
        {
          body: 'New body',
          evidenceLinkIds: ['evidence-1', 'evidence-2'],
          id: 'section-1',
          title: 'Recommendation',
        },
        {
          body: 'New limitation',
          id: 'section-added',
          title: 'Limitations',
        },
      ],
      version: '2',
    },
    { projectId: 'demo' },
  );

  assert.equal(revision.projectId, 'demo');
  assert.equal(revision.draftId, 'draft-1');
  assert.equal(revision.version, 2);
  assert.equal(revision.previousRevisionId, 'revision-1');
  assert.deepEqual(revision.diff, [
    {
      changedFields: ['body', 'evidenceLinkIds'],
      id: 'section-1',
      nextTitle: 'Recommendation',
      previousTitle: 'Recommendation',
      type: 'changed',
    },
    { id: 'section-removed', previousTitle: 'Removed', type: 'removed' },
    { id: 'section-added', nextTitle: 'Limitations', type: 'added' },
  ]);
});

test('diffDraftRevisionSections reports stable section changes', () => {
  assert.deepEqual(
    diffDraftRevisionSections([{ id: 'same', title: 'Same', body: 'Body' }], [{ id: 'same', title: 'Same', body: 'Body' }]),
    [],
  );
  assert.deepEqual(diffDraftRevisionSections([], [{ id: 'new', title: 'New', body: 'Body' }]), [
    { id: 'new', nextTitle: 'New', type: 'added' },
  ]);
});

test('normaliseCommentThread stores review request and resolve metadata', () => {
  const thread = normaliseCommentThread(
    {
      assigneeIds: ['reviewer-1'],
      messages: [{ authorId: 'author-1', body: 'Please verify this citation.' }],
      requestedReview: true,
      resolvedAt: '2026-06-14T00:00:00.000Z',
      resolvedBy: 'reviewer-1',
      status: 'resolved',
      targetId: 'section-1',
      targetType: 'draftSection',
      title: 'Citation review',
    },
    { projectId: 'demo' },
  );

  assert.equal(thread.projectId, 'demo');
  assert.equal(thread.status, 'resolved');
  assert.equal(thread.requestedReview, true);
  assert.equal(thread.targetId, 'section-1');
  assert.deepEqual(thread.assigneeIds, ['reviewer-1']);
  assert.equal(thread.messages[0].body, 'Please verify this citation.');
  assert.equal(thread.resolvedBy, 'reviewer-1');
});

test('normaliseActivityEvent records project feed events', () => {
  const activity = normaliseActivityEvent(
    {
      actorId: 'user-1',
      eventType: 'draft.exported',
      metadata: { format: 'markdown' },
      summary: 'Draft exported.',
      targetId: 'draft-1',
      targetType: 'draft',
    },
    { projectId: 'demo' },
  );

  assert.equal(activity.projectId, 'demo');
  assert.equal(activity.eventType, 'draft.exported');
  assert.equal(activity.targetType, 'draft');
  assert.deepEqual(activity.metadata, { format: 'markdown' });
});

test('normaliseNotification stores in-app notification state and adapter boundary', () => {
  const notification = normaliseNotification(
    {
      adapter: 'email-placeholder',
      channel: 'in-app',
      message: 'Review requested on Citation review.',
      recipientUserId: 'reviewer-1',
      relatedActivityEventId: 'activity-1',
      status: 'read',
      title: 'Review requested',
    },
    { projectId: 'demo' },
  );

  assert.equal(notification.projectId, 'demo');
  assert.equal(notification.status, 'read');
  assert.equal(notification.adapter, 'email-placeholder');
  assert.equal(notification.recipientUserId, 'reviewer-1');
  assert.equal(notification.relatedActivityEventId, 'activity-1');
});
