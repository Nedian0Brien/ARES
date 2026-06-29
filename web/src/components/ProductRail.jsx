import { Icon, T } from './primitives.jsx';

const PRODUCT_TABS = [
  { id:'reading', icon:'book',     lbl:'Reading', color:T.read },
  { id:'lab',     icon:'flask',    lbl:'Lab',     color:T.research },
  { id:'wiki',    icon:'share',    lbl:'Wiki',    color:T.search },
  { id:'agent',   icon:'sparkles', lbl:'Agent',   color:T.writing },
];
function ProductRail({ tab, setTab }) {
  return (
    <nav className="icon-rail" aria-label="주요 작업 영역">
      <div className="rail-logo" title="ARES Papers">A</div>
      <div className="rail-divider"/>
      {PRODUCT_TABS.map(t => (
        <button
          key={t.id}
          aria-controls="ares-workspace-panel"
          aria-current={tab===t.id ? 'page' : undefined}
          aria-label={`${t.lbl} 작업 영역 열기`}
          className={`rail-btn t-${t.id} ${tab===t.id?'active':''}`}
          onClick={() => setTab(t.id)}
          title={t.lbl}
          type="button"
        >
          <Icon name={t.icon} size={17}/>
          <span className="lbl">{t.lbl}</span>
        </button>
      ))}
      <div className="rail-spacer"/>
      <div className="rail-avatar" title="Minjae · Local">MP</div>
    </nav>
  );
}

export { ProductRail };
