import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Kbd, StatusIcon, T, Tag, mono } from '../../components/primitives.jsx';
import { api } from '../../lib/api.js';
import { useServerResource } from '../../lib/serverState.js';

const XP_STAGES = [
  { id:'hyp', n:1, lbl:'가설' }, { id:'design', n:2, lbl:'설계' },
  { id:'run', n:3, lbl:'실행' }, { id:'report', n:4, lbl:'보고' },
];
const KAN_COLS = [
  { id:'design',  lbl:'설계 중', ic:'bulb',  c:T.t3 },
  { id:'running', lbl:'실행 중', ic:'flask', c:T.research },
  { id:'analyze', lbl:'분석 중', ic:'grid',  c:T.result },
  { id:'done',    lbl:'완료',   ic:'check', c:T.search },
];
const VERD = {
  completed:{ c:T.search, l:'지지됨', ic:'check' },
  mixed:{ c:T.result, l:'혼재', ic:'info' },
  refuted:{ c:T.insight, l:'기각', ic:'x' },
  supported:{ c:T.search, l:'지지됨', ic:'check' },
};
const XP_TEMPLATES = [
  { ic:'flask',   tt:'τ sweep',     td:'단일 파라미터 grid 탐색' },
  { ic:'layers',  tt:'Ablation',    td:'구성요소 제거 비교' },
  { ic:'columns', tt:'Baseline 비교', td:'2–3 방법 동일 평가' },
];
const STATUS_TO_COL = {
  active:'running',
  analyzing:'analyze',
  candidate:'analyze',
  completed:'done',
  done:'done',
  draft:'design',
  error:'analyze',
  failed:'analyze',
  queued:'running',
  running:'running',
  todo:'design',
};

function assetTitle(asset, fallback) {
  return String(asset?.title || asset?.name || asset?.prompt || fallback || 'Untitled').trim();
}

function labDisplayTitle(asset, fallback) {
  return String(asset?.display?.labTitle || assetTitle(asset, fallback)).trim();
}

function labPaperMeta(paper) {
  return String(paper?.display?.labMeta || [paper?.venue, paper?.year].filter(Boolean).join(' · ') || paper?.sourceProvider || 'paper').trim();
}

function labPaperOrder(paper, index) {
  const order = Number(paper?.display?.labOrder);
  return Number.isFinite(order) ? order : index + 1000;
}

function labPaperVisible(paper) {
  return paper?.display?.labVisible !== false;
}

function labProjectDocCount(project, fallback) {
  const count = Number(project?.display?.labDocs);
  return Number.isFinite(count) ? count : fallback;
}

function labRunProgress(progressLabel) {
  const match = String(progressLabel || '').match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return 50;
  const done = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return 50;
  return Math.max(0, Math.min(100, (done / total) * 100));
}

function metricLabel(metrics) {
  if (!metrics || typeof metrics !== 'object') return '';
  const [key, value] = Object.entries(metrics)[0] || [];
  if (!key) return '';
  return `${key}: ${typeof value === 'number' ? Number(value).toFixed(2) : value}`;
}

function metricEntries(metrics) {
  if (!metrics || typeof metrics !== 'object') return [];
  return Object.entries(metrics).filter(([key]) => key);
}

function metricNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? number : null;
}

function chartRowsFromResult({ comparisons, metrics }) {
  const rows = comparisons.map((comparison, index) => {
    const paperValue = metricNumber(comparison.paperValue);
    const reproducedValue = metricNumber(comparison.reproducedValue);
    if (paperValue === null && reproducedValue === null) return null;
    return {
      label: String(comparison.metric || `metric ${index + 1}`),
      paperValue,
      reproducedValue,
      value: reproducedValue ?? paperValue,
    };
  }).filter(Boolean);

  if (rows.length > 0) return rows;

  return metricEntries(metrics).map(([key, value]) => {
    const numericValue = metricNumber(value);
    if (numericValue === null) return null;
    return {
      label: String(key),
      paperValue: null,
      reproducedValue: numericValue,
      value: numericValue,
    };
  }).filter(Boolean);
}

function domainResultRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const domain = String(row.domain || row.d || row.label || '').trim();
    const fixed = metricNumber(row.fixed);
    const ours = metricNumber(row.ours);
    const oracle = metricNumber(row.oracle);
    if (!domain || fixed === null || ours === null) return null;
    return {
      domain,
      fixed,
      oracle,
      ours,
      delta: ours - fixed,
    };
  }).filter(Boolean);
}

function mean(rows, key) {
  const values = rows.map((row) => row[key]).filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function formatMetric(value) {
  return Number.isFinite(value) ? value.toFixed(1) : '-';
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(href);
}

function formatTick(value) {
  return Number.isFinite(value) ? (Number.isInteger(value) ? String(value) : value.toFixed(1)) : '-';
}

function commandPreview(command) {
  if (!command || typeof command !== 'object') return '';
  return [command.command, ...(Array.isArray(command.args) ? command.args : [])].filter(Boolean).join(' ');
}

function logLines(logs) {
  return String([logs?.stdout, logs?.stderr].filter(Boolean).join('\n')).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 8);
}

function hasResultData({ dossier, experiment }) {
  return Boolean(
    dossier?.deltaSummary ||
    dossier?.analysis ||
    dossier?.verdictText ||
    (Array.isArray(dossier?.comparisons) && dossier.comparisons.length > 0) ||
    domainResultRows(dossier?.domainResults).length > 0 ||
    metricEntries(experiment?.metrics).length > 0,
  );
}

function labCardVerdict({ failure, metrics, status }) {
  const normalized = String(status || '').toLowerCase();
  if (failure || normalized === 'error' || normalized === 'failed') return 'refuted';
  if (normalized === 'done' && metricEntries(metrics).length > 0) return 'completed';
  if (normalized === 'done') return 'mixed';
  return '';
}

function labDossierVerdict(dossier) {
  if (String(dossier?.status || '').toLowerCase() === 'error') return 'refuted';
  if (VERD[dossier?.verdict]) return dossier.verdict;
  if (hasResultData({ dossier })) return 'completed';
  return 'mixed';
}

function labResultState({ dossier, experiment }) {
  const failure = experiment?.failure || experiment?.config?.failure || null;
  const status = String(experiment?.rawStatus || '').toLowerCase();
  const resultData = hasResultData({ dossier, experiment });
  if (failure || status === 'error' || status === 'failed') {
    return {
      className: 'refuted',
      icon: 'x',
      label: '실행 확인 필요',
      text: failure?.message || '실행이 실패했습니다.',
    };
  }
  if (status === 'done' && resultData) {
    const explicitVerdict = VERD[dossier?.verdict] ? VERD[dossier.verdict] : null;
    return {
      className: dossier?.verdict === 'refuted' ? 'refuted' : dossier?.verdict === 'mixed' ? 'mixed' : 'supported',
      icon: explicitVerdict?.ic || 'check',
      label: explicitVerdict?.l || '실행 결과',
      text: dossier?.verdictText || dossier?.deltaSummary || metricLabel(experiment?.metrics) || '결과가 저장되었습니다.',
    };
  }
  return {
    className: 'mixed',
    icon: 'info',
    label: '결과 대기',
    text: '실행 결과가 아직 없습니다.',
  };
}

function hasRunnerCommand(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && value.command);
}

function runCommand(run) {
  const command = run?.config?.command || run?.command || null;
  return hasRunnerCommand(command) ? command : null;
}

