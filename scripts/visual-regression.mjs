import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const projectId = 'rag-reranker';
const port = Number(process.env.ARES_VISUAL_PORT || 3130);
const baseURL = process.env.ARES_VISUAL_BASE_URL || `http://127.0.0.1:${port}`;
const outputDir = path.join(repoRoot, 'test-results', 'visual-regression');
const maxDiffRatio = Number(process.env.ARES_VISUAL_MAX_DIFF_RATIO || '0.001');
let navigationNonce = 0;

function appRoute(hash) {
  navigationNonce += 1;
  return `${baseURL}/?visual=${process.pid}-${navigationNonce}${hash}`;
}

const DESIGN_LIBRARY = [
  { id: 'p1', title: 'Reducing Reranker Costs in RAG via Adaptive Skipping', authors: ['Kim et al.'], venue: 'ACL 2024', year: 2024, progress: 62, tags: ['reranking', 'efficiency'], coll: 'c-rerank', flag: true, notes: 3, display: { labMeta: 'Kim · ACL’24', labOrder: 1, labTitle: 'Reducing Reranker Costs (Adaptive Skipping)' } },
  { id: 'p2', title: 'Efficient RAG with Lightweight Rerankers', authors: ['Chen et al.'], venue: 'EMNLP 2024', year: 2024, progress: 0, tags: ['reranking'], coll: 'c-rerank', notes: 0, display: { labMeta: 'Chen · EMNLP’24', labOrder: 2, labTitle: 'Lightweight Rerankers' } },
  { id: 'p3', title: 'FlashRAG: A Modular Framework for RAG Research', authors: ['Jin et al.'], venue: 'arXiv 2024', year: 2024, progress: 0, tags: ['framework'], coll: 'c-rerank', notes: 0, display: { labMeta: 'Jin · arXiv', labOrder: 4, labTitle: 'FlashRAG: Modular Framework' } },
  { id: 'p4', title: 'Is Reranking Really Necessary for RAG?', authors: ['Park et al.'], venue: 'ACL 2024', year: 2024, progress: 100, tags: ['reranking', 'analysis'], coll: 'c-rerank', flag: true, notes: 5, display: { labMeta: 'Park · ACL’24', labOrder: 3, labTitle: 'Is Reranking Really Necessary?' } },
  { id: 'p5', title: 'RAGLAB: Research-Oriented Unified Framework', authors: ['Zhang et al.'], venue: 'arXiv 2024', year: 2024, progress: 18, tags: ['framework'], coll: 'c-rerank', notes: 1, display: { labVisible: false } },
  { id: 'p6', title: 'BEIR: A Heterogeneous Benchmark for Information Retrieval', authors: ['Thakur et al.'], venue: 'NeurIPS 2021', year: 2021, progress: 100, tags: ['benchmark', 'evaluation'], coll: 'c-eval', notes: 4, display: { labVisible: false } },
  { id: 'p7', title: 'Dense Passage Retrieval for Open-Domain Question Answering', authors: ['Karpukhin et al.'], venue: 'EMNLP 2020', year: 2020, progress: 45, tags: ['retrieval', 'DPR'], coll: 'c-retr', notes: 2, display: { labVisible: false } },
  { id: 'p8', title: 'ColBERT: Efficient Passage Search via Late Interaction', authors: ['Khattab et al.'], venue: 'SIGIR 2020', year: 2020, progress: 0, tags: ['retrieval'], coll: 'c-retr', notes: 0, display: { labVisible: false } },
  { id: 'p9', title: 'Out-of-Domain Generalization in Dense Retrieval', authors: ['Lee et al.'], venue: 'ACL 2023', year: 2023, progress: 30, tags: ['retrieval', 'generalization'], coll: 'c-retr', flag: true, notes: 1, display: { labVisible: false } },
];
const DESIGN_LIBRARY_AGE_DAYS = [2, 2, 5, 7, 7, 14, 14, 21, 21];
const DESIGN_LAB_DOC_DISPLAY = {
  p1: { labMeta: "Kim · ACL '24", labOrder: 1, labTitle: 'Reducing Reranker Costs (Adaptive Skipping)' },
  p2: { labMeta: "Chen · EMNLP '24", labOrder: 2, labTitle: 'Lightweight Rerankers' },
  p4: { labMeta: "Park · ACL '24", labOrder: 3, labTitle: 'Is Reranking Really Necessary?' },
  p3: { labMeta: 'Jin · arXiv', labOrder: 4, labTitle: 'FlashRAG: Modular Framework' },
};
const DESIGN_READING_SESSION_ID = 'visual-reading-p1';
const DESIGN_READING_SECTIONS = [
  { id: 'abstract', label: 'Abstract', pageStart: 1, pageEnd: 2, status: 'done' },
  { id: 'intro', label: '1. Introduction', pageStart: 3, pageEnd: 4, status: 'done' },
  { id: 'related', label: '2. Related Work', pageStart: 5, pageEnd: 6, status: 'done' },
  { active: true, id: 'method', label: '3. Method', pageStart: 7, pageEnd: 9, selectionWordCount: 84, status: 'running' },
  { id: 'experiments', label: '4. Experiments', pageStart: 10, pageEnd: 14, status: 'todo' },
];
const DESIGN_READING_NOTES = [
  {
    body: 'cascade confidence scoring으로 retriever 신뢰도가 이하일 때만 reranker 호출',
    id: 'visual-note-method',
    kind: 'method',
    page: 4,
    quote: 'use a confidence score to selectively bypass the reranker',
    sectionId: 'method',
  },
  {
    body: 'BEIR 18 tasks 평균 nDCG@10 = 44.8, full-reranker 대비 -0.4',
    id: 'visual-note-result',
    kind: 'result',
    page: 7,
    quote: '44.8 nDCG@10 while reducing reranker calls by 58%',
    sectionId: 'method',
  },
  {
    body: 'threshold τ는 데이터셋별 수동 튜닝 필요',
    id: 'visual-note-limit',
    kind: 'limit',
    page: 9,
    quote: 'threshold sensitivity varies by dataset',
    sectionId: 'experiments',
  },
];
const DESIGN_READING_CHAT_MESSAGES = [
  {
    id: 'visual-chat-user-1',
    role: 'user',
    text: 'τ 값이 데이터셋마다 다르면 일반화 어렵지 않아?',
  },
  {
    citations: [{ label: '§5.2 Sensitivity', page: 7 }],
    id: 'visual-chat-assistant-1',
    role: 'assistant',
    text: '좋은 지적입니다. §5.2의 민감도 분석을 보면 τ=0.6이 BEIR 평균 sweet spot이지만, FiQA·NFCorpus처럼 retrieval이 약한 도메인에서는 τ를 0.4-0.5로 낮춰야 nDCG 유지됩니다.',
  },
  {
    id: 'visual-chat-user-2',
    role: 'user',
    text: 'Baseline 대비 reranker 호출이 얼마나 줄었어?',
  },
  {
    citations: [{ label: 'Table 3', page: 8 }, { label: '§5.1', page: 8 }],
    id: 'visual-chat-assistant-2',
    role: 'assistant',
    text: 'Table 3 기준 평균 58% skip -> 전체 latency 40% 감소. FiQA는 35%, NQ는 72%까지 skip 가능.',
  },
];
const DESIGN_READING_HIGHLIGHTS = [
  {
    id: 'visual-highlight-result',
    page: 1,
    quote: '44.8 nDCG@10 on average while reducing reranker calls by 58%',
    sectionId: 'method',
    sourceBounds: {
      height: 0.025,
      page: 1,
      rects: [
        { height: 0.025, width: 0.42, x: 0.50, y: 0.235 },
        { height: 0.025, width: 0.11, x: 0.12, y: 0.258 },
      ],
      unit: 'page-ratio',
      width: 0.42,
      x: 0.50,
      y: 0.235,
    },
    text: '44.8 nDCG@10 on average while reducing reranker calls by 58%',
    type: 'result',
  },
  {
    id: 'visual-highlight-claim',
    page: 1,
    quote: "the reranker's contribution is marginal",
    sectionId: 'intro',
    sourceBounds: { height: 0.025, page: 1, unit: 'page-ratio', width: 0.70, x: 0.12, y: 0.395 },
    text: "the reranker's contribution is marginal",
    type: 'highlight',
  },
];
const DESIGN_READING_ASSETS = [
  { caption: 'Adaptive skipping overview', id: 'visual-asset-f1', kind: 'figure', number: 1, page: 4, sourceText: 'cascade confidence score gates reranking' },
  { caption: 'Retriever confidence distribution', id: 'visual-asset-f2', kind: 'figure', number: 2, page: 5, sourceText: 'confidence histogram by domain' },
  { caption: 'Skip ratio by dataset', id: 'visual-asset-f3', kind: 'figure', number: 3, page: 8, sourceText: 'skip ratio vs latency curve' },
  { caption: 'Main BEIR result table', id: 'visual-asset-t1', kind: 'table', number: 1, page: 7, sourceText: 'nDCG@10 comparison' },
  { caption: 'Sensitivity around tau', id: 'visual-asset-t2', kind: 'table', number: 2, page: 8, sourceText: 'tau sweep by dataset' },
  { caption: 'Latency breakdown', id: 'visual-asset-t3', kind: 'table', number: 3, page: 8, sourceText: 'reranker skip latency' },
];

