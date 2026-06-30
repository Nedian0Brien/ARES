import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Kbd, StatusIcon, T, Tag, mono } from '../../components/primitives.jsx';
import { api, appUrl } from '../../lib/api.js';
import { createPdfSmartSelectionController } from '../../lib/pdfSelection.js';
import { invalidateServerResource, useServerResource } from '../../lib/serverState.js';
import { COLLECTIONS, SHELVES, STATUS_C, libStatus, shelfMatch } from '../../mock/reading.js';
import { hydrateReadingPdfSurface, resetReadingPdfSurface } from '../../../app/lib/pdf-viewer.js';

function AssetFig({ n }) {
  return (
    <svg viewBox="0 0 200 150" width="82%" height="82%">
      <rect x="6" y="6" width="188" height="138" fill="none" stroke="#d4d4d2" strokeDasharray="2 2"/>
      {n===1 && <g>
        <rect x="25" y="55" width="28" height="40" fill="#5e6ad2" opacity="0.55"/>
        <rect x="72" y="38" width="28" height="57" fill="#5e9c6f" opacity="0.55"/>
        <rect x="119" y="22" width="28" height="73" fill="#c07b3a" opacity="0.55"/>
        <rect x="166" y="48" width="20" height="47" fill="#8957c9" opacity="0.55"/>
        <line x1="20" y1="110" x2="186" y2="110" stroke="#8a8a92"/>
      </g>}
      {n===2 && <g>
        <circle cx="42" cy="75" r="22" fill="none" stroke="#5e6ad2" strokeWidth="1.5"/>
        <text x="42" y="78" textAnchor="middle" fontSize="9" fill="#5e6ad2">retrieve</text>
        <path d="M68 75 L108 75" stroke="#8a8a92" strokeWidth="1.2"/>
        <polygon points="108,71 116,75 108,79" fill="#8a8a92"/>
        <rect x="118" y="58" width="56" height="34" rx="4" fill="none" stroke="#8957c9" strokeWidth="1.5"/>
        <text x="146" y="80" textAnchor="middle" fontSize="9" fill="#8957c9">rerank</text>
      </g>}
      {n===3 && <g>
        <path d="M20 120 C 40 50, 80 40, 100 70 S 160 110, 180 90" fill="none" stroke="#c04e68" strokeWidth="1.8"/>
        <line x1="12" y1="130" x2="192" y2="130" stroke="#8a8a92"/>
        <line x1="12" y1="130" x2="12" y2="18" stroke="#8a8a92"/>
      </g>}
    </svg>
  );
}
function AssetTbl({ n }) {
  const rows = n===1 ? [['BM25','33.2','—'],['DPR','38.7','—'],['DPR+R','44.8','base'],['Ours','44.4','−0.4']] :
               n===3 ? [['NQ','72%','−50%'],['HotpotQA','61%','−42%'],['FiQA','35%','−24%']] :
                       [['Retrieve','9ms','14%'],['Rerank','42ms','66%'],['Generate','13ms','20%']];
  const cols = n===1 ? ['Method','nDCG','Δ'] : n===3 ? ['Dataset','Skip%','Latency'] : ['Stage','Time','Share'];
  return (
    <div style={{ fontFamily:"'Times New Roman',serif", fontSize:9, color:'#1a1a1d', width:'86%', border:'1px solid #8a8a92' }}>
      <div style={{ display:'grid', gridTemplateColumns:'1.3fr 1fr 1fr', borderBottom:'1px solid #0a0a0b', padding:'3px 5px', fontWeight:700 }}>
        {cols.map(c => <span key={c}>{c}</span>)}
      </div>
      {rows.map((r,i) => (
        <div key={i} style={{ display:'grid', gridTemplateColumns:'1.3fr 1fr 1fr', borderBottom: i<rows.length-1?'1px solid #e8e8e6':'none', padding:'3px 5px' }}>
          {r.map((c,j) => <span key={j}>{c}</span>)}
        </div>
      ))}
    </div>
  );
}

/* ============ Product rail (B option) ============ */

/* ============ Reading section panel (former icon-rail items as sub-tabs) ============ */
function OverviewBody({ library, notes, onOpenPaper, outline, outlineProgress, setSub }) {
  return (
    <div className="fp-body" style={{ padding:0 }}>
      <div className="fp-section">
        <div className="fp-section-h">
          <Icon name="book" size={11} color={T.read}/>Library<span className="count">{library.length}</span>
          <button className="more" onClick={() => setSub('library')}>All →</button>
        </div>
        {library.slice(0,3).map(p => (
          <button key={p.id} className={`lib-item ${p.active?'active':''}`} onClick={() => onOpenPaper(p.id)} type="button">
            <div className="t">{p.title}</div>
            <div className="m"><span>{p.auth}</span><span style={{ color:T.t4 }}>·</span><span>{p.venue}</span></div>
            {p.progress>0 && p.progress<100 && <div className="bar"><i style={{ width:`${p.progress}%` }}/></div>}
          </button>
        ))}
        {!library.length && <div className="wempty" style={{ padding:'8px 4px' }}>저장된 논문이 없습니다.</div>}
      </div>
      <div className="fp-section">
        <div className="fp-section-h">
          <Icon name="list" size={11} color={T.read}/>Outline
          <span className="count" style={{ color:T.read, fontWeight:600 }}>{outlineProgress}%</span>
          <button className="more" onClick={() => setSub('outline')}>Full →</button>
        </div>
        <div style={{ height:3, background:T.s3, borderRadius:2, overflow:'hidden', margin:'0 2px 8px' }}>
          <div style={{ width:`${outlineProgress}%`, height:'100%', background:T.read }}/>
        </div>
        {outline.slice(0,5).map((s) => (
          <div key={s.id} className={`outline-item ${s.active?'active':''}`}>
            <StatusIcon status={s.status}/><span>{s.label}</span>
          </div>
        ))}
        {!outline.length && <div className="wempty" style={{ padding:'8px 4px' }}>아직 목차가 없습니다.</div>}
      </div>
      <div className="fp-section">
        <div className="fp-section-h">
          <Icon name="highlight" size={11} color={T.read}/>Highlights<span className="count">{notes.length}</span>
          <button className="more" onClick={() => setSub('notes')}>All →</button>
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:8 }}>
          {[['Method',T.read],['Result',T.search],['Limit',T.result],['Claim',T.research],['Note',T.writing]].map(([l,c]) => (
            <span key={l} style={{ fontSize:10.5, padding:'2px 7px', borderRadius:4, background:`color-mix(in srgb, ${c} 12%, transparent)`, color:c, border:`1px solid color-mix(in srgb, ${c} 28%, transparent)`, display:'inline-flex', alignItems:'center', gap:4 }}>
              <span style={{ width:5, height:5, borderRadius:'50%', background:c }}/>{l}<span style={{ ...mono, color:T.t3 }}>{notes.filter(n=>n.cat===l).length}</span>
            </span>
          ))}
        </div>
        {notes.slice(0,3).map(n => (
          <div key={n.id} className="outline-item" style={{ alignItems:'flex-start' }}>
            <span style={{ width:3, minHeight:24, background:n.color, borderRadius:1.5, flexShrink:0, marginTop:2 }}/>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:11, color:T.t2, lineHeight:1.45, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{n.text}</div>
              <div style={{ fontSize:10, color:T.t4, ...mono, marginTop:2 }}>p.{n.pg}</div>
            </div>
          </div>
        ))}
        {!notes.length && <div className="wempty" style={{ padding:'8px 4px' }}>저장된 노트가 없습니다.</div>}
      </div>
    </div>
  );
}
function ReadingPanel({ library, notes, onOpenPaper, outline, outlineProgress, sub, setSub }) {
  const subs = [['overview','Overview'],['library','Library'],['outline','Outline'],['notes','Notes']];
  return (
    <div className="float-panel">
      <div className="fp-subnav">
        {subs.map(([id,lbl]) => (
          <button key={id} className={sub===id?'on':''} onClick={() => setSub(id)}>{lbl}</button>
        ))}
      </div>

      {sub==='overview' && <OverviewBody library={library} notes={notes} onOpenPaper={onOpenPaper} outline={outline} outlineProgress={outlineProgress} setSub={setSub}/>}

      {sub==='library' && <>
        <div className="fp-search">
          <Icon name="search" size={12}/><input placeholder="Filter papers…"/><Kbd>⌘K</Kbd>
        </div>
        <div className="fp-body">
          {library.map(p => (
            <button key={p.id} className={`lib-item ${p.active?'active':''}`} onClick={() => onOpenPaper(p.id)} type="button">
              <div className="t">{p.title}</div>
              <div className="m"><span>{p.auth}</span><span style={{ color:T.t4 }}>·</span><span>{p.venue}</span></div>
              {p.progress>0 && p.progress<100 && <div className="bar"><i style={{ width:`${p.progress}%` }}/></div>}
              {p.progress===100 && <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:10.5, color:T.search }}><Icon name="check" size={10}/> done</div>}
            </button>
          ))}
          {!library.length && <div className="wempty" style={{ padding:'8px 4px' }}>저장된 논문이 없습니다.</div>}
        </div>
      </>}

      {sub==='outline' && <>
        <div style={{ padding:'0 14px 12px' }}>
          <div style={{ fontSize:10.5, color:T.t3, marginBottom:5 }}>Reading progress</div>
          <div style={{ height:3, background:T.s3, borderRadius:2, overflow:'hidden' }}><div style={{ width:`${outlineProgress}%`, height:'100%', background:T.read }}/></div>
          <div style={{ fontSize:10.5, color:T.read, marginTop:4, ...mono, fontWeight:600 }}>{outlineProgress}%</div>
        </div>
        <div className="fp-body">
          {outline.map((s) => (
            <div key={s.id} className={`outline-item ${s.active?'active':''}`}>
              <StatusIcon status={s.status}/><span>{s.label}</span>
            </div>
          ))}
          {!outline.length && <div className="wempty" style={{ padding:'8px 4px' }}>텍스트 추출 후 목차가 표시됩니다.</div>}
        </div>
      </>}

      {sub==='notes' && <>
        <div className="fp-body" style={{ padding:'0 12px 10px' }}>
          <div style={{ fontSize:10.5, color:T.t3, textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:600, padding:'4px 4px 8px' }}>Categories</div>
          {[['Method',T.read],['Result',T.search],['Limit',T.result],['Claim',T.research],['Note',T.writing]].map(([l,c]) => (
            <div key={l} className="outline-item" style={{ gap:8 }}>
              <span style={{ width:10, height:3, background:c, borderRadius:1.5 }}/>{l}
              <span style={{ marginLeft:'auto', fontSize:10.5, color:T.t4, ...mono }}>{notes.filter(n=>n.cat===l).length}</span>
            </div>
          ))}
          <div style={{ height:1, background:T.b1, margin:'10px 4px' }}/>
          <div style={{ fontSize:10.5, color:T.t3, textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:600, padding:'4px 4px 8px' }}>Recent</div>
          {notes.map(n => (
            <div key={n.id} className="outline-item" style={{ alignItems:'flex-start' }}>
              <span style={{ width:3, height:24, background:n.color, borderRadius:1.5, flexShrink:0, marginTop:2 }}/>
              <div style={{ fontSize:11.5, color:T.t2, lineHeight:1.4, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{n.text}</div>
            </div>
          ))}
          {!notes.length && <div className="wempty" style={{ padding:'8px 4px' }}>저장된 노트가 없습니다.</div>}
        </div>
      </>}
    </div>
  );
}

