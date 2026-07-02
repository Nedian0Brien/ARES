import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Kbd, T, Tag, mono } from '../../components/primitives.jsx';
import { api } from '../../lib/api.js';
import { useServerResource } from '../../lib/serverState.js';
import { useAgentRunEvents } from '../../lib/sse.js';

const EV_KIND = {
  paper: { c:T.read,   ic:'pdf',   name:'Paper' },
  wiki:  { c:T.search, ic:'share', name:'Wiki'  },
  note:  { c:T.result, ic:'note',  name:'Note'  },
};
const AG_EVID = [
  { id:'e1', kind:'paper', src:'Adaptive Skipping',     loc:'§5.2 · p.7',     tag:'Sensitivity',  quote:'τ=0.6 is the BEIR-average sweet spot, yet FiQA and NFCorpus need τ∈[0.4, 0.5] to hold nDCG@10.' },
  { id:'e2', kind:'paper', src:'Lightweight Rerankers',  loc:'§4 · p.4',       tag:'Mechanism',    quote:'Weak first-stage retrieval surfaces more low-confidence queries, which shifts the optimal gate downward.' },
  { id:'e3', kind:'wiki',  src:'τ domain sensitivity',   loc:'Wiki · Failure', tag:'Failure mode', quote:'A τ tuned on one corpus does not transfer; the skip gain is absorbed once recall already saturates.' },
  { id:'e4', kind:'wiki',  src:'Confidence c(q)',        loc:'Wiki · Method',  tag:'Calibration',  quote:'c(q) is calibrated on in-domain dev sets, so out-of-domain queries are read as over-confident.' },
  { id:'e5', kind:'note',  src:'내 노트 — Limit',         loc:'Reading · p.9',  tag:'My note',      quote:'threshold τ는 데이터셋별 수동 튜닝 필요 → auto-τ regression으로 회귀하는 후속 아이디어.' },
];
const EV_IDX = Object.fromEntries(AG_EVID.map((e,i) => [e.id, i+1]));
const EV_BY_ID = Object.fromEntries(AG_EVID.map(e => [e.id, e]));
const AG_THREADS = [
  { id:'t1', title:'τ 도메인 민감도는 결국 어디서 오나?',        scope:'4 papers · Wiki · Note', n:6, when:'now', active:true, group:'오늘' },
  { id:'t2', title:'Reranker skip와 nDCG 손실 trade-off 정량화', scope:'3 papers',               n:4, when:'2h',  group:'오늘' },
  { id:'t3', title:'Cascade confidence c(q) 재현 설계 검토',     scope:'2 papers · Lab',         n:9, when:'어제', group:'이전' },
  { id:'t4', title:'BEIR vs 자체 split 점수 차이 원인 추적',     scope:'1 paper · Note',         n:5, when:'어제', group:'이전' },
];
const AG_SAVED = [
  { id:'s1', kind:'note',  title:'τ는 retrieval 품질의 대리변수 — 고정 τ 대신 도메인별 재캘리브레이션', dest:'Reading · Notes', when:'방금' },
  { id:'s2', kind:'flask', title:'auto-τ regression lane — c(q)를 도메인 난이도로 회귀',              dest:'Lab · Experiment', when:'방금' },
  { id:'s3', kind:'bulb',  title:'도메인 난이도 → 최적 τ 매핑 가설',                                  dest:'Idea',             when:'2h'  },
];
const SAVED_KIND = { note:{ c:T.result, ic:'note' }, flask:{ c:T.research, ic:'flask' }, bulb:{ c:T.read, ic:'bulb' }, wiki:{ c:T.search, ic:'share' } };

function Cite({ id, active, onPick }) {
  const ev = EV_BY_ID[id]; const k = EV_KIND[ev.kind]; const on = active===id;
  return (
    <span className="acite" title={`${k.name} · ${ev.src}`}
      onClick={() => onPick(id)}
      style={{ background:`color-mix(in srgb, ${k.c} ${on?'24':'13'}%, transparent)`, color:k.c, borderColor:`color-mix(in srgb, ${k.c} ${on?'52':'30'}%, transparent)` }}>
      {EV_IDX[id]}
    </span>
  );
}