const DESIGN_LAB_CARDS = [
  { id: 'k1', col: 'design', title: 'margin vs confidence gating 비교', tags: ['BEIR-13', 'nDCG@10'], meta: '설계 60%', origin: 'Wiki · Gating' },
  { id: 'k2', col: 'design', title: 'reranker depth k 민감도 분석', tags: ['FiQA', 'Latency'], meta: '초안', origin: 'Note · §5.1' },
  { id: 'k3', col: 'running', title: 'c(q) 도메인별 재캘리브레이션', tags: ['BEIR-13', 'NFCorpus'], metrics: {}, progressLabel: '3/6', status: 'running', step: '3/6 · 회귀 적합', elapsed: '1m 38s' },
  { id: 'k4', col: 'running', title: 'skip-ratio ↔ latency 곡선', tags: ['NQ', 'HotpotQA'], metrics: {}, progressLabel: '5/6', status: 'running', step: '5/6 · latency 측정', elapsed: '3m 02s' },
  { id: 'k5', col: 'analyze', title: '경량 reranker 증류 (MiniLM)', tags: ['BEIR-13', 'distill'], metrics: {}, progressLabel: '6/6', status: 'error' },
  { id: 'k6', col: 'done', title: 'auto-τ regression', tags: ['BEIR held-out'], metric: '+1.3 nDCG', value: '+1.3 nDCG', verdict: 'supported' },
  { id: 'k7', col: 'done', title: 'FiQA reranker skip ablation', tags: ['FiQA'], metric: '−0.2 nDCG', value: '−0.2 nDCG', verdict: 'mixed' },
  { id: 'k8', col: 'done', title: 'BM25 vs DPR gating 일치도', tags: ['BEIR-13'], metric: 'gate 불일치', value: 'gate 불일치', verdict: 'refuted' },
];

const DESIGN_LAB_RUN_STEPS = [
  { st: '도메인별 τ* 그리드서치', so: '13 domains · τ* 0.35–0.70', status: 'done' },
  { st: '도메인 특징 추출', so: 'recall@100, |q|, c̄(q) → 13×3 행렬', status: 'done' },
  { st: '회귀 모델 적합 τ̂ = f(x)', so: 'ridge α=1.0 · R² = 0.71', status: 'done' },
  { st: 'held-out 5개 도메인 평가', so: 'nDCG(τ̂) vs 고정 0.6 vs oracle', status: 'done' },
  { st: '리포트 생성', so: '차트 · 결과표 · 판정 작성', status: 'done' },
];

const DESIGN_LAB_DESIGN_ROWS = [
  { icon: 'note', label: '데이터셋', value: 'BEIR-13 + FiQA + NFCorpus' },
  { icon: 'layers', label: '베이스라인', value: '고정 τ=0.6 · oracle τ*' },
  { icon: 'grid', label: '지표', value: 'nDCG@10 · Recall@100' },
  { icon: 'flask', label: '독립변수', value: 'τ̂ = ridge(recall, |q|, c̄(q))' },
];

const DESIGN_LAB_DOMAIN_RESULTS = [
  { domain: 'FiQA', fixed: 38.1, ours: 40.3, oracle: 40.8 },
  { domain: 'NFCorpus', fixed: 32.4, ours: 33.9, oracle: 34.2 },
  { domain: 'SciFact', fixed: 64.2, ours: 64.5, oracle: 65.0 },
  { domain: 'TREC-COVID', fixed: 51.7, ours: 53.0, oracle: 53.4 },
  { domain: 'Touché', fixed: 24.8, ours: 26.1, oracle: 26.5 },
];

