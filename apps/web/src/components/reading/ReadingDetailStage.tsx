import { useEffect, useMemo, useRef, useState } from 'react';
import { BotIcon, BookOpenIcon, ChevronLeftIcon, FileTextIcon, Grid3X3Icon, MessageSquareIcon, MinusIcon, PlusIcon, SearchIcon, SendIcon, SparklesIcon, StickyNoteIcon, Trash2Icon, UserIcon } from 'lucide-react';

import { appUrl, readingSessionPath, type ApiProject, type ApiReadingSession } from '@/app/api';
import { hydrateReactReadingPdfSurface } from '@/app/pdfViewer';
import type { ReadingDocumentTab, ReadingWorkbenchTab } from '@/app/router';

type ReadingDetailStageProps = {
  analyzing: boolean;
  documentTab: ReadingDocumentTab;
  onAnalyze: (session: ApiReadingSession) => void;
  onBackToLibrary: () => void;
  onCreateNote: (session: ApiReadingSession) => void;
  onDeleteNote: (session: ApiReadingSession, noteId: string) => void;
  onDocumentTabChange: (tab: ReadingDocumentTab) => void;
  onSaveNote: (session: ApiReadingSession, noteId: string, body: string) => void;
  onSendQuestion: (session: ApiReadingSession, message: string) => void;
  onWorkbenchTabChange: (tab: ReadingWorkbenchTab) => void;
  project: ApiProject | null;
  readingSessions: ApiReadingSession[];
  selectedSessionId: string;
  workbenchBusy: boolean;
  workbenchTab: ReadingWorkbenchTab;
};

type ReadingSection = {
  label?: string;
  page?: number;
  pageStart?: number;
  status?: string;
};

function text(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object') : [];
}

function noteId(note: Record<string, unknown>, index: number) {
  return text(note.id, `note-${index}`);
}

function noteBody(note: Record<string, unknown>) {
  return text(note.body, text(note.memo));
}

function messageRole(message: Record<string, unknown>) {
  return text(message.role) === 'user' ? 'user' : 'assistant';
}

function formatAuthors(authors: string[] = []) {
  if (!authors.length) {
    return 'Unknown authors';
  }
  if (authors.length <= 2) {
    return authors.join(', ');
  }
  return `${authors.slice(0, 2).join(', ')} +${authors.length - 2}`;
}

function normalizedSections(session: ApiReadingSession | null): ReadingSection[] {
  return Array.isArray(session?.sections) ? (session.sections as ReadingSection[]) : [];
}

function statusLabel(session: ApiReadingSession | null) {
  if (session?.parseStatus === 'done') {
    return 'Parsed';
  }
  if (session?.parseStatus === 'running') {
    return 'Parsing';
  }
  if (session?.parseStatus === 'error') {
    return 'Parse error';
  }
  return 'Raw PDF';
}

function Tag({ active = false, label }: { active?: boolean; label: string }) {
  return <span className={`tag ${active ? 'is-on' : ''}`}>{label}</span>;
}

function EmptyDetail({ onBackToLibrary, project }: { onBackToLibrary: () => void; project: ApiProject | null }) {
  return (
    <div className="reading-stage" data-ares-surface="reading-stage" data-ares-stage="reading" data-reading-view="detail">
      <section className="reading-empty">
        <div className="placeholder-eyebrow">Reading</div>
        <h1 className="placeholder-title">No reading session</h1>
        <p className="placeholder-copy">Open a saved paper to start.</p>
        <div className="tag-row">
          <Tag label={`${project?.libraryCount || 0} saved`} />
          <Tag label={`${project?.queueCount || 0} queued`} />
        </div>
        <div className="reading-empty-actions">
          <button type="button" className="btn-p" onClick={onBackToLibrary}>Back to Library</button>
        </div>
      </section>
    </div>
  );
}