function ConversationPane({ active, onPick, basis }) {
  const [traceOpen, setTraceOpen] = useState(true);
  const steps = [
    ['search', <>Library 5편에서 <b>"threshold τ"</b> 구절 검색</>, '11 hits'],
    ['book',   <><b>Adaptive Skipping §5.2</b> · Lightweight Rerankers §4 정독</>, '2 papers'],
    ['share',  <>Wiki <b>τ sensitivity</b> · <b>Confidence c(q)</b> 노드 대조</>, '2 nodes'],
    ['note',   <>내 노트 <b>n3</b>(τ 수동 튜닝) 연결</>, '1 note'],
  ];
  return (
    <div className="pane ag-conv" style={{ flex:basis }}>
      <div className="ag-chdr">
        <span className="ag-model"><Icon name="sparkles" size={14} color={T.writing}/>ARES Agent · claude-opus-4<Icon name="chevD" size={13} color={T.t4} style={{ marginLeft:1 }}/></span>
        <span className="ag-verify" onClick={() => onPick('e1')}><Icon name="quote" size={13}/> 근거 모두 보기</span>
      </div>
      <div className="ag-stream">
       <div className="ag-col">
        {/* user */}
        <div className="ag-turn user">
          <div className="ag-ubub">τ 도메인 민감도가 결국 어디서 오는지 정리해줘. 논문마다 다르게 말하는 것 같아.</div>
        </div>

        {/* assistant hero */}
        <div className="ag-turn assistant">
          <div className="ag-ava"><Icon name="sparkles" size={13} color={T.writing}/></div>
          <div className="ag-msg">
            <div className="trace">
              <div className="trace-h" onClick={() => setTraceOpen(o => !o)}>
                <Icon name="sparkles" size={13} color={T.t4}/>
                <span>4단계로 추론하고 16개 출처를 확인함</span>
                <Icon name={traceOpen?'chevD':'chevR'} size={14} color={T.t4} style={{ marginLeft:1 }}/>
              </div>
              {traceOpen && (
                <div className="trace-steps">
                  {steps.map(([ic,txt,res],i) => (
                    <div key={i} className="tstep">
                      <span className="ti"><Icon name={ic} size={13}/></span>
                      <span className="ttext">{txt}</span>
                      <span className="tres">{res}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="ans">
              <p>세 논문이 서로 다른 말을 하는 것처럼 보이지만, 같은 원인을 다른 층위에서 가리키고 있습니다. τ 민감도는 본질적으로 <b>first-stage retrieval 품질의 함수</b>입니다.</p>
              <div className="akey">
                <div className="akrow"><span className="an">1</span><span className="at"><b>측정 층위</b> — τ=0.6은 BEIR 평균에서의 sweet spot일 뿐, retrieval이 약한 FiQA·NFCorpus에서는 0.4–0.5로 낮춰야 nDCG@10이 유지됩니다.<Cite id="e1" active={active} onPick={onPick}/></span></div>
                <div className="akrow"><span className="an">2</span><span className="at"><b>메커니즘</b> — 약한 1차 검색은 저신뢰 쿼리를 더 많이 만들어 최적 gate를 끌어내립니다. 도메인 자체가 아니라 <em>retrieval 난이도</em>가 τ를 움직입니다.<Cite id="e2" active={active} onPick={onPick}/></span></div>
                <div className="akrow"><span className="an">3</span><span className="at"><b>캘리브레이션 결함</b> — c(q)가 in-domain dev에 맞춰져 out-of-domain에서 과신되고<Cite id="e4" active={active} onPick={onPick}/>, 그래서 한 코퍼스에서 맞춘 τ가 다른 코퍼스로 전이되지 않습니다.<Cite id="e3" active={active} onPick={onPick}/></span></div>
              </div>
              <div className="ans-bl">
                <span className="blic"><Icon name="bulb" size={15}/></span>
                <span className="blt"><b>정리</b> — τ는 도메인 상수가 아니라 retrieval 품질의 대리변수입니다. 고정 τ를 버리기보다 c(q)를 도메인별로 재캘리브레이션하거나, 당신 노트처럼 auto-τ를 회귀로 추정하는 방향이 맞습니다.<Cite id="e5" active={active} onPick={onPick}/> 이 결론은 Lab의 <b>auto-τ regression</b> lane으로 보낼 수 있어요.</span>
              </div>
              <div className="ans-act">
                <button className="ab" title="복사"><Icon name="quote" size={16}/></button>
                <button className="ab" title="다시 생성"><Icon name="sparkles" size={16}/></button>
                <span className="grow"/>
                <button className="ab lbl prime"><Icon name="bookmark" size={13}/> 저장</button>
                <button className="ab lbl"><Icon name="note" size={13}/> Note</button>
                <button className="ab lbl"><Icon name="bulb" size={13}/> Idea</button>
                <button className="ab lbl"><Icon name="flask" size={13} color={T.research}/> Lab</button>
              </div>
            </div>
          </div>
        </div>

        {/* follow-up */}
        <div className="ag-turn user">
          <div className="ag-ubub">그럼 고정 τ는 아예 쓰면 안 되는 거야?</div>
        </div>
        <div className="ag-turn assistant">
          <div className="ag-ava"><Icon name="sparkles" size={13} color={T.writing}/></div>
          <div className="ag-msg">
            <div className="trace-mini"><Icon name="share" size={13} color={T.t4}/> Wiki <b>Confidence c(q)</b> 1건 재확인 · 0.4s</div>
            <div className="ans">
              <p>아니요 — 단일 도메인 프로덕션이라면 고정 τ로 충분합니다. 문제는 <em>교차 도메인 일반화</em>를 주장할 때예요. c(q)가 잘 보정된 in-domain에서는 τ=0.6이 full-reranker 대비 nDCG −0.4로 거의 무손실입니다.<Cite id="e1" active={active} onPick={onPick}/></p>
            </div>
          </div>
        </div>
       </div>
      </div>

      <div className="ag-input">
        <div className="ag-input-col">
          <div className="ag-box">
            <div className="ag-attach">
              <span className="ag-scopechip"><Icon name="book" size={11} color={T.read}/> Library 5 <span className="x"><Icon name="x" size={11}/></span></span>
              <span className="ag-scopechip"><Icon name="share" size={11} color={T.search}/> Wiki <span className="x"><Icon name="x" size={11}/></span></span>
              <span className="ag-scopechip"><Icon name="note" size={11} color={T.result}/> Notes 3 <span className="x"><Icon name="x" size={11}/></span></span>
            </div>
            <textarea rows={1} placeholder="라이브러리 전체에 질문하기…"/>
            <div className="ag-tools">
              <button className="ag-tool icon" title="컨텍스트 추가"><Icon name="plus" size={16}/></button>
              <button className="ag-tool"><Icon name="layers" size={13}/> 컨텍스트</button>
              <span style={{ flex:1 }}/>
              <span className="ag-tool" style={{ cursor:'default' }}><Icon name="quote" size={13} color={T.writing}/> 근거 모드</span>
              <button className="ag-send"><Icon name="send" size={15} color="#fff"/></button>
            </div>
          </div>
          <div className="ag-disc">모든 답변에 다시 확인 가능한 근거가 부착됩니다 · 교차 문서 추론</div>
        </div>
      </div>
    </div>
  );
}

function EvidencePane({ active, onPick, basis }) {
  const [tab, setTab] = useState('evidence');
  const refs = useRef({});
  useEffect(() => {
    if (tab==='evidence' && active && refs.current[active]) refs.current[active].scrollIntoView({ behavior:'smooth', block:'nearest' });
  }, [active, tab]);
  const counts = AG_EVID.reduce((a,e) => (a[e.kind]=(a[e.kind]||0)+1, a), {});
  return (
    <div className="pane ag-evid" style={{ flex:basis }}>
      <div className="evid-top">
        <div className={`evid-tab ${tab==='evidence'?'on':''}`} onClick={() => setTab('evidence')}>
          <Icon name="quote" size={13} color={tab==='evidence'?T.tx:T.t3}/> Evidence <span className="cn">{AG_EVID.length}</span>
        </div>
        <div className={`evid-tab ${tab==='artifacts'?'on':''}`} onClick={() => setTab('artifacts')}>
          <Icon name="bookmark" size={13} color={tab==='artifacts'?T.tx:T.t3}/> Artifacts <span className="cn">{AG_SAVED.length}</span>
        </div>
        <div className="pane-actions"><button className="pane-icon-btn" title="Filter"><Icon name="list" size={13}/></button></div>
      </div>

      {tab==='evidence' && <>
        <div className="evid-sum">
          <span className="el">이 스레드 근거</span>
          <span className="evid-chip"><span className="d" style={{ background:T.read }}/>{counts.paper||0} papers</span>
          <span className="evid-chip"><span className="d" style={{ background:T.search }}/>{counts.wiki||0} wiki</span>
          <span className="evid-chip"><span className="d" style={{ background:T.result }}/>{counts.note||0} note</span>
        </div>
        <div className="evid-list">
          {AG_EVID.map(e => {
            const k = EV_KIND[e.kind];
            return (
              <div key={e.id} ref={el => refs.current[e.id]=el}
                className={`ecard ${active===e.id?'on':''}`}
                onClick={() => onPick(e.id)}>
                <div className="ecard-h">
                  <span className="ecard-n" style={{ background:k.c }}>{EV_IDX[e.id]}</span>
                  <div className="ecard-src"><b>{e.src}</b><span>{e.loc}</span></div>
                  <Icon name={k.ic} size={14} color={k.c}/>
                </div>
                <div className="ecard-q">{e.quote}</div>
                <div className="ecard-f">
                  <span className="ek" style={{ background:`color-mix(in srgb, ${k.c} 12%, transparent)`, color:k.c }}>{k.name}</span>
                  <span className="ek" style={{ background:T.s2, color:T.t3, border:`1px solid ${T.b1}` }}>{e.tag}</span>
                  <span className="eopen"><Icon name="arrowR" size={12}/> 원문 열기</span>
                </div>
              </div>
            );
          })}
        </div>
      </>}

      {tab==='artifacts' && (
        <div className="evid-list" style={{ paddingTop:14 }}>
          {AG_SAVED.map(s => {
            const k = SAVED_KIND[s.kind];
            return (
              <div key={s.id} className="art-card">
                <span className="art-ic" style={{ background:`color-mix(in srgb, ${k.c} 12%, transparent)` }}><Icon name={k.ic} size={16} color={k.c}/></span>
                <div className="art-b">
                  <b>{s.title}</b>
                  <div className="ad"><Icon name="arrowR" size={11}/><span>{s.dest}</span><span style={{ color:T.t4 }}>·</span><span style={mono}>{s.when}</span></div>
                </div>
                <span className="art-go"><Icon name="chevR" size={15}/></span>
              </div>
            );
          })}
          <div style={{ fontSize:11.5, color:T.t4, textAlign:'center', padding:'6px 0', lineHeight:1.5 }}>답변에서 만든 산출물이 여기 모입니다 ·<br/>Note · Idea · Lab lane으로 내보내짐</div>
        </div>
      )}
    </div>
  );
}

function normaliseThread(thread) {
  return {
    ...thread,
    display: thread?.display && typeof thread.display === 'object' && !Array.isArray(thread.display) ? thread.display : {},
    id: String(thread?.id || ''),
    messageIds: Array.isArray(thread?.messageIds) ? thread.messageIds : [],
    savedMessageIds: Array.isArray(thread?.savedMessageIds) ? thread.savedMessageIds : [],
    title: String(thread?.title || 'New thread'),
  };
}

function normaliseMessage(message) {
  return {
    ...message,
    artifacts: Array.isArray(message?.artifacts) ? message.artifacts : [],
    citations: Array.isArray(message?.citations) ? message.citations : [],
    display: message?.display && typeof message.display === 'object' && !Array.isArray(message.display) ? message.display : {},
    id: String(message?.id || ''),
    role: ['assistant', 'system', 'user'].includes(message?.role) ? message.role : 'user',
    text: String(message?.text || ''),
    trace: Array.isArray(message?.trace) ? message.trace : [],
  };
}

function evidenceFromMessages(messages) {
  return messages.flatMap((message) => message.citations.map((citation, index) => ({
    id: String(citation.id || citation.evidenceLinkId || `${message.id}-citation-${index}`),
    kind: citation.kind || 'wiki',
    loc: citation.loc || citation.location || '',
    quote: citation.quote || citation.text || '',
    src: citation.src || citation.title || citation.sourceTitle || 'Evidence',
    tag: citation.tag || citation.type || 'Citation',
  })));
}

function savedFromMessages(messages) {
  return messages.flatMap((message) => message.artifacts.map((artifact, index) => ({
    id: String(artifact.id || `${message.id}-artifact-${index}`),
    kind: artifact.kind || 'note',
    title: artifact.title || artifact.name || 'Saved artifact',
    dest: artifact.dest || artifact.target || 'Saved',
    when: artifact.when || '',
  })));
}

function activateRoleButton(event, action) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  action();
}

function evidenceMaps(evidence) {
  const byId = new Map();
  const indexById = new Map();
  evidence.forEach((item, index) => {
    byId.set(item.id, item);
    indexById.set(item.id, index + 1);
  });
  return { byId, indexById };
}

function EmphasizedTraceText({ text }) {
  const pattern = /(Adaptive Skipping §5\.2|τ sensitivity|Confidence c\(q\)|n3|"threshold τ")/g;
  return String(text || '').split(pattern).map((part, index) => (
    part.match(pattern) ? <b key={index}>{part}</b> : part
  ));
}

function EvidenceCite({ active, byId, id, indexById, onPick }) {
  const item = byId.get(id);
  if (!item) return null;
  const kind = EV_KIND[item.kind] || EV_KIND.wiki;
  const on = active === id;
  return (
    <span
      className="acite"
      title={`${kind.name} · ${item.src}`}
      onClick={() => onPick(id)}
      style={{ background:`color-mix(in srgb, ${kind.c} ${on?'24':'13'}%, transparent)`, color:kind.c, borderColor:`color-mix(in srgb, ${kind.c} ${on?'52':'30'}%, transparent)` }}
    >
      {indexById.get(id) || ''}
    </span>
  );
}

function AnswerCites({ active, byId, citationIds = [], indexById, onPick }) {
  return citationIds.map((id) => (
    <EvidenceCite key={id} active={active} byId={byId} id={id} indexById={indexById} onPick={onPick}/>
  ));
}

function AnswerParts({ active, byId, indexById, onPick, section }) {
  if (!Array.isArray(section.parts) || section.parts.length === 0) {
    return <>{section.text}<AnswerCites active={active} byId={byId} citationIds={section.citationIds} indexById={indexById} onPick={onPick}/></>;
  }

  return section.parts.map((part, index) => {
    const citationId = part.citationId || part.cite;
    if (citationId) {
      return <EvidenceCite key={`cite-${index}-${citationId}`} active={active} byId={byId} id={citationId} indexById={indexById} onPick={onPick}/>;
    }

    const text = String(part.text || '');
    if (!text) return null;
    if (part.bold) return <b key={`part-${index}`}>{text}</b>;
    if (part.em) return <em key={`part-${index}`}>{text}</em>;
    return <span key={`part-${index}`}>{text}</span>;
  });
}

function StructuredAnswer({ active, byId, display, indexById, message, onPick }) {
  const sections = Array.isArray(display.sections) ? display.sections : [];
  const paragraphs = sections.filter((section) => section.kind === 'paragraph');
  const keys = sections.filter((section) => section.kind === 'key');
  const callouts = sections.filter((section) => section.kind === 'callout');
  if (!sections.length) {
    return <p>{message.text}</p>;
  }
  return (
    <>
      {paragraphs.map((section, index) => (
        <p key={`p-${index}`}><AnswerParts active={active} byId={byId} indexById={indexById} onPick={onPick} section={section}/></p>
      ))}
      {keys.length > 0 && (
        <div className="akey">
          {keys.map((section, index) => (
            <div key={`key-${index}`} className="akrow">
              <span className="an">{section.number || index + 1}</span>
              <span className="at"><b>{section.label}</b> — <AnswerParts active={active} byId={byId} indexById={indexById} onPick={onPick} section={section}/></span>
            </div>
          ))}
        </div>
      )}
      {callouts.map((section, index) => (
        <div key={`callout-${index}`} className="ans-bl">
          <span className="blic"><Icon name={section.icon || 'bulb'} size={15}/></span>
          <span className="blt"><b>{section.label || '정리'}</b> — <AnswerParts active={active} byId={byId} indexById={indexById} onPick={onPick} section={section}/></span>
        </div>
      ))}
    </>
  );
}

function latestDisplay(messages) {
  return [...messages].reverse().map((message) => message.display || {}).find((display) =>
    display.modelLabel || display.contextChips || display.footerText
  ) || {};
}

function LiveConversationPane({ active, basis, evidence, evidenceCount, evidenceTriggerRef, loadError, messages, onOpenEvidence, onPick, onSaveMessage, onSend, pending, savingKey, sendStatus }) {
  const [draft, setDraft] = useState('');
  const [traceOpen, setTraceOpen] = useState(true);
  const { byId, indexById } = useMemo(() => evidenceMaps(evidence), [evidence]);
  const display = latestDisplay(messages);
  const contextChips = Array.isArray(display.contextChips) && display.contextChips.length
    ? display.contextChips
    : [
      { icon:'book', label:'Library' },
      { icon:'share', label:'Wiki' },
    ];
  const modelLabel = display.modelLabel || 'grounded chat';
  const submit = (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || pending) return;
    setDraft('');
    onSend(text);
  };
  return (
    <div className="pane ag-conv" style={{ flex:basis }}>
      <div className="ag-chdr">
        <span className="ag-model"><Icon name="sparkles" size={14} color={T.writing}/>ARES Agent · {modelLabel}<Icon name="chevD" size={13} color={T.t4} style={{ marginLeft:1 }}/></span>
        <button
          ref={evidenceTriggerRef}
          type="button"
          className="ag-verify"
          disabled={loadError}
          onClick={onOpenEvidence}
          aria-label={`근거 모두 보기 (${evidenceCount})`}
        >
          <Icon name="quote" size={13}/> 근거 모두 보기
        </button>
      </div>
      <div className="ag-stream">
        <div className="ag-col">
          {loadError && (
            <div className="ag-turn assistant">
              <div className="ag-ava"><Icon name="sparkles" size={13} color={T.writing}/></div>
              <div className="ag-msg">
                <div className="ans"><p>Agent 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p></div>
              </div>
            </div>
          )}
          {!loadError && !messages.length && (
            <div className="ag-turn assistant">
              <div className="ag-ava"><Icon name="sparkles" size={13} color={T.writing}/></div>
              <div className="ag-msg">
                <div className="ans"><p>질문을 입력하면 이 스레드에 저장됩니다. 답변 생성은 연결되면 근거와 함께 표시됩니다.</p></div>
              </div>
            </div>
          )}
          {messages.map((message) => (
            <div key={message.id} className={`ag-turn ${message.role === 'user' ? 'user' : 'assistant'}`}>
              {message.role === 'user' ? (
                <div className="ag-ubub">{message.text}</div>
              ) : (
                <>
                  <div className="ag-ava"><Icon name="sparkles" size={13} color={T.writing}/></div>
                  <div className="ag-msg">
                    {message.trace.length > 0 && (
                      <div className="trace">
                        <div className="trace-h" onClick={() => setTraceOpen((open) => !open)}>
                          <Icon name="sparkles" size={13} color={T.t4}/>
                          <span>{message.display.traceSummary || `${message.trace.length} steps`}</span>
                          <Icon name={traceOpen?'chevD':'chevR'} size={14} color={T.t4} style={{ marginLeft:1 }}/>
                        </div>
                        {traceOpen && (
                          <div className="trace-steps">
                            {message.trace.map((step, index) => (
                              <div key={index} className="tstep">
                                <span className="ti"><Icon name={step.icon || 'sparkles'} size={13}/></span>
                                <span className="ttext"><EmphasizedTraceText text={step.text || step.title || 'Step'}/></span>
                                <span className="tres">{step.result || ''}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="ans">
                      <StructuredAnswer active={active} byId={byId} display={message.display || {}} indexById={indexById} message={message} onPick={onPick}/>
                      <div className="ans-act">
                        <button
                          type="button"
                          className="ab lbl prime"
                          disabled={Boolean(savingKey)}
                          onClick={() => onSaveMessage(message, 'note')}
                          title="Note에 저장"
                        >
                          <Icon name="bookmark" size={13}/> 저장
                        </button>
                        <button
                          type="button"
                          className="ab lbl"
                          disabled={Boolean(savingKey)}
                          onClick={() => onSaveMessage(message, 'note')}
                          title="Note에 저장"
                        >
                          <Icon name="note" size={13}/> Note
                        </button>
                        <button
                          type="button"
                          className="ab lbl"
                          disabled={Boolean(savingKey)}
                          onClick={() => onSaveMessage(message, 'idea')}
                          title="Idea로 저장"
                        >
                          <Icon name="bulb" size={13}/> Idea
                        </button>
                        <button
                          type="button"
                          className="ab lbl"
                          disabled={Boolean(savingKey)}
                          onClick={() => onSaveMessage(message, 'lab')}
                          title="Lab으로 저장"
                        >
                          <Icon name="flask" size={13} color={T.research}/> Lab
                        </button>
                        <button
                          type="button"
                          className="ab lbl"
                          disabled={Boolean(savingKey)}
                          onClick={() => onSaveMessage(message, 'wiki')}
                          title="Wiki로 저장"
                        >
                          <Icon name="share" size={13} color={T.search}/> Wiki
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
      <form className="ag-input" onSubmit={submit}>
        <div className="ag-input-col">
            <div className="ag-box">
              <div className="ag-attach">
                {contextChips.map((chip, index) => (
                  <span key={`${chip.label}-${index}`} className="ag-scopechip"><Icon name={chip.icon || 'layers'} size={11} color={chip.icon === 'note' ? T.result : chip.icon === 'share' ? T.search : T.read}/> {chip.label} <span className="x"><Icon name="x" size={11}/></span></span>
                ))}
              </div>
            <textarea rows={1} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="라이브러리 전체에 질문하기..."/>
            <div className="ag-tools">
              <button type="button" className="ag-tool icon" disabled title="컨텍스트 추가"><Icon name="plus" size={16}/></button>
              <button type="button" className="ag-tool" disabled><Icon name="layers" size={13}/> 컨텍스트</button>
              <span style={{ flex:1 }}/>
              <span className="ag-tool" style={{ cursor:'default' }}><Icon name="quote" size={13} color={T.writing}/> 근거 모드</span>
              <button className="ag-send" disabled={pending || !draft.trim()}><Icon name="send" size={15} color="#fff"/></button>
            </div>
          </div>
          <div className="ag-disc">{sendStatus || display.footerText || '모든 답변에는 다시 확인 가능한 근거가 붙습니다.'}</div>
        </div>
      </form>
    </div>
  );
}

function LiveEvidencePane({ active, artifacts, basis, evidence, mobileOpen, onClose, onPick }) {
  const [tab, setTab] = useState('evidence');
  const closeButtonRef = useRef(null);
  const refs = useRef({});
  useEffect(() => {
    if (tab==='evidence' && active && refs.current[active]) refs.current[active].scrollIntoView({ behavior:'smooth', block:'nearest' });
  }, [active, tab]);
  useEffect(() => {
    if (mobileOpen) {
      closeButtonRef.current?.focus({ preventScroll:true });
    }
  }, [mobileOpen]);
  const onSheetKeyDown = (event) => {
    if (!mobileOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(event.currentTarget.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'))
      .filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const counts = evidence.reduce((acc, item) => {
    acc[item.kind] = (acc[item.kind] || 0) + 1;
    return acc;
  }, {});
  return (
    <div
      className={`pane ag-evid ${mobileOpen ? 'mobile-open' : ''}`}
      style={{ flex:basis }}
      role={mobileOpen ? 'dialog' : 'region'}
      aria-modal={mobileOpen ? 'true' : undefined}
      aria-label="Agent 근거 원장"
      onKeyDown={onSheetKeyDown}
    >
      <div className="evid-top">
        <div
          className={`evid-tab ${tab==='evidence'?'on':''}`}
          role="button"
          tabIndex={0}
          onClick={() => setTab('evidence')}
          onKeyDown={(event) => activateRoleButton(event, () => setTab('evidence'))}
          aria-pressed={tab === 'evidence'}
        >
          <Icon name="quote" size={13} color={tab==='evidence'?T.tx:T.t3}/> Evidence <span className="cn">{evidence.length}</span>
        </div>
        <div
          className={`evid-tab ${tab==='artifacts'?'on':''}`}
          role="button"
          tabIndex={0}
          onClick={() => setTab('artifacts')}
          onKeyDown={(event) => activateRoleButton(event, () => setTab('artifacts'))}
          aria-pressed={tab === 'artifacts'}
        >
          <Icon name="bookmark" size={13} color={tab==='artifacts'?T.tx:T.t3}/> Artifacts <span className="cn">{artifacts.length}</span>
        </div>
        <div className="pane-actions">
          <button className="pane-icon-btn" disabled title="Filter"><Icon name="list" size={13}/></button>
        </div>
        <button ref={closeButtonRef} type="button" className="pane-icon-btn mobile-evid-close" onClick={onClose} aria-label="근거 닫기">
          <Icon name="x" size={16}/>
        </button>
      </div>
      {tab==='evidence' && (
        <>
          <div className="evid-sum">
            <span className="el">이 스레드 근거</span>
            <span className="evid-chip"><span className="d" style={{ background:T.read }}/>{counts.paper||0} papers</span>
            <span className="evid-chip"><span className="d" style={{ background:T.search }}/>{counts.wiki||0} wiki</span>
            <span className="evid-chip"><span className="d" style={{ background:T.result }}/>{counts.note||0} note</span>
          </div>
          <div className="evid-list">
            {!evidence.length && <div style={{ fontSize:12, color:T.t4, textAlign:'center', padding:'28px 18px', lineHeight:1.5 }}>아직 연결된 근거가 없습니다.</div>}
            {evidence.map((item, index) => {
              const kind = EV_KIND[item.kind] || EV_KIND.wiki;
              return (
                <div key={item.id} ref={(el) => refs.current[item.id]=el}
                  role="button"
                  tabIndex={0}
                  className={`ecard ${active===item.id?'on':''}`}
                  onFocus={() => onPick(item.id)}
                  onClick={() => onPick(item.id)}
                  onKeyDown={(event) => activateRoleButton(event, () => onPick(item.id))}
                  aria-pressed={active === item.id}>
                  <div className="ecard-h">
                    <span className="ecard-n" style={{ background:kind.c }}>{index + 1}</span>
                    <div className="ecard-src"><b>{item.src}</b><span>{item.loc}</span></div>
                    <Icon name={kind.ic} size={14} color={kind.c}/>
                  </div>
                  <div className="ecard-q">{item.quote || '근거 원문이 아직 저장되지 않았습니다.'}</div>
                  <div className="ecard-f">
                    <span className="ek" style={{ background:`color-mix(in srgb, ${kind.c} 12%, transparent)`, color:kind.c }}>{kind.name}</span>
                    <span className="ek" style={{ background:T.s2, color:T.t3, border:`1px solid ${T.b1}` }}>{item.tag}</span>
                    <span className="eopen"><Icon name="arrowR" size={12}/> 원문 열기</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {tab==='artifacts' && (
        <div className="evid-list" style={{ paddingTop:14 }}>
          {!artifacts.length && <div style={{ fontSize:12, color:T.t4, textAlign:'center', padding:'28px 18px', lineHeight:1.5 }}>저장된 산출물이 없습니다.</div>}
          {artifacts.map((artifact) => {
            const kind = SAVED_KIND[artifact.kind] || SAVED_KIND.note;
            return (
              <div key={artifact.id} className="art-card">
                <span className="art-ic" style={{ background:`color-mix(in srgb, ${kind.c} 12%, transparent)` }}><Icon name={kind.ic} size={16} color={kind.c}/></span>
                <div className="art-b">
                  <b>{artifact.title}</b>
                  <div className="ad"><Icon name="arrowR" size={11}/><span>{artifact.dest}</span>{artifact.when && <span style={mono}>{artifact.when}</span>}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function groupedThreads(threads) {
  const groups = [];
  for (const thread of threads) {
    const label = thread.display?.group || 'Threads';
    let group = groups.find((entry) => entry.label === label);
    if (!group) {
      group = { label, threads: [] };
      groups.push(group);
    }
    group.threads.push(thread);
  }
  return groups;
}

function threadMeta(thread) {
  const scope = thread.display?.scope || `${thread.messageIds.length} messages`;
  const when = thread.display?.activity || thread.display?.when || (thread.updatedAt ? new Date(thread.updatedAt).toLocaleDateString() : '');
  return { scope, when };
}

function threadOrder(thread) {
  const order = Number(thread.display?.order);
  return Number.isFinite(order) ? order : null;
}

function AgentPanel({ activeThreadId, loadError, onCreateThread, onSelectThread, pending, savedItems = [], threads }) {
  const [sub, setSub] = useState('threads');
  const groups = groupedThreads(threads);
  return (
    <div className="float-panel agent-panel">
      <div className="fp-subnav">
        <button className={sub==='threads'?'on':''} onClick={() => setSub('threads')}><Icon name="chat" size={12}/> Threads</button>
        <button className={sub==='saved'?'on':''} onClick={() => setSub('saved')}><Icon name="bookmark" size={12}/> Saved</button>
      </div>
      {sub==='threads' && (
        <div className="fp-body">
          <button className="ag-newt" onClick={onCreateThread} disabled={pending}><Icon name="plus" size={13}/> 새 스레드</button>
          <div>
            {loadError && <div style={{ fontSize:12, color:T.t4, padding:'12px 6px', lineHeight:1.45 }}>Agent 데이터를 불러오지 못했습니다.</div>}
            {!loadError && !threads.length && <div style={{ fontSize:12, color:T.t4, padding:'12px 6px', lineHeight:1.45 }}>아직 스레드가 없습니다.</div>}
            {groups.map((group) => (
              <div key={group.label}>
                <div className="ag-grp">{group.label}</div>
                {group.threads.map((thread) => {
                  const meta = threadMeta(thread);
                  return (
                    <button key={thread.id} className={`ag-thread ${thread.id===activeThreadId?'active':''}`} onClick={() => onSelectThread(thread.id)}>
                      <div className="tt">{thread.title}</div>
                      <div className="tm"><Icon name="layers" size={11} color={T.t4}/><span>{meta.scope}</span><span style={{ marginLeft:'auto' }} className="mono">{meta.when}</span></div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
      {sub==='saved' && (
        <div className="fp-body" style={{ paddingTop:8 }}>
          {!savedItems.length && <div style={{ fontSize:12, color:T.t4, padding:'12px 6px', lineHeight:1.45 }}>저장된 답변이 없습니다.</div>}
          {savedItems.map((item) => {
            const kind = SAVED_KIND[item.kind] || SAVED_KIND.note;
            return (
              <div key={item.id} className="art-card">
                <span className="art-ic" style={{ background:`color-mix(in srgb, ${kind.c} 12%, transparent)` }}><Icon name={kind.ic} size={16} color={kind.c}/></span>
                <div className="art-b">
                  <b>{item.title}</b>
                  <div className="ad"><Icon name="arrowR" size={11}/><span>{item.dest}</span>{item.when && <span style={mono}>{item.when}</span>}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AgentTab({ projectId = 'rag-reranker' }) {
  const [active, setActive] = useState(null);
  const [activeThreadId, setActiveThreadId] = useState('');
  const [activeAgentRunId, setActiveAgentRunId] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [pending, setPending] = useState(false);
  const [savingKey, setSavingKey] = useState('');
  const [sendStatus, setSendStatus] = useState('');
  const [splitH, setSplitH] = useState(63);
  const [mobileEvidenceOpen, setMobileEvidenceOpen] = useState(false);
  const drag = useRef(null);
  const evidenceTriggerRef = useRef(null);
  const loadThreads = useCallback(() => api(`api/projects/${encodeURIComponent(projectId)}/agent/threads`), [projectId]);
  const threadsState = useServerResource(['agent-threads', projectId, refreshVersion], loadThreads);
  const threads = useMemo(
    () => (threadsState.data?.results || []).map(normaliseThread).sort((left, right) => {
      const leftOrder = threadOrder(left);
      const rightOrder = threadOrder(right);
      if (leftOrder !== null || rightOrder !== null) {
        return (leftOrder ?? Number.MAX_SAFE_INTEGER) - (rightOrder ?? Number.MAX_SAFE_INTEGER);
      }
      return Date.parse(right.updatedAt || right.createdAt || '') - Date.parse(left.updatedAt || left.createdAt || '');
    }),
    [threadsState.data]
  );
  const selectedThread = threads.find((thread) => thread.id === activeThreadId) || threads[0] || null;
  const selectedThreadId = selectedThread?.id || '';
  const loadMessages = useCallback(
    () => api(`api/projects/${encodeURIComponent(projectId)}/agent/threads/${encodeURIComponent(selectedThreadId)}/messages`),
    [projectId, selectedThreadId]
  );
  const messagesState = useServerResource(['agent-messages', projectId, selectedThreadId, refreshVersion], loadMessages, { enabled: Boolean(selectedThreadId) });
  const messages = useMemo(() => (messagesState.data?.messages || []).map(normaliseMessage), [messagesState.data]);
  const evidence = useMemo(() => evidenceFromMessages(messages), [messages]);
  const artifacts = useMemo(() => savedFromMessages(messages), [messages]);
  const loadError = Boolean(threadsState.error || messagesState.error);
  const agentRunEvents = useAgentRunEvents(activeAgentRunId);
  useEffect(() => {
    if (!activeThreadId && threads[0]) {
      setActiveThreadId(threads[0].id);
    }
  }, [activeThreadId, threads]);
  useEffect(() => {
    setMobileEvidenceOpen(false);
  }, [loadError, selectedThreadId]);
  useEffect(() => {
    const run = agentRunEvents.latestRun?.run || agentRunEvents.latestRun;
    const status = String(run?.status || '').toLowerCase();
    if (!activeAgentRunId || !['canceled', 'done', 'error'].includes(status)) {
      return;
    }

    setRefreshVersion((value) => value + 1);
    setActiveAgentRunId('');
    if (status === 'done') {
      setSendStatus('답변이 도착했습니다.');
    } else if (status === 'canceled') {
      setSendStatus('답변 생성이 취소되었습니다.');
    } else {
      setSendStatus('답변을 만들지 못했습니다. 다시 시도해 주세요.');
    }
  }, [activeAgentRunId, agentRunEvents.latestRun]);
  const createThread = async () => {
    if (pending) return;
    setPending(true);
    setSendStatus('');
    try {
      const result = await api(`api/projects/${encodeURIComponent(projectId)}/agent/threads`, {
        method: 'POST',
        body: { title: 'New thread' },
      });
      setActiveThreadId(result.thread.id);
      setRefreshVersion((value) => value + 1);
    } catch (error) {
      setSendStatus(error.message || '스레드를 만들지 못했습니다.');
    } finally {
      setPending(false);
    }
  };
  const sendMessage = async (text) => {
    let threadId = selectedThreadId;
    setPending(true);
    setSendStatus('');
    try {
      if (!threadId) {
        const result = await api(`api/projects/${encodeURIComponent(projectId)}/agent/threads`, {
          method: 'POST',
          body: { title: text.slice(0, 80) || 'New thread' },
        });
        threadId = result.thread.id;
        setActiveThreadId(threadId);
      }
      const result = await api(`api/projects/${encodeURIComponent(projectId)}/agent/threads/${encodeURIComponent(threadId)}/messages`, {
        method: 'POST',
        body: { role: 'user', text },
      });
      if (result.agentRun?.id && result.assistantQueued) {
        setActiveAgentRunId(result.agentRun.id);
      } else {
        setActiveAgentRunId('');
      }
      setSendStatus(
        result.assistantGenerated
          ? ''
          : result.assistantQueued
            ? '답변을 준비 중입니다.'
            : result.generationStatus === 'error'
              ? '답변을 만들지 못했습니다. 다시 시도해 주세요.'
              : '질문이 저장되었습니다. 답변 생성은 준비 중입니다.'
      );
      setRefreshVersion((value) => value + 1);
    } catch (error) {
      setSendStatus(error.message || '메시지를 보내지 못했습니다.');
    } finally {
      setPending(false);
    }
  };
  const saveMessage = async (message, target) => {
    if (!selectedThreadId || !message?.id || savingKey) return;
    const key = `${message.id}:${target}`;
    setSavingKey(key);
    setSendStatus('');
    try {
      const result = await api(`api/projects/${encodeURIComponent(projectId)}/agent/threads/${encodeURIComponent(selectedThreadId)}/messages/${encodeURIComponent(message.id)}/save`, {
        method: 'POST',
        body: {
          target,
          title: message.text.slice(0, 80),
        },
      });
      const label = result.target === 'lab' ? 'Lab' : result.target === 'idea' ? 'Idea' : result.target === 'wiki' ? 'Wiki' : 'Note';
      setSendStatus(`${label}에 저장했습니다.`);
      setRefreshVersion((value) => value + 1);
    } catch (error) {
      setSendStatus(error.message || '저장하지 못했습니다.');
    } finally {
      setSavingKey('');
    }
  };
  const closeMobileEvidence = useCallback(() => {
    setMobileEvidenceOpen(false);
    requestAnimationFrame(() => evidenceTriggerRef.current?.focus({ preventScroll:true }));
  }, []);
  const openEvidenceLedger = useCallback(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      setMobileEvidenceOpen(true);
      return;
    }
    if (evidence[0]) {
      setActive(evidence[0].id);
    }
  }, [evidence]);
  const onDown = (e) => { drag.current = { x:e.clientX, s:splitH }; };
  useEffect(() => {
    const mv = (e) => { if (!drag.current) return; const total = window.innerWidth - 56 - 288 - 5;
      setSplitH(Math.max(40, Math.min(74, drag.current.s + ((e.clientX - drag.current.x)/total)*100))); };
    const up = () => drag.current = null;
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
  }, []);
  const thread = selectedThread || { title:'Agent', messageIds:[] };
  const headerByline = thread.display?.scope
    ? [`${thread.display.scope} in context`, `${evidence.length} evidence`]
    : [`${messages.length} messages`, `${evidence.length} evidence`];
  return (
    <>
      <div className="metabar">
        <div className="crumb-group"><Icon name="sparkles" size={13} color={T.writing}/><span style={{ color:T.writing, fontWeight:550 }}>Agent</span></div>
        <div style={{ display:'flex', flexDirection:'column', minWidth:0 }}>
          <div className="title">{thread.title}</div>
          <div className="byline"><span>{headerByline[0]}</span><span style={{ color:T.t4 }}>·</span><span>{headerByline[1]}</span></div>
        </div>
        <div className="meta-actions">
          <button className="btn-s" onClick={createThread} disabled={pending}><Icon name="plus" size={13}/> 새 스레드</button>
          <button className="btn-s" disabled={loadError} onClick={openEvidenceLedger} type="button"><Icon name="layers" size={13}/> Context</button>
          <div style={{ width:1, height:20, background:T.b1, margin:'0 4px' }}/>
          <button aria-label="공유" className="btn-ghost" disabled><Icon name="share" size={14}/></button>
          <button aria-label="더보기" className="btn-ghost" disabled><Icon name="moreH" size={14}/></button>
        </div>
      </div>
      <div className="main">
        <AgentPanel activeThreadId={selectedThreadId} loadError={loadError} onCreateThread={createThread} onSelectThread={setActiveThreadId} pending={pending} savedItems={artifacts} threads={threads}/>
        <div className="split">
          <LiveConversationPane active={active} basis={`0 0 calc(${splitH}% - 2.5px)`} evidence={evidence} evidenceCount={evidence.length} evidenceTriggerRef={evidenceTriggerRef} loadError={loadError} messages={messages} onOpenEvidence={openEvidenceLedger} onPick={setActive} onSaveMessage={saveMessage} onSend={sendMessage} pending={pending || messagesState.loading || threadsState.loading} savingKey={savingKey} sendStatus={sendStatus}/>
          <div className="resize h" onMouseDown={onDown}/>
          <LiveEvidencePane active={active} artifacts={artifacts} basis={`0 0 calc(${100-splitH}% - 2.5px)`} evidence={evidence} mobileOpen={mobileEvidenceOpen} onClose={closeMobileEvidence} onPick={setActive}/>
        </div>
      </div>
    </>
  );
}

export { AgentTab };