const DESIGN_LAB_PROJECTS = [
  {
    color: '#9b63d9',
    defaultQuery: 'reranker efficiency adaptive skipping',
    focus: 'RAG에서 reranker 호출 비용을 줄이는 게이팅·스킵 전략',
    id: projectId,
    keywords: ['reranker', 'adaptive skipping', 'BEIR', 'confidence gating'],
    name: 'Reranker 효율화',
    display: { labDocs: 12 },
  },
  {
    color: '#5e6ad2',
    defaultQuery: 'retrieval generalization',
    focus: '도메인 이동에서 retrieval 품질 저하와 보정 방법',
    id: 'retrieval-generalization',
    keywords: ['retrieval', 'generalization', 'domain shift'],
    name: 'Retrieval 일반화',
  },
  {
    color: '#5e9c6f',
    defaultQuery: 'evaluation protocol reproducibility',
    focus: 'BEIR·자체 split 점수 차이와 재현 가능한 평가 설계',
    id: 'evaluation-protocol',
    keywords: ['BEIR', 'evaluation', 'reproducibility'],
    name: '평가 프로토콜',
  },
  {
    color: '#c7772f',
    defaultQuery: 'lightweight cross encoder distillation',
    focus: 'cross-encoder를 경량 모델로 증류해 latency 절감',
    id: 'lightweight-model-distillation',
    keywords: ['cross-encoder', 'distillation', 'latency'],
    name: '경량 모델 증류',
  },
];
const DESIGN_LAB_PROJECT_UPDATED_OFFSETS = [0, 2 * 3_600_000, 86_400_000, 3 * 86_400_000];
const DESIGN_LAB_PROJECT_FIXTURES = {
  [projectId]: {
    linkedDossiers: [
      { id: 'k3-linked-dossier', runId: 'k3', title: 'c(q) recalibration run log' },
      { id: 'k4-linked-dossier', runId: 'k4', title: 'Latency curve run log' },
    ],
    readingPackets: 3,
  },
  'retrieval-generalization': {
    artifacts: 3,
    docs: 9,
    linkedArtifacts: 1,
    plans: 1,
    runs: [{ status: 'running' }],
  },
  'evaluation-protocol': {
    artifacts: 2,
    docs: 7,
    plans: 0,
    runs: [{ status: 'analyzing' }],
  },
  'lightweight-model-distillation': {
    artifacts: 1,
    docs: 5,
    plans: 0,
    runs: [{ status: 'running' }],
  },
};

const DESIGN_WIKI = [
  { id: 'ccs', title: 'Cascade confidence scoring', type: 'concept', tags: ['retrieval', 'efficiency', 'cascade'], folderId: 'cascade-skipping', links: ['adsk', 'rsk', 'tau', 'cq', 'msr', 'tausens', 'eqc'], paperCount: 6 },
  { id: 'rsk', title: 'Reranker skipping', type: 'concept', tags: ['retrieval'], folderId: 'cascade-skipping', links: ['tau', 'msr', 'flash', 'absorb'], paperCount: 26 },
  { id: 'tau', title: 'Threshold τ gating', type: 'concept', tags: ['retrieval'], folderId: 'cascade-skipping', links: ['gs', 'tausens', 'cq'], paperCount: 19 },
  { id: 'msr', title: 'Multi-stage retrieval', type: 'concept', tags: ['retrieval'], folderId: 'retrieval-efficiency', links: ['flash', 'raglab', 'beir', 'eqc'], paperCount: 38 },
  { id: 'eqc', title: 'Evidence contract', type: 'concept', tags: ['retrieval'], folderId: 'retrieval-efficiency', links: ['absorb'], paperCount: 14 },
  { id: 'adsk', title: 'Adaptive Skipping', type: 'system', tags: ['systems'], folderId: 'systems', links: ['beir', 'ndcg', 'tausens'], paperCount: 5 },
  { id: 'flash', title: 'FlashRAG', type: 'system', tags: ['systems'], links: ['beir', 'raglab'], paperCount: 5 },
  { id: 'raglab', title: 'RAGLAB', type: 'system', tags: ['systems'], links: [], paperCount: 5 },
  { id: 'beir', title: 'BEIR', type: 'bench', tags: ['evaluation'], folderId: 'benchmarks', links: ['ndcg', 'fiqa'], paperCount: 64 },
  { id: 'ndcg', title: 'nDCG@10', type: 'bench', tags: ['evaluation'], folderId: 'benchmarks', links: [], paperCount: 52 },
  { id: 'fiqa', title: 'FiQA', type: 'bench', tags: ['evaluation'], folderId: 'benchmarks', links: ['tausens'], paperCount: 24 },
  { id: 'cq', title: 'Confidence score c(q)', type: 'method', tags: ['retrieval'], folderId: 'methods', links: ['gs'], paperCount: 14 },
  { id: 'gs', title: 'Grid-search τ', type: 'method', tags: ['evaluation'], folderId: 'methods', links: [], paperCount: 9 },
  { id: 'tausens', title: 'τ domain sensitivity', type: 'failure', tags: ['failure'], folderId: 'failure-modes', links: [], paperCount: 14 },
  { id: 'absorb', title: 'Gain absorption', type: 'failure', tags: ['failure'], folderId: 'failure-modes', links: ['cq'], paperCount: 17 },
];

const DESIGN_WIKI_FOLDERS = [
  { id: 'retrieval-efficiency', name: 'Retrieval efficiency' },
  { id: 'cascade-skipping', name: 'Cascade & skipping', parentId: 'retrieval-efficiency' },
  { id: 'systems', name: 'Systems' },
  { id: 'evaluation', name: 'Evaluation' },
  { id: 'benchmarks', name: 'Benchmarks', parentId: 'evaluation' },
  { id: 'methods', name: 'Methods', parentId: 'evaluation' },
  { id: 'failure-modes', name: 'Failure modes' },
];

function designWikiBody(page) {
  if (page.id !== 'ccs') {
    return [
      { type: 'heading', text: page.title },
      { type: 'paragraph', text: `${page.title} visual fixture.` },
    ];
  }

  return [
    {
      type: 'paragraph',
      text:
        "A cascade confidence score gates whether the reranker runs at all. The retriever's own margin, c(q) = cos(q, d0) - cos(q, d1), estimates how decided the top result already is.",
    },
    {
      type: 'callout',
      text: 'Why it matters. On BEIR, skipping the reranker on confident queries cut reranker calls by 58% and end-to-end latency by 40%, at only a -0.4 nDCG@10 cost.',
    },
    { type: 'heading', text: 'How it works' },
    {
      type: 'paragraph',
      text:
        'The score reuses similarities the retriever already produced, so it adds negligible overhead. Once it clears a tuned threshold, the reranker is bypassed:',
    },
    { type: 'equation', text: 'skip_reranker := c(q) > τ' },
    { type: 'paragraph', text: 'τ is fixed on a validation set via grid search.' },
    { linkedPageId: 'adsk', type: 'paragraph', text: 'Connects Adaptive Skipping to the wider multi-stage retrieval pattern.' },
  ];
}

const DESIGN_AGENT_CITATIONS = [
  { id: 'e1', kind: 'paper', src: 'Adaptive Skipping', loc: '§5.2 · p.7', tag: 'Sensitivity', quote: 'τ=0.6 is the BEIR-average sweet spot, yet FiQA and NFCorpus need τ∈[0.4, 0.5] to hold nDCG@10.' },
  { id: 'e2', kind: 'paper', src: 'Lightweight Rerankers', loc: '§4 · p.4', tag: 'Mechanism', quote: 'Weak first-stage retrieval surfaces more low-confidence queries, which shifts the optimal gate downward.' },
  { id: 'e3', kind: 'wiki', src: 'τ domain sensitivity', loc: 'Wiki · Failure', tag: 'Failure mode', quote: 'A τ tuned on one corpus does not transfer; the skip gain is absorbed once recall already saturates.' },
  { id: 'e4', kind: 'wiki', src: 'Confidence c(q)', loc: 'Wiki · Method', tag: 'Calibration', quote: 'c(q) is calibrated on in-domain dev sets, so out-of-domain queries are read as over-confident.' },
  { id: 'e5', kind: 'note', src: '내 노트 — Limit', loc: 'Reading · p.9', tag: 'My note', quote: 'threshold τ는 데이터셋별 수동 튜닝 필요 → auto-τ regression으로 회귀하는 후속 아이디어.' },
];