export function ReadingDetailStage({
  analyzing,
  documentTab,
  onAnalyze,
  onBackToLibrary,
  onCreateNote,
  onDeleteNote,
  onDocumentTabChange,
  onSaveNote,
  onSendQuestion,
  onWorkbenchTabChange,
  project,
  readingSessions,
  selectedSessionId,
  workbenchBusy,
  workbenchTab,
}: ReadingDetailStageProps) {
  const session = useMemo(
    () => readingSessions.find((entry) => entry.id === selectedSessionId) || readingSessions[0] || null,
    [readingSessions, selectedSessionId],
  );
  const [zoom, setZoom] = useState(100);
  const [chatDraft, setChatDraft] = useState('');
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const pdfHostRef = useRef<HTMLDivElement | null>(null);
  const sections = normalizedSections(session);
  const notes = records(session?.notes);
  const chatMessages = records(session?.chatMessages);
  const pdfApiUrl = session?.id ? appUrl(readingSessionPath(session.id, 'pdf')).href : '';

  useEffect(() => {
    if (documentTab !== 'pdf' || !session?.pdfUrl || !pdfApiUrl) {
      return;
    }
    void hydrateReactReadingPdfSurface({
      host: pdfHostRef.current,
      pdfUrl: pdfApiUrl,
      zoom,
    });
  }, [documentTab, pdfApiUrl, session?.pdfUrl, zoom]);

  useEffect(() => {
    setNoteDrafts((current) => {
      const next: Record<string, string> = {};
      for (const [index, note] of notes.entries()) {
        const id = noteId(note, index);
        next[id] = current[id] ?? noteBody(note);
      }
      return next;
    });
  }, [notes]);

  if (!session) {
    return <EmptyDetail onBackToLibrary={onBackToLibrary} project={project} />;
  }

  const summaryReady = session.summaryStatus === 'done';
  const parsed = session.parseStatus === 'done';
  const chatDisabled = !parsed || workbenchBusy;

  return (
    <div
      className="reading-stage"
      data-ares-surface="reading-stage"
      data-ares-stage="reading"
      data-reading-orientation="horizontal"
      data-reading-view="detail"
    >
      <div className="reading-metabar">
        <button type="button" className="pane-icon-btn reading-detail-back" onClick={onBackToLibrary} aria-label="Back to library">
          <ChevronLeftIcon size={15} />
        </button>
        <div className="reading-metabar-copy">
          <div className="reading-metabar-title">{session.title || 'Untitled paper'}</div>
          <div className="reading-metabar-byline">
            <span>{formatAuthors(session.authors || [])}</span>
            <span className="reading-muted-dot">·</span>
            <Tag label={session.venue || 'Unknown venue'} />
            <Tag active={parsed} label={statusLabel(session)} />
            {summaryReady ? <Tag active label="Summary ready" /> : null}
          </div>
        </div>
        <div className="reading-metabar-actions">
          <button type="button" className="btn-s" onClick={() => onAnalyze(session)} disabled={analyzing || !session.id}>
            <SparklesIcon size={13} />
            <span>{analyzing ? 'Analyzing...' : 'Analyze paper'}</span>
          </button>
        </div>
      </div>

      <div className="reading-shell-main">
        <div className="reading-icon-rail">
          <button
            type="button"
            className={`reading-rail-btn ${documentTab === 'summary' && workbenchTab === 'chat' ? 'is-active' : ''}`}
            title="Overview"
            onClick={() => {
              onDocumentTabChange('summary');
              onWorkbenchTabChange('chat');
            }}
          >
            <BookOpenIcon size={16} />
            <span className="lbl">Overview</span>
          </button>
          <div className="reading-rail-divider" />
          <button
            type="button"
            className={`reading-rail-btn ${documentTab === 'summary' ? 'is-active' : ''}`}
            title="Outline"
            onClick={() => onDocumentTabChange('summary')}
          >
            <FileTextIcon size={16} />
            <span className="lbl">Outline</span>
          </button>
          <button
            type="button"
            className={`reading-rail-btn ${workbenchTab === 'notes' ? 'is-active' : ''}`}
            title="Notes"
            onClick={() => onWorkbenchTabChange('notes')}
          >
            <StickyNoteIcon size={16} />
            <span className="lbl">Notes</span>
            {notes.length ? <span className="badge mono">{notes.length}</span> : null}
          </button>
        </div>

        <div className="reading-split">
          <section className="reading-pane reading-doc-pane">
            <div className="pane-hdr">
              <button
                type="button"
                className={`pane-tab ${documentTab === 'summary' ? 'active' : ''}`}
                onClick={() => onDocumentTabChange('summary')}
                data-reading-document-tab="summary"
              >
                <SparklesIcon size={13} />
                <span>Summary</span>
                {summaryReady ? <span className="reading-pane-dot" /> : null}
              </button>
              <button
                type="button"
                className={`pane-tab ${documentTab === 'pdf' ? 'active' : ''}`}
                onClick={() => onDocumentTabChange('pdf')}
                data-reading-document-tab="pdf"
              >
                <FileTextIcon size={13} />
                <span>PDF</span>
                <span className="reading-pane-meta mono">{session.pageCount || 'PDF'}</span>
              </button>
              <button
                type="button"
                className={`pane-tab ${documentTab === 'assets' ? 'active' : ''}`}
                onClick={() => onDocumentTabChange('assets')}
                data-reading-document-tab="assets"
              >
                <Grid3X3Icon size={13} />
                <span>Assets</span>
                <span className="reading-pane-meta mono">0</span>
              </button>
            </div>

            <div className="pane-body">
              {documentTab === 'pdf' ? (
                session.pdfUrl ? (
                  <div className="reading-pdf-viewer">
                    <div
                      ref={pdfHostRef}
                      className="reading-pdf-canvas-root"
                      data-reading-pdf-host="true"
                      data-reading-pdf-url={session.pdfUrl || ''}
                      data-reading-session-id={session.id}
                    >
                      <div className="reading-pdf-loading">PDF를 불러오는 중입니다...</div>
                    </div>
                  </div>
                ) : (
                  <div className="reading-empty-view">
                    <div className="reading-empty-icon"><FileTextIcon size={24} /></div>
                    <div className="reading-empty-title">PDF unavailable</div>
                    <div className="reading-empty-copy">Open the source paper or import extracted text.</div>
                  </div>
                )
              ) : null}

              {documentTab === 'summary' ? (
                <div className="reading-summary-wrap">
                  <section className="reading-summary-block">
                    <div className="reading-summary-label"><SparklesIcon size={11} /><span>TL;DR</span></div>
                    <div className="reading-summary-body">{text(session.summary, 'Run analysis to prepare the paper summary.')}</div>
                  </section>
                  <section className="reading-summary-block">
                    <div className="reading-summary-label"><FileTextIcon size={11} /><span>Outline</span></div>
                    {sections.length ? (
                      <ul className="reading-summary-list">
                        {sections.slice(0, 8).map((section, index) => (
                          <li key={`${section.label || 'section'}-${index}`}>
                            <span className="bullet" />
                            <span>{text(section.label, `Section ${index + 1}`)}</span>
                            <span className="mono">p.{section.pageStart || section.page || index + 1}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="reading-empty-copy">No parsed sections.</div>
                    )}
                  </section>
                </div>
              ) : null}

              {documentTab === 'assets' ? (
                <div className="reading-empty-view">
                  <div className="reading-empty-icon"><Grid3X3Icon size={24} /></div>
                  <div className="reading-empty-title">{parsed ? 'No figures or tables found' : 'Analysis needed'}</div>
                  <div className="reading-empty-copy">{parsed ? 'Run analysis again if the paper contains visual evidence.' : 'Run analysis to prepare summary, chat, and assets.'}</div>
                </div>
              ) : null}
            </div>

            {documentTab === 'pdf' ? (
              <div className="reading-pdf-dock-layer dock-layer">
                <div className="pdf-dock" role="toolbar" aria-label="PDF tools">
                  <button type="button" className="dock-btn" aria-label="목차" disabled><FileTextIcon size={14} /></button>
                  <div className="dock-div" />
                  <button
                    type="button"
                    className="dock-btn"
                    aria-label="축소"
                    onClick={() => setZoom((current) => Math.max(60, current - 10))}
                  >
                    <MinusIcon size={12} />
                  </button>
                  <span className="zoom-val">{zoom}%</span>
                  <button
                    type="button"
                    className="dock-btn"
                    aria-label="확대"
                    onClick={() => setZoom((current) => Math.min(180, current + 10))}
                  >
                    <PlusIcon size={12} />
                  </button>
                  <div className="dock-div" />
                  <button type="button" className="dock-btn" aria-label="본문 검색" disabled><SearchIcon size={13} /></button>
                </div>
              </div>
            ) : null}
          </section>

          <div className="reading-resize-handle is-horizontal" />

          <section className="reading-pane reading-workbench-pane">
            <div className="pane-hdr">
              <button
                type="button"
                className={`pane-tab ${workbenchTab === 'chat' ? 'active' : ''}`}
                onClick={() => onWorkbenchTabChange('chat')}
              >
                <MessageSquareIcon size={13} />
                <span>Chat</span>
                <span className="reading-pane-meta mono">{chatMessages.length}</span>
              </button>
              <button
                type="button"
                className={`pane-tab ${workbenchTab === 'notes' ? 'active' : ''}`}
                onClick={() => onWorkbenchTabChange('notes')}
              >
                <StickyNoteIcon size={13} />
                <span>Notes</span>
                <span className="reading-pane-meta mono">{notes.length}</span>
              </button>
            </div>
            <div className="pane-body">
              {workbenchTab === 'chat' ? (
                <div className="reading-chat-wrap">
                  <div className="reading-chat-body">
                    {chatMessages.length ? chatMessages.map((message, index) => {
                      const role = messageRole(message);
                      return (
                        <article key={text(message.id, `message-${index}`)} className={`reading-bubble ${role}`}>
                          {role === 'assistant' ? (
                            <span className="reading-bubble-avatar"><BotIcon size={13} /></span>
                          ) : (
                            <span className="reading-bubble-avatar"><UserIcon size={13} /></span>
                          )}
                          <div className="reading-bubble-content">
                            <p>{text(message.text, role === 'assistant' ? 'No answer returned.' : 'Question')}</p>
                            {records(message.citations).length ? (
                              <div className="reading-cite-row">
                                {records(message.citations).slice(0, 3).map((citation, citationIndex) => (
                                  <button
                                    key={`${text(message.id, `message-${index}`)}-cite-${citationIndex}`}
                                    type="button"
                                    className="reading-cite"
                                    disabled
                                  >
                                    <span className="dot" />
                                    <span>{text(citation.label, 'source')}</span>
                                    {citation.pg ? <span className="mono">p.{text(citation.pg)}</span> : null}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </article>
                      );
                    }) : (
                      <div className="reading-empty-view">
                        <div className="reading-empty-icon"><MessageSquareIcon size={24} /></div>
                        <div className="reading-empty-title">No questions yet</div>
                        <div className="reading-empty-copy">{parsed ? 'Ask about this paper.' : 'Analyze the paper before asking.'}</div>
                      </div>
                    )}
                  </div>
                  <form
                    className="reading-chat-input"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const message = chatDraft.trim();
                      if (!message || chatDisabled) {
                        return;
                      }
                      setChatDraft('');
                      onSendQuestion(session, message);
                    }}
                  >
                    <div className="reading-chat-input-box">
                      <textarea
                        name="readingChatMessage"
                        rows={2}
                        placeholder={parsed ? 'Ask about this paper...' : 'Analyze the paper before asking'}
                        value={chatDraft}
                        onChange={(event) => setChatDraft(event.currentTarget.value)}
                        disabled={chatDisabled}
                      />
                      <button type="submit" className="reading-chat-send" aria-label="Send reading question" disabled={chatDisabled || !chatDraft.trim()}>
                        <SendIcon size={13} />
                      </button>
                    </div>
                    <div className="reading-chat-footer">
                      <span>{parsed ? 'Answers include paper evidence' : 'Waiting for paper text'}</span>
                      <span className="mono">{workbenchBusy ? 'Answering' : 'Ready'}</span>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="reading-notes-wrap">
                  <div className="reading-notes-toolbar">
                    <span className="reading-mini-label">All notes</span>
                    <button type="button" className="btn-s" onClick={() => onCreateNote(session)} disabled={workbenchBusy}>
                      <PlusIcon size={11} />
                      <span>New note</span>
                    </button>
                  </div>
                  {notes.length ? notes.map((note, index) => {
                    const id = noteId(note, index);
                    return (
                      <article key={id} className="reading-note-card" data-reading-note-id={id}>
                        <div className="reading-note-head">
                          <span className="tag">{text(note.kind, 'note')}</span>
                          <button type="button" className="reading-note-page mono" disabled>
                            {note.page ? `p.${text(note.page)}` : 'page --'}
                          </button>
                        </div>
                        <div className="reading-note-quote">"{text(note.quote, text(note.text, 'Quote 없음'))}"</div>
                        <textarea
                          className="reading-note-editor"
                          name="readingNoteBody"
                          rows={4}
                          placeholder="메모를 입력하세요..."
                          value={noteDrafts[id] ?? noteBody(note)}
                          onChange={(event) => setNoteDrafts((current) => ({ ...current, [id]: event.currentTarget.value }))}
                          disabled={workbenchBusy}
                        />
                        <div className="reading-note-actions">
                          <button type="button" className="btn-ghost" onClick={() => onSaveNote(session, id, noteDrafts[id] ?? noteBody(note))} disabled={workbenchBusy}>
                            <span>Save</span>
                          </button>
                          <button type="button" className="btn-ghost" onClick={() => onDeleteNote(session, id)} disabled={workbenchBusy}>
                            <Trash2Icon size={11} />
                            <span>Delete</span>
                          </button>
                        </div>
                      </article>
                    );
                  }) : (
                    <div className="reading-empty-view">
                      <div className="reading-empty-icon"><StickyNoteIcon size={24} /></div>
                      <div className="reading-empty-title">No notes</div>
                      <div className="reading-empty-copy">{parsed ? 'Save a passage as a note to see it here.' : 'Analyze the paper before adding notes.'}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
