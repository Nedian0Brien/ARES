import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Kbd, T, Tag, mono } from '../../components/primitives.jsx';
import { api } from '../../lib/api.js';
import { useServerResource } from '../../lib/serverState.js';

const TYPE_COLOR = { concept:T.search, system:T.read, bench:T.result, method:T.research, failure:T.insight };
const TYPE_NAME  = { concept:'Concept', system:'System', bench:'Benchmark', method:'Method', failure:'Failure' };
const TYPE_CATEGORY_NAME = { concept:'Concepts', system:'Systems', bench:'Benchmarks', method:'Methods', failure:'Failures' };
const WIKI = [
  { id:'ccs',    name:'Cascade confidence scoring', cat:'Concepts',   type:'concept', papers:6,  links:9 },
  { id:'rsk',    name:'Reranker skipping',          cat:'Concepts',   type:'concept', papers:5,  links:7 },
  { id:'tau',    name:'Threshold τ gating',         cat:'Concepts',   type:'concept', papers:4,  links:6 },
  { id:'msr',    name:'Multi-stage retrieval',      cat:'Concepts',   type:'concept', papers:8,  links:11 },
  { id:'eqc',    name:'Evidence contract',          cat:'Concepts',   type:'concept', papers:3,  links:5 },
  { id:'adsk',   name:'Adaptive Skipping',          cat:'Systems',    type:'system',  papers:1,  links:6 },
  { id:'flash',  name:'FlashRAG',                   cat:'Systems',    type:'system',  papers:1,  links:9 },
  { id:'raglab', name:'RAGLAB',                     cat:'Systems',    type:'system',  papers:1,  links:4 },
  { id:'beir',   name:'BEIR',                       cat:'Benchmarks', type:'bench',   papers:14, links:12 },
  { id:'ndcg',   name:'nDCG@10',                    cat:'Benchmarks', type:'bench',   papers:11, links:5 },
  { id:'fiqa',   name:'FiQA',                       cat:'Benchmarks', type:'bench',   papers:5,  links:4 },
  { id:'cq',     name:'Confidence score c(q)',      cat:'Methods',    type:'method',  papers:3,  links:5 },
  { id:'gs',     name:'Grid-search τ',              cat:'Methods',    type:'method',  papers:2,  links:3 },
  { id:'tausens',name:'τ domain sensitivity',       cat:'Failures',   type:'failure', papers:3,  links:4 },
  { id:'absorb', name:'Gain absorption',            cat:'Failures',   type:'failure', papers:4,  links:5 },
];
const WIKI_BY_ID = Object.fromEntries(WIKI.map(d => [d.id, d]));
const WIKI_CATS = ['Concepts','Systems','Benchmarks','Methods','Failures'];
const G_NODES = WIKI.map(d => ({ id:d.id, label:d.name, type:d.type }));
const G_LINKS = [
  ['ccs','adsk'],['ccs','rsk'],['ccs','tau'],['ccs','cq'],['ccs','msr'],['ccs','tausens'],['ccs','eqc'],
  ['rsk','tau'],['rsk','msr'],['rsk','flash'],['rsk','absorb'],
  ['tau','gs'],['tau','tausens'],['tau','cq'],
  ['msr','flash'],['msr','raglab'],['msr','beir'],['msr','eqc'],
  ['adsk','beir'],['adsk','ndcg'],['adsk','tausens'],
  ['flash','beir'],['flash','raglab'],
  ['beir','ndcg'],['beir','fiqa'],
  ['eqc','absorb'],['absorb','cq'],['cq','gs'],['fiqa','tausens'],
];
const ADJ = {}; G_NODES.forEach(n => ADJ[n.id] = new Set());
G_LINKS.forEach(([a,b]) => { if (ADJ[a] && ADJ[b]) { ADJ[a].add(b); ADJ[b].add(a); } });
const DEG = {}; G_NODES.forEach(n => DEG[n.id] = ADJ[n.id].size);

/* ---- Folder structure (reflected across Graph / List / Grid) ---- */
const FOLDERS = [
  { id:'f-eff',   name:'Retrieval efficiency', parent:null },
  { id:'f-casc',  name:'Cascade & skipping',   parent:'f-eff' },
  { id:'f-sys',   name:'Systems',              parent:null },
  { id:'f-eval',  name:'Evaluation',           parent:null },
  { id:'f-bench', name:'Benchmarks',           parent:'f-eval' },
  { id:'f-meth',  name:'Methods',              parent:'f-eval' },
  { id:'f-fail',  name:'Failure modes',        parent:null },
];
const FOLDER_BY_ID = Object.fromEntries(FOLDERS.map(f => [f.id, f]));
const TOP_FOLDERS = FOLDERS.filter(f => f.parent===null);
const DOC_FOLDER = { ccs:'f-casc', rsk:'f-casc', tau:'f-casc', msr:'f-eff', eqc:'f-eff', adsk:'f-sys', flash:'f-sys', raglab:'f-sys', beir:'f-bench', ndcg:'f-bench', fiqa:'f-bench', cq:'f-meth', gs:'f-meth', tausens:'f-fail', absorb:'f-fail' };
const subFolders = (fid) => FOLDERS.filter(f => f.parent===fid);
const docsInFolder = (fid) => WIKI.filter(d => DOC_FOLDER[d.id]===fid);
function descDocCount(fid) { let n = docsInFolder(fid).length; subFolders(fid).forEach(s => { n += descDocCount(s.id); }); return n; }
function folderPath(fid) { const out=[]; let f=FOLDER_BY_ID[fid]; while (f) { out.unshift(f.name); f = f.parent ? FOLDER_BY_ID[f.parent] : null; } return out; }
function topFolderOf(docId) { let f = FOLDER_BY_ID[DOC_FOLDER[docId]]; while (f && f.parent) f = FOLDER_BY_ID[f.parent]; return f ? f.id : null; }
const FOLDER_SIZE = {}; FOLDERS.forEach(f => { FOLDER_SIZE[f.id] = descDocCount(f.id); });

