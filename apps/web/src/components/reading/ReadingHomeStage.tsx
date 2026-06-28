import { useState } from 'react';
import { BookmarkIcon, BookOpenIcon, CheckIcon, ChevronRightIcon, ClockIcon, ExternalLinkIcon, FileTextIcon, SearchIcon, Share2Icon, SparklesIcon } from 'lucide-react';

import type { ApiPaper, ApiProject, ApiReadingSession } from '@/app/api';

type ReadingHomeStageProps = {
  layout: string;
  library: ApiPaper[];
  loading: boolean;
  onBackToDiscover: () => void;
  onOpenPaper: (paperId: string) => void;
  onSelectPaper: (paperId: string) => void;
  onStartReading: (paper: ApiPaper) => void;
  project: ApiProject | null;
  readingSessions: ApiReadingSession[];
  selectedPaperId: string;
};

type ReadingHomeItem = ApiPaper & {
  authorsLabel: string;
  hasPdf: boolean;
  lastActivityLabel: string;
  noteCount: number;
  progress: number;
  savedLabel: string;
  sectionCount: number;
  session?: ApiReadingSession;
  status: {
    bucket: 'done' | 'ready' | 'running';
    color: string;
    label: string;
  };
  tags: string[];
};

type ReadingHomeFilter = 'all' | 'done' | 'noPdf' | 'ready' | 'running';

function formatAuthors(authors: string[] = []) {
  if (!authors.length) {
    return 'Unknown authors';
  }
  if (authors.length <= 2) {
    return authors.join(', ');
  }
  return `${authors.slice(0, 2).join(', ')} +${authors.length - 2}`;
}

function dateLabel(value: string | undefined) {
  if (!value) {
    return 'n/a';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'n/a';
  }
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
}

function progressForSession(session: ApiReadingSession | undefined) {
  if (!session) {
    return 0;
  }
  if (Number(session.progress) > 0) {
    return Math.max(0, Math.min(100, Number(session.progress)));
  }
  if (session.summaryStatus === 'done') {
    return 100;
  }
  if (session.parseStatus === 'done') {
    return 62;
  }
  if (session.parseStatus === 'running' || session.summaryStatus === 'running') {
    return 36;
  }
  return 18;
}

function statusForSession(session: ApiReadingSession | undefined, progress: number): ReadingHomeItem['status'] {
  if (progress >= 100 || session?.summaryStatus === 'done') {
    return { bucket: 'done', color: 'var(--search)', label: 'Completed' };
  }
  if (session) {
    return { bucket: 'running', color: 'var(--result)', label: 'In progress' };
  }
  return { bucket: 'ready', color: 'var(--read)', label: 'Ready' };
}

function buildItems(library: ApiPaper[], readingSessions: ApiReadingSession[]): ReadingHomeItem[] {
  const sessionsByPaper = new Map(readingSessions.map((session) => [session.paperId, session]));
  return library.map((paper) => {
    const session = sessionsByPaper.get(paper.paperId);
    const progress = progressForSession(session);
    const sections = Array.isArray(session?.sections) ? session.sections : [];
    const notes = Array.isArray(session?.notes) ? session.notes : [];
    return {
      ...paper,
      authorsLabel: formatAuthors(paper.authors || session?.authors || []),
      hasPdf: Boolean(paper.pdfUrl || session?.pdfUrl),
      lastActivityLabel: dateLabel(session?.updatedAt || paper.updatedAt || paper.savedAt),
      noteCount: notes.length,
      progress,
      savedLabel: dateLabel(paper.savedAt || paper.updatedAt),
      sectionCount: sections.length,
      session,
      status: statusForSession(session, progress),
      tags: [...(paper.keywords || []), ...(paper.matchedKeywords || [])].filter(Boolean).slice(0, 6),
    };
  });
}

