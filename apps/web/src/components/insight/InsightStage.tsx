import { SparklesIcon } from 'lucide-react';

import type { ApiProject, ApiProjectGraph } from '@/app/api';

type InsightStageProps = {
  graph: ApiProjectGraph | null;
  onCreateFollowUpExperiment: () => void;
  onCreateInsightCard: () => void;
  project: ApiProject | null;
  onStageChange: (stage: 'research' | 'writing') => void;
  saving: boolean;
};

function text(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function Tag({ label }: { label: string }) {
  return <span className="tag">{label}</span>;
}

export function InsightStage({ graph, onCreateFollowUpExperiment, onCreateInsightCard, onStageChange, project, saving }: InsightStageProps) {
  const evidenceLinks = graph?.evidenceLinks || [];
  const resultDossiers = graph?.resultDossiers || [];
  const insightCards = graph?.insightCards || [];
  const evidence = [
    ...evidenceLinks.map((entry) => ({
      cat: text(entry.sourceType, 'evidence'),
      text: text(entry.quote, 'Linked evidence'),
    })),
    ...resultDossiers.map((entry) => ({
      cat: 'result delta',
      text: text(entry.deltaSummary, text(entry.summary, 'Result delta')),
    })),
  ];
  const primaryClaim = text(insightCards[0]?.claim, evidence[0]?.text || project?.focus || 'Select evidence to draft a claim');

  return (
    <div className="insight-stage" data-ares-surface="insight-stage" data-ares-stage="insight">
      <section className="insight-main">
        <div className="insight-hero">
          <div>
            <div className="insight-kicker"><SparklesIcon size={14} /><span>Insight</span></div>
            <h1>Evidence to decisions</h1>
            <p>Claims, hypotheses, and decisions from linked evidence.</p>
          </div>
          <div className="insight-hero-actions">
            <button type="button" className="btn-p" onClick={() => onStageChange('writing')}>Send to Writing</button>
            <button type="button" className="btn-s" onClick={onCreateFollowUpExperiment} disabled={saving || !insightCards.length}>
              Create follow-up experiment
            </button>
            <button type="button" className="btn-s" onClick={onCreateInsightCard} disabled={saving || !evidence.length}>
              {saving ? 'Creating...' : 'Create insight card'}
            </button>
          </div>
        </div>
        <div className="insight-grid">
          <aside className="insight-panel">
            <div className="insight-panel-head">
              <span className="insight-card-label">Evidence</span>
              <Tag label={`${evidence.length} items`} />
            </div>
            <div className="insight-evidence-list">
              {evidence.length ? evidence.slice(0, 4).map((item, index) => (
                <article key={`${item.cat}-${index}`} className="insight-evidence-card">
                  <div className="insight-evidence-meta"><Tag label={item.cat} /></div>
                  <p>{item.text}</p>
                </article>
              )) : <div className="insight-empty-compact">No linked evidence yet.</div>}
            </div>
          </aside>

          <section className="insight-panel insight-panel--cards">
            <div className="insight-panel-head">
              <span className="insight-card-label">Claims</span>
              <Tag label={`${insightCards.length || 1} Insight Card`} />
            </div>
            <article className="insight-card is-primary">
              <div className="insight-card-top">
                <span className="insight-card-label">Insight Card</span>
                <Tag label={text(insightCards[0]?.status, evidence.length ? 'draft' : 'empty')} />
              </div>
              <h2>{primaryClaim}</h2>
              <dl>
                <div><dt>linked evidence</dt><dd>{evidence.length ? `${evidence.length} source` : 'Evidence'}</dd></div>
                <div><dt>confidence</dt><dd>{text(insightCards[0]?.confidence, 'unrated')}</dd></div>
                <div><dt>next action</dt><dd>{text(insightCards[0]?.nextAction, evidence.length ? 'Send to Writing or Lab' : 'Link evidence')}</dd></div>
              </dl>
            </article>
          </section>

          <aside className="insight-panel">
            <div className="insight-panel-head">
              <span className="insight-card-label">Hypotheses</span>
            </div>
            <div className="insight-hypothesis-list">
              <article className="insight-hypothesis-card"><p>{project?.focus || 'Define a project focus to generate hypotheses.'}</p></article>
              <article className="insight-decision-box"><p>Decisions appear after insight cards are accepted.</p></article>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
