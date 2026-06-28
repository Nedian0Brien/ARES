import { BookmarkIcon, BookOpenIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, CompassIcon, FilterIcon, LayersIcon, SearchIcon, SparklesIcon } from 'lucide-react';
import type { FormEvent } from 'react';

import type { ApiPaper, ApiProject, SearchMode } from '@/app/api';

type SearchMeta = {
  provider: string;
  live: boolean;
  total: number;
  query: string;
  warning: string;
  searchMode: SearchMode;
  agentRuntime: string;
};

type SearchFilters = {
  venues: Set<string>;
  years: Set<string>;
  minRelevance: number;
  openAccessOnly: boolean;
  savedOnly: boolean;
};

type SearchStageProps = {
  availableVenues: string[];
  error: string;
  filters: SearchFilters;
  hasSearched: boolean;
  loading: boolean;
  onPaperRead: (paper: ApiPaper) => void;
  onPaperSaveToggle: (paper: ApiPaper) => void;
  onQueryChange: (value: string) => void;
  onSearchModeChange: (mode: SearchMode) => void;
  onSelectPaper: (paperId: string) => void;
  onSubmitSearch: () => void;
  previewPanelOpen: boolean;
  project: ApiProject | null;
  query: string;
  results: ApiPaper[];
  savingPaperId: string;
  searchLayout: string;
  searchMeta: SearchMeta;
  searchMode: SearchMode;
  selectedPaperId: string;
};

const VENUE_COLORS = [
  ['emnlp', 'var(--research)'],
  ['acl', 'var(--read)'],
  ['naacl', 'var(--read)'],
  ['neurips', 'var(--writing)'],
  ['icml', 'var(--result)'],
  ['iclr', 'var(--insight)'],
  ['arxiv', 'var(--t3)'],
] as const;

function formatAuthors(authors: string[] = []) {
  if (!authors.length) {
    return 'Unknown authors';
  }
  if (authors.length <= 2) {
    return authors.join(', ');
  }
  return `${authors.slice(0, 2).join(', ')} +${authors.length - 2}`;
}

function yearBucket(year: number | undefined) {
  if (year === 2025) return '2025';
  if (year === 2024) return '2024';
  if (year === 2023) return '2023';
  if (Number(year) > 0) return 'earlier';
  return 'unknown';
}

function venueColor(venue = '') {
  const lowered = venue.toLowerCase();
  return VENUE_COLORS.find(([needle]) => lowered.includes(needle))?.[1] || 'var(--t3)';
}

function relevanceColor(value: number) {
  if (value >= 90) return 'var(--search)';
  if (value >= 75) return 'var(--read)';
  return 'var(--t3)';
}

function paperReason(paper: ApiPaper) {
  const matched = (paper.matchedKeywords || []).filter(Boolean).slice(0, 2);
  const parts = [];
  if (matched.length) {
    parts.push(`matched ${matched.map((keyword) => `"${keyword}"`).join(' · ')}`);
  }
  if (paper.citedByCount) {
    parts.push(`cited by ${paper.citedByCount}`);
  }
  if (paper.openAccess) {
    parts.push('open access');
  }
  return parts.join(' · ') || 'semantic similarity match';
}

function visibleResults(results: ApiPaper[], filters: SearchFilters, availableVenues: string[], searchMode: SearchMode) {
  return results
    .filter((paper) => {
      const venueAllowed = availableVenues.length ? filters.venues.has(paper.venue || '') : true;
      const yearAllowed = filters.years.size ? filters.years.has(yearBucket(paper.year)) : true;
      const relevanceAllowed = Number(paper.relevance || 0) >= filters.minRelevance;
      const openAccessAllowed = filters.openAccessOnly ? Boolean(paper.openAccess) : true;
      const savedAllowed = filters.savedOnly ? Boolean(paper.saved) : true;
      return venueAllowed && yearAllowed && relevanceAllowed && openAccessAllowed && savedAllowed;
    })
    .toSorted((left, right) => {
      if (searchMode === 'keyword') {
        return (right.citedByCount || 0) - (left.citedByCount || 0) || (right.relevance || 0) - (left.relevance || 0);
      }
      return (right.relevance || 0) - (left.relevance || 0) || (right.citedByCount || 0) - (left.citedByCount || 0);
    });
}

function Tag({ color, label, strong = false }: { color?: string; label: string; strong?: boolean }) {
  return (
    <span className={`tag ${strong ? 'strong' : ''}`} style={color ? { '--tag-color': color } as React.CSSProperties : undefined}>
      {label}
    </span>
  );
}