function StatusPill({ item }: { item: ReadingHomeItem }) {
  return (
    <span
      className={`reading-home-status-pill is-${item.status.bucket}`}
      style={{
        background: `color-mix(in srgb, ${item.status.color} 8%, transparent)`,
        borderColor: `color-mix(in srgb, ${item.status.color} 22%, transparent)`,
        color: item.status.color,
      }}
    >
      <span className="dot" />
      {item.status.label}
    </span>
  );
}

function clampValue(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function MetricDiagram({ counts, diagram }: { counts: Record<'done' | 'ready' | 'running' | 'saved', number>; diagram: 'done' | 'ready' | 'running' | 'saved' }) {
  const dataset = [counts.saved, counts.ready, counts.running, counts.done];
  const maxValue = Math.max(...dataset, 1);
  const pct = (value: number, min = 0) => `${Math.round(clampValue((value / maxValue) * 100, min, 100))}%`;

  if (diagram === 'saved') {
    const points = dataset.map((value, index) => {
      const x = 2 + index * 28;
      const y = 34 - clampValue((value / maxValue) * 25, 1, 25);
      return `${x} ${Math.round(y)}`;
    });
    const line = `M${points.join('L')}`;
    const fill = `${line}L86 34L2 34Z`;
    return (
      <svg className="reading-home-metric-svg" viewBox="0 0 88 42" preserveAspectRatio="none" aria-hidden="true">
        <path className="reading-home-metric-axis" d="M2 34H86" />
        <path className="reading-home-metric-fill" d={fill} />
        <path className="reading-home-metric-line" d={line} />
      </svg>
    );
  }

  if (diagram === 'ready') {
    return (
      <div className="reading-home-band-stack" aria-hidden="true">
        <span className="reading-home-band"><i style={{ width: pct(counts.ready, 8) }} /></span>
        <span className="reading-home-band"><i style={{ opacity: 0.82, width: pct(counts.running, 8) }} /></span>
        <span className="reading-home-band"><i style={{ opacity: 0.68, width: pct(counts.done, 8) }} /></span>
      </div>
    );
  }

  if (diagram === 'running') {
    const bars = [
      counts.ready,
      counts.running,
      counts.done,
      counts.saved,
      counts.running + counts.done,
      counts.ready + counts.running,
    ].map((value) => Math.round(clampValue((value / maxValue) * 30, 6, 30)));
    return (
      <div className="reading-home-bars" aria-hidden="true">
        {bars.map((height, index) => (
          <span key={`${height}-${index}`} className={`reading-home-bar ${index >= 2 ? 'is-active' : ''}`} style={{ height }} />
        ))}
      </div>
    );
  }

  const activeDots = Math.round(clampValue((counts.done / maxValue) * 12, counts.done ? 1 : 0, 12));
  return (
    <div className="reading-home-dot-grid" aria-hidden="true">
      {Array.from({ length: 12 }, (_, index) => <span key={index} className={`reading-home-dot ${index < activeDots ? 'is-active' : ''}`} />)}
    </div>
  );
}

function MetricCard({ counts, diagram, icon: Icon, label, value }: { counts: Record<'done' | 'ready' | 'running' | 'saved', number>; diagram: 'done' | 'ready' | 'running' | 'saved'; icon: typeof BookmarkIcon; label: string; value: number }) {
  return (
    <article className="reading-home-metric">
      <div className="reading-home-metric-main">
        <div className="reading-home-metric-label-row">
          <span className="reading-home-metric-icon"><Icon size={14} /></span>
          <span className="reading-home-metric-label">{label}</span>
        </div>
        <div className="reading-home-metric-value">{value}</div>
      </div>
      <div className="reading-home-metric-diagram">
        <MetricDiagram counts={counts} diagram={diagram} />
      </div>
    </article>
  );
}

function Tag({ color, label, strong = false }: { color?: string; label: string; strong?: boolean }) {
  return (
    <span className={`tag ${strong ? 'strong' : ''}`} style={color ? { '--tag-color': color } as React.CSSProperties : undefined}>
      {label}
    </span>
  );
}

function previewPrimaryLabel(item: ReadingHomeItem) {
  return item.session ? 'Open Reading' : 'Start Reading';
}

function copyPaperLink(item: ReadingHomeItem) {
  const url = new URL(globalThis.location.href);
  url.hash = `#/reading/${encodeURIComponent(item.paperId)}`;
  void globalThis.navigator?.clipboard?.writeText(url.href);
}

function openPaperSource(item: ReadingHomeItem) {
  const href = item.paperUrl || item.pdfUrl || item.session?.pdfUrl || '';
  if (href) {
    globalThis.open?.(href, '_blank', 'noopener,noreferrer');
  }
}

function filterReadingItems(items: ReadingHomeItem[], filter: ReadingHomeFilter) {
  if (filter === 'ready') return items.filter((item) => item.status.bucket === 'ready');
  if (filter === 'running') return items.filter((item) => item.status.bucket === 'running');
  if (filter === 'done') return items.filter((item) => item.status.bucket === 'done');
  if (filter === 'noPdf') return items.filter((item) => !item.hasPdf);
  return items;
}

export function ReadingHomeStage({
  layout,
  library,
  loading,
  onBackToDiscover,
  onOpenPaper,
  onSelectPaper,
  onStartReading,
  project,
  readingSessions,
  selectedPaperId,
}: ReadingHomeStageProps) {
  const [filter, setFilter] = useState<ReadingHomeFilter>('all');
  const items = buildItems(library, readingSessions);
  const visible = filterReadingItems(items, filter);
  const selected = visible.find((item) => item.paperId === selectedPaperId) || visible[0] || null;
  const counts = {
    done: items.filter((item) => item.status.bucket === 'done').length,
    noPdf: items.filter((item) => !item.hasPdf).length,
    ready: items.filter((item) => item.status.bucket === 'ready').length,
    running: items.filter((item) => item.status.bucket === 'running').length,
    saved: items.length,
  };

  return (
    <div className="reading-stage reading-stage-home" data-ares-surface="reading-stage" data-ares-stage="reading" data-reading-view="home" data-reading-home-layout={layout}>
      <section className={`reading-home ${loading ? 'reading-home--loading' : ''}`}>
        <div className="reading-home-inner">
          <section className="reading-home-hero">
            <div className="reading-home-label"><BookOpenIcon size={14} /><span>Read</span></div>
            <h1 className="reading-home-title">Reading Library</h1>
            <p className="reading-home-copy">Saved papers and reading sessions.</p>
          </section>

          <section className="reading-home-metrics">
            <MetricCard counts={counts} diagram="saved" icon={BookmarkIcon} label="Saved" value={counts.saved} />
            <MetricCard counts={counts} diagram="ready" icon={SparklesIcon} label="Ready" value={counts.ready} />
            <MetricCard counts={counts} diagram="running" icon={ClockIcon} label="In progress" value={counts.running} />
            <MetricCard counts={counts} diagram="done" icon={CheckIcon} label="Completed" value={counts.done} />
          </section>

          {!items.length && !loading ? (
            <section className="reading-home-empty">
              <div className="reading-home-empty-icon"><BookmarkIcon size={28} /></div>
              <div className="reading-home-empty-title">Nothing saved yet</div>
              <div className="reading-home-empty-copy">No saved papers.</div>
              <div className="reading-home-empty-actions">
                <button type="button" className="btn-s" onClick={onBackToDiscover}>
                  <SearchIcon size={13} />
                  <span>Back to Discover</span>
                </button>
              </div>
            </section>
          ) : (
            <section className={`reading-home-content ${layout === 'desktop' && selected ? 'is-resizable' : ''}`} style={layout === 'desktop' && selected ? { '--reading-home-preview-w': '420px' } as React.CSSProperties : undefined}>
              <article className="reading-home-panel reading-home-dropzone" data-reading-pdf-dropzone="true">
                <div className="reading-home-panel-head">
                  <div className="reading-home-panel-title-wrap">
                    <span className="reading-home-panel-kicker">Worklist</span>
                    <h2 className="reading-home-panel-title">Saved papers</h2>
                  </div>
                </div>
                <div className="reading-home-list-tools">
                  <div className="reading-home-filter-row">
                    {[
                      ['all', 'All papers', counts.saved],
                      ['ready', 'Ready', counts.ready],
                      ['running', 'In progress', counts.running],
                      ['done', 'Completed', counts.done],
                      ['noPdf', 'No PDF', counts.noPdf],
                    ].map(([id, label, count]) => (
                      <button
                        key={id}
                        type="button"
                        className={`reading-home-filter-chip ${filter === id ? 'is-on' : ''}`}
                        onClick={() => setFilter(id as ReadingHomeFilter)}
                      >
                        <span>{label}</span>
                        <span className="reading-home-filter-count mono">{count}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="reading-home-table">
                  <div className="reading-home-table-head">
                    <span>Title / Authors</span>
                    <span>Venue</span>
                    <span>Saved</span>
                    <span>PDF</span>
                    <span>Status</span>
                    <span />
                  </div>
                  {visible.length ? visible.map((item) => {
                    const active = item.paperId === selected?.paperId;
                    return (
                      <button
                        key={item.paperId}
                        type="button"
                        className={`reading-home-row ${active ? 'is-selected' : ''}`}
                        onClick={() => {
                          if (layout === 'desktop') {
                            onSelectPaper(item.paperId);
                            return;
                          }
                          if (item.session) {
                            onOpenPaper(item.paperId);
                            return;
                          }
                          onStartReading(item);
                        }}
                        data-reading-paper-id={item.paperId}
                      >
                        <span className="reading-home-row-main">
                          <span className="reading-home-row-file"><FileTextIcon size={16} /></span>
                          <span className="reading-home-row-copy">
                            <span className="reading-home-row-title">{item.title}</span>
                            <span className="reading-home-row-authors">{formatAuthors(item.authors)}</span>
                            <span className="reading-home-row-mobile-meta">
                              <span>{item.venue || 'Unknown'}</span>
                              <span className="mono">{item.savedLabel}</span>
                              <span className={`reading-home-pdf-chip ${item.hasPdf ? 'is-on' : 'is-off'}`}>
                                {item.hasPdf ? <CheckIcon size={11} /> : <span className="mono">--</span>}
                                <span>{item.hasPdf ? 'PDF' : 'No PDF'}</span>
                              </span>
                              <StatusPill item={item} />
                            </span>
                          </span>
                        </span>
                        <span className="reading-home-cell">{item.venue || 'Unknown'}</span>
                        <span className="reading-home-cell mono">{item.savedLabel}</span>
                        <span className={`reading-home-pdf-chip ${item.hasPdf ? 'is-on' : 'is-off'}`}>
                          {item.hasPdf ? <CheckIcon size={12} /> : <span className="mono">--</span>}
                          <span>{item.hasPdf ? 'PDF' : 'Missing'}</span>
                        </span>
                        <span className="reading-home-status-cell"><StatusPill item={item} /></span>
                        <span className="reading-home-row-menu"><ChevronRightIcon size={13} /></span>
                      </button>
                    );
                  }) : (
                    <div className="reading-home-table-empty">
                      <div className="reading-home-empty-icon"><BookOpenIcon size={28} /></div>
                      <div className="reading-home-empty-title">No papers in this slice</div>
                      <div className="reading-home-empty-copy">No papers in this filter.</div>
                    </div>
                  )}
                  <div className="reading-home-table-foot">
                    <span>Showing {visible.length} of {items.length}</span>
                    <span className="mono">{project?.name || 'ARES'}</span>
                  </div>
                </div>
              </article>

              {layout === 'desktop' && selected ? (
                  <aside className="reading-home-preview is-desktop" data-ares-surface="reading-home-preview">
                    <div className="reading-home-preview-scroll">
                      <div className="reading-home-preview-header">
                        <div className="reading-home-preview-meta">
                          <span className="reading-home-preview-badge">{selected.venue || 'Unknown'}</span>
                          <span className="reading-home-preview-badge">
                            <span>{selected.hasPdf ? 'PDF' : 'No PDF'}</span>
                            {selected.hasPdf ? <CheckIcon size={11} /> : <span className="mono">--</span>}
                          </span>
                        </div>
                        <div className="reading-home-preview-icon-row">
                          <button
                            type="button"
                            className="reading-home-preview-icon"
                            aria-label="Open source"
                            title="Open source"
                            disabled={!selected.paperUrl && !selected.pdfUrl && !selected.session?.pdfUrl}
                            onClick={() => openPaperSource(selected)}
                          >
                            <ExternalLinkIcon size={14} />
                          </button>
                        </div>
                      </div>
                      <h2 className="reading-home-preview-title">{selected.title}</h2>
                      <div className="reading-home-preview-authors">{selected.authorsLabel}</div>
                      <div className="reading-home-preview-cta">
                        <button
                          type="button"
                          className="btn-p"
                          onClick={() => {
                            if (selected.session) {
                              onOpenPaper(selected.paperId);
                              return;
                            }
                            onStartReading(selected);
                          }}
                        >
                          <BookOpenIcon size={13} />
                          <span>{previewPrimaryLabel(selected)}</span>
                        </button>
                        <button type="button" className="btn-s" onClick={() => copyPaperLink(selected)}>
                          <Share2Icon size={13} />
                          <span>Copy link</span>
                        </button>
                      </div>
                      <section className="reading-home-preview-section">
                        <div className="reading-home-preview-section-title">Abstract</div>
                        <p className="reading-home-preview-copy">{selected.abstract || selected.summary || 'Abstract metadata is not available yet. Open Reading to generate structured notes.'}</p>
                      </section>
                      <section className="reading-home-preview-section">
                        <div className="reading-home-preview-section-title">Keywords</div>
                        <div className="tag-row reading-home-preview-terms">
                          {selected.tags.length ? selected.tags.map((tag) => <Tag key={tag} label={tag} />) : <Tag color="var(--t3)" label="No tags" />}
                        </div>
                      </section>
                      <section className="reading-home-preview-stat-grid">
                        <article className="reading-home-preview-stat">
                          <div className="reading-home-preview-stat-label">Status</div>
                          <div className="reading-home-preview-stat-value"><StatusPill item={selected} /></div>
                        </article>
                        <article className="reading-home-preview-stat">
                          <div className="reading-home-preview-stat-label">Progress</div>
                          <div className="reading-home-preview-stat-value">{selected.progress}%</div>
                        </article>
                        <article className="reading-home-preview-stat">
                          <div className="reading-home-preview-stat-label">Sections</div>
                          <div className="reading-home-preview-stat-value">{selected.sectionCount}</div>
                        </article>
                        <article className="reading-home-preview-stat">
                          <div className="reading-home-preview-stat-label">Notes</div>
                          <div className="reading-home-preview-stat-value">{selected.noteCount}</div>
                        </article>
                        <article className="reading-home-preview-stat">
                          <div className="reading-home-preview-stat-label">Saved</div>
                          <div className="reading-home-preview-stat-value mono">{selected.savedLabel}</div>
                        </article>
                        <article className="reading-home-preview-stat">
                          <div className="reading-home-preview-stat-label">Last activity</div>
                          <div className="reading-home-preview-stat-value mono">{selected.lastActivityLabel}</div>
                        </article>
                      </section>
                    </div>
                  </aside>
              ) : null}
            </section>
          )}
        </div>
      </section>
    </div>
  );
}