function DocumentHeader({ pageCount, pdfUrl, tab, setTab, summarized, orient, setOrient }) {
  const pageLabel = Number.isFinite(Number(pageCount)) ? `${Math.max(1, Math.round(Number(pageCount)))}p` : '';
  return (
    <div className="pane-hdr">
      <button aria-pressed={tab === 'summary'} className={`pane-tab ${tab==='summary'?'active':''}`} onClick={() => setTab('summary')} type="button">
        <Icon name="sparkles" size={13} color={tab==='summary'?T.read:T.t3}/>Summary
        {summarized && <span style={{ width:5, height:5, borderRadius:'50%', background:T.read }}/>}
      </button>
      <button aria-pressed={tab === 'pdf'} className={`pane-tab ${tab==='pdf'?'active':''}`} onClick={() => setTab('pdf')} type="button">
        <Icon name="pdf" size={13} color={tab==='pdf'?T.tx:T.t3}/>PDF Document
        {pageLabel && <span style={{ fontSize:10.5, color:T.t3, ...mono, marginLeft:2 }}>{pageLabel}</span>}
      </button>
      <div className="pane-actions">
        {setOrient && (
          <div className="orient-group" title="Pane orientation">
            <button className={`orient-btn ${orient==='horizontal'?'on':''}`} onClick={() => setOrient('horizontal')} title="Side by side"><Icon name="columns" size={13}/></button>
            <button className={`orient-btn ${orient==='vertical'?'on':''}`} onClick={() => setOrient('vertical')} title="Stacked (tablet)"><Icon name="rows" size={13}/></button>
          </div>
        )}
        {pdfUrl && <a aria-label="Download reading document" className="pane-icon-btn" href={pdfUrl} target="_blank" rel="noreferrer"><Icon name="download" size={13}/></a>}
      </div>
    </div>
  );
}

function readingSectionPage(section, fallback = 1) {
  const page = Number(section?.page ?? section?.pageStart ?? section?.sourcePage ?? fallback);
  return Number.isFinite(page) && page > 0 ? Math.round(page) : fallback;
}

function readingDockSearchResults(session, query) {
  const needle = String(query || '').trim().toLowerCase();
  if (needle.length < 2) return [];
  const candidates = [
    { label: 'Title', page: 1, text: session?.title },
    { label: 'Abstract', page: 1, text: session?.abstract || session?.paper?.abstract },
    { label: 'Summary', page: 1, text: session?.summary || session?.paper?.summary },
    ...(Array.isArray(session?.paper?.keyPoints) ? session.paper.keyPoints.map((text) => ({ label: 'Key point', page: 1, text })) : []),
    ...(Array.isArray(session?.sections)
      ? session.sections.map((section, index) => ({
          label: section?.label || `Section ${index + 1}`,
          page: readingSectionPage(section, index + 1),
          text: [section?.label, section?.summary].filter(Boolean).join(' '),
        }))
      : []),
    ...(Array.isArray(session?.notes)
      ? session.notes.map((note) => ({
          label: 'Note',
          page: Number(note?.page) || 1,
          text: [note?.quote, note?.body].filter(Boolean).join(' '),
        }))
      : []),
    ...(Array.isArray(session?.assets)
      ? session.assets.map((asset) => ({
          label: asset?.caption || asset?.kind || 'Asset',
          page: Number(asset?.sourceBounds?.page || asset?.page) || 1,
          text: [asset?.caption, asset?.sourceText, asset?.summary].filter(Boolean).join(' '),
        }))
      : []),
  ];

  return candidates
    .map((candidate) => {
      const text = String(candidate.text || '').replace(/\s+/g, ' ').trim();
      const index = text.toLowerCase().indexOf(needle);
      if (index < 0) return null;
      const start = Math.max(0, index - 42);
      const end = Math.min(text.length, index + needle.length + 74);
      return {
        label: String(candidate.label || 'PDF text'),
        page: Math.max(1, Math.round(Number(candidate.page) || 1)),
        snippet: `${start > 0 ? '...' : ''}${text.slice(start, end)}${end < text.length ? '...' : ''}`,
      };
    })
    .filter(Boolean)
    .slice(0, 8);
}

function readingProjectHash(projectId) {
  return `#/projects/${encodeURIComponent(projectId || 'rag-reranker')}/reading`;
}

function readingSessionHash(projectId, sessionId, docTab = 'pdf') {
  const tab = ['pdf', 'summary'].includes(docTab) ? docTab : 'pdf';
  return `${readingProjectHash(projectId)}/sessions/${encodeURIComponent(sessionId)}/${tab}`;
}