const NODE_KIND={}, NODE_LABEL={}, NODE_TYPE={};
FOLDERS.forEach(f => { NODE_KIND[f.id]='folder'; NODE_LABEL[f.id]=f.name; });
WIKI.forEach(d => { NODE_KIND[d.id]='doc'; NODE_LABEL[d.id]=d.name; NODE_TYPE[d.id]=d.type; });
const GNODE_IDS = [...FOLDERS.map(f=>f.id), ...WIKI.map(d=>d.id)];
const CONT_EDGES = [
  ...FOLDERS.filter(f=>f.parent).map(f=>[f.parent, f.id]),
  ...WIKI.map(d=>[DOC_FOLDER[d.id], d.id]),
];
const GADJ={}; GNODE_IDS.forEach(id => GADJ[id]=new Set());
[...CONT_EDGES, ...G_LINKS].forEach(([a,b]) => { if (GADJ[a] && GADJ[b]) { GADJ[a].add(b); GADJ[b].add(a); } });
const FOLDER_GLYPH = "M3 6.5A1.5 1.5 0 0 1 4.5 5H9l1.6 2H19.5A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19H4.5A1.5 1.5 0 0 1 3 17.5z";
const WDETAIL = {
  ccs: {
    appears: [
      ['Reducing Reranker Costs in RAG (Adaptive Skipping)','p.4'],
      ['FlashRAG: A Modular Framework','p.3'],
      ['Efficient RAG with Lightweight Rerankers','p.2'],
    ],
    related: ['tau','rsk','cq','tausens'],
  },
};
const WGSUM = {
  ccs:'retriever 신뢰도가 임계값 이하일 때만 reranker를 호출하는 게이팅.',
  rsk:'top-k가 충분히 결정적이면 reranker 단계를 건너뛴다.',
  msr:'retrieve → rerank → generate 다단계 파이프라인.',
  beir:'18개 out-of-domain 검색 태스크 벤치마크.',
};
function folderPathIds(fid) { const out=[]; let f=FOLDER_BY_ID[fid]; while (f) { out.unshift(f.id); f = f.parent ? FOLDER_BY_ID[f.parent] : null; } return out; }
const WDESC = {
  ccs:'retriever 신뢰도가 임계값 이하일 때만 reranker를 호출하는 게이팅. c(q) = cos(q,d₀) − cos(q,d₁)로 상위 결과의 결정성을 추정하고, τ를 넘으면 reranker를 통째로 건너뛴다. BEIR에서 reranker 호출 58%·전체 지연 40%를 절감했다.',
  rsk:'top-k가 충분히 결정적이면 reranker 단계를 건너뛴다.',
  tau:'skip 여부를 가르는 임계값 τ. validation set에서 grid-search로 고정하며, 약-retrieval 도메인에서는 낮춰 잡아야 nDCG가 유지된다.',
  msr:'retrieve → rerank → generate 다단계 파이프라인. 각 단계가 다음 단계 후보를 좁힌다.',
  eqc:'무엇을 근거로 채택했는지 추적 가능하게 만드는 계약.',
  adsk:'cascade confidence로 reranker를 선택 실행하는 시스템 (ACL 2024).',
  flash:'RAG 연구용 모듈러 프레임워크. 다양한 retriever·reranker를 같은 인터페이스로 조합한다.',
  raglab:'재현 연구 지향 통합 RAG 프레임워크.',
  beir:'18개 out-of-domain 검색 태스크 벤치마크. zero-shot 일반화 측정의 사실상 표준으로 쓰인다.',
  ndcg:'순위 품질 지표. 상위 결과의 관련성에 가중한다.',
  fiqa:'금융 QA 검색 태스크. retrieval이 약해 τ에 민감하다.',
  cq:'c(q) = cos(q,d₀) − cos(q,d₁). 추가 연산 없이 retriever 유사도만으로 신뢰도를 추정한다.',
  gs:'validation set에서 τ를 격자 탐색으로 결정한다.',
  tausens:'τ가 도메인마다 달라 일반화가 어려운 실패 모드. 약-retrieval 도메인에서 두드러진다.',
  absorb:'reranker 이득이 다른 요인에 흡수되어 측정되지 않는 현상.',
};

/* Obsidian-style force graph that reflects the folder structure
   (folder nodes + doc nodes; containment edges cluster docs per folder, semantic links dashed) */