const DESIGN_AGENT_THREADS = [
  { id: 't1', title: 'τ 도메인 민감도는 결국 어디서 오나?', display: { activity: '6 · now', group: '오늘', order: 1, scope: '4 papers · Wiki · Note', when: 'now' } },
  { id: 't2', title: 'Reranker skip와 nDCG 손실 trade-off 정량화', display: { activity: '4 · 2h', group: '오늘', order: 2, scope: '3 papers', when: '2h' } },
  { id: 't3', title: 'Cascade confidence c(q) 재현 설계 검토', display: { activity: '9 · 어제', group: '이전', order: 3, scope: '2 papers · Lab', when: '어제' } },
  { id: 't4', title: 'BEIR vs 자체 split 점수 차이 원인 추적', display: { activity: '5 · 어제', group: '이전', order: 4, scope: '1 paper · Note', when: '어제' } },
];

const DESIGN_AGENT_ARTIFACTS = [
  { collection: 'insightNotes', dest: 'Reading · Notes', id: 's1', kind: 'note', title: 'τ는 retrieval 품질의 대리변수 — 고정 τ 대신 도메인별 재캘리브레이션', when: '방금' },
  { collection: 'reproductionPlans', dest: 'Lab · Experiment', id: 's2', kind: 'flask', title: 'auto-τ regression lane — c(q)를 도메인 난이도로 회귀', when: '방금' },
  { collection: 'insightCards', dest: 'Idea', id: 's3', kind: 'bulb', title: '도메인 난이도 → 최적 τ 매핑 가설', when: '2h' },
];

const cases = [
  {
    id: 'reading-library',
    ref: 'ref-reading-library.png',
    open: async (page) => {
      await page.goto(appRoute(`#/projects/${projectId}/reading`));
      await page.locator('.lib-row, .wempty').first().waitFor({ state: 'visible' });
    },
  },
  {
    id: 'reading-reader',
    ref: 'ref-reading-reader.png',
    ignoreSelectors: ['.reading-pdf-page-surface'],
    unignoreSelectors: ['.dock-wrap'],
    maxDiffRatio: 0.025,
    open: async (page, state) => {
      await page.goto(appRoute(`#/projects/${projectId}/reading/sessions/${encodeURIComponent(state.sessionId)}/pdf`));
      await page.locator('[data-reading-pdf-host="true"]').waitFor({ state: 'visible' });
      await page.locator('.reading-pdf-canvas, .pdf-page, .pdf-empty, .pdf-message').first().waitFor({ state: 'visible' });
    },
  },
  {
    id: 'lab-projects',
    ref: 'ref-lab-projects.png',
    open: async (page) => {
      await page.goto(appRoute(`#/projects/${projectId}/research`));
      await page.locator('.proj-card, .wempty').first().waitFor({ state: 'visible' });
    },
  },
  {
    id: 'lab-board',
    ref: 'ref-lab-board.png',
    open: async (page) => {
      await page.goto(appRoute(`#/projects/${projectId}/research`));
      await page.locator('.proj-card').first().click();
      await page.locator('.kanban').waitFor({ state: 'visible' });
    },
  },
  {
    id: 'lab-workspace',
    ref: 'ref-lab-workspace.png',
    open: async (page, state) => {
      await page.goto(appRoute(`#/projects/${projectId}/research`));
      await page.locator('.proj-card').first().click();
      const card = page.getByRole('listitem', { name: `${state.labTitle} · 완료` });
      await card.waitFor({ state: 'visible' });
      await card.getByRole('button', { name: /워크스페이스 열기/ }).click();
      await page.locator('.xp-chart, .run-pane').first().waitFor({ state: 'visible' });
    },
  },
  {
    id: 'wiki',
    ref: 'ref-wiki.png',
    ignoreSelectors: ['.graph-host'],
    maxDiffRatio: 0.003,
    open: async (page) => {
      await page.goto(appRoute(`#/projects/${projectId}/insight`));
      await page.locator('.wiki-explorer').waitFor({ state: 'visible' });
      await page.locator('.ntitle, .wempty').first().waitFor({ state: 'visible' });
    },
  },
  {
    id: 'agent',
    ref: 'ref-agent.png',
    open: async (page, state) => {
      await page.goto(appRoute(`#/projects/${projectId}/writing`));
      await page.locator('.ag-thread', { hasText: state.threadTitle }).click();
      await page.locator('.ag-turn.assistant', { hasText: state.answerText }).last().waitFor({ state: 'visible' });
    },
  },
];

function assertOk(response, label) {
  if (!response.ok) {
    throw new Error(`${label} failed: ${response.status} ${response.statusText}`);
  }
}

function createVisualSeed(seedContents) {
  const state = JSON.parse(seedContents);
  const now = Date.now();
  state.projects = Array.isArray(state.projects) ? state.projects : [];
  state.library = typeof state.library === 'object' && state.library ? state.library : {};
  state.readingQueue = typeof state.readingQueue === 'object' && state.readingQueue ? state.readingQueue : {};

  state.projects = DESIGN_LAB_PROJECTS.map((project, index) => ({
    ...project,
    createdAt: project.createdAt || new Date(now - DESIGN_LAB_PROJECT_UPDATED_OFFSETS[index]).toISOString(),
    updatedAt: project.updatedAt || new Date(now - DESIGN_LAB_PROJECT_UPDATED_OFFSETS[index]).toISOString(),
  }));

  for (const project of DESIGN_LAB_PROJECTS) {
    state.library[project.id] = [];
    state.readingQueue[project.id] = [];
  }
  for (const collectionName of [
    'agentMessages',
    'agentThreads',
    'evidenceLinks',
    'experimentRuns',
    'insightCards',
    'insightNotes',
    'readingPackets',
    'readingSessions',
    'reproductionPlans',
    'reproChecklistItems',
    'resultComparisons',
    'resultDossiers',
    'wikiFolders',
    'wikiPages',
    'writingDrafts',
  ]) {
    state[collectionName] = [];
  }

  state.readingSessions = [buildVisualReadingSession(now)];

  return `${JSON.stringify(state, null, 2)}\n`;
}

