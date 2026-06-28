import { FlaskConicalIcon } from 'lucide-react';

import type { ApiPaper, ApiProject, ApiProjectGraph, ApiReadingSession } from '@/app/api';

type LabStageProps = {
  compareActive: boolean;
  graph: ApiProjectGraph | null;
  library: ApiPaper[];
  onCreateManualRun: () => void;
  onOpenCompare: () => void;
  project: ApiProject | null;
  readingSessions: ApiReadingSession[];
  savingRun: boolean;
};

function text(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function Tag({ label }: { label: string }) {
  return <span className="tag">{label}</span>;
}

export function LabStage({ compareActive, graph, library, onCreateManualRun, onOpenCompare, project, readingSessions, savingRun }: LabStageProps) {
  const plans = graph?.reproductionPlans || [];
  const runs = graph?.experimentRuns || [];
  const dossiers = graph?.resultDossiers || [];
  const sourcePaper = readingSessions[0] || library[0] || graph?.papers?.[0] || null;
  const plan = plans[0] || null;
  const labMode = compareActive ? 'compare' : 'plan';

  return (
    <div className="lab-stage" data-ares-surface="lab-stage" data-ares-stage={compareActive ? 'result' : 'research'} data-lab-mode={labMode}>
      <section className="lab-main">
        <div className="lab-hero">
          <div className="lab-hero-copy">
            <div className="lab-kicker"><FlaskConicalIcon size={14} /><span>Lab</span></div>
            <h1>{compareActive ? 'Compare result dossier' : 'Plan reproduction run'}</h1>
            <p>Reading packet, reproduction plan, and metric deltas.</p>
          </div>
          <div className="lab-source-card">
            <span className="lab-card-label">Reading Packet</span>
            <strong title={sourcePaper?.title || ''}>{sourcePaper?.title || 'No reading packet'}</strong>
            <div className="lab-source-meta">
              <Tag label={sourcePaper?.venue || 'No venue'} />
              <Tag label={plan ? 'Plan linked' : sourcePaper ? 'Packet linked' : 'Not connected'} />
            </div>
            <div className="lab-handoff-context">
              <span className="lab-card-label">Handoff context</span>
              <span>{plan ? 'Source refs ready' : 'No handoff context'}</span>
            </div>
          </div>
        </div>

        <section className="lab-mode-grid" aria-label="Lab modes">
          <article className={`lab-mode-card ${compareActive ? '' : 'is-active'}`}>
            <span className="lab-card-label">Plan</span>
            <h2>Reproduction plan</h2>
            <ul>
              <li>{project?.libraryCount || library.length} saved papers</li>
              <li>{project?.queueCount || 0} queued readings</li>
              <li>{plans.length} reproduction plans</li>
              <li>{runs.length} experiment runs</li>
            </ul>
          </article>
          <article className="lab-mode-card">
            <span className="lab-card-label">Runs</span>
            <h2>Experiment runs</h2>
            <button type="button" className="btn-s" onClick={onCreateManualRun} disabled={!plan || savingRun}>
              {savingRun ? 'Creating...' : 'Run experiment'}
            </button>
          </article>
          <article className={`lab-mode-card ${compareActive ? 'is-active' : ''}`}>
            <span className="lab-card-label">Compare</span>
            <h2>Result Dossier</h2>
            <button type="button" className="btn-s" onClick={onOpenCompare} disabled={!dossiers.length}>Open Compare</button>
          </article>
        </section>

        <section className="lab-run-list" aria-label="Experiment run cards">
          <div className="lab-section-head">
            <div>
              <span className="lab-card-label">Runs</span>
              <h2>Current run queue</h2>
            </div>
            <button type="button" className="btn-s" onClick={onCreateManualRun} disabled={!plan || savingRun}>
              {savingRun ? 'Creating...' : 'Attach result'}
            </button>
          </div>
          <div className="lab-run-grid">
            {(runs.length ? runs : [{ title: 'Baseline reproduction', status: sourcePaper ? 'todo' : 'blocked' }]).map((run, index) => (
              <article key={text(run.id, `run-${index}`)} className="lab-run-card">
                <div className="lab-run-head">
                  <strong>{text(run.title, text(run.kind, 'Baseline reproduction'))}</strong>
                  <Tag label={text(run.status, 'todo')} />
                </div>
                <dl>
                  <div><dt>Metric</dt><dd>{text(run.metric, 'primary score')}</dd></div>
                  <div><dt>Paper</dt><dd>{plan ? 'linked' : 'none'}</dd></div>
                  <div><dt>Ours</dt><dd>{text(run.observedMetric, 'pending')}</dd></div>
                  <div><dt>Delta</dt><dd>—</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}