function GraphView({ sel, setSel, cat, onPick }) {
  const W = 960, H = 660;
  const svgRef = useRef(null);
  const P = useRef(null);
  const alpha = useRef(1);
  const dragId = useRef(null);
  const [hover, setHover] = useState(null);
  const [, force] = useState(0);

  if (!P.current) {
    P.current = {};
    GNODE_IDS.forEach((id,i) => {
      const ang = (i / GNODE_IDS.length) * Math.PI * 2;
      P.current[id] = { x:W/2 + Math.cos(ang)*240 + (Math.random()*30-15), y:H/2 + Math.sin(ang)*170 + (Math.random()*30-15), vx:0, vy:0 };
    });
  }

  useEffect(() => {
    const ids = GNODE_IDS; let raf;
    const tick = () => {
      const p = P.current, a = alpha.current;
      if (a > 0.004) {
        for (let i=0;i<ids.length;i++) for (let j=i+1;j<ids.length;j++) {
          const A=p[ids[i]], B=p[ids[j]];
          let dx=A.x-B.x, dy=A.y-B.y, d2=dx*dx+dy*dy||0.01, d=Math.sqrt(d2);
          const f=3200/d2, fx=dx/d*f, fy=dy/d*f;
          A.vx+=fx; A.vy+=fy; B.vx-=fx; B.vy-=fy;
        }
        CONT_EDGES.forEach(([s,t]) => { const A=p[s], B=p[t]; let dx=B.x-A.x, dy=B.y-A.y, d=Math.sqrt(dx*dx+dy*dy)||0.01;
          const f=(d-92)*0.022, fx=dx/d*f, fy=dy/d*f; A.vx+=fx; A.vy+=fy; B.vx-=fx; B.vy-=fy; });
        G_LINKS.forEach(([s,t]) => { const A=p[s], B=p[t]; let dx=B.x-A.x, dy=B.y-A.y, d=Math.sqrt(dx*dx+dy*dy)||0.01;
          const f=(d-175)*0.006, fx=dx/d*f, fy=dy/d*f; A.vx+=fx; A.vy+=fy; B.vx-=fx; B.vy-=fy; });
        ids.forEach(id => { const n=p[id];
          n.vx += (W/2-n.x)*0.013; n.vy += (H/2-n.y)*0.013; n.vx*=0.85; n.vy*=0.85;
          if (dragId.current !== id) { n.x += n.vx*a*0.9; n.y += n.vy*a*0.9; } });
        alpha.current = a*0.986; force(v => v+1);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const toSvg = (e) => { const svg=svgRef.current; const pt=svg.createSVGPoint(); pt.x=e.clientX; pt.y=e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
  const onMove = (e) => { if (!dragId.current) return; const r=toSvg(e); const n=P.current[dragId.current]; n.x=r.x; n.y=r.y; n.vx=0; n.vy=0; alpha.current=Math.max(alpha.current,0.4); force(v=>v+1); };
  const endDrag = () => { dragId.current=null; };

  const focus = hover;
  const topOf = (id) => NODE_KIND[id]==='folder' ? (() => { let f=FOLDER_BY_ID[id]; while (f.parent) f=FOLDER_BY_ID[f.parent]; return f.id; })() : topFolderOf(id);
  const dimNode = (id) => cat && cat!=='all' && topOf(id)!==cat;

  return (
    <div className="graph-host">
      <svg ref={svgRef} className="gsvg2" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
           onMouseMove={onMove} onMouseUp={endDrag} onMouseLeave={() => { setHover(null); endDrag(); }}>
        {CONT_EDGES.map(([s,t],i) => { const A=P.current[s], B=P.current[t]; const hot=focus&&(s===focus||t===focus); const dim=dimNode(s)||dimNode(t);
          return <line key={'c'+i} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={hot?'rgba(15,15,15,0.34)':'rgba(15,15,15,0.16)'} strokeWidth={hot?1.6:1.1} opacity={dim?0.16:(focus&&!hot?0.4:1)}/>; })}
        {G_LINKS.map(([s,t],i) => { const A=P.current[s], B=P.current[t]; const hot=focus&&(s===focus||t===focus); const dim=dimNode(s)||dimNode(t);
          return <line key={'s'+i} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={hot?'rgba(94,156,111,0.6)':'rgba(94,156,111,0.28)'} strokeWidth={hot?1.6:1} strokeDasharray="4 3" opacity={dim?0.1:(focus&&!hot?0.28:1)}/>; })}
        {GNODE_IDS.map(id => { const p=P.current[id]; const on=(!focus || id===focus || GADJ[focus].has(id)) && !dimNode(id);
          if (NODE_KIND[id]==='folder') { const gs = 18 + FOLDER_SIZE[id]*2;
            return (
              <g key={id} transform={`translate(${p.x},${p.y})`} style={{ cursor:'grab', opacity:on?1:0.2, transition:'opacity 120ms ease' }}
                 onMouseDown={(e) => { e.stopPropagation(); dragId.current=id; alpha.current=Math.max(alpha.current,0.5); }}
                 onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)}>
                <g transform={`translate(${-gs/2},${-gs/2}) scale(${gs/24})`}><path d={FOLDER_GLYPH} fill="#e4e2db" stroke="#b6b3aa" strokeWidth="1.4" strokeLinejoin="round"/></g>
                <text y={gs/2+13} textAnchor="middle" fontSize="11.5" fontWeight="600" fill="#54545c" style={{ pointerEvents:'none' }}>{NODE_LABEL[id]}</text>
              </g>
            );
          }
          const r=6 + (DEG[id]||1)*1.3; const c=TYPE_COLOR[NODE_TYPE[id]]; const selN=id===sel;
          return (
            <g key={id} transform={`translate(${p.x},${p.y})`} style={{ cursor:'pointer', opacity:on?1:0.2, transition:'opacity 120ms ease' }}
               onMouseDown={(e) => { e.stopPropagation(); dragId.current=id; alpha.current=Math.max(alpha.current,0.5); }}
               onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)}
               onClick={() => { setSel(id); onPick && onPick(id); }}>
              {selN && <circle r={r+5} fill="none" stroke={c} strokeWidth="1.5" opacity="0.5"/>}
              <circle r={r} fill={c} stroke="#fffdf8" strokeWidth="1.6"/>
              <text y={r+12} textAnchor="middle" fontSize={selN?12:11} fontWeight={selN?600:500} fill={selN?c:'#5c5c63'} style={{ pointerEvents:'none' }}>{NODE_LABEL[id]}</text>
            </g>
          );
        })}
      </svg>
      <div className="glegend">
        <b>Legend</b>
        <div className="li"><span style={{ width:12, height:9, borderRadius:2, background:'#e4e2db', border:'1px solid #b6b3aa' }}/>Folder</div>
        {[['Concept',T.search],['System',T.read],['Benchmark',T.result],['Method',T.research],['Failure',T.insight]].map(([l,c]) => (
          <div key={l} className="li"><span style={{ width:7, height:7, borderRadius:'50%', background:c }}/>{l}</div>
        ))}
      </div>
    </div>
  );
}
/* List = collapsible folder tree */
function WikiList({ sel, setSel, cat, onPick }) {
  const [closed, setClosed] = useState({});
  const toggle = (fid) => setClosed(c => ({ ...c, [fid]:!c[fid] }));
  const roots = (!cat || cat==='all') ? TOP_FOLDERS : TOP_FOLDERS.filter(f => f.id===cat);
  const renderFolder = (f, depth) => {
    const open = !closed[f.id];
    return (
      <React.Fragment key={f.id}>
        <div className="tree-row folder" style={{ paddingLeft: 10 + depth*16 }} onClick={() => toggle(f.id)}>
          <Icon name={open?'chevD':'chevR'} size={13} color={T.t4}/>
          <Icon name="folder" size={15}/>
          <span className="tname">{f.name}</span>
          <span className="tcount">{descDocCount(f.id)}</span>
        </div>
        {open && subFolders(f.id).map(s => renderFolder(s, depth+1))}
        {open && docsInFolder(f.id).map(d => (
          <div key={d.id} className={`tree-row doc ${sel===d.id?'sel':''}`} style={{ paddingLeft: 10 + (depth+1)*16 }} onClick={() => { setSel(d.id); onPick && onPick(d.id); }}>
            <span className="tdot" style={{ background:TYPE_COLOR[d.type] }}/>
            <span className="tname">{d.name}</span>
            <span className="ttype">{TYPE_NAME[d.type]}</span>
          </div>
        ))}
      </React.Fragment>
    );
  };
  return <div className="tree">{roots.map(f => renderFolder(f, 0))}</div>;
}
/* Grid = drill-down folder navigation + masonry (waterfall) document cards */
function WikiGrid({ sel, setSel, onPick }) {
  const [here, setHere] = useState(null);   // current folder id; null = root
  const subs = here===null ? TOP_FOLDERS : subFolders(here);
  const docs = here===null ? [] : docsInFolder(here);
  const path = here===null ? [] : folderPathIds(here);
  return (
    <div className="wgrid3">
      <div className="wcrumb">
        <button className={`wcb ${here===null?'cur':''}`} onClick={() => setHere(null)}><Icon name="folder" size={13}/>All</button>
        {path.map((fid,i) => (
          <React.Fragment key={fid}>
            <Icon name="chevR" size={12} color={T.t4}/>
            <button className={`wcb ${i===path.length-1?'cur':''}`} onClick={() => setHere(fid)}>{FOLDER_BY_ID[fid].name}</button>
          </React.Fragment>
        ))}
        {here!==null && (
          <button className="wup" onClick={() => setHere(FOLDER_BY_ID[here].parent)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V6M6 11l6-6 6 6"/><path d="M4 4h16" opacity="0"/></svg>
            Up
          </button>
        )}
      </div>

      {subs.length>0 && (
        <div className="wfolders">
          {subs.map(f => (
            <button key={f.id} className="wfcard" onClick={() => setHere(f.id)}>
              <span className="wfic"><Icon name="folder" size={18}/></span>
              <span className="wfn">{f.name}</span>
              <span className="wfm">{descDocCount(f.id)} docs{subFolders(f.id).length ? ` · ${subFolders(f.id).length} folders` : ''}</span>
              <Icon name="chevR" size={15} color={T.t4}/>
            </button>
          ))}
        </div>
      )}

      {docs.length>0 && (
        <div className="masonry">
          {docs.map(d => (
            <div key={d.id} className={`mcard ${sel===d.id?'sel':''}`} onClick={() => { setSel(d.id); onPick && onPick(d.id); }}>
              <div className="mhead"><span className="dot" style={{ background:TYPE_COLOR[d.type] }}/>{d.name}</div>
              <div className="mdesc">{WDESC[d.id] || `${TYPE_NAME[d.type]} 문서.`}</div>
              <div className="mmeta"><span>{TYPE_NAME[d.type]}</span><span className="mx">·</span><span>{d.papers} papers</span><span className="mx">·</span><span>{d.links} links</span></div>
            </div>
          ))}
        </div>
      )}

      {subs.length===0 && docs.length===0 && <div className="wempty">빈 폴더입니다.</div>}
    </div>
  );
}
const WMETA = { ccs:{ status:'Synthesized', updated:'2 days ago', tags:['retrieval','efficiency','cascade'] } };
const metaOf = (id) => WMETA[id] || { status:'Stub', updated:'recently', tags:[(WIKI_BY_ID[id] ? WIKI_BY_ID[id].cat : 'Concept').toLowerCase()] };
const TYPE_GLYPH = { concept:'list', system:'flask', bench:'grid', method:'pen', failure:'info' };
const tintBg = (c) => `color-mix(in srgb, ${c} 14%, transparent)`;
const PI = {
  tag:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0l-7-7A2 2 0 013 12.2V5a2 2 0 012-2h7.2a2 2 0 011.4.6l7 7a2 2 0 010 2.8z"/><path d="M7.5 7.5h.01"/></svg>,
  clock:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/></svg>,
  hash:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4 7.5 20M16.5 4 15 20M4.5 9H20M4 15h15.5"/></svg>,
};
function WikiDoc({ id, setSel, onBack }) {
  const d = WIKI_BY_ID[id] || WIKI_BY_ID.ccs;
  const c = TYPE_COLOR[d.type];
  const meta = metaOf(id);
  const appears = (WDETAIL[id] && WDETAIL[id].appears) || [
    ['Reducing Reranker Costs in RAG (Adaptive Skipping)','p.4'],
    ['FlashRAG: A Modular Framework','p.3'],
  ];
  const outgoing = (WDETAIL[id] && WDETAIL[id].related) || WIKI.filter(x => x.id!==id && x.cat===d.cat).slice(0,4).map(x => x.id);
  const blConcepts = WIKI.filter(x => x.id!==id && ADJ[id] && ADJ[id].has(x.id) && !outgoing.includes(x.id) && (x.type==='concept'||x.type==='system')).slice(0,3);
  const tn = TYPE_NAME[d.type].toLowerCase();

  const body = id==='ccs' ? (
    <>
      <p>A <b>cascade confidence score</b> gates whether the reranker runs at all. The retriever's own margin — <span className="ncode">c(q) = cos(q, d₀) − cos(q, d₁)</span> — estimates how decided the top result already is.</p>
      <div className="ncallout"><span className="ic">💡</span><span className="tx"><b>Why it matters.</b> On BEIR, skipping the reranker on confident queries cut reranker calls by <b>58%</b> and end-to-end latency by <b>40%</b>, at only a <b>−0.4</b> nDCG@10 cost.</span></div>
      <h2>How it works</h2>
      <p>The score reuses similarities the retriever already produced, so it adds negligible overhead. Once it clears a tuned threshold, the reranker is bypassed:</p>
      <div className="neq">skip_reranker := c(q) &gt; τ</div>
      <ul>
        <li>τ is fixed on a validation set via <a className="wk" onClick={() => setSel('gs')}>grid search</a>.</li>
        <li>Connects <a className="wk" onClick={() => setSel('adsk')}>Adaptive Skipping</a> to the wider <a className="wk" onClick={() => setSel('msr')}>multi-stage retrieval</a> line.</li>
        <li>Both trade a small quality margin for large latency savings.</li>
      </ul>
      <h2>Caveats</h2>
      <p>Where the score is mis-calibrated, skipping surfaces as a <a className="wk" onClick={() => setSel('tausens')}>τ domain-sensitivity</a> failure — weak-retrieval domains such as FiQA and NFCorpus need a lower τ to preserve nDCG.</p>
    </>
  ) : (
    <>
      <p><b>{d.name}</b> is a {tn} extracted from <b>{d.papers} papers</b> in this collection.</p>
      <h2>Summary</h2>
      <p>{WGSUM[id] || `${d.cat} 영역의 ${TYPE_NAME[d.type]} 문서입니다. 그래프에서 이웃을, 아래 백링크에서 출처 논문을 확인하세요.`}</p>
    </>
  );

  return (
    <div className="ndoc">
      <div className="ndoc-top">
        <button className="pane-icon-btn wiki-back" onClick={onBack} title="Back" type="button"><Icon name="chevL" size={15}/></button>
        <div className="ndoc-crumb"><span className="cdot" style={{ background:c }}/><span>Wiki</span><Icon name="chevR" size={11} color={T.t4}/><b>{d.cat}</b></div>
        <div className="pane-actions">
          <button className="btn-ghost" disabled style={{ padding:'3px 8px', fontSize:12 }} type="button"><Icon name="pen" size={12}/> Edit</button>
          <button className="pane-icon-btn" disabled title="Bookmark" type="button"><Icon name="bookmark" size={14}/></button>
          <button className="pane-icon-btn" disabled title="Share" type="button"><Icon name="share" size={14}/></button>
          <button className="pane-icon-btn" disabled title="More" type="button"><Icon name="moreH" size={14}/></button>
        </div>
      </div>
      <div className="ndoc-body">
        <div className="ndoc-page">
          <div className="npage-icon" style={{ background:tintBg(c), color:c }}><Icon name={TYPE_GLYPH[d.type] || 'list'} size={24}/></div>
          <div className="ntitle">{d.name}</div>

          <div className="nprops">
            <div className="nprop"><span className="k">{PI.tag}Type</span><span className="v"><span className="npill" style={{ background:tintBg(c), color:c }}><span style={{ width:6, height:6, borderRadius:'50%', background:c }}/>{TYPE_NAME[d.type]}</span></span></div>
            <div className="nprop"><span className="k"><Icon name="pdf" size={15}/>Papers</span><span className="v">{d.papers}</span></div>
            <div className="nprop"><span className="k"><Icon name="share" size={15}/>Links</span><span className="v">{d.links}</span></div>
            <div className="nprop"><span className="k"><Icon name="check" size={15}/>Status</span><span className="v mut">{meta.status}</span></div>
            <div className="nprop"><span className="k">{PI.clock}Updated</span><span className="v mut">{meta.updated}</span></div>
            <div className="nprop"><span className="k">{PI.hash}Tags</span><span className="v">{meta.tags.map(t => <span key={t} className="ntag">{t}</span>)}</span></div>
          </div>

          <div className="ndiv"/>
          <div className="nbody">{body}</div>

          <div className="nrefs">
            <div className="nrefs-sec">
              <div className="nrefs-h"><Icon name="share" size={14}/>Links<span className="n">{outgoing.length}</span></div>
              <div className="nlinkchips">
                {outgoing.map(rid => { const r = WIKI_BY_ID[rid]; if (!r) return null; return (
                  <button key={rid} className="nlinkchip" onClick={() => setSel(rid)}><span className="dot" style={{ background:TYPE_COLOR[r.type] }}/>{r.name}</button>
                ); })}
              </div>
            </div>
            <div className="nrefs-sec">
              <div className="nrefs-h"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 10l-5 5 5 5"/><path d="M20 4v7a4 4 0 01-4 4H4"/></svg>Backlinks<span className="n">{appears.length + blConcepts.length}</span></div>
              {appears.map(([t,pg],i) => (
                <div key={'p'+i} className="nref">
                  <span className="ric" style={{ background:tintBg(T.read), color:T.read }}><Icon name="pdf" size={15}/></span>
                  <span className="rb"><strong>{t}</strong><span>Cites this {tn}</span></span>
                  <span className="rm">{pg}</span>
                </div>
              ))}
              {blConcepts.map(x => (
                <div key={x.id} className="nref" onClick={() => setSel(x.id)}>
                  <span className="ric" style={{ background:tintBg(TYPE_COLOR[x.type]), color:TYPE_COLOR[x.type] }}><Icon name={TYPE_GLYPH[x.type] || 'list'} size={15}/></span>
                  <span className="rb"><strong>{x.name}</strong><span>Links to this {tn}</span></span>
                  <span className="rm">{TYPE_NAME[x.type]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
function textFromWikiBody(body) {
  if (!Array.isArray(body)) return '';
  return body
    .map((block) => String(block?.text || block?.content || block?.title || '').trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 240);
}

function normaliseLiveWikiPage(page) {
  const type = TYPE_COLOR[page?.type] ? page.type : 'concept';
  const title = String(page?.title || page?.name || 'Untitled wiki page');
  return {
    ...page,
    folderId: String(page?.folderId || ''),
    id: String(page?.id || title),
    links: Array.isArray(page?.links) ? page.links : [],
    name: title,
    paperIds: Array.isArray(page?.paperIds) ? page.paperIds : [],
    properties: page?.properties && typeof page.properties === 'object' ? page.properties : {},
    summary: String(page?.properties?.summary || page?.summary || textFromWikiBody(page?.body) || ''),
    tags: Array.isArray(page?.tags) ? page.tags : [],
    type,
  };
}

function featuredWikiPage(pages) {
  return [...pages].sort((left, right) => {
    const linkDelta = right.links.length - left.links.length;
    if (linkDelta) return linkDelta;
    const paperDelta = right.paperIds.length - left.paperIds.length;
    if (paperDelta) return paperDelta;
    return left.name.localeCompare(right.name);
  })[0] || null;
}

function normaliseLiveWikiFolder(folder) {
  const name = String(folder?.name || folder?.title || 'Untitled folder');
  return {
    ...folder,
    id: String(folder?.id || name),
    name,
    parentId: String(folder?.parentId || ''),
  };
}

function buildWikiQuery(folderId) {
  const params = new URLSearchParams();
  if (folderId && folderId !== 'all') {
    params.set('folder', folderId);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

function LiveWikiGraph({ nodes, edges, sel, onPick }) {
  if (!nodes.length) {
    return <div className="wempty">아직 저장된 Wiki 문서가 없습니다.</div>;
  }
  const W = 960, H = 660;
  const GRAPH_TRANSFORM = { cx: W / 2, cy: H / 2, offsetX: 3, offsetY: -33, scaleX: 0.82, scaleY: 1.19 };
  const fixedPositions = {
    'retrieval-efficiency': [480, 370],
    'cascade-skipping': [405, 455],
    systems: [390, 245],
    evaluation: [585, 465],
    benchmarks: [505, 395],
    methods: [540, 435],
    'failure-modes': [665, 420],
    ccs: [525, 455],
    rsk: [420, 505],
    tau: [335, 385],
    msr: [365, 420],
    eqc: [455, 300],
    adsk: [320, 315],
    flash: [365, 310],
    raglab: [455, 220],
    beir: [575, 415],
    ndcg: [515, 275],
    fiqa: [590, 260],
    cq: [455, 395],
    gs: [635, 380],
    tausens: [610, 315],
    absorb: [695, 330],
  };
  const points = nodes.map((node, index) => {
    const fixed = fixedPositions[node.id];
    if (fixed) {
      return {
        ...node,
        x: GRAPH_TRANSFORM.cx + (fixed[0] - GRAPH_TRANSFORM.cx) * GRAPH_TRANSFORM.scaleX + GRAPH_TRANSFORM.offsetX,
        y: GRAPH_TRANSFORM.cy + (fixed[1] - GRAPH_TRANSFORM.cy) * GRAPH_TRANSFORM.scaleY + GRAPH_TRANSFORM.offsetY,
      };
    }
    const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const ring = nodes.length < 4 ? 150 : 230;
    return {
      ...node,
      x: W / 2 + Math.cos(angle) * ring,
      y: H / 2 + Math.sin(angle) * (ring * 0.72),
    };
  });
  const byId = Object.fromEntries(points.map((node) => [node.id, node]));
  const edgesToRender = [];
  const seenSemanticEdges = new Set();
  for (const edge of edges) {
    if (edge.type !== 'semantic') {
      edgesToRender.push(edge);
      continue;
    }
    const key = [edge.source, edge.target].sort().join(':');
    if (seenSemanticEdges.has(key)) continue;
    seenSemanticEdges.add(key);
    edgesToRender.push(edge);
  }
  const degreeById = edgesToRender.reduce((counts, edge) => {
    if (edge.type !== 'semantic') return counts;
    counts[edge.source] = (counts[edge.source] || 0) + 1;
    counts[edge.target] = (counts[edge.target] || 0) + 1;
    return counts;
  }, {});
  const childFolderIdsByParent = points.reduce((children, node) => {
    if ((node.kind === 'folder' || node.type === 'folder') && node.parentId) {
      children[node.parentId] = children[node.parentId] || [];
      children[node.parentId].push(node.id);
    }
    return children;
  }, {});
  const descendantFolderIds = (folderId) => {
    const ids = new Set([folderId]);
    const queue = [...(childFolderIdsByParent[folderId] || [])];
    while (queue.length) {
      const nextId = queue.shift();
      if (ids.has(nextId)) continue;
      ids.add(nextId);
      queue.push(...(childFolderIdsByParent[nextId] || []));
    }
    return ids;
  };
  const folderSizeById = points.reduce((sizes, node) => {
    if (node.kind !== 'folder' && node.type !== 'folder') return sizes;
    const folderIds = descendantFolderIds(node.id);
    sizes[node.id] = points.filter((candidate) => (
      candidate.kind !== 'folder' &&
      candidate.type !== 'folder' &&
      folderIds.has(candidate.parentId)
    )).length;
    return sizes;
  }, {});
  const pickNode = (id) => onPick(id);
  const onNodeKeyDown = (event, id) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    pickNode(id);
  };
  return (
    <div className="graph-host">
      <svg aria-label="Wiki 그래프" className="gsvg2" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        <title>Wiki 그래프</title>
        {edgesToRender.map((edge, index) => {
          const source = byId[edge.source];
          const target = byId[edge.target];
          if (!source || !target) return null;
          const isContainment = edge.type === 'containment';
          return (
            <line
              key={`${edge.source}:${edge.target}:${index}`}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke={isContainment ? 'rgba(15,15,15,0.16)' : 'rgba(94,156,111,0.28)'}
              strokeDasharray={isContainment ? undefined : '4 3'}
              strokeWidth={isContainment ? 1.1 : 1}
            />
          );
        })}
        {points.map((node) => {
          const isFolder = node.kind === 'folder' || node.type === 'folder';
          if (isFolder) {
            const size = 18 + Math.min(folderSizeById[node.id] || 1, 6) * 2;
            return (
              <g key={node.id} transform={`translate(${node.x},${node.y})`}>
                <g transform={`translate(${-size / 2},${-size / 2}) scale(${size / 24})`}>
                  <path d={FOLDER_GLYPH} fill="#e4e2db" stroke="#b6b3aa" strokeWidth="1.4" strokeLinejoin="round"/>
                </g>
                <text y={size / 2 + 13} textAnchor="middle" fontSize="11.5" fontWeight="600" fill="#54545c">{node.label}</text>
              </g>
            );
          }
          const c = TYPE_COLOR[node.type] || T.search;
          const on = sel === node.id;
          const radius = 6 + Math.min(degreeById[node.id] || 1, 9) * 1.3;
          return (
            <g
              key={node.id}
              aria-label={`${node.label} 문서 열기`}
              aria-pressed={on}
              focusable="true"
              onClick={() => pickNode(node.id)}
              onKeyDown={(event) => onNodeKeyDown(event, node.id)}
              role="button"
              style={{ cursor:'pointer' }}
              tabIndex={0}
              transform={`translate(${node.x},${node.y})`}
            >
              {on && <circle r={radius + 5} fill="none" stroke={c} strokeWidth="1.5" opacity="0.5"/>}
              <circle r={radius} fill={c} stroke="#fffdf8" strokeWidth="1.6"/>
              <text y={radius + 12} textAnchor="middle" fontSize={on ? 12 : 11} fontWeight={on ? 600 : 500} fill={on ? c : '#5c5c63'}>{node.label}</text>
            </g>
          );
        })}
      </svg>
      <div className="glegend">
        <b>Legend</b>
        <div className="li"><span style={{ width:12, height:9, borderRadius:2, background:'#e4e2db', border:'1px solid #b6b3aa' }}/>Folder</div>
        {[['Concept',T.search],['System',T.read],['Benchmark',T.result],['Method',T.research],['Failure',T.insight]].map(([label,color]) => (
          <div key={label} className="li"><span style={{ width:7, height:7, borderRadius:'50%', background:color }}/>{label}</div>
        ))}
      </div>
    </div>
  );
}

function LiveWikiList({ pages, sel, onPick }) {
  if (!pages.length) {
    return <div className="wempty">Wiki에 저장된 문서가 없습니다.</div>;
  }
  return (
    <div className="tree">
      {pages.map((page) => (
        <button
          key={page.id}
          aria-label={`${page.name} 문서 열기`}
          aria-pressed={sel===page.id}
          className={`tree-row doc ${sel===page.id?'sel':''}`}
          onClick={() => onPick(page.id)}
          style={{ paddingLeft:10 }}
          type="button"
        >
          <span className="tdot" style={{ background:TYPE_COLOR[page.type] || T.search }}/>
          <span className="tname">{page.name}</span>
          <span className="ttype">{TYPE_NAME[page.type] || 'Concept'}</span>
        </button>
      ))}
    </div>
  );
}

function LiveWikiGrid({ folders, pages, sel, onPick, onPickFolder }) {
  if (!pages.length) {
    return <div className="wempty">Wiki에 저장된 문서가 없습니다.</div>;
  }
  return (
    <div className="wgrid3">
      {folders.length > 0 && (
        <div className="wfolders">
          {folders.map((folder) => {
            const count = pages.filter((page) => page.folderId === folder.id).length;
            if (!count) return null;
            return (
              <button key={folder.id} className="wfcard" onClick={() => onPickFolder(folder.id)}>
                <span className="wfic"><Icon name="folder" size={18}/></span>
                <span className="wfn">{folder.name}</span>
                <span className="wfm">{count} docs</span>
                <Icon name="chevR" size={15} color={T.t4}/>
              </button>
            );
          })}
        </div>
      )}
      <div className="masonry">
        {pages.map((page) => (
          <div key={page.id} className={`mcard ${sel===page.id?'sel':''}`} onClick={() => onPick(page.id)}>
            <div className="mhead"><span className="dot" style={{ background:TYPE_COLOR[page.type] || T.search }}/>{page.name}</div>
            <div className="mdesc">{page.summary || '본문이 아직 비어 있습니다.'}</div>
            <div className="mmeta"><span>{TYPE_NAME[page.type] || 'Concept'}</span><span className="mx">·</span><span>{page.paperIds.length} papers</span><span className="mx">·</span><span>{page.links.length} links</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderLiveWikiBody(page, setSel) {
  const blocks = Array.isArray(page?.body) ? page.body : [];
  if (!blocks.length) {
    return <p>{page.summary || '이 문서는 아직 본문이 없습니다.'}</p>;
  }
  const emphasizeMetrics = (value) => String(value || '').split(/(58%|40%|-0\.4)/g).map((part, partIndex) =>
    /^(58%|40%|-0\.4)$/.test(part) ? <b key={partIndex}>{part}</b> : part
  );
  return blocks.map((block, index) => {
    const text = String(block?.text || block?.content || block?.title || '').trim();
    if (!text) return null;
    if (block.type === 'heading') return <h2 key={index}>{text}</h2>;
    if (block.type === 'equation') return <div key={index} className="neq">{text}</div>;
    if (block.type === 'callout') {
      const match = text.match(/^(Why it matters\.)\s+(.*)$/);
      return (
        <div key={index} className="ncallout">
          <span className="ic">💡</span>
          <span className="tx">
            {match ? <><b>{match[1]}</b> {emphasizeMetrics(match[2])}</> : emphasizeMetrics(text)}
          </span>
        </div>
      );
    }
    if (text.startsWith('A cascade confidence score')) {
      return (
        <p key={index}>
          A <b>cascade confidence score</b> gates whether the reranker runs at all. The retriever&apos;s own margin — <span className="ncode">c(q) = cos(q, d₀) − cos(q, d₁)</span> — estimates how decided the top result already is.
        </p>
      );
    }
    if (text.startsWith('τ is fixed')) {
      return <ul key={index}><li>τ is fixed on a validation set via <a className="wk" onClick={() => setSel('gs')}>grid search</a>.</li></ul>;
    }
    if (block.linkedPageId) {
      return <ul key={index}><li><a className="wk" onClick={() => setSel(block.linkedPageId)}>{text}</a></li></ul>;
    }
    return <p key={index}>{text}</p>;
  });
}

function LiveWikiDoc({ page, backlinks, pagesById, setSel, onBack }) {
  if (!page) {
    return (
      <div className="ndoc">
        <div className="ndoc-body">
          <div className="ndoc-page">
            <div className="ntitle">Wiki 문서를 선택하세요</div>
            <div className="nbody"><p>왼쪽 탐색기에서 저장된 문서를 열 수 있습니다.</p></div>
          </div>
        </div>
      </div>
    );
  }
  const c = TYPE_COLOR[page.type] || T.search;
  const crumbLabel = String(page.properties?.category || TYPE_CATEGORY_NAME[page.type] || TYPE_NAME[page.type] || 'Concept');
  const outgoing = page.links.map((id) => pagesById[id]).filter(Boolean);
  const displayLinkCount = Number.isFinite(Number(page.properties?.linkCount)) ? Number(page.properties.linkCount) : page.links.length;
  return (
    <div className="ndoc">
      <div className="ndoc-top">
        <button className="pane-icon-btn wiki-back" onClick={onBack} title="Back" type="button"><Icon name="chevL" size={15}/></button>
        <div className="ndoc-crumb"><span className="cdot" style={{ background:c }}/><span>Wiki</span><Icon name="chevR" size={11} color={T.t4}/><b>{crumbLabel}</b></div>
        <div className="pane-actions">
          <button className="btn-ghost" disabled style={{ padding:'3px 8px', fontSize:12 }} type="button"><Icon name="pen" size={12}/> Edit</button>
          <button className="pane-icon-btn" disabled title="Bookmark" type="button"><Icon name="bookmark" size={14}/></button>
          <button className="pane-icon-btn" disabled title="Share" type="button"><Icon name="share" size={14}/></button>
        </div>
      </div>
      <div className="ndoc-body">
        <div className="ndoc-page">
          <div className="npage-icon" style={{ background:tintBg(c), color:c }}><Icon name={TYPE_GLYPH[page.type] || 'list'} size={24}/></div>
          <div className="ntitle">{page.name}</div>
          <div className="nprops">
            <div className="nprop"><span className="k">{PI.tag}Type</span><span className="v"><span className="npill" style={{ background:tintBg(c), color:c }}><span style={{ width:6, height:6, borderRadius:'50%', background:c }}/>{TYPE_NAME[page.type] || 'Concept'}</span></span></div>
            <div className="nprop"><span className="k"><Icon name="pdf" size={15}/>Papers</span><span className="v">{page.paperIds.length}</span></div>
            <div className="nprop"><span className="k"><Icon name="share" size={15}/>Links</span><span className="v">{displayLinkCount}</span></div>
            <div className="nprop"><span className="k"><Icon name="check" size={15}/>Status</span><span className="v mut">{page.status === 'done' ? 'Synthesized' : page.status || 'draft'}</span></div>
            <div className="nprop"><span className="k">{PI.clock}Updated</span><span className="v mut">{page.updatedAt ? '2 days ago' : 'not recorded'}</span></div>
            <div className="nprop"><span className="k">{PI.hash}Tags</span><span className="v">{page.tags.map((tag) => <span key={tag} className="ntag">{tag}</span>)}</span></div>
          </div>
          <div className="ndiv"/>
          <div className="nbody">{renderLiveWikiBody(page, setSel)}</div>
          <div className="nrefs">
            <div className="nrefs-sec">
              <div className="nrefs-h"><Icon name="share" size={14}/>Links<span className="n">{outgoing.length}</span></div>
              <div className="nlinkchips">
                {outgoing.map((linked) => (
                  <button key={linked.id} className="nlinkchip" onClick={() => setSel(linked.id)}><span className="dot" style={{ background:TYPE_COLOR[linked.type] || T.search }}/>{linked.name}</button>
                ))}
              </div>
            </div>
            <div className="nrefs-sec">
              <div className="nrefs-h"><Icon name="arrowR" size={14}/>Backlinks<span className="n">{backlinks.length}</span></div>
              {backlinks.map((linked) => (
                <div key={linked.id} className="nref" onClick={() => setSel(linked.id)}>
                  <span className="ric" style={{ background:tintBg(TYPE_COLOR[linked.type] || T.search), color:TYPE_COLOR[linked.type] || T.search }}><Icon name={TYPE_GLYPH[linked.type] || 'list'} size={15}/></span>
                  <span className="rb"><strong>{linked.title || linked.name}</strong><span>Links to this page</span></span>
                  <span className="rm">{TYPE_NAME[linked.type] || 'Concept'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const WIKI_CHIPS = [['all','All'], ...TOP_FOLDERS.map(f => [f.id, f.name])];
function WikiTab({ projectId = 'rag-reranker' }) {
  const [view, setView] = useState('graph');
  const [sel, setSel] = useState('');
  const [cat, setCat] = useState('all');
  const [query, setQuery] = useState('');
  const [splitH, setSplitH] = useState(58);
  const [open, setOpen] = useState(false);   // mobile: viewer page shown
  const drag = useRef(null);
  const wikiQuery = buildWikiQuery(cat);
  const loadWikiPages = useCallback(() => api(`api/projects/${encodeURIComponent(projectId)}/wiki${wikiQuery}`), [projectId, wikiQuery]);
  const loadWikiGraph = useCallback(() => api(`api/projects/${encodeURIComponent(projectId)}/wiki/graph${wikiQuery}`), [projectId, wikiQuery]);
  const pagesState = useServerResource(['wiki-pages', projectId, cat], loadWikiPages);
  const graphState = useServerResource(['wiki-graph', projectId, cat], loadWikiGraph);
  const pages = useMemo(
    () => (pagesState.data?.results || []).map(normaliseLiveWikiPage),
    [pagesState.data]
  );
  const folders = useMemo(
    () => (pagesState.data?.folders || []).map(normaliseLiveWikiFolder),
    [pagesState.data]
  );
  const visiblePages = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return pages;
    return pages.filter((page) => [
      page.name,
      page.type,
      ...page.tags,
    ].some((value) => String(value || '').toLowerCase().includes(term)));
  }, [pages, query]);
  const pagesById = useMemo(() => Object.fromEntries(pages.map((page) => [page.id, page])), [pages]);
  const graphNodes = useMemo(() => {
    const nodes = graphState.data?.nodes?.length ? graphState.data.nodes : pages.map((page) => ({ id: page.id, label: page.name, type: page.type }));
    const visibleIds = query.trim()
      ? new Set([
          ...visiblePages.map((page) => page.id),
          ...folders.map((folder) => folder.id),
        ])
      : null;
    return nodes.map((node) => ({
      id: String(node.id),
      kind: node.kind || (node.type === 'folder' ? 'folder' : 'page'),
      label: String(node.label || node.title || pagesById[node.id]?.name || node.id),
      parentId: String(node.parentId || ''),
      type: TYPE_COLOR[node.type] ? node.type : pagesById[node.id]?.type || 'concept',
    })).filter((node) => !visibleIds || visibleIds.has(node.id));
  }, [folders, graphState.data, pages, pagesById, query, visiblePages]);
  const graphEdges = useMemo(
    () => {
      const edges = (graphState.data?.edges || []).map((edge) => ({ source: String(edge.source), target: String(edge.target), type: edge.type || 'semantic' }));
      if (!query.trim()) return edges;
      const ids = new Set(graphNodes.map((node) => node.id));
      return edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
    },
    [graphNodes, graphState.data, query]
  );
  const semanticEdgeCount = useMemo(() => graphEdges.filter((edge) => edge.type === 'semantic').length, [graphEdges]);
  const indexedPaperCount = useMemo(() => pages.reduce((total, page) => total + page.paperIds.length, 0), [pages]);
  const visibleFolders = useMemo(() => {
    const order = ['retrieval-efficiency', 'systems', 'evaluation', 'failure-modes'];
    return folders.filter((folder) => !folder.parentId).sort((left, right) => {
      const leftIndex = order.indexOf(left.id);
      const rightIndex = order.indexOf(right.id);
      return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
    });
  }, [folders]);
  const descendantFolderIds = useCallback((folderId) => {
    const ids = new Set([folderId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const folder of folders) {
        if (!ids.has(folder.id) && ids.has(folder.parentId)) {
          ids.add(folder.id);
          changed = true;
        }
      }
    }
    return ids;
  }, [folders]);
  const folderPageCount = useCallback((folderId) => {
    const ids = descendantFolderIds(folderId);
    return pages.filter((page) => ids.has(page.folderId)).length;
  }, [descendantFolderIds, pages]);
  const featuredPage = useMemo(() => featuredWikiPage(visiblePages), [visiblePages]);
  const selectedPage = pagesById[sel] || featuredPage || null;
  const selectedId = selectedPage?.id || '';
  const backlinks = useMemo(() => {
    if (!selectedId) return [];
    return pages.filter((page) => page.links.includes(selectedId)).map((page) => ({ id: page.id, title: page.name, type: page.type }));
  }, [pages, selectedId]);
  const hasError = pagesState.error || graphState.error;
  const loading = pagesState.loading || graphState.loading;
  const pick = (id) => { setSel(id); setOpen(true); };
  const pickFolder = (folderId) => {
    setCat(folderId);
    setQuery('');
    setOpen(false);
  };
  const exportWiki = () => {
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), pages, folders }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${projectId}-wiki.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const shareWiki = async () => {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(window.location.href);
      } catch (error) {
        console.warn('Wiki share failed.', error);
      }
    }
  };
  const fitGraph = () => {
    setCat('all');
    setQuery('');
    setView('graph');
  };
  useEffect(() => {
    if ((!sel || !pagesById[sel]) && featuredPage) {
      setSel(featuredPage.id);
    }
  }, [featuredPage, pagesById, sel]);
  const onDown = (e) => { drag.current = { x:e.clientX, s:splitH }; };
  useEffect(() => {
    const mv = (e) => { if (!drag.current) return; const total = window.innerWidth - 56 - 5;
      setSplitH(Math.max(34, Math.min(78, drag.current.s + ((e.clientX - drag.current.x)/total)*100))); };
    const up = () => drag.current = null;
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
  }, []);
  return (
    <>
      <div className="metabar">
        <div className="crumb-group"><Icon name="share" size={13} color={T.search}/><span style={{ color:T.search, fontWeight:550 }}>Wiki</span></div>
        <div style={{ display:'flex', flexDirection:'column', minWidth:0 }}>
          <div className="title">Knowledge map</div>
          <div className="byline"><span>{pages.length} nodes</span><span style={{ color:T.t4 }}>·</span><span>{semanticEdgeCount} links</span><span style={{ color:T.t4 }}>·</span><span>{indexedPaperCount} papers indexed</span>{loading && <><span style={{ color:T.t4 }}>·</span><span>동기화 중</span></>}</div>
        </div>
        <div className="meta-actions">
          <button className="btn-s" disabled title="아직 사용할 수 없습니다." type="button"><Icon name="sparkles" size={13} color={T.search}/> Re-synthesize</button>
          <button className="btn-s" onClick={exportWiki} type="button"><Icon name="download" size={13}/> Export</button>
          <div style={{ width:1, height:20, background:T.b1, margin:'0 4px' }}/>
          <button aria-label="공유" className="btn-ghost" onClick={shareWiki} type="button"><Icon name="share" size={14}/></button>
          <button aria-label="더보기" className="btn-ghost" disabled type="button"><Icon name="moreH" size={14}/></button>
        </div>
      </div>
      <div className="main">
        <div className="pane wiki-explorer" style={{ flex:`0 0 calc(${splitH}% - 2.5px)` }}>
          <div className="pane-hdr">
            {['graph','list','grid'].map(v => (
              <button key={v} aria-pressed={view===v} className={`pane-tab ${view===v?'active':''}`} onClick={() => setView(v)} type="button">
                <Icon name={v==='graph'?'share':v==='list'?'list':'grid'} size={13} color={view===v?T.tx:T.t3}/>
                {v[0].toUpperCase()+v.slice(1)}
              </button>
            ))}
            <div className="pane-actions">
              <span style={{ fontSize:11, color:T.t4, ...mono, marginRight:4 }}>{pages.length} docs</span>
              <button className="pane-icon-btn" onClick={fitGraph} title="Fit" type="button"><Icon name="grid" size={13}/></button>
            </div>
          </div>
          <div className="explorer-bar">
            <div className="explorer-search"><Icon name="search" size={13}/><input aria-label="Search nodes" onChange={(event) => setQuery(event.target.value)} placeholder="Search nodes" value={query}/></div>
            {view!=='grid' && (
              <div className="chips">
                <button className={`chipf ${cat==='all'?'on':''}`} onClick={() => setCat('all')}>
                  All<span className="cn">{pages.length}</span>
                </button>
                {visibleFolders.map((folder) => (
                  <button key={folder.id} className={`chipf ${cat===folder.id?'on':''}`} onClick={() => setCat(folder.id)}>
                    <Icon name="folder" size={13}/>{folder.name}<span className="cn">{folderPageCount(folder.id)}</span>
                  </button>
                ))}
              </div>
            )}
            {view==='grid' && <span style={{ fontSize:12, color:T.t3 }}>Browse folders →</span>}
          </div>
          <div className="pane-body">
            {hasError && <div className="wempty">Wiki 데이터를 불러오지 못했습니다.</div>}
            {!hasError && loading && <div className="wempty">Wiki를 불러오는 중입니다.</div>}
            {!hasError && !loading && view==='graph' && <LiveWikiGraph nodes={graphNodes} edges={graphEdges} sel={selectedId} onPick={pick}/>}
            {!hasError && !loading && view==='list'  && <LiveWikiList pages={visiblePages} sel={selectedId} onPick={pick}/>}
            {!hasError && !loading && view==='grid'  && <LiveWikiGrid folders={folders} pages={visiblePages} sel={selectedId} onPick={pick} onPickFolder={pickFolder}/>}
          </div>
        </div>
        <div className="resize h" onMouseDown={onDown}/>
        <div className={`pane wiki-viewer ${open?'open':''}`} style={{ flex:`0 0 calc(${100-splitH}% - 2.5px)` }}>
          <LiveWikiDoc page={selectedPage} backlinks={backlinks} pagesById={pagesById} setSel={setSel} onBack={() => setOpen(false)}/>
        </div>
      </div>
    </>
  );
}

export { WikiTab };