function buildVisualReadingSession(now) {
  const activePaper = DESIGN_LIBRARY[0];
  const createdAt = new Date(now - 2 * 86_400_000).toISOString();
  const updatedAt = new Date(now - 30 * 60_000).toISOString();
  return {
    abstract:
      "Retrieval-augmented generation (RAG) pipelines typically apply a neural reranker to every retrieved passage list, regardless of the retriever's confidence. We show that this full-reranking policy is wasteful on a non-trivial fraction of queries.",
    authors: ['Kim, J.¹', 'Park, S.²', 'Lee, H.¹'],
    chatMessages: DESIGN_READING_CHAT_MESSAGES,
    createdAt,
    keyPoints: [
      'Adaptive skipping uses confidence to bypass reranking on easy queries.',
      'BEIR average quality remains close to full reranking while calls fall by 58%.',
      'Threshold sensitivity is strongest on domains with weaker first-stage retrieval.',
    ],
    display: {
      ...(DESIGN_LAB_DOC_DISPLAY[activePaper.id] || {}),
      pdfAuthors: 'Kim, J.¹ · Park, S.² · Lee, H.¹   ¹KAIST  ²Seoul National University',
      pdfVenue: 'ACL 2024 · arXiv:2406.XXXXX',
    },
    keywords: [],
    highlights: DESIGN_READING_HIGHLIGHTS,
    notes: DESIGN_READING_NOTES.map((note, index) => ({
      ...note,
      createdAt: new Date(now - (index + 1) * 20 * 60_000).toISOString(),
      updatedAt: new Date(now - index * 10 * 60_000).toISOString(),
    })),
    pageCount: 14,
    paperId: activePaper.id,
    paperUrl: `https://example.org/papers/${activePaper.id}`,
    parseFinishedAt: updatedAt,
    parseStartedAt: createdAt,
    parseStatus: 'done',
    pdfUrl: `https://example.org/papers/${activePaper.id}.pdf`,
    projectId,
    sections: DESIGN_READING_SECTIONS,
    sourceName: 'ARES visual fixture',
    sourceProvider: 'visual-regression',
    sourceRefs: [{ id: activePaper.id, label: activePaper.title, type: 'paper' }],
    status: 'done',
    summary: 'Adaptive skipping cuts reranker calls while keeping BEIR quality close to full reranking.',
    summaryCards: {
      keyPoints: [
        'Confidence scoring decides whether reranking is necessary.',
        'Average skip rate reaches 58% with a small quality delta.',
        'Hard retrieval domains need lower thresholds.',
      ],
      method: 'A confidence gate estimates whether the first-stage retriever is already reliable enough to skip the cross-encoder reranker.',
      result: 'The method reports 44.8 nDCG@10 while reducing reranker calls by 58% and end-to-end latency by 40%.',
      tldr: 'Adaptive skipping reduces reranker cost by gating reranker calls on query confidence.',
    },
    summaryFinishedAt: updatedAt,
    summaryStartedAt: createdAt,
    summaryStatus: 'done',
    title: activePaper.title,
    updatedAt,
    venue: activePaper.venue,
    year: activePaper.year,
    assets: DESIGN_READING_ASSETS,
    id: DESIGN_READING_SESSION_ID,
  };
}

async function api(pathname, { body, method = 'GET' } = {}) {
  const response = await fetch(`${baseURL}${pathname}`, {
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    method,
  });
  assertOk(response, `${method} ${pathname}`);
  return response.json();
}