function labColumnCountsFromExperiments(experiments) {
  return KAN_COLS.reduce((counts, column) => ({
    ...counts,
    [column.id]: experiments.filter((item) => item.col === column.id).length,
  }), {});
}

function graphToLabState(graph) {
  const project = graph?.project || {};
  const papers = Array.isArray(graph?.papers) ? graph.papers : [];
  const readingPackets = Array.isArray(graph?.readingPackets) ? graph.readingPackets : [];
  const plans = Array.isArray(graph?.reproductionPlans) ? graph.reproductionPlans : [];
  const runs = Array.isArray(graph?.experimentRuns) ? graph.experimentRuns : [];
  const dossiers = Array.isArray(graph?.resultDossiers) ? graph.resultDossiers : [];
  const labPapers = papers.filter((paper) => paper.source !== 'reading' && labPaperVisible(paper));
  const labPackets = readingPackets.filter((packet) => !packet.readingSessionId);
  const runIds = new Set(runs.map((run) => String(run.id || '')));
  const linkedDossierRunIds = new Set();
  for (const dossier of dossiers) {
    for (const runId of dossier.experimentRunIds || []) {
      if (runIds.has(String(runId))) {
        linkedDossierRunIds.add(String(runId));
      }
    }
  }
  const projectId = String(project.id || 'rag-reranker');
  const color = T.research;
  const projectCard = {
    arts: dossiers.length,
    color,
    desc: String(project.focus || project.defaultQuery || '프로젝트 자산 그래프'),
    docs: labProjectDocCount(project, labPapers.length + labPackets.length),
    id: projectId,
    name: String(project.name || projectId),
    updated: formatProjectUpdated(project.updatedAt || project.createdAt),
  };
  const planCards = plans.map((plan) => ({
    id: plan.id,
    proj: projectId,
    col: 'design',
    title: assetTitle(plan, 'Reproduction plan'),
    tags: (plan.metrics || []).slice(0, 3),
    meta: plan.progressLabel || plan.status || `${(plan.commands || []).length} commands`,
    origin: plan.sourceRefs?.[0]?.label || (plan.readingPacketId ? 'Reading handoff' : 'Plan'),
  }));
  const runCards = runs.map((run) => {
    const col = STATUS_TO_COL[String(run.status || '').toLowerCase()] || 'design';
    const command = runCommand(run);
    return {
      approvalState: run.config?.approval?.state || '',
      assetKind: 'experimentRun',
      canExecute: Boolean(command && !['running', 'done'].includes(col)),
      command,
      completedAt: run.completedAt || null,
      config: run.config || {},
      failure: run.config?.failure || null,
      id: run.id,
      metrics: run.metrics || {},
      proj: projectId,
      rawStatus: run.status || '',
      designRows: run.designRows || [],
      elapsed: run.elapsed || '',
      reportSummary: run.reportSummary || '',
      runSteps: run.runSteps || [],
      startedAt: run.startedAt || null,
      col,
      title: assetTitle(run, 'Experiment run'),
      tags: (Array.isArray(run.tags) && run.tags.length ? run.tags : [run.kind || 'run', run.status || 'draft']).filter(Boolean).slice(0, 3),
      meta: run.reproductionPlanId ? 'plan linked' : 'manual',
      metric: metricLabel(run.metrics) || run.status || '',
      prog: col === 'running' ? labRunProgress(run.progressLabel) : 100,
      runs: run.progressLabel || '1/1',
      step: run.notes || run.status || 'queued',
      elapsed: run.elapsed || '',
      verdict: labCardVerdict({ failure: run.config?.failure, metrics: run.metrics, status: run.status }),
    };
  });
  const dossierCards = dossiers.filter((dossier) => {
    return !(dossier.experimentRunIds || []).some((runId) => linkedDossierRunIds.has(String(runId)));
  }).map((dossier) => ({
    assetKind: 'resultDossier',
    analysis: dossier.analysis || '',
    id: dossier.id,
    comparisons: dossier.comparisons || [],
    deltaSummary: dossier.deltaSummary || '',
      designRows: dossier.designRows || [],
      domainResults: dossier.domainResults || [],
      elapsed: dossier.elapsed || '',
      experimentRunIds: dossier.experimentRunIds || [],
      footnote: dossier.footnote || '',
      hypothesis: dossier.hypothesis || '',
      proj: projectId,
      resultLabel: dossier.resultLabel || '',
      reportSummary: dossier.reportSummary || '',
      rawStatus: dossier.status || '',
      runSteps: dossier.runSteps || [],
      progressLabel: dossier.progressLabel || '',
      subtitle: dossier.subtitle || '',
      col: 'done',
      title: assetTitle(dossier, 'Result dossier'),
    tags: (Array.isArray(dossier.tags) && dossier.tags.length ? dossier.tags : ['dossier', dossier.status || 'done']).slice(0, 3),
    metric: dossier.deltaSummary || `${(dossier.experimentRunIds || []).length} runs`,
    verdictText: dossier.verdictText || '',
    versionLabel: dossier.versionLabel || '',
    verdict: labDossierVerdict(dossier),
  }));
  const experiments = [...planCards, ...runCards, ...dossierCards];
  projectCard.columnCounts = labColumnCountsFromExperiments(experiments);
  projectCard.experimentCount = experiments.length;
  const assets = {
    [projectId]: {
      arts: dossiers.map((dossier) => ({ t: assetTitle(dossier, 'Result dossier'), m: dossier.deltaSummary || '리포트', ic:'note' })),
      data: labPackets.map((packet) => ({ t: assetTitle(packet, 'Reading packet'), m: packet.summary || 'reading packet', ic:'grid' })),
      docs: labPapers
        .map((paper, index) => ({ t: labDisplayTitle(paper, 'Paper'), m: labPaperMeta(paper), ic:'pdf', order: labPaperOrder(paper, index) }))
        .sort((a, b) => a.order - b.order)
        .map(({ order, ...paper }) => paper),
    },
  };

  return {
    assets,
    dossiers,
    experiments,
    projectById: { [projectId]: projectCard },
    projects: [projectCard],
  };
}

function formatProjectUpdated(value) {
  if (!value) return '방금';
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '방금';
  const elapsed = Math.max(0, Date.now() - time);
  const hours = Math.floor(elapsed / 3_600_000);
  if (hours < 1) return '방금';
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(elapsed / 86_400_000);
  if (days === 0) return '방금';
  if (days === 1) return '어제';
  return `${days}일 전`;
}

function projectSummaryToLabCard(project) {
  const id = String(project?.id || '').trim();
  const labColumnCounts = project?.labColumnCounts || {};
  return {
    arts: Number(project?.labArtifactCount ?? 0),
    color: project?.color || T.research,
    columnCounts: KAN_COLS.reduce((counts, column) => ({
      ...counts,
      [column.id]: Number(labColumnCounts[column.id] || 0),
    }), {}),
    desc: String(project?.focus || project?.defaultQuery || '연구 프로젝트'),
    docs: Number(project?.libraryCount ?? project?.readingSessionCount ?? 0),
    experimentCount: Number(project?.labExperimentCount ?? 0),
    id,
    name: String(project?.name || id || 'Lab'),
    updated: formatProjectUpdated(project?.updatedAt || project?.createdAt),
  };
}

