import { PenLineIcon } from 'lucide-react';

import type { ApiPaper, ApiProject, ApiProjectGraph, ApiReadingSession } from '@/app/api';

type WritingStageProps = {
  graph: ApiProjectGraph | null;
  library: ApiPaper[];
  onCreateDraftSection: () => void;
  onExportDraft: () => void;
  project: ApiProject | null;
  readingSessions: ApiReadingSession[];
  saving: boolean;
};

function text(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function Tag({ label }: { label: string }) {
  return <span className="tag">{label}</span>;
}

function wordCount(value: unknown) {
  return text(value).split(/\s+/).filter(Boolean).length;
}

export function WritingStage({ graph, library, onCreateDraftSection, onExportDraft, project, readingSessions, saving }: WritingStageProps) {
  const draftSections = graph?.draftSections || [];
  const insightCards = graph?.insightCards || [];
  const evidenceLinks = graph?.evidenceLinks || [];
  const sourceTitle = readingSessions[0]?.title || library[0]?.title || project?.name || 'Untitled research draft';
  const sections = draftSections.length
    ? draftSections
    : [
        { id: 'abstract', status: 'todo', title: 'Abstract' },
        { id: 'intro', status: 'queue', title: 'Introduction' },
        { id: 'method', status: 'queue', title: 'Method' },
        { id: 'experiments', status: 'todo', title: 'Experiments' },
        { id: 'conclusion', status: 'todo', title: 'Conclusion' },
      ];
  const activeSection = draftSections[0] || null;
  const activeInsight = insightCards.find((card) => Array.isArray(activeSection?.insightCardIds) && activeSection?.insightCardIds.includes(card.id)) || insightCards[0] || null;
  const acceptedInsight = insightCards.find((card) => text(card.status) === 'accepted') || null;

  return (
    <div className="writing-stage" data-ares-surface="writing-stage" data-ares-stage="writing">
      <aside className="writing-outline">
        <div className="writing-panel-head">
          <span className="writing-card-label">Outline</span>
          <Tag label={`${sections.length} sections`} />
        </div>
        <div className="writing-section-list">
          {sections.map((section, index) => (
            <button key={text(section.id, `section-${index}`)} type="button" className={`writing-section-row ${index === 0 ? 'is-active' : ''}`} disabled={!draftSections.length}>
              <span>{text(section.title, text(section.sectionType, 'Section'))}</span>
              <small className="mono">{text(section.status, 'draft')} · {wordCount(section.body)}w</small>
            </button>
          ))}
        </div>
      </aside>

      <main className="writing-editor">
        <div className="writing-hero">
          <div>
            <div className="writing-kicker"><PenLineIcon size={14} /><span>Writing</span></div>
            <h1>Draft from evidence</h1>
            <p>Source-linked sections and export queue.</p>
          </div>
          <div className="writing-actions">
            <button type="button" className="btn-p" onClick={onCreateDraftSection} disabled={saving || !acceptedInsight}>
              {saving ? 'Generating...' : 'Generate section'}
            </button>
            <button type="button" className="btn-s" onClick={onExportDraft} disabled={!draftSections.length}>Export</button>
          </div>
        </div>
        <section className="writing-draft-card">
          <div className="writing-draft-toolbar">
            <span className="writing-card-label">Draft</span>
            <Tag label="source-linked draft" />
          </div>
          <article className="writing-draft-body">
            <h2>{text(activeSection?.title, 'Method')}</h2>
            <p>Source: <strong>{sourceTitle}</strong></p>
            <blockquote>{text(activeSection?.body, 'No suggestion selected.')}</blockquote>
          </article>
        </section>
      </main>

      <aside className="writing-sources">
        <div className="writing-panel-head">
          <span className="writing-card-label">Sources</span>
          <Tag label={`${evidenceLinks.length} linked`} />
        </div>
        <div className="writing-source-list">
          <article className="writing-source-card">
            <span className="writing-card-label">Insight Card</span>
            <p>{text(activeInsight?.claim, 'No claim selected.')}</p>
          </article>
          <article className="writing-source-card">
            <span className="writing-card-label">Evidence Bundle</span>
            <p>{evidenceLinks.length ? `${evidenceLinks.length} linked source` : sourceTitle}</p>
          </article>
          <article className="writing-gap-box">
            <span className="writing-card-label">Evidence gaps</span>
            <p>{draftSections.length ? 'Review source coverage before export.' : 'Create a draft section before export.'}</p>
          </article>
        </div>
      </aside>
    </div>
  );
}