async function waitForHealth() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 20000) {
    try {
      const response = await fetch(`${baseURL}/api/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${baseURL}/api/health`);
}

async function startServer() {
  if (process.env.ARES_VISUAL_BASE_URL) {
    await waitForHealth();
    return null;
  }

  const runtimeRoot = path.join(repoRoot, '.runtime', `visual-${process.pid}`);
  await rm(runtimeRoot, { force: true, recursive: true });
  await mkdir(path.join(runtimeRoot, 'data'), { recursive: true });
  const seedContents = await readFile(path.join(repoRoot, 'data', 'store.seed.json'), 'utf8');
  await writeFile(
    path.join(runtimeRoot, 'data', 'store.seed.json'),
    createVisualSeed(seedContents)
  );

  const child = spawn(process.execPath, ['services/backend/index.mjs'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ARES_AGENT_CHAT_AUTOGENERATE: 'false',
      ARES_DATA_ROOT_DIR: runtimeRoot,
      ARES_ENABLE_DEMO_PDF: 'true',
      HOST: '127.0.0.1',
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => process.stdout.write(`[visual-server] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[visual-server] ${chunk}`));

  await waitForHealth();
  return child;
}

async function seedVisualState() {
  const stamp = Date.now();
  const dated = (offsetDays) => new Date(stamp - offsetDays * 86_400_000).toISOString();
  const orderedDate = (index) => dated(DESIGN_LIBRARY_AGE_DAYS[index] || index + 1);
  let sessionId = DESIGN_READING_SESSION_ID;

  async function createSessionNotes(session, paper) {
    for (let index = 0; index < paper.notes; index += 1) {
      await api(`/api/reading-sessions/${encodeURIComponent(session.id)}/notes`, {
        body: {
          body: index === 0 ? 'threshold τ는 데이터셋별 수동 튜닝 필요' : `fixture note ${index + 1}`,
          kind: index === 0 ? 'limit' : 'note',
          page: 7 + index,
          quote: index === 0 ? 'auto-τ regression 모델로 회귀하는 후속 아이디어' : `${paper.title} note ${index + 1}`,
        },
        method: 'POST',
      });
    }
  }

  async function createLibraryPaper(targetProjectId, index) {
    await api(`/api/projects/${targetProjectId}/library`, {
      body: {
        paper: {
          abstract: `Project ${targetProjectId} visual paper ${index}.`,
          authors: ['Visual Fixture'],
          coll: 'c-project',
          collectionIds: ['c-project'],
          paperId: `${targetProjectId}-paper-${index}`,
          progress: index % 3 === 0 ? 100 : index % 2 === 0 ? 45 : 0,
          readingProgress: index % 3 === 0 ? 100 : index % 2 === 0 ? 45 : 0,
          savedAt: dated(index),
          sourceProvider: 'visual-regression',
          tags: ['fixture'],
          title: `${targetProjectId} paper ${index}`,
          updatedAt: dated(index),
          venue: 'Visual',
          year: 2026,
        },
      },
      method: 'POST',
    });
  }

  async function createReadingPacket(targetProjectId, index) {
    await api(`/api/projects/${targetProjectId}/reading-packets`, {
      body: {
        id: `${targetProjectId}-packet-${index}`,
        paperIds: [`${targetProjectId}-packet-paper-${index}`],
        status: 'ready',
        summary: `Reading packet ${index}`,
        title: `Reading packet ${index}`,
      },
      method: 'POST',
    });
  }

  async function createPlan(targetProjectId, index) {
    await api(`/api/projects/${targetProjectId}/reproduction-plans`, {
      body: {
        commands: [],
        id: `${targetProjectId}-plan-${index}`,
        metrics: ['nDCG@10'],
        sourceRefs: [{ label: 'Plan' }],
        status: 'draft',
        title: `${targetProjectId} plan ${index}`,
      },
      method: 'POST',
    });
  }

  async function createRun(targetProjectId, index, status) {
    const id = `${targetProjectId}-run-${index}`;
    await api(`/api/projects/${targetProjectId}/experiment-runs`, {
      body: {
        config: {},
        id,
        kind: 'visual',
        metrics: {},
        status,
        title: `${targetProjectId} run ${index}`,
      },
      method: 'POST',
    });
    return id;
  }

  async function createDossier(targetProjectId, index, { runId = '' } = {}) {
    await api(`/api/projects/${targetProjectId}/result-dossiers`, {
      body: {
        comparisons: [],
        deltaSummary: '완료',
        experimentRunIds: runId ? [runId] : [],
        id: `${targetProjectId}-dossier-${index}`,
        status: 'done',
        title: `${targetProjectId} dossier ${index}`,
      },
      method: 'POST',
    });
  }

  for (const paper of [...DESIGN_LIBRARY].reverse()) {
    const index = DESIGN_LIBRARY.findIndex((entry) => entry.id === paper.id);
    const timestamp = orderedDate(index);
    await api(`/api/projects/${projectId}/library`, {
      body: {
        paper: {
          abstract: `${paper.title} visual fixture.`,
          authors: paper.authors,
          coll: paper.coll,
          collectionIds: [paper.coll],
          display: DESIGN_LAB_DOC_DISPLAY[paper.id] || {},
          flag: Boolean(paper.flag),
          paperId: paper.id,
          paperUrl: `https://example.org/papers/${paper.id}`,
          pdfUrl: `https://example.org/papers/${paper.id}.pdf`,
          display: paper.display,
          progress: paper.progress,
          readingProgress: paper.progress,
          savedAt: timestamp,
          sourceProvider: 'visual-regression',
          summary: `${paper.title} summary.`,
          tags: paper.tags,
          title: paper.title,
          updatedAt: timestamp,
          venue: paper.venue,
          year: paper.year,
        },
      },
      method: 'POST',
    });
  }

  const activePaper = DESIGN_LIBRARY[0];

  for (const paper of DESIGN_LIBRARY.slice(1).filter((entry) => entry.notes > 0)) {
    const noteSession = await api(`/api/projects/${projectId}/reading-sessions`, {
      body: { display: DESIGN_LAB_DOC_DISPLAY[paper.id] || {}, paperId: paper.id },
      method: 'POST',
    });
    await createSessionNotes(noteSession.readingSession, paper);
  }

  for (const card of [...DESIGN_LAB_CARDS].reverse()) {
    if (card.col === 'design') {
      await api(`/api/projects/${projectId}/reproduction-plans`, {
        body: {
          commands: [],
          id: card.id,
          metrics: card.tags,
          progressLabel: card.meta,
          sourceRefs: [{ label: card.origin || 'Plan' }],
          status: 'draft',
          title: card.title,
        },
        method: 'POST',
      });
      continue;
    }

    if (card.col === 'done') {
      const richReport = card.id === 'k6';
      await api(`/api/projects/${projectId}/result-dossiers`, {
        body: {
          comparisons: [
            {
              metric: card.title,
              paperValue: '0',
              reproducedValue: card.value,
            },
          ],
          analysis: richReport
            ? '5개 미관측 도메인 전부에서 τ̂가 고정 τ=0.6을 상회했고 oracle 상한의 약 78%를 회복했습니다. 가장 큰 이득은 retrieval이 약한 FiQA·NFCorpus에서 나왔고, 도메인별 수동 τ 튜닝을 제거해도 손실은 작았습니다.'
            : '',
	          deltaSummary: card.metric,
	          designRows: richReport ? DESIGN_LAB_DESIGN_ROWS : [],
	          domainResults: richReport ? DESIGN_LAB_DOMAIN_RESULTS : [],
	          elapsed: richReport ? '2m 14s · CPU' : '',
	          executionSummary: richReport ? '파이프라인을 실행했습니다.' : '',
	          footnote: richReport ? '에이전트 생성 · 방금' : '',
	          hypothesis: richReport ? 'τ를 도메인 난이도(첫 단계 recall)로 회귀하면, 데이터셋별 수동 튜닝 없이도 nDCG@10을 유지할 수 있다.' : '',
	          id: card.id,
	          progressLabel: richReport ? '5/5' : '',
	          prompt: richReport ? 'τ를 도메인 난이도(첫 단계 recall)로 회귀하면, 데이터셋별 수동 튜닝 없이 nDCG@10을 유지할 수 있는지 검증해줘.' : '',
	          reportSummary: richReport ? '가설 지지됨 · 차트 · 결과표 · 분석 포함' : '',
          resultLabel: richReport ? '고정 τ 대비 개선' : '',
          runSteps: richReport ? DESIGN_LAB_RUN_STEPS : [],
          status: 'done',
          subtitle: richReport ? '가설 검증 실험 · BEIR held-out 5 domains · nDCG@10' : '',
          tags: card.tags,
          title: card.title,
          verdict: card.verdict,
          verdictText: richReport ? 'held-out에서 고정 τ 대비 +1.3 nDCG, oracle 대비 −0.4를 기록했습니다.' : card.metric,
          versionLabel: richReport ? 'v1' : '',
        },
        method: 'POST',
      });
      continue;
    }

    await api(`/api/projects/${projectId}/experiment-runs`, {
      body: {
        config: card.col === 'analyze' ? { failure: { message: '리포트 생성 중' } } : {},
        elapsed: card.elapsed,
        id: card.id,
        kind: 'visual',
        metrics: card.metrics,
        notes: card.step || '',
        progressLabel: card.progressLabel,
        status: card.status,
        tags: card.tags,
        title: card.title,
      },
      method: 'POST',
    });
  }

  const mainFixture = DESIGN_LAB_PROJECT_FIXTURES[projectId];
  for (let index = 1; index <= mainFixture.readingPackets; index += 1) {
    await createReadingPacket(projectId, index);
  }
  for (const dossier of mainFixture.linkedDossiers) {
    await api(`/api/projects/${projectId}/result-dossiers`, {
      body: {
        comparisons: [],
        deltaSummary: '실행 로그 저장',
        experimentRunIds: [dossier.runId],
        id: dossier.id,
        status: 'done',
        title: dossier.title,
      },
      method: 'POST',
    });
  }

  for (const project of DESIGN_LAB_PROJECTS.filter((entry) => entry.id !== projectId)) {
    const fixture = DESIGN_LAB_PROJECT_FIXTURES[project.id];
    for (let index = 1; index <= fixture.docs; index += 1) {
      await createLibraryPaper(project.id, index);
    }
    for (let index = 1; index <= fixture.plans; index += 1) {
      await createPlan(project.id, index);
    }
    const runIds = [];
    for (const [index, run] of fixture.runs.entries()) {
      runIds.push(await createRun(project.id, index + 1, run.status));
    }
    const linkedArtifactCount = Math.min(Number(fixture.linkedArtifacts || 0), runIds.length);
    for (let index = 1; index <= fixture.artifacts; index += 1) {
      const runId = index <= linkedArtifactCount ? runIds[index - 1] : '';
      await createDossier(project.id, index, { runId });
    }
  }

  for (const folder of DESIGN_WIKI_FOLDERS) {
    await api(`/api/projects/${projectId}/wiki-folders`, {
      body: { id: folder.id, name: folder.name, parentId: folder.parentId || '' },
      method: 'POST',
    });
  }
  for (const page of DESIGN_WIKI) {
    await api(`/api/projects/${projectId}/wiki`, {
      body: {
        body: designWikiBody(page),
        folderId: page.folderId || `${page.tags[0]}`,
        id: page.id,
        links: page.links,
        paperIds: Array.from({ length: page.paperCount || 1 }, (_, index) => `${activePaper.id}-${index + 1}`),
        properties: page.id === 'ccs'
          ? { category: 'Concepts', linkCount: 9, summary: "A cascade confidence score gates whether the reranker runs at all." }
          : {},
        status: page.id === 'ccs' ? 'done' : 'draft',
        tags: page.tags,
        title: page.title,
        type: page.type,
      },
      method: 'POST',
    });
  }

  for (const threadFixture of DESIGN_AGENT_THREADS) {
    await api(`/api/projects/${projectId}/agent/threads`, {
      body: {
        display: threadFixture.display,
        id: threadFixture.id,
        title: threadFixture.title,
      },
      method: 'POST',
    });
  }
  const threadTitle = DESIGN_AGENT_THREADS[0].title;
  const userText = 'τ 도메인 민감도가 결국 어디서 오는지 정리해줘. 논문마다 다르게 말하는 것 같아.';
  const answerText =
    '세 논문이 서로 다른 말을 하는 것처럼 보이지만, 같은 원인을 다른 층위에서 가리키고 있습니다. τ 민감도는 본질적으로 first-stage retrieval 품질의 함수입니다. 측정 층위에서는 τ=0.6이 BEIR 평균에서만 sweet spot이고 FiQA·NFCorpus에서는 0.4-0.5로 낮춰야 nDCG@10이 유지됩니다. 메커니즘 층위에서는 약한 1차 검색이 저신뢰 쿼리를 더 많이 만들어 최적 gate를 끌어내립니다. 캘리브레이션 층위에서는 c(q)가 in-domain dev에 맞춰져 out-of-domain에서 과신됩니다. 정리하면 τ는 도메인 상수가 아니라 retrieval 품질의 대리변수입니다.';
  await api(`/api/projects/${projectId}/agent/threads/${encodeURIComponent(DESIGN_AGENT_THREADS[0].id)}/messages`, {
    body: {
      id: `visual-agent-user-${stamp}`,
      role: 'user',
      text: userText,
    },
    method: 'POST',
  });
  await api(`/api/projects/${projectId}/agent/threads/${encodeURIComponent(DESIGN_AGENT_THREADS[0].id)}/messages`, {
    body: {
      artifacts: DESIGN_AGENT_ARTIFACTS,
      citations: DESIGN_AGENT_CITATIONS,
      display: {
        contextChips: [
          { icon: 'book', label: 'Library 5' },
          { icon: 'share', label: 'Wiki' },
          { icon: 'note', label: 'Notes 3' },
        ],
        footerText: '모든 답변에 다시 확인 가능한 근거가 부착됩니다 · 교차 문서 추론',
        modelLabel: 'claude-opus-4',
        sections: [
          {
            citationIds: [],
            kind: 'paragraph',
            parts: [
              { text: '세 논문이 서로 다른 말을 하는 것처럼 보이지만, 같은 원인을 다른 층위에서 가리키고 있습니다. τ 민감도는 본질적으로 ' },
              { bold: true, text: 'first-stage retrieval 품질의 함수' },
              { text: '입니다.' },
            ],
            text: '세 논문이 서로 다른 말을 하는 것처럼 보이지만, 같은 원인을 다른 층위에서 가리키고 있습니다. τ 민감도는 본질적으로 first-stage retrieval 품질의 함수입니다.',
          },
          {
            citationIds: ['e1'],
            kind: 'key',
            label: '측정 층위',
            number: '1',
            text: 'τ=0.6은 BEIR 평균에서의 sweet spot일 뿐, retrieval이 약한 FiQA·NFCorpus에서는 0.4–0.5로 낮춰야 nDCG@10이 유지됩니다.',
          },
          {
            citationIds: ['e2'],
            kind: 'key',
            label: '메커니즘',
            number: '2',
            parts: [
              { text: '약한 1차 검색은 저신뢰 쿼리를 더 많이 만들어 최적 gate를 끌어내립니다. 도메인 자체가 아니라 ' },
              { bold: true, text: 'retrieval 난이도' },
              { text: '가 τ를 움직입니다.' },
              { citationId: 'e2' },
            ],
            text: '약한 1차 검색은 저신뢰 쿼리를 더 많이 만들어 최적 gate를 끌어내립니다. 도메인 자체가 아니라 retrieval 난이도가 τ를 움직입니다.',
          },
          {
            citationIds: ['e4', 'e3'],
            kind: 'key',
            label: '캘리브레이션 결함',
            number: '3',
            parts: [
              { text: 'c(q)가 in-domain dev에 맞춰져 out-of-domain에서 과신되고' },
              { citationId: 'e4' },
              { text: ', 그래서 한 코퍼스에서 맞춘 τ가 다른 코퍼스로 전이되지 않습니다.' },
              { citationId: 'e3' },
            ],
            text: 'c(q)가 in-domain dev에 맞춰져 out-of-domain에서 과신되고, 그래서 한 코퍼스에서 맞춘 τ가 다른 코퍼스로 전이되지 않습니다.',
          },
          {
            citationIds: ['e5'],
            kind: 'callout',
            label: '정리',
            parts: [
              { text: 'τ는 도메인 상수가 아니라 retrieval 품질의 대리변수입니다. 고정 τ를 버리기보다 c(q)를 도메인별로 재캘리브레이션하거나, 당신 노트처럼 auto-τ를 회귀로 추정하는 방향이 맞습니다.' },
              { citationId: 'e5' },
              { text: ' 이 결론은 Lab의 ' },
              { bold: true, text: 'auto-τ regression' },
              { text: ' lane으로 보낼 수 있어요.' },
            ],
            text: 'τ는 도메인 상수가 아니라 retrieval 품질의 대리변수입니다. 고정 τ를 버리기보다 c(q)를 도메인별로 재캘리브레이션하거나, 당신 노트처럼 auto-τ를 회귀로 추정하는 방향이 맞습니다. 이 결론은 Lab의 auto-τ regression lane으로 보낼 수 있어요.',
          },
        ],
        traceSummary: '4단계로 추론하고 16개 출처를 확인함',
      },
      id: `visual-agent-message-${stamp}`,
      role: 'assistant',
      text: answerText,
      trace: [
        { icon: 'search', result: '11 hits', text: 'Library 5편에서 "threshold τ" 구절 검색' },
        { icon: 'book', result: '2 papers', text: 'Adaptive Skipping §5.2 · Lightweight Rerankers §4 정독' },
        { icon: 'share', result: '2 nodes', text: 'Wiki τ sensitivity · Confidence c(q) 노드 대조' },
        { icon: 'note', result: '1 note', text: '내 노트 n3(τ 수동 튜닝) 연결' },
      ],
    },
    method: 'POST',
  });

  return {
    answerText: '세 논문이 서로 다른 말을 하는 것처럼 보이지만',
    labTitle: 'auto-τ regression',
    sessionId,
    threadTitle,
  };
}

function collectDiagnostics(page) {
  const browserErrors = [];
  const failedRequests = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      browserErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    browserErrors.push(error.message);
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText || '';
    if (request.url().includes('/events') && /ERR_ABORTED/i.test(failure)) {
      return;
    }
    if (/\/api\/reading-sessions\/[^/]+\/pdf$/.test(new URL(request.url()).pathname) && /ERR_ABORTED/i.test(failure)) {
      return;
    }
    failedRequests.push(`${request.method()} ${request.url()} ${failure}`.trim());
  });

  return { browserErrors, failedRequests };
}