function projectSummariesToLabCards(projects, currentLabState) {
  const current = currentLabState.projects[0] || null;
  const cards = (Array.isArray(projects) ? projects : [])
    .map(projectSummaryToLabCard)
    .filter((project) => project.id);
  if (!current?.id) return cards;
  const existingIndex = cards.findIndex((project) => project.id === current.id);
  if (existingIndex >= 0) {
    cards[existingIndex] = { ...cards[existingIndex], ...current };
    return cards;
  }
  return [current, ...cards];
}

function StageBar() {
  const activeId = 'report';
  const ai = XP_STAGES.findIndex(s => s.id===activeId);
  return (
    <div className="stage-bar">
      {XP_STAGES.map((s,i) => {
        const done = i < ai, active = i === ai;
        return (
          <React.Fragment key={s.id}>
            <div className={`stage-step ${done?'done':''} ${active?'active':''}`}>
              <span className="sd">{done ? <Icon name="check" size={12} color="#fff"/> : s.n}</span>
              <span className="sl">{s.lbl}</span>
            </div>
            {i < XP_STAGES.length-1 && <div className={`stage-conn ${i<ai?'done':''}`}/>}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function LabResultChart({ comparisons, metrics }) {
  const rows = chartRowsFromResult({ comparisons, metrics });
  if (rows.length === 0) return null;

  const width = 348;
  const height = 176;
  const left = 34;
  const right = 332;
  const bottom = 136;
  const top = 20;
  const maxValue = Math.max(...rows.flatMap((row) => [row.paperValue, row.reproducedValue, row.value]).filter((value) => value !== null).map(Math.abs), 1);
  const slot = (right - left) / rows.length;
  const barWidth = Math.max(9, Math.min(18, slot * 0.24));
  const yFor = (value) => bottom - (Math.abs(value) / maxValue) * (bottom - top);

  return (
    <div className="xp-chart">
      <div className="ct">실행 지표 차트</div>
      <div className="cl">
        <span><i style={{ background:T.t3 }}/>논문값</span>
        <span><i style={{ background:T.research }}/>재현값</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} aria-label="실행 지표 차트" role="img" width="100%" style={{ display:'block', marginTop:8 }}>
        {[0, 0.5, 1].map((ratio) => {
          const y = bottom - ratio * (bottom - top);
          return (
            <g key={ratio}>
              <line x1={left} y1={y} x2={right} y2={y} stroke={ratio === 0 ? T.b2 : T.b1} strokeWidth={ratio === 0 ? 1 : 0.8} strokeDasharray={ratio === 0 ? '' : '2 3'}/>
              <text x={left - 7} y={y + 3} textAnchor="end" fontSize="8" fill={T.t4} fontFamily="'JetBrains Mono',monospace">{(maxValue * ratio).toFixed(2)}</text>
            </g>
          );
        })}
        {rows.map((row, index) => {
          const center = left + index * slot + slot / 2;
          const paperHeight = row.paperValue === null ? 0 : bottom - yFor(row.paperValue);
          const reproducedHeight = row.reproducedValue === null ? 0 : bottom - yFor(row.reproducedValue);
          return (
            <g key={row.label}>
              {row.paperValue !== null && <rect x={center - barWidth - 2} y={bottom - paperHeight} width={barWidth} height={paperHeight} rx="2.5" style={{ fill:'color-mix(in srgb, var(--t3) 35%, transparent)' }}/>}
              {row.reproducedValue !== null && <rect x={center + 2} y={bottom - reproducedHeight} width={barWidth} height={reproducedHeight} rx="2.5" style={{ fill:T.research }}/>}
              <text x={center} y={bottom + 14} textAnchor="middle" fontSize="8" fill={T.t3}>{row.label}</text>
              <text x={center + 2 + barWidth / 2} y={bottom - reproducedHeight - 5} textAnchor="middle" fontSize="8" fontWeight="600" fill={T.research} fontFamily="'JetBrains Mono',monospace">{row.value.toFixed(2)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function DomainResultChart({ rows }) {
  const domainRows = domainResultRows(rows);
  if (domainRows.length === 0) return null;

  const width = 348;
  const height = 176;
  const left = 34;
  const right = 338;
  const bottom = 136;
  const top = 16;
  const maxDomainValue = Math.max(...domainRows.flatMap((row) => [row.delta, row.oracle === null ? 0 : row.oracle - row.fixed]).map(Math.abs), 1);
  const maxValue = maxDomainValue <= 3 ? 3 : maxDomainValue;
  const tickValues = maxValue === 3 ? [0, 1, 2, 3] : [0, maxValue / 2, maxValue];
  const slot = (right - left) / domainRows.length;
  const yFor = (value) => bottom - (Math.abs(value) / maxValue) * (bottom - top);
  const barWidth = 13;

  return (
    <div className="xp-chart">
      <div className="ct">도메인별 nDCG@10 개선</div>
      <div className="cl">
        <span><i style={{ background:T.research }}/>τ̂ (ours)</span>
        <span><i style={{ background:'rgba(137,87,201,0.18)', boxShadow:'inset 0 0 0 1px rgba(137,87,201,0.45)' }}/>oracle {'상한'}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} aria-label="도메인별 nDCG@10 개선" role="img" width="100%" style={{ display:'block' }}>
        {tickValues.map((value) => {
          const y = yFor(value);
          return (
            <g key={value}>
              <line x1={left} y1={y} x2={right} y2={y} stroke={value === 0 ? T.b2 : T.b1} strokeWidth={value === 0 ? 1 : 0.8} strokeDasharray={value === 0 ? '' : '2 3'}/>
              <text x={left - 7} y={y + 3} textAnchor="end" fontSize="8" fill={T.t4} fontFamily="'JetBrains Mono',monospace">+{formatTick(value)}</text>
            </g>
          );
        })}
        {domainRows.map((row, index) => {
          const center = left + index * slot + slot / 2;
          const oursHeight = bottom - yFor(row.delta);
          const oracleDelta = row.oracle === null ? row.delta : row.oracle - row.fixed;
          const oracleHeight = bottom - yFor(oracleDelta);
          return (
            <g key={row.domain}>
              <rect x={center + 1} y={bottom - oracleHeight} width={barWidth} height={oracleHeight} rx="2.5" style={{ fill:'rgba(137,87,201,0.13)', stroke:'rgba(137,87,201,0.4)', strokeWidth:0.8 }}/>
              <rect x={center - barWidth - 1} y={bottom - oursHeight} width={barWidth} height={oursHeight} rx="2.5" style={{ fill:T.research }}/>
              <text x={center - barWidth / 2 - 1} y={bottom - oursHeight - 4} textAnchor="middle" fontSize="7.5" fontWeight="600" fill={T.research} fontFamily="'JetBrains Mono',monospace">+{formatMetric(row.delta)}</text>
              <text x={center} y={bottom + 12} textAnchor="middle" fontSize="8" fill={T.t3}>{row.domain}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function RunnerConsolePane({ basis, dossier, experiment }) {
  const [draft, setDraft] = useState('');
  const [queuedRequest, setQueuedRequest] = useState('');
  const rich = dossier || {};
  const source = rich.runSteps?.length || rich.designRows?.length || rich.hypothesis ? rich : experiment || {};
  const logs = experiment?.config?.logs || {};
  const metrics = metricEntries(experiment?.metrics);
  const lines = logLines(logs);
  const command = commandPreview(experiment?.command || experiment?.config?.command);
  const status = experiment?.rawStatus || experiment?.step || 'draft';
  const designRows = Array.isArray(source.designRows) ? source.designRows : [];
  const runSteps = Array.isArray(source.runSteps) && source.runSteps.length ? source.runSteps : [
    { st:'실험 선택', so:experiment?.title || '선택된 실험 없음', status: experiment ? 'done' : 'todo' },
    { st:'실행 명령', so:command || '저장된 실행 명령이 없습니다.', status: command ? 'done' : 'todo' },
    { st:'러너 출력', so:lines[0] || '실행 로그가 아직 없습니다.', status: lines.length ? 'done' : status === 'done' ? 'done' : 'todo' },
    { st:'지표 수집', so:metrics.length ? metrics.map(([key, value]) => `${key}: ${value}`).join(' · ') : '수집된 지표가 없습니다.', status: metrics.length ? 'done' : 'todo' },
  ];
  const goal = source.prompt || source.hypothesis || experiment?.title || '실험을 선택하세요.';
  const completedLabel = source.progressLabel || (runSteps.length ? `${runSteps.filter((step) => step.status === 'done').length}/${runSteps.length}` : '');
  const reportSummary = source.reportSummary || dossier?.verdictText || dossier?.deltaSummary || '';
  const quickRequest = (text) => {
    setDraft(text);
    setQueuedRequest('');
  };
  const submitRequest = () => {
    const request = draft.trim();
    setQueuedRequest(request || '실험 수정 지시를 입력해 주세요.');
    if (request) setDraft('');
  };
  const exportReport = () => {
    downloadJson(`ares-lab-report-${experiment?.id || dossier?.id || 'experiment'}.json`, {
      dossier,
      experiment,
      exportedAt: new Date().toISOString(),
      runSteps,
    });
  };
  return (
    <div className="pane run-pane" style={{ flex:basis }}>
      <StageBar/>
      <div className="run-feed">
        <div className="run-col feed">
          {/* user goal */}
          <div className="ag-turn user">
            <div className="ag-ubub">{goal}</div>
          </div>

          {/* agent: hypothesis + design */}
          <div className="rmsg">
            <span className="ra"><Icon name="sparkles" size={13} color={T.research}/></span>
            <div className="rc">
              {designRows.length ? source.designSummary || <>가설을 정리하고 실험을 설계했습니다 — <b>τ̂ = ridge(recall, |q|, c̄(q))</b>를 8개 train 도메인에서 학습하고 5개 미관측 도메인에서 검증합니다.</> : command ? '저장된 실행 명령을 확인했습니다.' : '이 실험에는 아직 실행 명령이 없습니다.'}
              <div className="rspec">
                {designRows.length ? designRows.map((row, index) => (
                  <div key={index} className="rsline"><Icon name={row.icon || 'flask'} size={12} color={T.research}/><span className="rk">{row.label}</span><span className="rv">{row.value}</span></div>
                )) : (
                  <>
                    <div className="rsline"><Icon name="flask" size={12} color={T.research}/><span className="rk">상태</span><span className="rv">{status}</span></div>
                    <div className="rsline"><Icon name="layers" size={12} color={T.research}/><span className="rk">명령</span><span className="rv">{command || '미설정'}</span></div>
                    <div className="rsline"><Icon name="grid" size={12} color={T.research}/><span className="rk">지표</span><span className="rv">{metrics.length ? `${metrics.length}개` : '없음'}</span></div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* agent: execution */}
          <div className="rmsg">
            <span className="ra"><Icon name="sparkles" size={13} color={T.research}/></span>
            <div className="rc">
              {status === 'done' ? source.executionSummary || '파이프라인을 실행했습니다.' : '현재 실험 상태를 불러왔습니다.'}
              <div className="runcard">
                <div className="runcard-h"><Icon name={status === 'done' ? 'check' : 'info'} size={13} color={status === 'done' ? T.search : T.research}/> <b>{status === 'done' ? '실행 완료' : '실행 대기'}</b>{completedLabel && <> · {completedLabel} 단계</>}<span className="rg">{source.elapsed || experiment?.completedAt || experiment?.startedAt || '시간 정보 없음'}</span></div>
                {runSteps.map((s,i) => (
                  <div key={i} className="rstep">
                    <span className="si"><StatusIcon status={s.status}/></span>
                    <div className="sb"><div className="st">{i+1}. {s.st}</div><div className="so">→ {s.so}</div></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* agent: report artifact generated */}
          <div className="rmsg">
            <span className="ra"><Icon name="sparkles" size={13} color={T.research}/></span>
            <div className="rc">
              {reportSummary ? '결과를 분석해 실험 리포트를 생성했습니다.' : lines.length ? '러너 로그를 저장된 결과에서 읽었습니다.' : '저장된 로그가 없습니다.'}
              {reportSummary && (
                <>
                  <div className="rartifact">
                    <span className="rai"><Icon name="note" size={16} color={T.research}/></span>
                    <div className="rab"><b>실험 리포트 — {dossier?.title || experiment?.title}</b><span>{reportSummary}</span></div>
                    <Icon name="arrowR" size={15} color={T.t4}/>
                  </div>
                  {dossier?.verdictText && (
                    <div className={`rverdict ${dossier.verdict === 'refuted' ? 'refuted' : ''}`}>
                      <span className="vi"><Icon name={dossier.verdict === 'refuted' ? 'x' : 'check'} size={15}/></span>
                      <span className="vt"><b>{VERD[dossier.verdict]?.l || '실행 결과'}</b> — {dossier.verdictText}</span>
                    </div>
                  )}
                </>
              )}
              {lines.length > 0 && (
                <div className="runcard">
                  {lines.map((line, index) => (
                    <div key={index} className="rstep">
                      <span className="si"><StatusIcon status="done"/></span>
                      <div className="sb"><div className="st" style={{ fontFamily:mono }}>{line}</div></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="run-steer">
        <div className="run-col">
          <div className="run-qa">
            <button className="run-qchip" onClick={() => quickRequest('held-out 도메인을 하나 더 추가해 같은 조건으로 재실행')} type="button"><Icon name="plus" size={12}/> 도메인 추가 후 재실행</button>
            <button className="run-qchip" onClick={() => quickRequest('고정 τ=0.6 baseline을 BM25 confidence baseline으로 교체')} type="button"><Icon name="layers" size={12}/> baseline 교체</button>
            <button className="run-qchip" onClick={exportReport} type="button"><Icon name="download" size={12}/> 리포트 내보내기</button>
          </div>
          <div className="chat-box">
            <textarea rows={1} onChange={(event) => setDraft(event.target.value)} placeholder="실험을 수정하거나 재실행을 지시하세요…" value={draft}/>
            <div className="chat-irow">
              <button className="chat-tool icon" onClick={() => quickRequest('현재 설정을 유지하고 결과표만 다시 생성')} title="설정 첨부" type="button"><Icon name="layers" size={15}/></button>
              <span style={{ flex:1 }}/>
              <span className="chat-tool" style={{ cursor:'default' }}><Icon name="sparkles" size={12} color={T.research}/> 실험 에이전트</span>
              <button className="chat-send" onClick={submitRequest} title="실험 지시 저장" type="button"><Icon name="send" size={14} color="#fff"/></button>
            </div>
          </div>
          {queuedRequest && <div className="ag-disc">{queuedRequest}</div>}
        </div>
      </div>
    </div>
  );
}

function ReportPane({ basis, dossier, experiment }) {
  const comparisons = Array.isArray(dossier?.comparisons) ? dossier.comparisons : [];
  const domainResults = dossier?.domainResults || [];
  const domainRows = domainResultRows(domainResults);
  const metrics = metricEntries(experiment?.metrics);
  const failure = experiment?.failure || experiment?.config?.failure || null;
  const verdict = labResultState({ dossier, experiment });
  const fixedMean = mean(domainRows, 'fixed');
  const oursMean = mean(domainRows, 'ours');
  const oracleMean = mean(domainRows, 'oracle');
  const reportPayload = {
    dossier,
    experiment,
    exportedAt: new Date().toISOString(),
  };
  const copyReport = () => navigator.clipboard?.writeText(JSON.stringify(reportPayload, null, 2));
  const exportReport = () => downloadJson(`ares-lab-report-${experiment?.id || dossier?.id || 'experiment'}.json`, reportPayload);
  const shareReport = () => {
    const title = dossier?.title || experiment?.title || 'ARES Lab report';
    if (navigator.share) {
      navigator.share({ text: JSON.stringify(reportPayload, null, 2), title }).catch(() => {});
      return;
    }
    copyReport();
  };
  return (
    <div className="pane report-pane" style={{ flex:basis }}>
      <div className="rep-top">
        <span className="repi"><Icon name="note" size={14} color={T.research}/></span>
        <div className="rep-id"><b>실험 리포트</b><span>{dossier?.footnote || (dossier ? '저장된 결과' : '선택한 실험')}</span></div>
        <span className="rep-v">{dossier?.versionLabel || experiment?.rawStatus || 'draft'}</span>
        <div className="pane-actions">
          <button className="pane-icon-btn" onClick={copyReport} title="복사" type="button"><Icon name="quote" size={13}/></button>
          <button className="pane-icon-btn" onClick={exportReport} title="내보내기" type="button"><Icon name="download" size={13}/></button>
          <button className="pane-icon-btn" onClick={shareReport} title="공유" type="button"><Icon name="share" size={13}/></button>
        </div>
      </div>
      <div className="rep-wrap">
        <div className="rep">
          <div className="rep-title">{dossier?.title || experiment?.title || '실험 결과'}</div>
          <div className="rep-sub">{dossier?.subtitle || dossier?.deltaSummary || metricLabel(experiment?.metrics) || '선택한 실험의 실행 결과가 아직 없습니다.'}</div>

          <div className={`xp-verdict ${verdict.className}`} style={{ marginTop:15, width:'100%', flexWrap:'wrap' }}>
            <Icon name={verdict.icon} size={15}/> {dossier?.verdict === 'supported' ? '가설 지지됨' : verdict.label}
            <span className="vt">{domainRows.length && fixedMean !== null && oursMean !== null ? `평균 ${formatMetric(oursMean)} (τ̂) vs ${formatMetric(fixedMean)} (고정)${oracleMean === null ? '' : ` · oracle ${formatMetric(oracleMean)}`}` : verdict.text}</span>
          </div>

          <div className="rep-sec">
            <div className="xp-sh"><Icon name="bulb" size={12} color={T.research}/> {dossier?.hypothesis ? '가설' : '실행'}</div>
            <div className="rep-hyp">{dossier?.hypothesis || commandPreview(experiment?.command || experiment?.config?.command) || '실행 명령이 없습니다.'}</div>
          </div>

          <div className="rep-sec">
            <div className="xp-sh"><Icon name="grid" size={12} color={T.research}/> 결과<span className="sx">{dossier?.resultLabel || `${metrics.length} metrics`}</span></div>
            {domainRows.length ? <DomainResultChart rows={domainResults}/> : <LabResultChart comparisons={comparisons} metrics={experiment?.metrics}/>}
            <div className={`xp-rt ${domainRows.length ? 'domain-table' : ''}`}>
              {domainRows.length ? (
                <>
                  <div className="rr h"><div className="rc">도메인</div><div className="rc">고정 0.6</div><div className="rc">τ̂</div><div className="rc">ORACLE</div><div className="rc">Δ</div></div>
                  {domainRows.map((row) => (
                    <div key={row.domain} className="rr">
                      <div className="rc">{row.domain}</div>
                      <div className="rc">{formatMetric(row.fixed)}</div>
                      <div className="rc best">{formatMetric(row.ours)}</div>
                      <div className="rc">{row.oracle === null ? '-' : formatMetric(row.oracle)}</div>
                      <div className="rc pos">+{formatMetric(row.delta)}</div>
                    </div>
                  ))}
                  <div className="rr tot">
                    <div className="rc">평균</div>
                    <div className="rc">{formatMetric(fixedMean)}</div>
                    <div className="rc best">{formatMetric(oursMean)}</div>
                    <div className="rc">{formatMetric(oracleMean)}</div>
                    <div className="rc pos">+{formatMetric(oursMean - fixedMean)}</div>
                  </div>
                </>
              ) : (
                <>
                  <div className="rr h"><div className="rc">항목</div><div className="rc">논문값</div><div className="rc">재현값</div><div className="rc">차이</div></div>
                  {comparisons.map((comparison, index) => (
                    <div key={index} className="rr">
                      <div className="rc">{comparison.metric || `metric ${index + 1}`}</div>
                      <div className="rc">{comparison.paperValue || '-'}</div>
                      <div className="rc best">{comparison.reproducedValue || '-'}</div>
                      <div className="rc pos">{comparison.delta || '-'}</div>
                    </div>
                  ))}
                  {!comparisons.length && metrics.map(([key, value]) => (
                    <div key={key} className="rr">
                      <div className="rc">{key}</div>
                      <div className="rc">-</div>
                      <div className="rc best">{value}</div>
                      <div className="rc pos">-</div>
                    </div>
                  ))}
                  {!comparisons.length && !metrics.length && <div className="wempty">표시할 실행 지표가 없습니다.</div>}
                </>
              )}
            </div>
          </div>

          <div className="rep-sec" style={{ marginBottom:0 }}>
            <div className="xp-sh"><Icon name="sparkles" size={12} color={T.research}/> 분석</div>
            <div className="rep-body">
              {failure?.message || dossier?.analysis || (dossier ? '저장된 비교 결과를 표시하고 있습니다.' : '실행이 완료되면 이 영역에 비교 결과와 지표가 표시됩니다.')}
            </div>
          </div>

          <div className="rep-foot"><Icon name="flask" size={11}/> {dossier?.footnote || experiment?.completedAt || experiment?.updatedAt || '아직 완료 시간이 없습니다.'}</div>
        </div>
      </div>
    </div>
  );
}

function KanCard({ executing, k, active, onExecute, onOpen }) {
  const v = k.verdict ? VERD[k.verdict] : null;
  const canExecute = k.canExecute && !executing;
  const showExecute = Boolean(k.command && k.col !== 'done');
  const statusLabel = KAN_COLS.find((col) => col.id === k.col)?.lbl || k.col;
  return (
    <article aria-label={`${k.title} · ${statusLabel}`} className={`kan-card ${active?'active':''}`} role="listitem">
      <button aria-label={`${k.title} 워크스페이스 열기`} className="kan-open" onClick={() => onOpen(k.id)} type="button">
        <div className="kan-t">{k.title}</div>
        <div className="kan-tags">{k.tags.map(t => <span key={t} className="kan-tag">{t}</span>)}</div>
      </button>
      {k.col==='design' && (
        <div className="kan-foot"><Icon name="bulb" size={12} color={T.t4}/> {k.meta}<span style={{ color:T.t4 }}>·</span>{k.origin}</div>
      )}
      {k.col==='running' && <>
        <div className="kan-prog">
          <div className="kan-progbar"><i style={{ width:`${k.prog}%` }}/></div>
          <div className="kan-progmeta"><span className="step">{k.step}</span><span className="el">{k.elapsed}</span></div>
        </div>
        <div className="kan-foot"><span className="kan-agent"><span className="pa"><span className="pd"/></span> 에이전트 실행 중</span></div>
      </>}
      {k.col==='analyze' && (
        <div className="kan-foot" style={{ justifyContent:'space-between' }}>
          <span className="kan-agent"><span className="pa"><span className="pd"/></span> 리포트 생성 중</span>
          <span className="kan-tag">run {k.runs}</span>
        </div>
      )}
      {k.col==='done' && v && (
        <div className="kan-foot">
          <span className="kan-verdict" style={{ background:`color-mix(in srgb, ${v.c} 12%, transparent)`, color:v.c }}><Icon name={v.ic} size={12}/>{v.l}</span>
          <span className="kan-metric" style={{ color:v.c }}>{k.metric}</span>
        </div>
      )}
      {showExecute && (
        <div className="kan-actions">
          <button aria-label={`${k.title} 실행`} className="kan-run" disabled={!canExecute} onClick={() => onExecute(k.id)} type="button">
            <Icon name={executing ? 'flask' : 'send'} size={12}/>{executing ? '실행 중' : '실행'}
          </button>
        </div>
      )}
    </article>
  );
}

function ProjectGrid({ experiments, onOpen, projects }) {
  const projectExperiments = (projectId) => experiments.filter((item) => item.proj === projectId);
  const projectDist = (project) => {
    const liveExperiments = projectExperiments(project.id);
    if (liveExperiments.length) {
      return KAN_COLS.map((column) => liveExperiments.filter((item) => item.col === column.id).length);
    }
    return KAN_COLS.map((column) => Number(project.columnCounts?.[column.id] || 0));
  };
  return (
    <div className="proj-wrap">
        <div className="proj-grid">
          {projects.map(p => {
            const dist = projectDist(p), exps = p.experimentCount ?? projectExperiments(p.id).length;
            return (
            <button key={p.id} className="proj-card" onClick={() => onOpen(p.id)}>
              <div className="proj-ch">
                <span className="proj-ic" style={{ background:`color-mix(in srgb, ${p.color} 13%, transparent)` }}><Icon name="flask" size={18} color={p.color}/></span>
                <span className="proj-name">{p.name}</span>
                <span className="proj-up">{p.updated}</span>
              </div>
              <div className="proj-desc">{p.desc}</div>
              <div className="proj-assets">
                <span className="proj-ac"><Icon name="book" size={13} color={T.t4}/><b>{p.docs}</b> docs</span>
                <span className="proj-ac"><Icon name="flask" size={13} color={T.t4}/><b>{exps}</b> 실험</span>
                <span className="proj-ac"><Icon name="note" size={13} color={T.t4}/><b>{p.arts}</b> 아티팩트</span>
              </div>
              <div className="proj-bar">
                {KAN_COLS.map((c,i) => dist[i]>0 ? <i key={c.id} style={{ flex:dist[i], background:c.c }}/> : null)}
              </div>
              <div className="proj-legend">
                {KAN_COLS.map((c,i) => dist[i]>0 ? <span key={c.id}><span className="d" style={{ background:c.c }}/>{c.lbl} <b>{dist[i]}</b></span> : null)}
              </div>
            </button>
          );
        })}
        {!projects.length && <div className="wempty">Lab에 연결된 프로젝트 자산이 없습니다.</div>}
      </div>
    </div>
  );
}

function ProjectPanel({ assets, projectById, proj, experiments }) {
  const [sub, setSub] = useState('docs');
  const P = projectById[proj];
  const a = assets[proj] || { arts:[], data:[], docs:[] };
  const visibleAssets = sub === 'docs' ? a[sub].slice(0, 4) : a[sub];
  const tabs = [['docs','Docs','book'],['arts','Artifacts','note'],['data','Data','grid']];
  return (
    <div className="float-panel lab-project-panel">
      <div className="proj-ph">
        <span className="pic" style={{ background:`color-mix(in srgb, ${P.color} 13%, transparent)` }}><Icon name="flask" size={16} color={P.color}/></span>
        <div><div className="pn">{P.name}</div><div className="pm">{experiments.filter((item) => item.proj === proj).length} experiments · {P.docs} docs</div></div>
      </div>
      <div className="fp-subnav">
        {tabs.map(([id,lbl,ic]) => <button key={id} className={sub===id?'on':''} onClick={() => setSub(id)}><Icon name={ic} size={12}/> {lbl}</button>)}
      </div>
      <div className="fp-body">
        {visibleAssets.map((it,i) => (
          <div key={i} className="passet">
            <span className="pai" style={{ background:`color-mix(in srgb, ${P.color} 11%, transparent)` }}><Icon name={it.ic} size={14} color={P.color}/></span>
            <div><div className="pat">{it.t}</div><div className="pam">{it.m}</div></div>
          </div>
        ))}
        {!visibleAssets.length && <div style={{ fontSize:12, color:T.t4, padding:'12px 6px', lineHeight:1.45 }}>연결된 자산이 없습니다.</div>}
      </div>
    </div>
  );
}

function LabBoard({ executingRunId, experiments, onCreateExperiment, onExecute, proj, sel, onOpen }) {
  const exps = experiments.filter((item) => item.proj === proj);
  return (
    <div className="kanban">
      {KAN_COLS.map(col => {
        const cards = exps.filter(k => k.col===col.id);
        const headerId = `lab-kanban-${col.id}`;
        return (
          <div key={col.id} className="kan-col">
            <div className="kan-colh" id={headerId}>
              <span className="ci" style={{ background:`color-mix(in srgb, ${col.c} 13%, transparent)` }}><Icon name={col.ic} size={12} color={col.c}/></span>
              <span className="cl">{col.lbl}</span>
              <span className="cc">{cards.length}</span>
              <button className="cadd" onClick={() => onCreateExperiment({ status: 'draft', title: `${col.lbl} 실험 초안` })} title="실험 추가" type="button"><Icon name="plus" size={15}/></button>
            </div>
            <div aria-labelledby={headerId} className="kan-cards" role="list">
              {cards.map(k => <KanCard key={k.id} executing={executingRunId===k.id} k={k} active={k.id===sel} onExecute={onExecute} onOpen={onOpen}/>)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LabPanel({ experiments, onCreateExperiment, projectById, proj, sel, onOpen }) {
  const [sub, setSub] = useState('exp');
  const order = ['running','analyze','design','done'];
  const P = projectById[proj];
  const projectExperiments = experiments.filter((item) => item.proj === proj);
  return (
    <div className="float-panel lab-side-panel">
      <div className="proj-ph">
        <span className="pic" style={{ background:`color-mix(in srgb, ${P.color} 13%, transparent)` }}><Icon name="flask" size={16} color={P.color}/></span>
        <div><div className="pn">{P.name}</div><div className="pm">{projectExperiments.length} experiments</div></div>
      </div>
      <div className="fp-subnav">
        <button className={sub==='exp'?'on':''} onClick={() => setSub('exp')}><Icon name="flask" size={12}/> Experiments</button>
        <button className={sub==='tpl'?'on':''} onClick={() => setSub('tpl')}><Icon name="layers" size={12}/> Templates</button>
      </div>
      {sub==='exp' && (
        <div className="fp-body">
          <button className="ag-newt" onClick={() => onCreateExperiment()} type="button"><Icon name="plus" size={13}/> 새 실험</button>
          {order.map(cid => {
            const col = KAN_COLS.find(c => c.id===cid);
            const list = projectExperiments.filter(k => k.col===cid);
            if (!list.length) return null;
            return (
              <div key={cid}>
                <div className="ag-grp">{col.lbl}</div>
                {list.map(k => (
                  <button key={k.id} className={`lab-exp ${k.id===sel?'active':''}`} onClick={() => onOpen(k.id)}>
                    <div className="et">{k.title}</div>
                    <div className="em">
                      <span className="est" style={{ color:col.c }}><span className="d" style={{ background:col.c }}/>{col.lbl}</span>
                      <span className="ept">{k.col==='done' ? k.metric : k.col==='running' ? k.step : k.col==='analyze' ? `run ${k.runs}` : k.meta}</span>
                    </div>
                    {k.col==='running' && <div className="ebar"><i style={{ width:`${k.prog}%` }}/></div>}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
      {sub==='tpl' && (
        <div className="fp-body" style={{ paddingTop:8 }}>
          <div className="ag-grp">실험 템플릿</div>
          {XP_TEMPLATES.map((t,i) => (
            <div key={i} className="lab-tpl">
              <span className="ti"><Icon name={t.ic} size={14}/></span>
              <div><div className="tt">{t.tt}</div><div className="td">{t.td}</div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LabTab({ projectId = 'rag-reranker' }) {
  const [view, setView] = useState('projects');   // projects | board | workspace
  const [proj, setProj] = useState(projectId);
  const [sel, setSel] = useState('');
  const [executeState, setExecuteState] = useState({ message: '', runId: '', status: 'idle' });
  const [graphRefresh, setGraphRefresh] = useState(0);
  const [projectsRefresh, setProjectsRefresh] = useState(0);
  const [splitH, setSplitH] = useState(57);
  const drag = useRef(null);
  const graphProjectId = proj || projectId;
  const loadProjects = useCallback(() => api('api/projects'), []);
  const projectsState = useServerResource(['lab-projects', projectsRefresh], loadProjects);
  const loadGraph = useCallback(() => api(`api/projects/${encodeURIComponent(graphProjectId)}/graph`), [graphProjectId]);
  const graphState = useServerResource(['lab-project-graph', graphProjectId, graphRefresh], loadGraph);
  const labState = useMemo(() => graphToLabState(graphState.data || {}), [graphState.data]);
  const projectCards = useMemo(() => projectSummariesToLabCards(projectsState.data?.projects || [], labState), [projectsState.data, labState]);
  const projectCardById = useMemo(() => Object.fromEntries(projectCards.map((project) => [project.id, project])), [projectCards]);
  const projectById = useMemo(() => ({ ...projectCardById, ...labState.projectById }), [labState.projectById, projectCardById]);
  const firstProjectId = projectCards[0]?.id || labState.projects[0]?.id || projectId;
  const activeProjectId = proj || firstProjectId;
  const P = projectById[activeProjectId] || labState.projects[0] || { id:'', name:'Lab', color:T.research, docs:0, arts:0 };
  const projectExperiments = labState.experiments.filter((item) => item.proj === activeProjectId);
  const activeExperiment = labState.experiments.find((item) => item.id === sel) || projectExperiments[0] || null;
  const activeDossier = activeExperiment?.assetKind === 'resultDossier'
    ? labState.dossiers.find((dossier) => dossier.id === activeExperiment.id) || null
    : labState.dossiers.find((dossier) => dossier.experimentRunIds?.includes(activeExperiment?.id)) || null;
  const activeRun = activeExperiment?.assetKind === 'resultDossier'
    ? labState.experiments.find((item) => item.assetKind === 'experimentRun' && activeDossier?.experimentRunIds?.includes(item.id)) || activeExperiment
    : activeExperiment;
  const activeExperimentTitle = activeExperiment?.title || '실험을 선택하세요';
  const onDown = (e) => { drag.current = { x:e.clientX, s:splitH }; };
  useEffect(() => {
    const mv = (e) => { if (!drag.current) return; const total = window.innerWidth - 56 - 288 - 5;
      setSplitH(Math.max(38, Math.min(72, drag.current.s + ((e.clientX - drag.current.x)/total)*100))); };
    const up = () => drag.current = null;
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
  }, []);
  const openProject = (id) => {
    const projectDefault = labState.experiments.find((item) => item.proj === id && item.id === 'k6')
      || labState.experiments.find((item) => item.proj === id && item.col === 'done')
      || null;
    setProj(id);
    setSel(projectDefault?.id || '');
    setView('board');
  };
  const openExp = (id) => { setSel(id); setView('workspace'); };
  const createDraftExperiment = async (details = {}) => {
    setExecuteState({ message: '새 실험을 만드는 중', runId: '', status: 'running' });
    try {
      const payload = await api(`api/projects/${encodeURIComponent(activeProjectId)}/experiment-runs`, {
        body: {
          kind: 'manual',
          notes: activeExperiment?.title ? `${activeExperiment.title}에서 시작한 후속 실험` : '',
          status: details.status || 'draft',
          tags: ['manual'],
          title: details.title || '새 실험 초안',
        },
        method: 'POST',
      });
      const createdId = payload?.asset?.id || '';
      if (createdId) {
        setSel(createdId);
      }
      setView('workspace');
      setGraphRefresh((value) => value + 1);
      setExecuteState({ message: '새 실험 초안을 만들었습니다.', runId: createdId, status: 'done' });
    } catch (error) {
      setExecuteState({ message: error instanceof Error ? error.message : '새 실험을 만들지 못했습니다.', runId: '', status: 'error' });
    }
  };
  const createProject = async () => {
    setExecuteState({ message: '새 프로젝트를 만드는 중', runId: '', status: 'running' });
    try {
      const payload = await api('api/projects', {
        body: {
          color: T.research,
          focus: '새 Lab 프로젝트',
          keywords: ['lab'],
          name: `Lab 프로젝트 ${projectCards.length + 1}`,
        },
        method: 'POST',
      });
      const createdId = payload?.project?.id || '';
      if (createdId) {
        setProj(createdId);
        setSel('');
      }
      setProjectsRefresh((value) => value + 1);
      setGraphRefresh((value) => value + 1);
      setView('board');
      setExecuteState({ message: '새 프로젝트를 만들었습니다.', runId: createdId, status: 'done' });
    } catch (error) {
      setExecuteState({ message: error instanceof Error ? error.message : '새 프로젝트를 만들지 못했습니다.', runId: '', status: 'error' });
    }
  };
  const createWorkspaceItem = () => {
    if (view === 'projects') {
      createProject();
      return;
    }
    createDraftExperiment();
  };
  const shareWorkspace = async () => {
    const title = activeExperiment?.title || P.name || 'ARES Lab';
    const text = `${title} · ${activeDossier?.verdictText || activeDossier?.deltaSummary || activeExperiment?.metric || 'Lab workspace'}`;
    if (navigator.share) {
      try {
        await navigator.share({ text, title });
        setExecuteState({ message: '공유했습니다.', runId: activeExperiment?.id || '', status: 'done' });
      } catch {
        setExecuteState({ message: '공유를 취소했습니다.', runId: activeExperiment?.id || '', status: 'idle' });
      }
      return;
    }
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        setExecuteState({ message: '공유 내용을 복사했습니다.', runId: activeExperiment?.id || '', status: 'done' });
      } catch {
        setExecuteState({ message: '공유 내용을 복사하지 못했습니다.', runId: activeExperiment?.id || '', status: 'error' });
      }
      return;
    }
    setExecuteState({ message: '이 브라우저에서는 공유를 사용할 수 없습니다.', runId: activeExperiment?.id || '', status: 'error' });
  };
  const openMoreMenu = () => {
    setExecuteState({ message: `${projectExperiments.length}개 실험 · ${P.arts}개 아티팩트`, runId: activeExperiment?.id || '', status: 'idle' });
  };
  const executeExperiment = async (id) => {
    const experiment = labState.experiments.find((item) => item.id === id);
    if (!experiment?.command) {
      setExecuteState({ message: '실행 명령이 없습니다.', runId: id, status: 'error' });
      return;
    }

    setExecuteState({ message: '실행 중', runId: id, status: 'running' });
    try {
        const payload = await api(`api/projects/${encodeURIComponent(activeProjectId)}/experiment-runs/${encodeURIComponent(id)}/execute`, {
        body: {
          command: experiment.command,
          reason: 'Lab board execution requested.',
        },
        method: 'POST',
      });
      const runnerStatus = payload?.runnerResult?.status || '';
      const failureType = payload?.runnerResult?.failure?.type || '';
      const message = runnerStatus === 'blocked' && failureType === 'approval_required'
        ? '승인이 필요합니다.'
        : runnerStatus === 'done'
          ? '실행 완료'
          : '실행 결과를 확인해 주세요.';
      setExecuteState({ message, runId: id, status: runnerStatus === 'done' ? 'done' : runnerStatus === 'blocked' ? 'error' : 'idle' });
      setGraphRefresh((value) => value + 1);
    } catch (error) {
      setExecuteState({ message: error instanceof Error ? error.message : '실행하지 못했습니다.', runId: id, status: 'error' });
    }
  };
  useEffect(() => {
    if (!proj && firstProjectId) {
      setProj(firstProjectId);
    }
  }, [firstProjectId, proj]);
  useEffect(() => {
    if (!sel && projectExperiments[0]) {
      const preferred = projectExperiments.find((item) => item.col === 'done' && (item.reportSummary || item.versionLabel || item.runSteps?.length))
        || projectExperiments.find((item) => item.col === 'done')
        || projectExperiments[0];
      setSel(preferred.id);
    }
  }, [projectExperiments, sel]);
  return (
    <>
      <div className="metabar">
        <div className="crumb-group"><Icon name="flask" size={13} color={T.research}/><span style={{ color:T.research, fontWeight:550 }}>Lab</span></div>
        {view!=='projects' && (
          <button className="btn-ghost lab-back" style={{ marginRight:2 }} onClick={() => setView(view==='workspace'?'board':'projects')}>
            <Icon name="chevL" size={14}/> {view==='workspace' ? P.name : '프로젝트'}
          </button>
        )}
        <div style={{ display:'flex', flexDirection:'column', minWidth:0 }}>
          {view==='projects' && <>
            <div className="title">프로젝트</div>
                <div className="byline"><span>{projectCards.length}개 프로젝트</span><span style={{ color:T.t4 }}>·</span><span>{projectsState.loading || graphState.loading ? '동기화 중' : '가설 · 실험 · 리포트 워크스페이스'}</span></div>
          </>}
          {view==='board' && <>
            <div className="title">{P.name}</div>
            <div className="byline"><span>{P.docs} docs</span><span style={{ color:T.t4 }}>·</span><span>{projectExperiments.length} experiments</span><span style={{ color:T.t4 }}>·</span><span>{P.arts} artifacts</span></div>
          </>}
          {view==='workspace' && <>
            <div className="title">{activeExperimentTitle}</div>
            <div className="byline">
              <span style={{ color:P.color }}>{P.name}</span>
              <span style={{ color:T.t4 }}>·</span>
              {activeDossier?.verdict ? (
                <span style={{ color: VERD[activeDossier.verdict]?.c || T.t2, display:'inline-flex', alignItems:'center', gap:4 }}>
                  <Icon name={VERD[activeDossier.verdict]?.ic || 'check'} size={12}/>
                  보고 완료 · {VERD[activeDossier.verdict]?.l || activeDossier.verdict}
                </span>
              ) : (
                <span>{activeExperiment ? activeExperiment.col : 'no experiment selected'}</span>
              )}
            </div>
          </>}
        </div>
        <div className="meta-actions">
          {view!=='projects' && (
            <div className="seg" role="group" aria-label="Lab 보기">
              <button aria-pressed={view==='board'} className={view==='board'?'on':''} onClick={() => setView('board')} type="button"><Icon name="columns" size={13}/> 보드</button>
              <button aria-pressed={view==='workspace'} className={view==='workspace'?'on':''} onClick={() => setView('workspace')} type="button"><Icon name="flask" size={13}/> 워크스페이스</button>
            </div>
          )}
          {executeState.message && view!=='projects' && (
            <span style={{ color: executeState.status === 'error' ? T.insight : T.t3, fontSize:12 }}>{executeState.message}</span>
          )}
          <button className="btn-s" onClick={createWorkspaceItem} type="button"><Icon name="plus" size={13}/> {view==='projects' ? '새 프로젝트' : '새 실험'}</button>
          <div style={{ width:1, height:20, background:T.b1, margin:'0 4px' }}/>
          <button aria-label="공유" className="btn-ghost" onClick={shareWorkspace} type="button"><Icon name="share" size={14}/></button>
          <button aria-label="더보기" className="btn-ghost" onClick={openMoreMenu} type="button"><Icon name="moreH" size={14}/></button>
        </div>
      </div>
          {view==='projects' && <div className="main"><ProjectGrid experiments={labState.experiments} onOpen={openProject} projects={projectCards}/></div>}
          {view==='board' && <div className="main"><ProjectPanel assets={labState.assets} experiments={labState.experiments} projectById={projectById} proj={activeProjectId}/><LabBoard executingRunId={executeState.status === 'running' ? executeState.runId : ''} experiments={labState.experiments} onCreateExperiment={createDraftExperiment} onExecute={executeExperiment} proj={activeProjectId} sel={sel} onOpen={openExp}/></div>}
      {view==='workspace' && activeExperiment && (
        <div className="main">
              <LabPanel experiments={labState.experiments} onCreateExperiment={createDraftExperiment} projectById={projectById} proj={activeProjectId} sel={sel} onOpen={setSel}/>
          <div className="split">
            <RunnerConsolePane basis={`0 0 calc(${splitH}% - 2.5px)`} dossier={activeDossier} experiment={activeRun}/>
            <div className="resize h" onMouseDown={onDown}/>
            <ReportPane basis={`0 0 calc(${100-splitH}% - 2.5px)`} dossier={activeDossier} experiment={activeRun}/>
          </div>
        </div>
      )}
      {view==='workspace' && !activeExperiment && <div className="main"><div className="wempty">실험을 선택하세요.</div></div>}
    </>
  );
}

export { LabTab };