function PdfView({ dockHidden = false, onAskSelection = null, onOpenNotes = null, onRefresh = null, onSelectionChange = null, session, sourceHighlight = null, targetPage = 1 }) {
  const [zoom, setZoom] = useState(100);
  const [pdfSelection, setPdfSelection] = useState(null);
  const [dockPanel, setDockPanel] = useState('');
  const [dockStatus, setDockStatus] = useState({ message: '', status: 'idle' });
  const [pagePreviews, setPagePreviews] = useState({});
  const [renderedPageCount, setRenderedPageCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPage, setSelectedPage] = useState(Math.max(1, Number(targetPage) || 1));
  const hostRef = useRef(null);
  const pdfUrl = session?.id ? appUrl(`api/reading-sessions/${encodeURIComponent(session.id)}/pdf`).href : '';
  const pageCount = Math.max(1, Number(session?.pageCount) || 0, renderedPageCount);
  const activePage = Math.min(pageCount, Math.max(1, Number(selectedPage) || Number(targetPage) || 1));
  const pdfAnnotations = [
    ...(Array.isArray(session?.highlights) ? session.highlights : []),
    ...(Array.isArray(session?.notes) ? session.notes : []),
  ];
  const sections = Array.isArray(session?.sections) && session.sections.length
    ? session.sections
    : [{ id: 'document', label: 'Document', pageStart: 1 }];
  const linkableNotes = Array.isArray(session?.notes)
    ? session.notes.filter((note) => note?.id && String(note.kind || '').toLowerCase() !== 'highlight')
    : [];
  const searchResults = readingDockSearchResults(session, searchQuery);
  useEffect(() => {
    setSelectedPage(Math.max(1, Number(targetPage) || 1));
  }, [targetPage]);

  useEffect(() => {
    setPdfSelection(null);
    onSelectionChange?.(null);
    setDockStatus({ message: '', status: 'idle' });
    setPagePreviews({});
    setRenderedPageCount(0);
  }, [onSelectionChange, session?.id]);

  useEffect(() => {
    if (!dockStatus.message || dockStatus.status === 'running') return undefined;
    const timeout = window.setTimeout(() => setDockStatus({ message: '', status: 'idle' }), 2200);
    return () => window.clearTimeout(timeout);
  }, [dockStatus.message, dockStatus.status]);

  const jumpToPage = (page) => {
    const nextPage = Math.min(pageCount, Math.max(1, Math.round(Number(page) || 1)));
    setSelectedPage(nextPage);
    setDockPanel('');
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !session?.id || !session?.pdfUrl) {
      resetReadingPdfSurface();
      return undefined;
    }

    void hydrateReadingPdfSurface({
      annotations: pdfAnnotations,
      baseUrl: appUrl(''),
      host,
      onPageCount(count) {
        setRenderedPageCount(Math.max(1, Math.round(Number(count) || 1)));
      },
      onPagePreview(preview) {
        setPagePreviews((current) => {
          const page = Number(preview?.page) || 0;
          if (!page || current[page]?.src === preview.src) {
            return current;
          }
          return { ...current, [page]: preview };
        });
      },
      pdfUrl,
      sourceHighlight,
      targetPage: activePage,
      zoom,
    });

    return () => {
      resetReadingPdfSurface();
    };
  }, [activePage, pdfUrl, session?.id, session?.pdfUrl, session?.notes, session?.highlights, sourceHighlight, zoom]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !session?.id || !session?.pdfUrl) {
      return undefined;
    }

    return createPdfSmartSelectionController({
      host,
      onSelection(selection) {
        if (selection.quote.length > 5) {
          setPdfSelection(selection);
          onSelectionChange?.(selection);
        }
      },
    });
  }, [onSelectionChange, session?.id, session?.pdfUrl]);

  const clearPdfSelection = () => {
    window.getSelection?.()?.removeAllRanges();
    setPdfSelection(null);
    onSelectionChange?.(null);
  };

  const askPdfSelection = () => {
    if (!pdfSelection?.quote) return;
    onSelectionChange?.(pdfSelection);
    onAskSelection?.(pdfSelection);
  };

  const savePdfSelection = async (kind) => {
    if (!session?.id || !pdfSelection?.quote || dockStatus.status === 'running') {
      return;
    }

    const labels = {
      highlight: '하이라이트',
      link: '노트 링크',
      note: '메모',
    };
    const payload = {
      body: '',
      kind,
      origin: 'user',
      page: pdfSelection.page,
      quote: pdfSelection.quote,
      sourceBounds: pdfSelection.sourceBounds,
    };
    setDockStatus({ message: `${labels[kind] || '선택'} 저장 중`, status: 'running' });
    try {
      await api(`api/reading-sessions/${encodeURIComponent(session.id)}/notes`, {
        body: payload,
        method: 'POST',
      });
      clearPdfSelection();
      setDockPanel('');
      if (kind !== 'highlight') {
        onOpenNotes?.();
      }
      onRefresh?.();
      setDockStatus({ message: `${labels[kind] || '선택'}를 저장했습니다.`, status: 'done' });
    } catch (error) {
      setDockStatus({ message: error instanceof Error ? error.message : '선택을 저장하지 못했습니다.', status: 'error' });
    }
  };

  const linkPdfSelectionToNote = async (note) => {
    if (!session?.id || !note?.id || !pdfSelection?.quote || dockStatus.status === 'running') {
      return;
    }

    setDockStatus({ message: '노트 연결 중', status: 'running' });
    try {
      await api(`api/reading-sessions/${encodeURIComponent(session.id)}/notes/${encodeURIComponent(note.id)}`, {
        body: {
          body: note.body || '',
          kind: note.kind || 'note',
          page: pdfSelection.page,
          quote: pdfSelection.quote,
          sourceBounds: pdfSelection.sourceBounds,
        },
        method: 'PATCH',
      });
      clearPdfSelection();
      setDockPanel('');
      onRefresh?.();
      setDockStatus({ message: '노트에 연결했습니다.', status: 'done' });
    } catch (error) {
      setDockStatus({ message: error instanceof Error ? error.message : '노트에 연결하지 못했습니다.', status: 'error' });
    }
  };

  if (!session?.id) {
    return (
      <div className="empty-state">
        <div style={{ width:52, height:52, borderRadius:14, background:'rgba(94,106,210,0.08)', display:'flex', alignItems:'center', justifyContent:'center' }}><Icon name="pdf" size={24} color={T.t3}/></div>
        <div className="title">읽을 세션이 없습니다</div>
        <div className="sub">라이브러리에서 논문을 열면 PDF가 여기에 표시됩니다.</div>
      </div>
    );
  }

  if (!session.pdfUrl) {
    return (
      <div className="empty-state">
        <div style={{ width:52, height:52, borderRadius:14, background:'rgba(94,106,210,0.08)', display:'flex', alignItems:'center', justifyContent:'center' }}><Icon name="pdf" size={24} color={T.t3}/></div>
        <div className="title">PDF가 없습니다</div>
        <div className="sub">원문 파일이 연결된 논문을 열어 주세요.</div>
      </div>
    );
  }

  return (
    <div className="pdf-host">
      <div className="pdf-scroll">
        <div
          ref={hostRef}
          className="reading-pdf-canvas-root"
          data-reading-pdf-host="true"
          data-reading-pdf-url={pdfUrl}
          data-reading-session-id={session.id}
        >
          <div className="reading-pdf-loading">PDF를 불러오는 중입니다...</div>
        </div>
      </div>

      {!dockHidden && <div className={`dock-wrap ${pdfSelection ? 'has-selection' : ''}`}>
        {pdfSelection && (
          <div className="sel-chip">
            <span className="qi"><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2.5 4h11M2.5 8h8M2.5 12h5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></span>
            <span className="q">"{pdfSelection.quote.length > 58 ? `${pdfSelection.quote.slice(0, 55)}...` : pdfSelection.quote}"</span>
            <button className="x" onClick={clearPdfSelection} aria-label="선택 해제"><Icon name="x" size={9}/></button>
          </div>
        )}
        {dockStatus.message && (
          <div className={`pdf-toast ${dockStatus.status === 'error' ? 'is-error' : ''}`} role="status">
            {dockStatus.message}
          </div>
        )}
        {dockPanel === 'toc' && (
          <div className="dock-pop dock-toc pdf-dock-sheet" role="dialog" aria-label="목차">
            <div className="ph">목차</div>
            {sections.slice(0, 10).map((section, index) => {
              const page = readingSectionPage(section, index + 1);
              return (
                <button className={`toc-row ${page === activePage ? 'cur' : ''}`} key={section.id || `${section.label}-${index}`} onClick={() => jumpToPage(page)} type="button">
                  <span className="n">{page}</span>
                  <span className="tt">{section.label || `Section ${index + 1}`}</span>
                </button>
              );
            })}
          </div>
        )}
        {dockPanel === 'search' && (
          <div className="dock-pop pdf-search-panel pdf-dock-sheet" role="dialog" aria-label="본문 검색">
            <div className="ph">본문 검색</div>
            <div className="pdf-search-box">
              <input aria-label="PDF 검색어" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search PDF" />
              <span className="mono">{searchQuery ? searchResults.length : 0}</span>
            </div>
            <div className="pdf-search-results">
              {searchQuery.trim().length < 2 && <div className="pdf-search-empty">두 글자 이상 입력</div>}
              {searchQuery.trim().length >= 2 && !searchResults.length && <div className="pdf-search-empty">검색 결과 없음</div>}
              {searchResults.map((result, index) => (
                <button className="pdf-search-result" key={`${result.page}-${result.snippet}-${index}`} onClick={() => jumpToPage(result.page)} type="button">
                  <span className="pdf-search-result-meta"><span>{result.label}</span><span className="mono">p.{result.page}</span></span>
                  <span className="pdf-search-result-snippet">{result.snippet}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {dockPanel === 'link' && (
          <div className="dock-pop dock-note-links pdf-dock-sheet" role="dialog" aria-label="노트 링크 선택">
            <div className="ph">노트 링크</div>
            {linkableNotes.length > 0 ? (
              <div className="note-link-list">
                {linkableNotes.slice(0, 8).map((note) => {
                  const text = String(note.body || note.quote || '빈 노트').trim();
                  return (
                    <button className="note-link-row" key={note.id} onClick={() => linkPdfSelectionToNote(note)} type="button" aria-label={`노트에 연결: ${text.slice(0, 36)}`}>
                      <span className="note-link-kind">{noteLabel(note)}</span>
                      <span className="note-link-text">{text}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="note-link-empty">
                <span>연결할 노트가 없습니다.</span>
                <button className="btn-s" disabled={!pdfSelection || dockStatus.status === 'running'} onClick={() => savePdfSelection('note')} type="button"><Icon name="note" size={12}/> 메모 추가</button>
              </div>
            )}
          </div>
        )}
        {dockPanel === 'pages' && (
          <div className="dock-pop dock-pages pdf-dock-sheet" role="dialog" aria-label="페이지 미리보기">
            <div className="ph">페이지 미리보기</div>
            <div className="pgrid">
              {Array.from({ length: Math.min(pageCount, 24) }).map((_, index) => {
                const page = index + 1;
                const preview = pagePreviews[page];
                return (
                  <button className={`pgi ${page === activePage ? 'cur' : ''}`} key={page} onClick={() => jumpToPage(page)} type="button">
                    <span className={`pgt ${preview?.src ? 'has-image' : ''}`}>
                      {preview?.src
                        ? <img alt={`Page ${page} preview`} height={preview.height} src={preview.src} width={preview.width} />
                        : <span className="pgt-loading">PDF</span>}
                    </span>
                    <span className="pgn">{page}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className={`dock ${pdfSelection ? 'has-selection' : ''}`} role="toolbar" aria-label="PDF tools">
          <button className={`dock-btn ${dockPanel === 'toc' ? 'on' : ''}`} title="목차" aria-label="목차" onClick={() => setDockPanel((panel) => panel === 'toc' ? '' : 'toc')} type="button"><Icon name="list" size={13}/></button>
          <div className="dock-div"/>
          <button className="dock-btn dock-zoom-btn" title="Zoom out" aria-label="축소" onClick={() => setZoom(z => Math.max(50, z-10))} type="button"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3.5 8h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg></button>
          <span className="dock-zoom">{zoom}%</span>
          <button className="dock-btn dock-zoom-btn" title="Zoom in" aria-label="확대" onClick={() => setZoom(z => Math.min(200, z+10))} type="button"><Icon name="plus" size={13}/></button>
          <div className="dock-div dock-zoom-sep"/>
          <button className="dock-btn dock-fit-btn" title="Fit to width" aria-label="화면에 맞추기" onClick={() => setZoom(100)} type="button"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 5.5V3a1 1 0 011-1h2.5M11.5 2H13a1 1 0 011 1v2.5M14 10.5V13a1 1 0 01-1 1h-2.5M4.5 14H3a1 1 0 01-1-1v-2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
          <div className="dock-div"/>
          <button className={`dock-btn ${dockPanel === 'search' ? 'on' : ''}`} title="본문 검색" aria-label="본문 검색" onClick={() => setDockPanel((panel) => panel === 'search' ? '' : 'search')} type="button"><Icon name="search" size={13}/></button>
          <div className="dock-div"/>
          <button className={`dock-btn ${dockPanel === 'pages' ? 'on' : ''}`} title="페이지 미리보기" aria-label="페이지 미리보기" onClick={() => setDockPanel((panel) => panel === 'pages' ? '' : 'pages')} type="button"><Icon name="grid" size={13}/></button>
          <div className="dock-sel-group" aria-label="선택한 텍스트 작업">
            <div className="dock-div"/>
            <button className="dock-btn hl" disabled={!pdfSelection || dockStatus.status === 'running'} title="하이라이트" aria-label="하이라이트" onClick={() => savePdfSelection('highlight')} type="button">
              <Icon name="highlight" size={13}/>
              <span className="lbl-wrap"><span className="lbl">하이라이트</span></span>
            </button>
            <button className="dock-btn nt" disabled={!pdfSelection || dockStatus.status === 'running'} title="메모 추가" aria-label="메모 추가" onClick={() => savePdfSelection('note')} type="button">
              <Icon name="note" size={13}/>
              <span className="lbl-wrap"><span className="lbl">메모 추가</span></span>
            </button>
            <button className={`dock-btn link ${dockPanel === 'link' ? 'on' : ''}`} disabled={!pdfSelection || dockStatus.status === 'running'} title="노트 링크" aria-label="노트 링크" onClick={() => setDockPanel((panel) => panel === 'link' ? '' : 'link')} type="button">
              <Icon name="link" size={13}/>
              <span className="lbl-wrap"><span className="lbl">노트 링크</span></span>
            </button>
            <button className="dock-btn chat" disabled={!pdfSelection || dockStatus.status === 'running'} title="AI에게 질문" aria-label="AI에게 질문" onClick={askPdfSelection} type="button">
              <Icon name="chat" size={13}/>
              <span className="lbl-wrap"><span className="lbl">AI 질문</span></span>
            </button>
          </div>
        </div>
      </div>}
    </div>
  );
}

function SummaryView({ actionStatus = '', onGen, ready, session }) {
  const summaryCards = session?.summaryCards || {};
  if (!ready) return (
    <div className="empty-state">
      <div style={{ width:52, height:52, borderRadius:14, background:'rgba(94,106,210,0.08)', display:'flex', alignItems:'center', justifyContent:'center' }}><Icon name="sparkles" size={24} color={T.read}/></div>
      <div className="title">요약이 아직 생성되지 않았습니다</div>
      <div className="sub">{session?.parseStatus === 'done' ? '요약을 생성하면 이 논문의 핵심 내용이 여기에 표시됩니다.' : '텍스트 추출 후 요약을 생성할 수 있습니다.'}</div>
      <button className="btn-p" disabled={!session?.id || actionStatus === 'running'} onClick={onGen} style={{ marginTop:8 }}><Icon name="sparkles" size={13}/> Generate summary</button>
    </div>
  );
  return (
    <div className="summary-wrap">
      {summaryCards.tldr && (
        <div className="summary-block">
          <div className="summary-label"><Icon name="sparkles" size={11} color={T.read}/> TL;DR</div>
          <div className="summary-body">{summaryCards.tldr}</div>
        </div>
      )}
      {Array.isArray(summaryCards.keyPoints) && summaryCards.keyPoints.length > 0 && (
        <div className="summary-block">
          <div className="summary-label" style={{ color:T.search }}><Icon name="dot" size={8} color={T.search}/> Key points</div>
          <ul className="summary-list">
            {summaryCards.keyPoints.map((point, index) => (
              <li key={`${point}-${index}`}><span className="bullet" style={{ background:T.search }}/>{point}</li>
            ))}
          </ul>
        </div>
      )}
      {summaryCards.method && (
        <div className="summary-block">
          <div className="summary-label" style={{ color:T.read }}><Icon name="dot" size={8} color={T.read}/> Method</div>
          <div className="summary-body">{summaryCards.method}</div>
        </div>
      )}
      {summaryCards.result && (
        <div className="summary-block">
          <div className="summary-label" style={{ color:T.search }}><Icon name="dot" size={8} color={T.search}/> Result</div>
          <div className="summary-body">{summaryCards.result}</div>
        </div>
      )}
      {summaryCards.limit && (
        <div className="summary-block">
          <div className="summary-label" style={{ color:T.result }}><Icon name="dot" size={8} color={T.result}/> Limit</div>
          <div className="summary-body">{summaryCards.limit}</div>
        </div>
      )}
      {summaryCards.fullSummary && (
        <div className="summary-block">
          <div className="summary-label"><Icon name="note" size={11} color={T.t2}/> Full summary</div>
          <div className="summary-body">{summaryCards.fullSummary}</div>
        </div>
      )}
    </div>
  );
}

function WorkbenchHeader({ assetsCount = 0, chatCount = 0, notesCount = 0, tab, setTab, onCollapse, onMobileClose }) {
  const tabs = [
    { id:'chat', label:'Chat', icon:'chat', count:chatCount },
    { id:'notes', label:'Notes', icon:'note', count:notesCount },
    { id:'assets', label:'Assets', icon:'grid', count:assetsCount },
  ];
  return (
    <div className="pane-hdr">
      {tabs.map(t => (
        <button key={t.id} aria-pressed={tab === t.id} className={`pane-tab ${tab===t.id?'active':''}`} onClick={() => setTab(t.id)} type="button">
          <Icon name={t.icon} size={13} color={tab===t.id?T.tx:T.t3}/>{t.label}
          <span style={{ fontSize:10.5, color:T.t4, ...mono }}>{t.count}</span>
        </button>
      ))}
      <div className="pane-actions">
        <button aria-label="Collapse workbench" className="pane-icon-btn" title="Collapse" onClick={onCollapse} type="button"><Icon name="chevR" size={13}/></button>
        {onMobileClose && (
          <button className="pane-icon-btn mobile-wb-close" title="Close workbench" aria-label="Close workbench" onClick={onMobileClose} type="button"><Icon name="x" size={13}/></button>
        )}
      </div>
    </div>
  );
}

function activeReadingSection(session) {
  const sections = Array.isArray(session?.sections) ? session.sections : [];
  return sections.find((section) => section?.active)
    || sections.find((section) => String(section?.status || '').toLowerCase() === 'running')
    || sections.find((section) => /method/i.test(String(section?.label || section?.title || '')))
    || sections[0]
    || null;
}

function readingSectionContextLabel(section) {
  const label = String(section?.label || '').replace(/^\d+\.\s*/, '').trim();
  if (!label) return '';
  const order = Number(section?.order);
  return Number.isFinite(order) ? `${Math.max(1, Math.round(order) + 1)} ${label}` : label;
}

function selectedTextWordCount(selection) {
  const quote = String(selection?.quote || '').trim();
  if (!quote) return 0;
  return quote.split(/\s+/).filter(Boolean).length;
}

function readingChatSelectionPayload(selection) {
  const quote = String(selection?.quote || '').trim();
  if (!quote) return null;
  return {
    lineCount: Number(selection?.lineCount) || quote.split(/\n+/).filter(Boolean).length || 1,
    page: Number(selection?.page) || null,
    quote,
    sourceBounds: selection?.sourceBounds || null,
  };
}

function ChatView({ actionStatus = '', onClearSelection = null, onSend, selectedTextSelection = null, session }) {
  const [draft, setDraft] = useState('');
  const messages = Array.isArray(session?.chatMessages) ? session.chatMessages : [];
  const canChat = Boolean(session?.id);
  const preparingPaper = canChat && session.parseStatus !== 'done';
  const activeSection = activeReadingSection(session);
  const activeSectionLabel = readingSectionContextLabel(activeSection);
  const activeTextSelection = selectedTextSelection?.quote ? selectedTextSelection : null;
  const selectionWordCount = selectedTextWordCount(activeTextSelection);

  const submit = (event) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || !canChat || actionStatus === 'running') return;
    onSend(message, activeTextSelection);
    setDraft('');
  };

  return (
    <div className="chat-wrap">
      <div className="chat-body">
        {messages.map(m => (
          <div key={m.id} className={`bubble ${m.role}`}>
            {m.role==='assistant' && <div className="avatar"><Icon name="sparkles" size={13} color={T.read}/></div>}
            <div className="content">
              {m.text}
              {Array.isArray(m.citations) && m.citations.length > 0 && <div>{m.citations.map((c,i) => (
                <span key={i} className="cite"><span className="dot"/>{c.label}<span style={{ color:T.t4, ...mono }}>{c.page ? `p.${c.page}` : ''}</span></span>
              ))}</div>}
            </div>
          </div>
        ))}
        {!messages.length && (
          <div className="empty-state" style={{ minHeight:220 }}>
            <div style={{ width:52, height:52, borderRadius:14, background:'rgba(94,106,210,0.08)', display:'flex', alignItems:'center', justifyContent:'center' }}><Icon name="chat" size={24} color={T.t3}/></div>
            <div className="title">아직 대화가 없습니다</div>
            <div className="sub">{preparingPaper ? '질문을 남기면 준비가 끝나는 대로 답변합니다.' : '논문 내용에 대해 질문할 수 있습니다.'}</div>
          </div>
        )}
      </div>
      <form className="chat-input" onSubmit={submit}>
        <div className="chat-box">
          {(activeSectionLabel || selectionWordCount > 0) && (
            <div className="chat-attach">
              {activeSectionLabel && (
                <span className="chat-context-chip"><Icon name="pdf" size={12}/>§{activeSectionLabel}</span>
              )}
              {selectionWordCount > 0 && (
                <span className="chat-context-chip"><Icon name="quote" size={12}/>선택 {selectionWordCount}단어<button className="x" aria-label="선택 텍스트 제거" onClick={onClearSelection} type="button">×</button></span>
              )}
            </div>
          )}
          <textarea disabled={!canChat || actionStatus === 'running'} onChange={(event) => setDraft(event.target.value)} rows={1} placeholder="이 논문에게 질문하기..." value={draft}/>
          <div className="chat-irow">
            <button className="chat-tool icon" disabled type="button" aria-label="문단 첨부"><Icon name="plus" size={13}/></button>
            <span className="chat-tool" style={{ cursor:'default' }}><Icon name="pdf" size={13}/>현재 섹션</span>
            <span style={{ flex:1 }}/>
            <span className="chat-tool" style={{ cursor:'default' }}><Icon name="sparkles" size={12} color={T.read}/>{actionStatus === 'running' ? 'running' : 'gpt-4o'}</span>
            <button className="chat-send" disabled={!draft.trim() || !canChat || actionStatus === 'running'}><Icon name="send" size={14} color="#fff"/></button>
          </div>
        </div>
        <div className="chat-disc">{preparingPaper ? '논문을 준비한 뒤 답변합니다' : (activeTextSelection ? '선택 텍스트가 질문과 함께 전달됩니다' : '논문 텍스트를 바탕으로 답변합니다')}</div>
      </form>
    </div>
  );
}

function NotesView({ onRefresh, projectId, session }) {
  const notes = Array.isArray(session?.notes) ? session.notes : [];
  const [editingId, setEditingId] = useState('');
  const [editDraft, setEditDraft] = useState({ body: '', kind: 'note', page: '', quote: '' });
  const [newNote, setNewNote] = useState({ body: '', kind: 'note', page: '', quote: '' });
  const [noteStates, setNoteStates] = useState({});

  const setNoteState = (id, state) => {
    setNoteStates((current) => ({
      ...current,
      [id]: state,
    }));
  };

  const notePayload = (draft) => ({
    body: String(draft.body || '').trim(),
    kind: String(draft.kind || 'note').trim() || 'note',
    page: String(draft.page || '').trim() ? Number(draft.page) || 1 : null,
    quote: String(draft.quote || '').trim(),
  });

  const startEdit = (note) => {
    setEditingId(note.id);
    setEditDraft({
      body: note.body || '',
      kind: note.kind || 'note',
      page: note.page || '',
      quote: note.quote || '',
    });
  };

  const createNote = async () => {
    if (!session?.id || noteStates.new?.status === 'running') return;
    const payload = notePayload(newNote);
    if (!payload.body && !payload.quote) {
      setNoteState('new', { message: '내용을 입력해 주세요.', status: 'error' });
      return;
    }

    setNoteState('new', { message: '저장 중', status: 'running' });
    try {
      await api(`api/reading-sessions/${encodeURIComponent(session.id)}/notes`, {
        body: payload,
        method: 'POST',
      });
      setNewNote({ body: '', kind: 'note', page: '', quote: '' });
      setNoteState('new', { message: '노트를 저장했습니다.', status: 'done' });
      onRefresh?.();
    } catch (error) {
      setNoteState('new', { message: error instanceof Error ? error.message : '노트를 저장하지 못했습니다.', status: 'error' });
    }
  };

  const updateNote = async (noteId) => {
    if (!session?.id || !noteId || noteStates[noteId]?.status === 'running') return;
    const payload = notePayload(editDraft);
    if (!payload.body && !payload.quote) {
      setNoteState(noteId, { message: '내용을 입력해 주세요.', status: 'error' });
      return;
    }

    setNoteState(noteId, { message: '저장 중', status: 'running' });
    try {
      await api(`api/reading-sessions/${encodeURIComponent(session.id)}/notes/${encodeURIComponent(noteId)}`, {
        body: payload,
        method: 'PATCH',
      });
      setEditingId('');
      setNoteState(noteId, { message: '수정했습니다.', status: 'done' });
      onRefresh?.();
    } catch (error) {
      setNoteState(noteId, { message: error instanceof Error ? error.message : '수정하지 못했습니다.', status: 'error' });
    }
  };

  const deleteNote = async (noteId) => {
    if (!session?.id || !noteId || noteStates[noteId]?.status === 'running') return;
    setNoteState(noteId, { message: '삭제 중', status: 'running' });
    try {
      await api(`api/reading-sessions/${encodeURIComponent(session.id)}/notes/${encodeURIComponent(noteId)}`, {
        method: 'DELETE',
      });
      setEditingId('');
      setNoteState(noteId, { message: '삭제했습니다.', status: 'done' });
      onRefresh?.();
    } catch (error) {
      setNoteState(noteId, { message: error instanceof Error ? error.message : '삭제하지 못했습니다.', status: 'error' });
    }
  };

  const saveNoteToWiki = async (note) => {
    if (!projectId || !session?.id || !note?.id || noteStates[note.id]?.status === 'running') return;
    const noteBody = String(note.body || '').trim();
    const noteQuote = String(note.quote || '').trim();
    const noteText = noteBody || noteQuote;
    const title = noteText ? noteText.slice(0, 80) : 'Reading note';
    setNoteState(note.id, { message: '저장 중', status: 'running' });

    try {
      await api(`api/projects/${encodeURIComponent(projectId)}/wiki`, {
        body: {
          body: [
            ...(noteQuote ? [{ text: noteQuote, type: 'quote' }] : []),
            ...(noteBody ? [{ text: noteBody, type: 'paragraph' }] : []),
          ],
          paperIds: session.paperId ? [session.paperId] : [],
          properties: {
            noteId: note.id,
            page: note.page || '',
            readingSessionId: session.id,
            sourceType: 'readingNote',
          },
          tags: ['reading'],
          title,
          type: 'concept',
        },
        method: 'POST',
      });
      invalidateServerResource(['wiki-pages', projectId, 'all']);
      invalidateServerResource(['wiki-graph', projectId, 'all']);
      setNoteState(note.id, { message: 'Wiki에 저장했습니다.', status: 'done' });
    } catch (error) {
      setNoteState(note.id, { message: error instanceof Error ? error.message : 'Wiki에 저장하지 못했습니다.', status: 'error' });
    }
  };

  return (
    <div className="notes-wrap">
      <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom:4 }}>
        <span style={{ fontSize:10.5, color:T.t3, textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:600, flex:1 }}>All notes</span>
      </div>
      {notes.map((n) => {
        const noteState = noteStates[n.id] || {};
        const isEditing = editingId === n.id;
        return (
          <div key={n.id} className="note-card">
            <div className="note-head"><Tag label={noteLabel(n)} color={noteColor(n)} dot/>{n.page && <span className="pg">p.{n.page}</span>}</div>
            {isEditing ? (
              <div className="note-editor">
                <textarea aria-label="노트 본문" rows={3} value={editDraft.body} onChange={(event) => setEditDraft((draft) => ({ ...draft, body: event.target.value }))}/>
                <input aria-label="노트 인용" value={editDraft.quote} onChange={(event) => setEditDraft((draft) => ({ ...draft, quote: event.target.value }))} placeholder="인용"/>
                <input aria-label="노트 페이지" value={editDraft.page} onChange={(event) => setEditDraft((draft) => ({ ...draft, page: event.target.value }))} placeholder="page"/>
              </div>
            ) : (
              <>
                {n.quote && <div className="note-quote">"{n.quote}"</div>}
                <div className="note-memo">{n.body || '메모 내용이 없습니다.'}</div>
              </>
            )}
            <div className="note-actions">
              {isEditing ? (
                <>
                  <button className="btn-ghost" disabled={noteState.status === 'running'} onClick={() => updateNote(n.id)} style={{ padding:'2px 6px', fontSize:11 }}><Icon name="check" size={11}/> Save</button>
                  <button className="btn-ghost" onClick={() => setEditingId('')} style={{ padding:'2px 6px', fontSize:11 }}><Icon name="x" size={11}/> Cancel</button>
                </>
              ) : (
                <button className="btn-ghost" onClick={() => startEdit(n)} style={{ padding:'2px 6px', fontSize:11 }}><Icon name="pen" size={11}/> Edit</button>
              )}
              {noteState.message && <span style={{ color: noteState.status === 'error' ? T.insight : T.t3, fontSize:11, marginLeft:'auto' }}>{noteState.message}</span>}
              <button className="btn-ghost" disabled={noteState.status === 'running'} onClick={() => saveNoteToWiki(n)} style={{ padding:'2px 6px', fontSize:11, marginLeft: noteState.message ? 0 : 'auto', color:T.search }}><Icon name="note" size={11}/> Wiki</button>
              <button className="btn-ghost" disabled={noteState.status === 'running'} onClick={() => deleteNote(n.id)} style={{ padding:'2px 6px', fontSize:11, color:T.insight }}><Icon name="x" size={11}/> Delete</button>
            </div>
          </div>
        );
      })}
      {!notes.length && <div className="wempty">저장된 노트가 없습니다.</div>}
      <div className="note-card">
        <div className="note-head"><Tag label="New" color={T.read} dot/></div>
        <div className="note-editor">
          <textarea aria-label="새 노트 본문" rows={3} value={newNote.body} onChange={(event) => setNewNote((draft) => ({ ...draft, body: event.target.value }))} placeholder="노트"/>
          <input aria-label="새 노트 인용" value={newNote.quote} onChange={(event) => setNewNote((draft) => ({ ...draft, quote: event.target.value }))} placeholder="인용"/>
          <input aria-label="새 노트 페이지" value={newNote.page} onChange={(event) => setNewNote((draft) => ({ ...draft, page: event.target.value }))} placeholder="page"/>
        </div>
        <div className="note-actions">
          {noteStates.new?.message && <span style={{ color: noteStates.new.status === 'error' ? T.insight : T.t3, fontSize:11 }}>{noteStates.new.message}</span>}
          <button className="btn-s" disabled={noteStates.new?.status === 'running'} onClick={createNote} style={{ justifyContent:'center', padding:'7px 10px', color:T.t2, marginLeft:'auto' }}><Icon name="plus" size={12}/> New manual note</button>
        </div>
      </div>
    </div>
  );
}

function clampRatio(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(1, Math.max(0, number));
}

function assetSourceHighlight(asset) {
  if (!asset) return null;
  const bounds = asset?.sourceBounds;
  if (bounds?.unit !== 'page-ratio') {
    return null;
  }

  const page = Math.max(1, Math.floor(Number(bounds.page) || 1));
  const width = Math.max(0.04, clampRatio(bounds.width, 0.84));
  const height = Math.max(0.04, clampRatio(bounds.height, 0.12));
  return {
    height,
    page,
    unit: 'page-ratio',
    width,
    x: Math.min(1 - width, clampRatio(bounds.x, 0)),
    y: Math.min(1 - height, clampRatio(bounds.y, 0)),
  };
}

function assetCitationText(asset, session) {
  const kind = [asset?.kind, asset?.number].filter(Boolean).join(' ') || 'Reading asset';
  const page = asset?.page ? `p.${asset.page}` : 'page unknown';
  const caption = String(asset?.caption || asset?.sourceText || session?.title || '').trim();
  return [kind, page, caption].filter(Boolean).join(' — ');
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const node = document.createElement('textarea');
  node.value = text;
  node.setAttribute('readonly', '');
  node.style.position = 'fixed';
  node.style.opacity = '0';
  document.body.appendChild(node);
  node.select();
  document.execCommand('copy');
  node.remove();
}

function AssetSourceMap({ asset }) {
  const highlight = assetSourceHighlight(asset);
  if (!highlight) return null;

  return (
    <div className="asset-source-map" aria-label="Source region">
      <div className="asset-source-page">
        <span
          className="asset-source-box"
          style={{
            height: `${highlight.height * 100}%`,
            left: `${highlight.x * 100}%`,
            top: `${highlight.y * 100}%`,
            width: `${highlight.width * 100}%`,
          }}
        />
      </div>
      <div className="asset-source-caption"><span>Source region</span><strong style={mono}>p.{highlight.page}</strong></div>
    </div>
  );
}

function AssetFileAction({ available, children, href, icon }) {
  if (!available) {
    return (
      <button className="btn-s" disabled type="button">
        <Icon name={icon} size={13}/>{children}
      </button>
    );
  }

  return (
    <a className="btn-s" href={href} target="_blank" rel="noreferrer">
      <Icon name={icon} size={13}/>{children}
    </a>
  );
}

function AssetPreview({ asset, session }) {
  return (
    <div className="asset-thumb">
      {asset.thumbPath && session?.id
        ? <img alt={asset.caption || `${asset.kind} ${asset.number}`} src={appUrl(`api/reading-sessions/${encodeURIComponent(session.id)}/assets/${encodeURIComponent(asset.id)}/file?kind=thumb`).href} />
        : asset.kind==='figure' ? <AssetFig n={asset.number}/> : <AssetTbl n={asset.number}/>}
    </div>
  );
}

function AssetsView({ onRefresh, onSourceJump, session }) {
  const [kind, setKind] = useState('all');
  const [selectedId, setSelectedId] = useState('');
  const [status, setStatus] = useState('');
  const [extractState, setExtractState] = useState({ message: '', status: 'idle' });
  const assets = Array.isArray(session?.assets) ? session.assets : [];
  const figureCount = assets.filter((asset) => asset.kind === 'figure').length;
  const tableCount = assets.filter((asset) => asset.kind === 'table').length;
  const list = kind==='all' ? assets : assets.filter(a => a.kind===kind);
  const selected = assets.find((asset) => asset.id === selectedId) || list.find((asset) => asset.id === selectedId) || null;
  const selectedSource = assetSourceHighlight(selected);
  const assetFileUrl = (asset, fileKind) => (
    session?.id && asset?.id
      ? appUrl(`api/reading-sessions/${encodeURIComponent(session.id)}/assets/${encodeURIComponent(asset.id)}/file?kind=${fileKind}`).href
      : ''
  );
  const jumpToSource = () => {
    if (!selectedSource) return;
    onSourceJump?.(selectedSource);
    setStatus(`원문 p.${selectedSource.page}로 이동했습니다.`);
  };
  const copyCitation = async () => {
    if (!selected) return;
    try {
      await copyTextToClipboard(assetCitationText(selected, session));
      setStatus('Citation copied.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Citation을 복사하지 못했습니다.');
    }
  };
  const extractAssets = async () => {
    if (!session?.id || extractState.status === 'running') return;
    setExtractState({ message: 'Assets updating', status: 'running' });
    try {
      await api(`api/reading-sessions/${encodeURIComponent(session.id)}/extract-assets`, { method: 'POST' });
      setExtractState({ message: 'Assets updated.', status: 'done' });
      setSelectedId('');
      setStatus('');
      onRefresh?.();
    } catch (error) {
      setExtractState({ message: error instanceof Error ? error.message : 'Assets를 업데이트하지 못했습니다.', status: 'error' });
    }
  };

  return (
    <div className="assets-wrap">
      <div className="assets-toolbar">
        <button className={`btn-${kind==='all'?'p':'s'}`} style={{ padding:'3px 9px', fontSize:11.5 }} onClick={() => setKind('all')}>All {assets.length}</button>
        <button className={`btn-${kind==='figure'?'p':'s'}`} style={{ padding:'3px 9px', fontSize:11.5 }} onClick={() => setKind('figure')}><Icon name="image" size={11}/> Figures {figureCount}</button>
        <button className={`btn-${kind==='table'?'p':'s'}`} style={{ padding:'3px 9px', fontSize:11.5 }} onClick={() => setKind('table')}><Icon name="table" size={11}/> Tables {tableCount}</button>
        {extractState.message && <span className={`asset-status asset-toolbar-status ${extractState.status === 'error' ? 'is-error' : ''}`}>{extractState.message}</span>}
        <button className="btn-s" disabled={!session?.id || extractState.status === 'running'} onClick={extractAssets} style={{ padding:'3px 9px', fontSize:11.5, marginLeft:'auto' }} type="button"><Icon name="sparkles" size={11}/> Refresh assets</button>
      </div>
      <div className="asset-grid">
        {list.map(a => (
          <button key={a.id} className={`asset-card ${selected?.id === a.id ? 'active' : ''}`} onClick={() => { setSelectedId(a.id); setStatus(''); }} type="button">
            <AssetPreview asset={a} session={session}/>
            <div className="asset-meta">
              <div className="asset-kind" style={{ color: a.kind==='figure' ? T.research : T.writing }}>{a.kind} {a.number}</div>
              <div className="asset-caption">{a.caption || a.sourceText || '캡션이 없습니다.'}</div>
              {a.page && <div className="asset-pg">p.{a.page}</div>}
            </div>
          </button>
        ))}
        {!list.length && <div className="wempty">추출된 자산이 없습니다.</div>}
      </div>
      {selected && (
        <div className="asset-detail">
          <div className="asset-detail-head">
            <div>
              <div className="asset-kind" style={{ color: selected.kind==='figure' ? T.research : T.writing }}>{selected.kind} {selected.number}</div>
              <h3>{selected.caption || selected.sourceText || 'Untitled asset'}</h3>
            </div>
            <button className="btn-ghost" aria-label="Close asset detail" onClick={() => setSelectedId('')} style={{ padding:'4px' }} type="button"><Icon name="x" size={13}/></button>
          </div>
          <div className="asset-detail-body">
            <div className="asset-detail-preview">
              <AssetPreview asset={selected} session={session}/>
              <AssetSourceMap asset={selected}/>
            </div>
            <div className="asset-detail-meta">
              <div className="asset-detail-row"><span>Source page</span><strong style={mono}>{selected.page ? `p.${selected.page}` : '--'}</strong></div>
              <div className="asset-detail-row"><span>Type</span><strong>{selected.kind || '--'}</strong></div>
              {selectedSource && (
                <div className="asset-detail-row">
                  <span>Region</span>
                  <strong style={mono}>{`${Math.round(selectedSource.x * 100)}:${Math.round(selectedSource.y * 100)} / ${Math.round(selectedSource.width * 100)}x${Math.round(selectedSource.height * 100)}`}</strong>
                </div>
              )}
              {selected.sourceText && <div className="asset-source-snippet">{selected.sourceText}</div>}
              {Array.isArray(selected.rows) && selected.rows.length > 0 && (
                <div className="asset-detail-table">
                  {selected.rows.slice(0, 5).map((row, index) => (
                    <div className="asset-detail-table-row" key={`${selected.id}-row-${index}`}>
                      {row.slice(0, 4).map((cell, cellIndex) => <span key={`${selected.id}-cell-${index}-${cellIndex}`}>{String(cell || '')}</span>)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="asset-detail-actions">
            <button className="btn-p" disabled={!selectedSource} onClick={jumpToSource} type="button"><Icon name="pdf" size={13} color="#fff"/> Go to source page</button>
            <AssetFileAction available={Boolean(selected.thumbPath)} href={assetFileUrl(selected, 'thumb')} icon="image">Open image</AssetFileAction>
            <AssetFileAction available={Boolean(selected.dataPath)} href={assetFileUrl(selected, 'data')} icon="table">Open data</AssetFileAction>
            <button className="btn-s" onClick={copyCitation} type="button"><Icon name="share" size={13}/> Copy citation</button>
            {status && <span className="asset-status asset-detail-status">{status}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============ Reading · Library view ============ */
function formatLibraryDate(value, now = Date.now()) {
  if (!value) return '';
  const time = Date.parse(value);
  if (Number.isNaN(time)) return '';
  const days = Math.max(0, Math.floor((now - time) / 86_400_000));
  if (days < 1) return '오늘';
  const formatter = new Intl.RelativeTimeFormat('ko', { numeric: 'always' });
  if (days < 7) return formatter.format(-days, 'day');
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return formatter.format(-weeks, 'week');
  return new Date(time).toLocaleDateString('ko-KR');
}

function normaliseLibraryPaper(paper, index) {
  const authors = Array.isArray(paper?.authors) ? paper.authors.filter(Boolean) : [];
  const collectionIds = Array.isArray(paper?.collectionIds)
    ? paper.collectionIds.filter(Boolean)
    : [paper?.coll || paper?.collectionId || paper?.collection].filter(Boolean);
  const keywords = [
    ...(Array.isArray(paper?.tags) ? paper.tags : []),
    ...(Array.isArray(paper?.matchedKeywords) ? paper.matchedKeywords : []),
    ...(Array.isArray(paper?.keywords) ? paper.keywords : []),
  ];
  const shelf = String(paper?.shelf || paper?.libraryStatus || '').toLowerCase();
  const rawProgress = Number(paper?.readingProgress ?? paper?.progress ?? (shelf === 'done' ? 100 : 0));
  const progress = Number.isFinite(rawProgress) ? Math.max(0, Math.min(100, rawProgress)) : 0;
  const noteCount = Number(paper?.noteCount ?? paper?.notes?.length ?? 0);
  const venue = String(paper?.venue || '').trim();
  const year = paper?.year ? String(paper.year).trim() : '';
  const venueLabel = venue && year && venue.includes(year) ? venue : [venue, year].filter(Boolean).join(' ');
  return {
    ...paper,
    active: index === 0,
    added: formatLibraryDate(paper?.savedAt || paper?.updatedAt),
    auth: authors.length ? authors.join(', ') : paper?.sourceName || paper?.sourceProvider || 'Unknown author',
    coll: collectionIds[0] || '',
    flag: Boolean(paper?.flag),
    id: String(paper?.paperId || paper?.id || `paper-${index}`),
    notes: Number.isFinite(noteCount) ? Math.max(0, noteCount) : 0,
    progress,
    tags: Array.from(new Set(keywords)).slice(0, 4),
    title: String(paper?.title || paper?.sourceName || 'Untitled paper'),
    venue: venueLabel || paper?.sourceProvider || 'Paper',
  };
}

function normaliseReadingSession(session) {
  return {
    ...session,
    assets: Array.isArray(session?.assets) ? session.assets : [],
    authors: Array.isArray(session?.authors) ? session.authors : [],
    chatMessages: Array.isArray(session?.chatMessages) ? session.chatMessages : [],
    evidenceCoverage: session?.evidenceCoverage || null,
    highlights: Array.isArray(session?.highlights) ? session.highlights : [],
    id: String(session?.id || ''),
    notes: Array.isArray(session?.notes) ? session.notes : [],
    pageCount: Number.isFinite(Number(session?.pageCount)) ? Math.max(1, Number(session.pageCount)) : null,
    paperId: String(session?.paperId || session?.paper?.paperId || ''),
    parseStatus: String(session?.parseStatus || 'idle'),
    pdfUrl: String(session?.pdfUrl || session?.paper?.pdfUrl || ''),
    sections: Array.isArray(session?.sections) ? session.sections : [],
    summaryCards: session?.summaryCards || null,
    summaryStatus: String(session?.summaryStatus || 'idle'),
    title: String(session?.title || session?.paper?.title || 'Untitled paper'),
    venue: String(session?.venue || session?.paper?.venue || ''),
    year: session?.year ?? session?.paper?.year ?? null,
  };
}

function sessionAsPaper(session, index = 0) {
  if (!session?.paperId) return null;
  return normaliseLibraryPaper(
    {
      abstract: session.abstract,
      authors: session.authors,
      paperId: session.paperId,
      pdfUrl: session.pdfUrl,
      progress: session.parseStatus === 'done' ? 100 : 0,
      sourceName: session.sourceName,
      sourceProvider: session.sourceProvider,
      title: session.title,
      venue: session.venue,
      year: session.year,
    },
    index,
  );
}

function normalisePanelSection(section, index, activeIndex = 0) {
  const label = String(section?.label || section?.title || `Section ${index + 1}`).trim();
  const status = String(section?.status || 'done').toLowerCase();
  return {
    active: index === activeIndex,
    id: String(section?.id || `${label}-${index}`),
    label,
    pageEnd: section?.pageEnd ?? null,
    pageStart: section?.pageStart ?? null,
    status: ['done', 'running', 'todo', 'queue'].includes(status) ? status : 'done',
    summary: String(section?.summary || ''),
  };
}

function buildPanelOutline(session) {
  const sections = Array.isArray(session?.sections) ? session.sections : [];
  const activeIndex = Math.max(0, sections.findIndex((section) => section?.active));
  return sections
    .map((section, index) => normalisePanelSection(section, index, activeIndex))
    .filter((section) => section.label);
}

function buildPanelNotes(session) {
  return (Array.isArray(session?.notes) ? session.notes : [])
    .map((note, index) => {
      const text = String(note?.body || note?.quote || '').trim();
      if (!text) return null;
      return {
        cat: noteLabel(note),
        color: noteColor(note),
        id: String(note?.id || `note-${index}`),
        pg: note?.page || '',
        text,
      };
    })
    .filter(Boolean);
}

function panelOutlineProgress(outline, paper, session) {
  if (Number.isFinite(Number(paper?.progress))) {
    return Math.max(0, Math.min(100, Math.round(Number(paper.progress))));
  }
  if (outline.length) {
    const done = outline.filter((section) => section.status === 'done').length;
    return Math.max(0, Math.min(100, Math.round((done / outline.length) * 100)));
  }
  return session?.parseStatus === 'done' ? 100 : 0;
}

function hasSummaryCards(summaryCards) {
  return Boolean(
    summaryCards &&
    (
      summaryCards.tldr ||
      summaryCards.method ||
      summaryCards.result ||
      summaryCards.limit ||
      summaryCards.fullSummary ||
      (Array.isArray(summaryCards.keyPoints) && summaryCards.keyPoints.length)
    )
  );
}

function noteLabel(note) {
  const kind = String(note?.kind || 'note').trim();
  return kind ? kind[0].toUpperCase() + kind.slice(1) : 'Note';
}

function noteColor(note) {
  const kind = String(note?.kind || '').toLowerCase();
  if (kind.includes('method')) return T.read;
  if (kind.includes('result')) return T.search;
  if (kind.includes('limit')) return T.result;
  if (kind.includes('claim')) return T.research;
  return T.writing;
}

const LIBRARY_SORT_OPTIONS = [
  ['recent', '최근'],
  ['saved', '저장일'],
  ['oldest', '오래된 순'],
  ['title', '제목'],
  ['year', '연도'],
];

const DEFAULT_LIBRARY_FILTERS = Object.freeze({
  collection: '',
  q: '',
  shelf: 'all',
  sort: 'recent',
  tag: '',
});

function buildLibraryQuery(filters = DEFAULT_LIBRARY_FILTERS) {
  const params = new URLSearchParams();
  const query = String(filters.q || '').trim();
  const shelf = String(filters.shelf || 'all');
  const collection = String(filters.collection || '');
  const tag = String(filters.tag || '');
  const sort = String(filters.sort || 'recent');

  if (query) params.set('q', query);
  if (shelf && shelf !== 'all') params.set('shelf', shelf);
  if (collection) params.set('collection', collection);
  if (tag) params.set('tag', tag);
  if (sort) params.set('sort', sort);

  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

function libraryFilterActive(filters = DEFAULT_LIBRARY_FILTERS) {
  return Boolean(
    String(filters.q || '').trim() ||
    (filters.shelf && filters.shelf !== 'all') ||
    filters.collection ||
    filters.tag ||
    (filters.sort && filters.sort !== 'recent')
  );
}

function libraryCollections(library) {
  const labels = new Map(COLLECTIONS.map((collection) => [collection.id, collection.name]));
  const counts = new Map();
  for (const paper of library) {
    const ids = Array.isArray(paper.collectionIds) && paper.collectionIds.length
      ? paper.collectionIds
      : [paper.coll].filter(Boolean);
    for (const id of ids) {
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([id, count]) => ({ count, id, name: labels.get(id) || id }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function libraryTags(library) {
  const counts = new Map();
  for (const paper of library) {
    for (const tag of Array.isArray(paper.tags) ? paper.tags : []) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([id, count]) => ({ count, id }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

const LIBRARY_TAG_ORDER = ['reranking', 'efficiency', 'framework', 'analysis', 'benchmark', 'evaluation', 'retrieval', 'DPR', 'generalization'];

function orderedLibraryTags(tags) {
  const order = new Map(LIBRARY_TAG_ORDER.map((id, index) => [id, index]));
  return [...tags].sort((left, right) => {
    const leftOrder = order.has(left.id) ? order.get(left.id) : Number.MAX_SAFE_INTEGER;
    const rightOrder = order.has(right.id) ? order.get(right.id) : Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.id.localeCompare(right.id);
  });
}

function libraryShelfCount(library, shelf) {
  return library.filter((paper) => shelfMatch(paper, shelf)).length;
}

function LibStatus({ p }) {
  const st = libStatus(p);
  if (st==='done') return <span className="lr-stat done"><Icon name="check" size={13} color="#fff"/></span>;
  if (st==='unread') return <span className="lr-stat unread"/>;
  const r=9, c=2*Math.PI*r, off=c*(1-p.progress/100);
  return (
    <span className="lr-stat reading">
      <svg width="24" height="24" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r={r} fill="none" stroke={T.s3} strokeWidth="2.6"/>
        <circle cx="12" cy="12" r={r} fill="none" stroke={T.read} strokeWidth="2.6" strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" transform="rotate(-90 12 12)"/>
      </svg>
    </span>
  );
}

function LibraryPanel({ collections, filters, library, onCollection, onCreateCollection, onReset, onShelf, onTag, tags }) {
  return (
    <div className="float-panel">
      <div className="fp-body" style={{ paddingTop:12 }}>
        <div className="fp-section">
          <div className="fp-section-h"><Icon name="book" size={11} color={T.read}/>서가</div>
          {SHELVES.map(s => (
            <button key={s.id} className={`lib-shelf ${filters.shelf===s.id ? 'on':''}`} onClick={() => onShelf(s.id)}>
              <Icon name={s.ic} size={13}/>{s.name}<span className="c">{libraryShelfCount(library, s.id)}</span>
            </button>
          ))}
        </div>
        <div className="fp-section">
          <div className="fp-section-h"><Icon name="folder" size={11} color={T.read}/>컬렉션<button className="more" onClick={onCreateCollection} style={{ marginLeft:'auto' }} type="button">+ 새 컬렉션</button></div>
          {collections.map(c => (
            <button key={c.id} className={`lib-shelf ${filters.collection===c.id ? 'on':''}`} onClick={() => onCollection(c.id)}>
              <Icon name="folder" size={13}/>{c.name}<span className="c">{c.count}</span>
            </button>
          ))}
          {!collections.length && <div className="wempty" style={{ padding:'8px 4px' }}>컬렉션이 없습니다.</div>}
        </div>
        <div className="fp-section">
          <div className="fp-section-h"><Icon name="highlight" size={11} color={T.read}/>태그</div>
          <div className="lib-tagcloud">
            {orderedLibraryTags(tags).map(t => (
              <button key={t.id} className={`lib-tagc ${filters.tag===t.id ? 'on':''}`} onClick={() => onTag(t.id)}>
                {t.id}
              </button>
            ))}
          </div>
          {!tags.length && <div className="wempty" style={{ padding:'8px 4px' }}>태그가 없습니다.</div>}
        </div>
        {libraryFilterActive(filters) && (
          <button className="lib-clear" onClick={onReset}>필터 초기화</button>
        )}
      </div>
    </div>
  );
}

function LibraryView({ allLibrary, filters, library, loading, onCreateCollection, onFilters, onOpen }) {
  const [layout, setLayout] = useState('list');
  const collections = useMemo(() => libraryCollections(allLibrary), [allLibrary]);
  const tags = useMemo(() => libraryTags(allLibrary), [allLibrary]);
  const emptyText = libraryFilterActive(filters) ? '조건에 맞는 논문이 없습니다.' : '저장된 논문이 없습니다.';
  const sortLabel = LIBRARY_SORT_OPTIONS.find(([value]) => value === filters.sort)?.[1] || '최근';

  const updateFilters = (patch) => {
    onFilters((current) => ({ ...current, ...patch }));
  };

  const toggleCollection = (id) => {
    updateFilters({ collection: filters.collection === id ? '' : id });
  };

  const toggleTag = (id) => {
    updateFilters({ tag: filters.tag === id ? '' : id });
  };

  return (
    <div className="main">
      <LibraryPanel
        collections={collections}
        filters={filters}
        library={allLibrary}
        onCollection={toggleCollection}
        onCreateCollection={onCreateCollection}
        onReset={() => onFilters(DEFAULT_LIBRARY_FILTERS)}
        onShelf={(shelf) => updateFilters({ shelf })}
        onTag={toggleTag}
        tags={tags}
      />
      <div className="lib-wrap">
        <div className="lib-toolbar">
          <div className="lib-search">
            <Icon name="search" size={13}/>
            <input
              aria-label="라이브러리 검색"
              onChange={(event) => updateFilters({ q: event.target.value })}
              placeholder="제목 · 저자 · 태그 검색"
              value={filters.q}
            />
            {!filters.q && <Kbd>⌘K</Kbd>}
          </div>
          <label className="lib-sort">
            <Icon name="list" size={13}/>
            <span>정렬:</span>
            <select aria-label="라이브러리 정렬" onChange={(event) => updateFilters({ sort: event.target.value })} value={filters.sort}>
              {LIBRARY_SORT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <span className="lib-count">{loading ? '동기화 중' : `${library.length} / ${allLibrary.length}`}</span>
          <div className="lib-segs">
            <button className={layout==='list'?'on':''} onClick={() => setLayout('list')} title="목록"><Icon name="list" size={14}/></button>
            <button className={layout==='grid'?'on':''} onClick={() => setLayout('grid')} title="격자"><Icon name="grid" size={14}/></button>
          </div>
        </div>
        <div className="lib-body" data-library-query={buildLibraryQuery(filters)} data-library-sort={sortLabel}>
          {layout==='list' ? (
            <div className="lib-list">
              {library.map(p => (
                <div key={p.id} className={`lib-row ${p.flag?'flagged':''}`} onClick={() => onOpen(p.id)}>
                  <LibStatus p={p}/>
                  <div className="lr-main">
                    <div className="t">{p.title}</div>
                    <div className="m">
                      <span className="au">{p.auth}</span><span style={{ color:T.t4 }}>·</span><span>{p.venue}</span>
                      {p.tags.map(t => <span key={t} className="lib-tag">{t}</span>)}
                    </div>
                  </div>
                  <div className="lr-side">
                    {p.flag && <span className="lr-flag" title="중요 표시"><Icon name="bookmark" size={14} color={T.result}/></span>}
                    {p.notes>0 && <span className="sm"><Icon name="note" size={12}/>{p.notes}</span>}
                    <span className="sm">{p.added}</span>
                    <span className="open"><Icon name="arrowR" size={15}/></span>
                  </div>
                </div>
              ))}
              {!library.length && <div className="wempty">{emptyText}</div>}
            </div>
          ) : (
            <div className="lib-grid">
              {library.map(p => {
                const st = libStatus(p);
                return (
                  <div key={p.id} className="lib-card" onClick={() => onOpen(p.id)}>
                    <div className="ch">
                      <LibStatus p={p}/>
                      <span className="vtag">{p.venue}</span>
                      {p.flag && <Icon name="bookmark" size={13} color={T.result} style={{ marginLeft:'auto' }}/>}
                    </div>
                    <div className="ct">{p.title}</div>
                    <div className="cm">{p.auth}</div>
                    <div className="cbar"><i style={{ width:`${Math.max(p.progress,3)}%`, background:STATUS_C[st] }}/></div>
                    <div className="cf">
                      {p.tags.map(t => <span key={t} className="lib-tag">{t}</span>)}
                      {p.notes>0 && <span className="sm" style={{ marginLeft:'auto', color:T.t4, fontSize:11, fontFamily:"'JetBrains Mono',monospace", display:'inline-flex', alignItems:'center', gap:4 }}><Icon name="note" size={11}/>{p.notes}</span>}
                    </div>
                  </div>
                );
              })}
              {!library.length && <div className="wempty">{emptyText}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============ Reading tab (workbench split) ============ */
function ReadingTab({ projectId = 'rag-reranker', readSub, route, setReadSub }) {
  const [view, setView] = useState(route?.reading?.view || 'library');
  const [paperId, setPaperId] = useState('');
  const [docTab, setDocTab] = useState(route?.reading?.docTab || 'pdf');
  const [wbTab, setWbTab] = useState('chat');
  const [splitH, setSplitH] = useState(62);
  const [splitV, setSplitV] = useState(62);
  const [wbCollapsed, setWbCollapsed] = useState(false);
  const [mobileWorkbenchOpen, setMobileWorkbenchOpen] = useState(false);
  const [orient, setOrient] = useState('horizontal');
  const [libraryFilters, setLibraryFilters] = useState(DEFAULT_LIBRARY_FILTERS);
  const [libraryRefresh, setLibraryRefresh] = useState(0);
  const [readingAction, setReadingAction] = useState({ message: '', status: 'idle' });
  const [uploadState, setUploadState] = useState({ message: '', status: 'idle' });
  const [assetSource, setAssetSource] = useState(null);
  const [readerSelection, setReaderSelection] = useState(null);
  const [collectionModalOpen, setCollectionModalOpen] = useState(false);
  const [collectionDraft, setCollectionDraft] = useState({ name: '', paperId: '' });
  const [libraryMenuOpen, setLibraryMenuOpen] = useState(false);
  const uploadInputRef = useRef(null);
  const libraryQuery = useMemo(() => buildLibraryQuery(libraryFilters), [libraryFilters]);
  const loadAllLibrary = useCallback(() => api(`api/projects/${encodeURIComponent(projectId)}/library`), [projectId]);
  const loadLibrary = useCallback(() => api(`api/projects/${encodeURIComponent(projectId)}/library${libraryQuery}`), [projectId, libraryQuery]);
  const loadReadingSessions = useCallback(() => api(`api/projects/${encodeURIComponent(projectId)}/reading-sessions`), [projectId]);
  const allLibraryState = useServerResource(['reading-library-all', projectId, libraryRefresh], loadAllLibrary);
  const libraryState = useServerResource(['reading-library', projectId, libraryRefresh, libraryQuery], loadLibrary);
  const readingSessionsState = useServerResource(['reading-sessions', projectId, libraryRefresh], loadReadingSessions);
  const allLibrary = useMemo(
    () => (allLibraryState.data?.results || []).map(normaliseLibraryPaper),
    [allLibraryState.data]
  );
  const collectionCount = useMemo(() => libraryCollections(allLibrary).length, [allLibrary]);
  const library = useMemo(
    () => (libraryState.data?.results || []).map(normaliseLibraryPaper),
    [libraryState.data]
  );
  const paperSource = allLibrary.length ? allLibrary : library;
  const readingSessions = useMemo(
    () => (readingSessionsState.data?.results || []).map(normaliseReadingSession),
    [readingSessionsState.data]
  );
  const routeSessionId = String(route?.reading?.sessionId || '');
  const routeSession = readingSessions.find((entry) => entry.id === routeSessionId) || null;
  const selectedPaper = paperSource.find(p => p.id===paperId) || null;
  const sessionPaper = sessionAsPaper(routeSession, paperSource.length);
  const paper = selectedPaper || sessionPaper || paperSource[0] || normaliseLibraryPaper({}, 0);
  const session = routeSession
    || readingSessions.find((entry) => entry.paperId && entry.paperId === paper.id)
    || null;
  const sessionSummaryReady = hasSummaryCards(session?.summaryCards);
  const sessionChatCount = session?.chatMessages?.length || 0;
  const sessionNotesCount = session?.notes?.length || 0;
  const sessionAssetsCount = session?.assets?.length || 0;
  const panelLibrary = useMemo(
    () => paperSource.map((entry) => ({ ...entry, active: entry.id === paper.id })),
    [paperSource, paper.id]
  );
  const panelOutline = useMemo(() => buildPanelOutline(session), [session]);
  const panelNotes = useMemo(() => buildPanelNotes(session), [session]);
  const panelProgress = panelOutlineProgress(panelOutline, paper, session);
  const applyHash = useCallback((hash) => {
    if (typeof window === 'undefined') return;
    if (window.location.hash === hash) {
      return;
    }
    window.location.hash = hash;
  }, []);
  const openLibrary = useCallback(() => {
    setView('library');
    applyHash(readingProjectHash(projectId));
  }, [applyHash, projectId]);
  const openReader = useCallback((id) => {
    const nextPaperId = String(id || '');
    const nextSession = readingSessions.find((entry) => entry.paperId === nextPaperId || entry.id === nextPaperId);
    setPaperId(nextSession?.paperId || nextPaperId);
    setView('reader');
    setDocTab('pdf');
    if (nextSession?.id) {
      applyHash(readingSessionHash(projectId, nextSession.id, 'pdf'));
    }
  }, [applyHash, projectId, readingSessions]);
  const openCurrentReader = useCallback(() => {
    setView('reader');
    if (session?.id) {
      applyHash(readingSessionHash(projectId, session.id, docTab || 'pdf'));
    }
  }, [applyHash, docTab, projectId, session?.id]);
  const setReaderDocTab = useCallback((nextTab) => {
    const normalizedTab = nextTab === 'summary' ? 'summary' : 'pdf';
    setDocTab(normalizedTab);
    if (session?.id) {
      applyHash(readingSessionHash(projectId, session.id, normalizedTab));
    }
  }, [applyHash, projectId, session?.id]);
  const drag = useRef(null);

  const pickUploadFile = () => {
    uploadInputRef.current?.click();
  };

  const openCollectionModal = () => {
    setCollectionDraft({ name: '', paperId: paper?.id || allLibrary[0]?.id || '' });
    setCollectionModalOpen(true);
  };

  const closeCollectionModal = () => {
    setCollectionModalOpen(false);
    setCollectionDraft({ name: '', paperId: '' });
  };

  const createCollection = async (event) => {
    event.preventDefault();
    const name = collectionDraft.name.trim();
    const targetPaperId = collectionDraft.paperId || allLibrary[0]?.id || '';
    const targetPaper = allLibrary.find((entry) => entry.id === targetPaperId);
    if (!name || !targetPaper) {
      setUploadState({ message: '컬렉션 이름과 논문을 선택해 주세요.', status: 'error' });
      return;
    }

    const collectionId = name.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-+|-+$/g, '') || name;
    const collectionIds = Array.from(new Set([...(targetPaper.collectionIds || []), collectionId]));
    setUploadState({ message: '컬렉션 저장 중', status: 'running' });
    try {
      await api(`api/projects/${encodeURIComponent(projectId)}/library/${encodeURIComponent(targetPaper.id)}`, {
        body: { collectionIds },
        method: 'PATCH',
      });
      setLibraryFilters((current) => ({ ...current, collection: collectionId }));
      setLibraryRefresh((value) => value + 1);
      setUploadState({ message: '컬렉션을 만들었습니다.', status: 'done' });
      closeCollectionModal();
    } catch (error) {
      setUploadState({ message: error instanceof Error ? error.message : '컬렉션을 만들지 못했습니다.', status: 'error' });
    }
  };

  const uploadPaper = async (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) return;

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setUploadState({ message: 'PDF만 선택해 주세요.', status: 'error' });
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      setUploadState({ message: '100MB 이하 PDF를 선택해 주세요.', status: 'error' });
      return;
    }

    setUploadState({ message: '업로드 중', status: 'running' });
    try {
      const payload = await api(`api/projects/${encodeURIComponent(projectId)}/reading-sessions/upload`, {
        body: file,
        headers: {
          'content-type': file.type || 'application/pdf',
          'x-file-name': encodeURIComponent(file.name),
        },
        method: 'POST',
      });
      const uploadedPaperId = String(payload?.paper?.paperId || payload?.readingSession?.paperId || '');
      if (uploadedPaperId) {
        setPaperId(uploadedPaperId);
      }
      setLibraryRefresh((value) => value + 1);
      setUploadState({ message: '추가했습니다.', status: 'done' });
    } catch (error) {
      setUploadState({ message: error instanceof Error ? error.message : '업로드하지 못했습니다.', status: 'error' });
    }
  };

  const downloadLibrary = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      projectId,
      papers: allLibrary,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `ares-library-${projectId}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
    setUploadState({ message: '내보냈습니다.', status: 'done' });
  };

  const showLibraryMore = () => {
    setLibraryMenuOpen((open) => !open);
  };

  const resetLibraryFilters = () => {
    setLibraryFilters(DEFAULT_LIBRARY_FILTERS);
    setLibraryMenuOpen(false);
    setUploadState({ message: '필터를 초기화했습니다.', status: 'done' });
  };

  const summarizeSession = async () => {
    if (!session?.id || readingAction.status === 'running') return;
    setReadingAction({ message: '요약 중', status: 'running' });
    try {
      await api(`api/reading-sessions/${encodeURIComponent(session.id)}/summarize`, { method: 'POST' });
      setLibraryRefresh((value) => value + 1);
      setReadingAction({ message: '요약했습니다.', status: 'done' });
    } catch (error) {
      setReadingAction({ message: error instanceof Error ? error.message : '요약하지 못했습니다.', status: 'error' });
    }
  };

  const sendReadingChat = async (message, selection = readerSelection) => {
    if (!session?.id || readingAction.status === 'running') return;
    const chatSelection = readingChatSelectionPayload(selection);
    setReadingAction({ message: '답변 중', status: 'running' });
    try {
      await api(`api/reading-sessions/${encodeURIComponent(session.id)}/chat`, {
        body: chatSelection ? { message, selection: chatSelection } : { message },
        method: 'POST',
      });
      setLibraryRefresh((value) => value + 1);
      setReadingAction({ message: '답변을 추가했습니다.', status: 'done' });
    } catch (error) {
      setReadingAction({ message: error instanceof Error ? error.message : '답변하지 못했습니다.', status: 'error' });
    }
  };

  const jumpToAssetSource = useCallback((sourceHighlight) => {
    if (!sourceHighlight?.page) return;
    setAssetSource(sourceHighlight);
    setReaderDocTab('pdf');
    setMobileWorkbenchOpen(false);
  }, [setReaderDocTab]);

  const askReaderSelection = useCallback((selection) => {
    if (selection?.quote) {
      setReaderSelection(selection);
    }
    setWbTab('chat');
    setWbCollapsed(false);
    if (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 860px)').matches) {
      setMobileWorkbenchOpen(true);
    }
  }, []);

  const clearReaderSelection = useCallback(() => {
    setReaderSelection(null);
    window.getSelection?.()?.removeAllRanges();
  }, []);

  const openMobileWorkbench = (nextTab) => {
    setWbTab(nextTab);
    setWbCollapsed(false);
    setMobileWorkbenchOpen(true);
  };

  const openNotesWorkbench = useCallback(() => {
    setWbTab('notes');
    setWbCollapsed(false);
    if (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 860px)').matches) {
      setMobileWorkbenchOpen(true);
    }
  }, []);

  useEffect(() => {
    if (routeSession?.paperId && paperId !== routeSession.paperId) {
      setPaperId(routeSession.paperId);
      return;
    }
    if (!paperId && !routeSessionId && paperSource[0]) {
      setPaperId(paperSource[0].id);
    }
  }, [paperId, paperSource, routeSession?.paperId, routeSessionId]);

  useEffect(() => {
    setAssetSource(null);
    setReaderSelection(null);
    setMobileWorkbenchOpen(false);
  }, [session?.id]);

  useEffect(() => {
    if (route?.reading?.view) {
      setView(route.reading.view);
    }
    if (route?.reading?.docTab) {
      setDocTab(route.reading.docTab);
    }
  }, [route?.hash]);

  const onDown = (e) => { drag.current = { startX:e.clientX, startY:e.clientY, startSplit: orient==='horizontal' ? splitH : splitV }; };
  useEffect(() => {
    const onMove = (e) => {
      if (!drag.current) return;
      if (orient==='horizontal') {
        const left = 56 + 288;
        const wbStrip = wbCollapsed ? 42 : 0;
        const delta = e.clientX - drag.current.startX;
        const total = window.innerWidth - left - wbStrip - 5;
        setSplitH(Math.max(30, Math.min(82, drag.current.startSplit + (delta/total)*100)));
      } else {
        const delta = e.clientY - drag.current.startY;
        const total = window.innerHeight - 58 - 5;
        setSplitV(Math.max(32, Math.min(82, drag.current.startSplit + (delta/total)*100)));
      }
    };
    const onUp = () => drag.current = null;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [orient, wbCollapsed]);

  const split = orient==='horizontal' ? splitH : splitV;
  const sessionPdfUrl = session?.id ? appUrl(`api/reading-sessions/${encodeURIComponent(session.id)}/pdf`).href : '';
  const docPane = (
    <div className="pane reading-pane reading-doc-pane" style={{ flex: wbCollapsed ? 1 : `0 0 calc(${split}% - 2.5px)` }}>
      <DocumentHeader pageCount={session?.pageCount} pdfUrl={sessionPdfUrl} tab={docTab} setTab={setReaderDocTab} summarized={sessionSummaryReady} orient={orient} setOrient={setOrient}/>
          <div className="pane-body">{docTab==='pdf' ? <PdfView dockHidden={mobileWorkbenchOpen} onAskSelection={askReaderSelection} onOpenNotes={openNotesWorkbench} onRefresh={() => setLibraryRefresh((value) => value + 1)} onSelectionChange={setReaderSelection} session={session} sourceHighlight={assetSource} targetPage={assetSource?.page || 1}/> : <SummaryView actionStatus={readingAction.status} ready={sessionSummaryReady} session={session} onGen={summarizeSession}/>}</div>
    </div>
  );
  const wbPane = (
    <div className={`pane reading-pane reading-workbench-pane ${mobileWorkbenchOpen ? 'mobile-open' : ''}`} style={{ flex:`0 0 calc(${100-split}% - 2.5px)` }}>
      <WorkbenchHeader assetsCount={sessionAssetsCount} chatCount={sessionChatCount} notesCount={sessionNotesCount} tab={wbTab} setTab={setWbTab} onCollapse={() => setWbCollapsed(true)} onMobileClose={() => setMobileWorkbenchOpen(false)}/>
      <div className="pane-body">
        {wbTab==='chat' && <ChatView actionStatus={readingAction.status} onClearSelection={clearReaderSelection} onSend={sendReadingChat} selectedTextSelection={readerSelection} session={session}/>}
        {wbTab==='notes' && <NotesView onRefresh={() => setLibraryRefresh((value) => value + 1)} projectId={projectId} session={session}/>}
        {wbTab==='assets' && <AssetsView onRefresh={() => setLibraryRefresh((value) => value + 1)} onSourceJump={jumpToAssetSource} session={session}/>}
      </div>
    </div>
  );
  const mobileWorkbenchActions = (
    <div className="mobile-wb-actions" aria-label="Reader workbench">
      {[
        ['chat', 'chat', 'Chat', sessionChatCount],
        ['notes', 'note', 'Notes', sessionNotesCount],
        ['assets', 'grid', 'Assets', sessionAssetsCount],
      ].map(([id, icon, label, count]) => (
        <button className={wbTab === id ? 'on' : ''} key={id} onClick={() => openMobileWorkbench(id)} type="button">
          <Icon name={icon} size={14}/><span>{label}</span><span className="count" style={mono}>{count}</span>
        </button>
      ))}
    </div>
  );

  const viewToggle = (
    <div className="seg">
      <button className={view==='library'?'on':''} onClick={openLibrary}><Icon name="grid" size={13}/> 라이브러리</button>
      <button className={view==='reader'?'on':''} onClick={openCurrentReader}><Icon name="book" size={13}/> 리더</button>
    </div>
  );

  if (view==='library') {
    return (
      <>
        <div className="metabar">
          <div className="crumb-group"><Icon name="book" size={13} color={T.read}/><span style={{ color:T.read, fontWeight:550 }}>Reading</span></div>
          <div style={{ display:'flex', flexDirection:'column', minWidth:0 }}>
            <div className="title">라이브러리</div>
            <div className="byline"><span>{allLibrary.length} papers</span><span style={{ color:T.t4 }}>·</span><span>{libraryShelfCount(allLibrary, 'reading')} 읽는 중</span><span style={{ color:T.t4 }}>·</span><span>{libraryState.loading || allLibraryState.loading ? '동기화 중' : `${collectionCount} 컬렉션`}</span></div>
          </div>
          <div className="meta-actions">
            {viewToggle}
            {uploadState.message && (
              <span style={{ color: uploadState.status === 'error' ? T.insight : T.t3, fontSize:12 }}>{uploadState.message}</span>
            )}
            <button className="btn-p" onClick={pickUploadFile} disabled={uploadState.status === 'running'}><Icon name="plus" size={13} color="#fff"/> 논문 추가</button>
            <span style={{ width:1, height:18, background:T.b1, margin:'0 4px' }}/>
            <button aria-label="라이브러리 내보내기" className="btn-ghost" onClick={downloadLibrary} type="button"><Icon name="download" size={14}/></button>
            <button aria-label="라이브러리 옵션" className="btn-ghost" onClick={showLibraryMore} type="button"><Icon name="moreH" size={14}/></button>
            {libraryMenuOpen && (
              <div className="library-action-menu" role="menu">
                <button onClick={downloadLibrary} role="menuitem" type="button">JSON 내보내기</button>
                <button onClick={resetLibraryFilters} role="menuitem" type="button">필터 초기화</button>
              </div>
            )}
          </div>
        </div>
        <input ref={uploadInputRef} type="file" accept="application/pdf,.pdf" onChange={uploadPaper} hidden />
        <LibraryView allLibrary={allLibrary} filters={libraryFilters} library={library} loading={libraryState.loading} onCreateCollection={openCollectionModal} onFilters={setLibraryFilters} onOpen={openReader}/>
        {collectionModalOpen && (
          <div className="library-modal-overlay" role="presentation">
            <form aria-label="새 컬렉션" className="library-modal" onSubmit={createCollection} role="dialog">
              <div className="library-modal-head">
                <span>새 컬렉션</span>
                <button aria-label="닫기" className="pane-icon-btn" onClick={closeCollectionModal} type="button"><Icon name="x" size={13}/></button>
              </div>
              <label>
                <span>이름</span>
                <input autoFocus onChange={(event) => setCollectionDraft((current) => ({ ...current, name: event.target.value }))} placeholder="예: Reranking 비용" value={collectionDraft.name} />
              </label>
              <label>
                <span>첫 논문</span>
                <select onChange={(event) => setCollectionDraft((current) => ({ ...current, paperId: event.target.value }))} value={collectionDraft.paperId}>
                  {allLibrary.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
                </select>
              </label>
              <div className="library-modal-actions">
                <button className="btn-s" onClick={closeCollectionModal} type="button">취소</button>
                <button className="btn-p" disabled={uploadState.status === 'running'} type="submit"><Icon name="folder" size={13}/> 만들기</button>
              </div>
            </form>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="metabar reading-reader-metabar">
        <div className="crumb-group"><Icon name="book" size={13} color={T.read}/><span style={{ color:T.read, fontWeight:550 }}>Reading</span></div>
        <button className="btn-ghost" style={{ marginRight:2 }} onClick={openLibrary}><Icon name="chevL" size={14}/> 라이브러리</button>
        <div style={{ display:'flex', flexDirection:'column', minWidth:0 }}>
          <div className="title">{paper.title}</div>
          <div className="byline">
            <span>{paper.auth}</span><span style={{ color:T.t4 }}>·</span>
            <Tag label={paper.venue}/>
          </div>
        </div>
        <div className="meta-actions">
          {viewToggle}
          {readingAction.message && (
            <span style={{ color: readingAction.status === 'error' ? T.insight : T.t3, fontSize:12 }}>{readingAction.message}</span>
          )}
          <button className={sessionSummaryReady?'btn-s':'btn-p'} disabled={!session?.id || readingAction.status === 'running'} onClick={summarizeSession}>
            <Icon name={sessionSummaryReady?'check':'sparkles'} size={13} color={sessionSummaryReady?T.search:undefined}/>{sessionSummaryReady?'Analyzed':'Analyze'}
          </button>
        </div>
      </div>

      <div className="main reading-main">
        <ReadingPanel library={panelLibrary} notes={panelNotes} onOpenPaper={openReader} outline={panelOutline} outlineProgress={panelProgress} sub={readSub} setSub={setReadSub}/>
        <div className={`split reading-split ${orient==='vertical'?'vertical':''}`}>
          {wbCollapsed ? docPane : (<>{docPane}<div className={`resize ${orient==='horizontal'?'h':'v'}`} onMouseDown={onDown}/>{wbPane}</>)}
        </div>
        {mobileWorkbenchActions}
        {wbCollapsed && (
          <div className="wb-strip">
            {[['chat','chat',sessionChatCount],['notes','note',sessionNotesCount],['assets','grid',sessionAssetsCount]].map(([id,ic,n]) => (
              <button key={id} className="rail-btn" title={id} onClick={() => { setWbTab(id); setWbCollapsed(false); }}>
                <Icon name={ic} size={15}/>{n && <span className="badge" style={mono}>{n}</span>}
              </button>
            ))}
            <div className="rail-spacer"/>
            <button className="rail-btn" title="Expand" onClick={() => setWbCollapsed(false)}><Icon name="chevL" size={15}/></button>
          </div>
        )}
      </div>
    </>
  );
}

export { ReadingTab };