function isInsideRegion(x, y, region) {
  return x >= region.x
    && x < region.x + region.width
    && y >= region.y
    && y < region.y + region.height;
}

function applyIgnoredRegions(ref, actual, regions, unignoredRegions = []) {
  for (const region of regions || []) {
    const left = Math.max(0, Math.floor(region.x));
    const top = Math.max(0, Math.floor(region.y));
    const right = Math.min(ref.width, Math.ceil(region.x + region.width));
    const bottom = Math.min(ref.height, Math.ceil(region.y + region.height));
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        if (unignoredRegions.some((unignoredRegion) => isInsideRegion(x, y, unignoredRegion))) {
          continue;
        }
        const index = (y * ref.width + x) * 4;
        actual.data[index] = ref.data[index];
        actual.data[index + 1] = ref.data[index + 1];
        actual.data[index + 2] = ref.data[index + 2];
        actual.data[index + 3] = ref.data[index + 3];
      }
    }
  }
}

async function compareScreenshot(testCase, actualPath, ignoredRegions = [], unignoredRegions = []) {
  const refPath = path.join(repoRoot, 'design', 'screenshots', testCase.ref);
  const diffPath = path.join(outputDir, `${testCase.id}.diff.png`);
  const ref = PNG.sync.read(await readFile(refPath));
  const actual = PNG.sync.read(await readFile(actualPath));

  if (ref.width !== actual.width || ref.height !== actual.height) {
    return {
      diffPath,
      diffPixels: ref.width * ref.height,
      diffRatio: 1,
      dimensions: `${actual.width}x${actual.height} actual vs ${ref.width}x${ref.height} ref`,
      id: testCase.id,
      pass: false,
    };
  }

  applyIgnoredRegions(ref, actual, ignoredRegions, unignoredRegions);
  const diff = new PNG({ width: ref.width, height: ref.height });
  const diffPixels = pixelmatch(ref.data, actual.data, diff.data, ref.width, ref.height, {
    threshold: 0.1,
  });
  await writeFile(diffPath, PNG.sync.write(diff));
  const diffRatio = diffPixels / (ref.width * ref.height);
  return {
    diffPath,
    diffPixels,
    diffRatio,
    dimensions: `${actual.width}x${actual.height}`,
    id: testCase.id,
    ignoredRegions,
    maxDiffRatio: testCase.maxDiffRatio || maxDiffRatio,
    pass: diffRatio <= (testCase.maxDiffRatio || maxDiffRatio),
  };
}

