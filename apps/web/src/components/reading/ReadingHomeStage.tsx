import { BookmarkIcon, BookOpenIcon, CheckIcon, ChevronRightIcon, ClockIcon, FileTextIcon, SearchIcon, SparklesIcon } from 'lucide-react';

import type { ApiPaper, ApiProject, ApiReadingSession } from '@/app/api';

type ReadingHomeStageProps = {
  layout: string;
  library: ApiPaper[];
  loading: boolean;
  onBackToDiscover: () => void;
  onOpenPaper: (paperId: string) => void;
  onSelectPaper: (paperId: string) => void;
  project: ApiProject | null;
  readingSessions: ApiReadingSession[];
  selectedPaperId: string;
};

type ReadingHomeItem = ApiPaper & {
  hasPdf: boolean;
  lastActivityLabel: string;
  progress: number;
  savedLabel: string;
  status: {
    bucket: 'done' | 'ready' | 'running';
    color: string;
    label: string;
  };
};

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
    return {
      ...paper,
      hasPdf: Boolean(paper.pdfUrl || session?.pdfUrl),
      lastActivityLabel: dateLabel(session?.updatedAt || paper.updatedAt || paper.savedAt),
      progress,
      savedLabel: dateLabel(paper.savedAt || paper.updatedAt),
      status: statusForSession(session, progress),
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
      {item.status.label}
    </span>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof BookmarkIcon; label: string; value: number }) {
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
        <div className="reading-home-band-stack" aria-hidden="true">
          <span className="reading-home-band"><i style={{ width: `${Math.max(8, Math.min(100, value * 24))}%` }} /></span>
        </div>
      </div>
    </article>
  );
}

export function ReadingHomeStage({
  layout,
  library,
  loading,
  onBackToDiscover,
  onOpenPaper,
  onSelectPaper,
  project,
  readingSessions,
  selectedPaperId,
}: ReadingHomeStageProps) {
  const items = buildItems(library, readingSessions);
  const selected = items.find((item) => item.paperId === selectedPaperId) || items[0] || null;
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
            <MetricCard icon={BookmarkIcon} label="Saved" value={counts.saved} />
            <MetricCard icon={SparklesIcon} label="Ready" value={counts.ready} />
            <MetricCard icon={ClockIcon} label="In progress" value={counts.running} />
            <MetricCard icon={CheckIcon} label="Completed" value={counts.done} />
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
                      ['All papers', counts.saved],
                      ['Ready', counts.ready],
                      ['In progress', counts.running],
                      ['Completed', counts.done],
                      ['No PDF', counts.noPdf],
                    ].map(([label, count]) => (
                      <button key={label} type="button" className={`reading-home-filter-chip ${label === 'All papers' ? 'is-on' : ''}`}>
                        <span>{label}</span>
                        <span className="reading-home-filter-count mono">{count}</span>
                      </button>
                    ))}
                  </div>
                  <div className="reading-home-tool-row">
                    <span className="reading-home-tool-btn">
                      <span>Sort: Saved newest</span>
                    </span>
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
                  {items.map((item) => {
                    const active = item.paperId === selected?.paperId;
                    return (
                      <button
                        key={item.paperId}
                        type="button"
                        className={`reading-home-row ${active ? 'is-selected' : ''}`}
                        onClick={() => {
                          onSelectPaper(item.paperId);
                          onOpenPaper(item.paperId);
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
                                <span>{item.hasPdf ? 'PDF' : 'No PDF'}</span>
                              </span>
                              <StatusPill item={item} />
                            </span>
                          </span>
                        </span>
                        <span className="reading-home-cell">{item.venue || 'Unknown'}</span>
                        <span className="reading-home-cell mono">{item.savedLabel}</span>
                        <span className={`reading-home-pdf-chip ${item.hasPdf ? 'is-on' : 'is-off'}`}>
                          <span>{item.hasPdf ? 'PDF' : 'Missing'}</span>
                        </span>
                        <span className="reading-home-status-cell"><StatusPill item={item} /></span>
                        <span className="reading-home-row-menu"><ChevronRightIcon size={13} /></span>
                      </button>
                    );
                  })}
                  <div className="reading-home-table-foot">
                    <span>Showing {items.length} of {items.length}</span>
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
                        <span className="reading-home-preview-badge">{selected.year || 'n/a'}</span>
                      </div>
                    </div>
                    <h2 className="reading-home-preview-title">{selected.title}</h2>
                    <div className="reading-home-preview-authors">{formatAuthors(selected.authors)}</div>
                    <section className="reading-home-preview-section">
                      <div className="reading-home-preview-section-title">Abstract</div>
                      <p className="reading-home-preview-copy">{selected.summary || selected.abstract || 'Abstract is not available.'}</p>
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