function SearchModeToggle({
  loading,
  onSearchModeChange,
  searchMode,
}: {
  loading: boolean;
  onSearchModeChange: (mode: SearchMode) => void;
  searchMode: SearchMode;
}) {
  const modes: Array<{ ctaLabel: string; icon: typeof CompassIcon; id: SearchMode }> = [
    { ctaLabel: 'Agent Search', icon: CompassIcon, id: 'scout' },
    { ctaLabel: 'Keyword Search', icon: BookOpenIcon, id: 'keyword' },
  ];

  return (
    <div className="hero-submit" aria-label="Search mode">
      {modes.map((mode) => {
        const Icon = mode.icon;
        const active = searchMode === mode.id;
        return (
          <button
            key={mode.id}
            type={active ? 'submit' : 'button'}
            className={`hero-submit-btn ${active ? 'active' : ''}`}
            data-mode={mode.id}
            disabled={loading}
            onClick={active ? undefined : () => onSearchModeChange(mode.id)}
            title={mode.ctaLabel}
            aria-label={mode.ctaLabel}
          >
            <Icon aria-hidden="true" size={14.5} />
            <span className="expand">
              <span className="hero-submit-label hero-submit-label-desktop">{mode.ctaLabel}</span>
              <span className="hero-submit-label hero-submit-label-mobile">{mode.id === 'scout' ? 'Agent' : 'Keyword'}</span>
              <span className="go" aria-hidden="true">
                <ChevronRightIcon size={13} />
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function SearchStage({
  availableVenues,
  error,
  filters,
  hasSearched,
  loading,
  onPaperRead,
  onPaperSaveToggle,
  onQueryChange,
  onSearchModeChange,
  onSelectPaper,
  onSubmitSearch,
  previewPanelOpen,
  project,
  query,
  results,
  savingPaperId,
  searchLayout,
  searchMeta,
  searchMode,
  selectedPaperId,
}: SearchStageProps) {
  const visible = visibleResults(results, filters, availableVenues, searchMode);
  const selected = visible.find((paper) => paper.paperId === selectedPaperId) || visible[0] || null;

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmitSearch();
  }

  return (
    <div className="search-stage" data-ares-surface="search-stage" data-ares-stage="search" data-search-layout={searchLayout}>
      <aside className="search-filters search-filters-focal" data-ares-surface="search-filters" data-ares-stage="search">
        <div className="search-filters-header">
          <span className="filter-eyebrow">Filters</span>
          <button type="button" className="panel-toggle-btn" title="Collapse filters">
            <ChevronLeftIcon size={13} />
          </button>
        </div>
        <section className="search-filter-section">
          <button type="button" className="sec-hdr">
            <span className="sec-hdr-copy">
              <FilterIcon size={11} />
              <span>Venue</span>
            </span>
          </button>
          <div className="sec-body">
            {availableVenues.length ? (
              availableVenues.map((venue) => {
                const checked = filters.venues.has(venue);
                return (
                <label key={venue} className={`filter-option ${checked ? 'is-checked' : ''}`}>
                  <span className="filter-option-box">{checked ? <CheckIcon size={9} /> : null}</span>
                  <span className="filter-option-dot" style={{ background: venueColor(venue) }} />
                  <span>{venue}</span>
                </label>
              );
              })
            ) : (
              <div className="empty-state compact-empty">검색 결과가 들어오면 venue 필터가 채워집니다.</div>
            )}
          </div>
        </section>
        <section className="filter-divider filter-library-card">
          <div className="filter-group-title">Library</div>
          <div className="library-metric">
            <span className="library-metric-value">{project?.libraryCount || 0}</span>
            <span className="library-metric-label">papers</span>
          </div>
          <div className="tag-row filter-library-tags">
            <Tag color="var(--search)" label={`${project?.libraryCount || 0} saved`} strong />
            <Tag label={`${visible.filter((paper) => !paper.saved).length} new`} />
          </div>
        </section>
      </aside>

      <section className="results-pane results-pane-focal" data-ares-surface="search-results" data-ares-stage="search">
        <div className="hero-wrap">
          {hasSearched ? (
            <div className="results-back-row">
              <button type="button" className="results-back-btn" title="검색 홈으로">
                <ChevronLeftIcon size={12} />
                <span>검색 홈</span>
              </button>
            </div>
          ) : null}
          <form className={`hero-input ${searchMode}`} onSubmit={submitSearch}>
            <span className="hero-lead-icon" aria-hidden="true">
              <SearchIcon size={16} />
            </span>
            <input
              id="search-input"
              type="text"
              name="query"
              autoComplete="off"
              spellCheck="false"
              value={query}
              onChange={(event) => onQueryChange(event.currentTarget.value)}
              placeholder={searchMode === 'scout' ? '의미 기반으로 논문을 찾아볼까요?' : '키워드, 저자, 제목으로 검색'}
            />
            <SearchModeToggle loading={loading} onSearchModeChange={onSearchModeChange} searchMode={searchMode} />
          </form>
          {searchMeta.warning ? <div className="notice"><span>{searchMeta.warning}</span></div> : null}
          {error ? <div className="notice"><span>{error}</span></div> : null}
        </div>

        <div className="results-list">
          <div className="results-list-inner">
            <div className="results-summary-row">
              <div className="results-summary-copy">
                <span className="results-summary-count">{visible.length} results</span>
                <span className="results-summary-sub">· Sorted by {searchMode === 'scout' ? 'relevance' : 'citations'}</span>
              </div>
              <div className="results-summary-actions">
                <span className="btn-g results-summary-btn"><LayersIcon size={12} /><span>Group</span></span>
              </div>
            </div>
            {loading ? <div className="loading-state search-results-empty">OpenAlex에서 논문 후보를 불러오는 중입니다...</div> : null}
            {!loading && !hasSearched ? <div className="empty-state search-results-empty">검색어를 입력하고 Search를 눌러 논문을 찾아보세요.</div> : null}
            {!loading && hasSearched && !visible.length ? <div className="empty-state search-results-empty">No results for this filter.</div> : null}
            {!loading
              ? visible.map((paper) => {
                  const selectedRow = paper.paperId === selected?.paperId;
                  const relevance = Number(paper.relevance || 0);
                  return (
                    <button
                      key={paper.paperId}
                      type="button"
                      className={`paper-row ${selectedRow ? 'is-selected' : ''}`}
                      data-ares-surface="paper-row"
                      data-ares-role="paper-row"
                      data-ares-stage="search"
                      data-ares-paper-id={paper.paperId}
                      data-ares-paper-title={paper.title}
                      onClick={() => onSelectPaper(paper.paperId)}
                    >
                      <span className="paper-venue-bar" style={{ background: venueColor(paper.venue), opacity: selectedRow ? 1 : 0.32 }} />
                      <span className="paper-content">
                        <span className="paper-main">
                          <span className="paper-title">{paper.title}</span>
                          <span className="paper-meta">
                            <span className="paper-authors">{formatAuthors(paper.authors)}</span>
                            <span className="paper-meta-separator">·</span>
                            <Tag color={venueColor(paper.venue)} label={paper.venue || 'Unknown'} />
                            <span className="paper-year mono">{paper.year || 'n/a'}</span>
                            <span className="paper-meta-separator">·</span>
                            <span className="paper-cites">{paper.citedByCount || 0}</span>
                            {paper.openAccess ? <Tag color="var(--search)" label="open access" /> : null}
                            {paper.saved ? <Tag color="var(--read)" label="saved" strong /> : null}
                            {paper.queued ? <Tag color="var(--result)" label="reading queue" /> : null}
                          </span>
                          <span className="paper-summary">{paper.summary || paper.abstract || 'Abstract metadata is not available yet.'}</span>
                          {searchMode === 'scout' ? (
                            <span className="reasoning-line paper-reasoning">
                              <SparklesIcon size={10} />
                              <span>scout · {paperReason(paper)}</span>
                            </span>
                          ) : null}
                        </span>
                        <span className="paper-score-wrap">
                          <span className="paper-score mono" style={{ color: relevanceColor(relevance) }}>{relevance}</span>
                          <span className="paper-relevance-bar">
                            <span className="paper-relevance-bar-fill" style={{ width: `${Math.max(0, Math.min(100, relevance))}%`, background: relevanceColor(relevance) }} />
                          </span>
                          <span className="paper-score-label">{searchMode === 'scout' ? 'relevance' : 'match'}</span>
                        </span>
                      </span>
                    </button>
                  );
                })
              : null}
          </div>
        </div>
      </section>

      {previewPanelOpen ? (
        <aside className={`search-preview search-preview-focal ${selected ? '' : 'is-empty'}`} data-ares-surface="search-preview" data-ares-stage="search" data-ares-paper-id={selected?.paperId || ''}>
          <div className="search-preview-header search-preview-header-focal">
            <div className="preview-heading">
              <div className="preview-eyebrow">Paper</div>
              <div className="preview-title">{selected?.title || 'Select a paper'}</div>
              {selected ? (
                <div className="tag-row">
                  <Tag label={formatAuthors(selected.authors)} />
                  <Tag color={venueColor(selected.venue)} label={selected.venue || 'Unknown'} />
                  <Tag label={`${selected.citedByCount || 0} cites`} />
                </div>
              ) : null}
            </div>
          </div>
          {selected ? (
            <>
              <div className="search-preview-body">
                <section className="preview-section">
                  <div className="preview-section-title">Abstract</div>
                  <div className="preview-copy">{selected.summary || selected.abstract || 'Abstract is not available.'}</div>
                </section>
                <section className="preview-section">
                  <div className="preview-section-title">Why relevant</div>
                  <div className="reasoning-line preview-reasoning-line">
                    <SparklesIcon size={11} />
                    <span>{paperReason(selected)}</span>
                  </div>
                </section>
              </div>
              <div className="search-preview-footer">
                <button type="button" className="btn-p" onClick={() => onPaperSaveToggle(selected)} disabled={savingPaperId === selected.paperId}>
                  <BookmarkIcon size={12} />
                  <span>{selected.saved ? 'Remove' : savingPaperId === selected.paperId ? 'Saving...' : 'Save'}</span>
                </button>
                <button type="button" className="btn-s" onClick={() => onPaperRead(selected)}>
                  <span>Read</span>
                  <ChevronRightIcon size={12} />
                </button>
              </div>
            </>
          ) : (
            <div className="empty-state search-preview-empty">Select a paper.</div>
          )}
        </aside>
      ) : null}
    </div>
  );
}