async function run() {
  await mkdir(outputDir, { recursive: true });
  const server = await startServer();
  let browser;
  try {
    const state = await seedVisualState();
    browser = await chromium.launch();
    const context = await browser.newContext({
      deviceScaleFactor: 2,
      viewport: { height: 900, width: 1440 },
    });
    const page = await context.newPage();
    const diagnostics = collectDiagnostics(page);
    const results = [];

    for (const testCase of cases) {
      await testCase.open(page, state);
      if (process.env.ARES_VISUAL_DEBUG_LAYOUT === '1') {
        const layout = await page.evaluate(() => {
          const rect = (selector) => {
            const element = document.querySelector(selector);
            if (!element) return null;
            const box = element.getBoundingClientRect();
            const styles = window.getComputedStyle(element);
            return {
              height: box.height,
              paddingLeft: styles.paddingLeft,
              paddingRight: styles.paddingRight,
              width: box.width,
              x: box.x,
              y: box.y,
            };
          };
          return {
            graphHost: rect('.graph-host'),
            pdfCanvas: rect('.reading-pdf-canvas'),
            pdfHost: rect('[data-reading-pdf-host="true"]'),
            pdfSurface: rect('.reading-pdf-page-surface'),
          };
        });
        console.log(`[visual-layout] ${testCase.id} ${JSON.stringify(layout)}`);
      }
      await page.waitForTimeout(350);
      const actualPath = path.join(outputDir, `${testCase.id}.actual.png`);
      await page.screenshot({ fullPage: false, path: actualPath });
      const readRegions = async (selectors = []) => (selectors.length
        ? page.evaluate((regionSelectors) => {
            const scale = window.devicePixelRatio || 1;
            return regionSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)).map((element) => {
              const box = element.getBoundingClientRect();
              return {
                height: box.height * scale,
                width: box.width * scale,
                x: box.x * scale,
                y: box.y * scale,
              };
            }));
          }, selectors)
        : []);
      const ignoredRegions = await readRegions(testCase.ignoreSelectors);
      const unignoredRegions = await readRegions(testCase.unignoreSelectors);
      results.push({
        actualPath,
        ...(await compareScreenshot(testCase, actualPath, ignoredRegions, unignoredRegions)),
        refPath: path.join('design', 'screenshots', testCase.ref),
        unignoredRegions,
      });
    }

    await browser.close();
    browser = null;

    const failed = results.filter((result) => !result.pass);
    const hasBrowserIssues = diagnostics.browserErrors.length > 0 || diagnostics.failedRequests.length > 0;
    const report = {
      browserErrors: diagnostics.browserErrors,
      failedRequests: diagnostics.failedRequests,
      maxDiffRatio,
      results,
    };
    await writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);

    for (const result of results) {
      const status = result.pass ? 'PASS' : 'FAIL';
      console.log(`${status} ${result.id}: diff ${(result.diffRatio * 100).toFixed(3)}% (${result.diffPixels} px)`);
    }
    if (hasBrowserIssues) {
      console.error('Browser diagnostics failed:', JSON.stringify({
        browserErrors: diagnostics.browserErrors,
        failedRequests: diagnostics.failedRequests,
      }, null, 2));
    }
    if (failed.length || hasBrowserIssues) {
      process.exitCode = 1;
    }
  } finally {
    if (browser) {
      await browser.close();
    }
    if (server) {
      server.kill('SIGINT');
      await new Promise((resolve) => server.once('exit', resolve));
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
