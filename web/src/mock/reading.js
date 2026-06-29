import { T } from '../components/primitives.jsx';

const LIBRARY = [
  { id:'p1', title:'Reducing Reranker Costs in RAG via Adaptive Skipping', auth:'Kim et al.', venue:'ACL 2024', progress:62, active:true, tags:['reranking','efficiency'], added:'2일 전', notes:3, coll:'c-rerank', flag:true },
  { id:'p2', title:'Efficient RAG with Lightweight Rerankers', auth:'Chen et al.', venue:'EMNLP 2024', progress:0, tags:['reranking'], added:'2일 전', notes:0, coll:'c-rerank' },
  { id:'p3', title:'FlashRAG: A Modular Framework for RAG Research', auth:'Jin et al.', venue:'arXiv 2024', progress:0, tags:['framework'], added:'5일 전', notes:0, coll:'c-rerank' },
  { id:'p4', title:'Is Reranking Really Necessary for RAG?', auth:'Park et al.', venue:'ACL 2024', progress:100, tags:['reranking','analysis'], added:'1주 전', notes:5, coll:'c-rerank', flag:true },
  { id:'p5', title:'RAGLAB: Research-Oriented Unified Framework', auth:'Zhang et al.', venue:'arXiv 2024', progress:18, tags:['framework'], added:'1주 전', notes:1, coll:'c-rerank' },
  { id:'p6', title:'BEIR: A Heterogeneous Benchmark for Information Retrieval', auth:'Thakur et al.', venue:'NeurIPS 2021', progress:100, tags:['benchmark','evaluation'], added:'2주 전', notes:4, coll:'c-eval' },
  { id:'p7', title:'Dense Passage Retrieval for Open-Domain Question Answering', auth:'Karpukhin et al.', venue:'EMNLP 2020', progress:45, tags:['retrieval','DPR'], added:'2주 전', notes:2, coll:'c-retr' },
  { id:'p8', title:'ColBERT: Efficient Passage Search via Late Interaction', auth:'Khattab et al.', venue:'SIGIR 2020', progress:0, tags:['retrieval'], added:'3주 전', notes:0, coll:'c-retr' },
  { id:'p9', title:'Out-of-Domain Generalization in Dense Retrieval', auth:'Lee et al.', venue:'ACL 2023', progress:30, tags:['retrieval','generalization'], added:'3주 전', notes:1, coll:'c-retr', flag:true },
];
const COLLECTIONS = [
  { id:'c-rerank', name:'Reranking 효율화' },
  { id:'c-retr',   name:'Retrieval 일반화' },
  { id:'c-eval',   name:'평가 프로토콜' },
];
const libStatus = (p) => p.progress===0 ? 'unread' : p.progress>=100 ? 'done' : 'reading';
const STATUS_C = { reading:'#5e6ad2', done:'#5e9c6f', unread:'#b0b0b8' };
const STATUS_L = { reading:'읽는 중', done:'완독', unread:'안 읽음' };
const SHELVES = [
  { id:'all',     name:'전체',      ic:'book' },
  { id:'reading', name:'읽는 중',    ic:'book' },
  { id:'unread',  name:'안 읽음',    ic:'book' },
  { id:'done',    name:'완독',      ic:'check' },
  { id:'flag',    name:'중요 표시',  ic:'bookmark' },
];
const shelfMatch = (p, s) => s==='all' ? true : s==='flag' ? !!p.flag : libStatus(p)===s;
const shelfCount = (s) => LIBRARY.filter(p => shelfMatch(p, s)).length;
const LIB_TAGS = [...new Set(LIBRARY.flatMap(p => p.tags))];
const OUTLINE = [
  { label:'Abstract', status:'done' },
  { label:'1. Introduction', status:'done' },
  { label:'2. Related Work', status:'done' },
  { label:'3. Method', status:'done', active:true },
  { label:'4. Experiments', status:'running' },
  { label:'5. Analysis', status:'queue' },
  { label:'6. Conclusion', status:'queue' },
];
const MESSAGES = [
  { id:1, role:'user', text:'τ 값이 데이터셋마다 다르면 일반화 어렵지 않아?' },
  { id:2, role:'assistant', text:'좋은 지적입니다. §5.2의 민감도 분석을 보면 τ=0.6이 BEIR 평균 sweet spot이지만, FiQA·NFCorpus처럼 retrieval이 약한 도메인에서는 τ를 0.4–0.5로 낮춰야 nDCG 유지됩니다.', cites:[{ label:'§5.2 Sensitivity', pg:7 }] },
  { id:3, role:'user', text:'Baseline 대비 reranker 호출이 얼마나 줄었어?' },
  { id:4, role:'assistant', text:'Table 3 기준 평균 58% skip → 전체 latency 40% 감소. FiQA는 35%, NQ는 72%까지 skip 가능.', cites:[{ label:'Table 3', pg:8 },{ label:'§5.1', pg:8 }] },
];
const NOTES = [
  { id:'n1', cat:'Method', color:T.read, text:'cascade confidence scoring으로 retriever 신뢰도가 τ 이하일 때만 reranker 호출', memo:'BM25 + DPR 혼합 시 confidence 정의 재검토 필요 — c(q) 재정의 실험 TODO', pg:4 },
  { id:'n2', cat:'Result', color:T.search, text:'BEIR 18 tasks 평균 nDCG@10 = 44.8, full-reranker 대비 −0.4', memo:'원 논문 Table 3 ↔ 우리 Baseline 40.2 / 4.6 차이 → 재현 seed·split 확인', pg:7 },
  { id:'n3', cat:'Limit', color:T.result, text:'threshold τ는 데이터셋별 수동 튜닝 필요', memo:'auto-τ regression 모델로 회귀하는 후속 아이디어', pg:9 },
];
const ASSETS = [
  { id:'f1', kind:'Figure', n:1, cap:'Adaptive Skipping overview', pg:3 },
  { id:'t1', kind:'Table',  n:1, cap:'BEIR nDCG@10 comparison', pg:7 },
  { id:'f2', kind:'Figure', n:2, cap:'Cascade scoring pipeline', pg:5 },
  { id:'t3', kind:'Table',  n:3, cap:'Reranker skip ratio per dataset', pg:8 },
  { id:'f3', kind:'Figure', n:3, cap:'Confidence distribution (FiQA)', pg:9 },
  { id:'t2', kind:'Table',  n:2, cap:'Latency breakdown per component', pg:8 },
];

export { ASSETS, COLLECTIONS, LIBRARY, LIB_TAGS, MESSAGES, NOTES, OUTLINE, SHELVES, STATUS_C, STATUS_L, libStatus, shelfCount, shelfMatch };
