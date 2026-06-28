import { ChevronDownIcon, ChevronRightIcon, FilterIcon, MoreHorizontalIcon, PlusIcon, SearchIcon, ShareIcon, SidebarIcon } from 'lucide-react';

import { stageById, workflowTabByStageId, WORKFLOW_STAGES, WORKFLOW_TABS, type WorkflowStageId, type WorkflowTabId } from '@/app/workflow';
import type { ApiProject } from '@/app/api';
import type { AresAppState, ThemeMode } from '@/app/state';

type AppChromeProps = {
  activeProject?: ApiProject | null;
  children: React.ReactNode;
  onProjectChange: (projectId: string) => void;
  onStageChange: (stageId: WorkflowStageId) => void;
  onTabChange: (tabId: WorkflowTabId) => void;
  onThemeModeChange: (mode: ThemeMode) => void;
  projects: ApiProject[];
  state: AresAppState;
};

function WorkflowIcon({ name, size = 14 }: { name: string; size?: number }) {
  const stage = WORKFLOW_STAGES.find((item) => item.iconName === name);
  const tab = WORKFLOW_TABS.find((item) => item.iconName === name);
  const Icon = stage?.icon ?? tab?.icon ?? SearchIcon;
  return <Icon aria-hidden="true" size={size} strokeWidth={1.75} />;
}

function ThemeSwitcher({ onThemeModeChange, themeMode }: { onThemeModeChange: (mode: ThemeMode) => void; themeMode: ThemeMode }) {
  const modes: Array<[ThemeMode, string, string]> = [
    ['light', 'Light', 'sun'],
    ['dark', 'Dark', 'moon'],
    ['system', 'System', 'monitor'],
  ];

  return (
    <div className="theme-switcher" role="group" aria-label="Color theme">
      {modes.map(([mode, label]) => (
        <button
          key={mode}
          type="button"
          className={`theme-switcher-btn ${themeMode === mode ? 'is-active' : ''}`}
          aria-pressed={themeMode === mode}
          onClick={() => onThemeModeChange(mode)}
          title={label}
        >
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

function DesktopSidebar({ onProjectChange, onTabChange, projects, state }: Pick<AppChromeProps, 'onProjectChange' | 'onTabChange' | 'projects' | 'state'>) {
  const activeTab = workflowTabByStageId(state.activeStage);
  const collapsed = state.sidebarCollapsed;
  const workflowExpanded = collapsed || state.workflowOpen;

  return (
    <aside className="desktop-sidebar" data-ares-surface="sidebar" data-ares-role="navigation" data-collapsed={collapsed ? 'true' : 'false'}>
      <section className="sidebar-section">
        <div className="workspace-switch" title="ARES · Research workspace">
          <span className="brand-mark">A</span>
          <span className="brand-copy">
            <span className="brand-title">ARES</span>
            <span className="brand-subtitle">Research workspace</span>
          </span>
        </div>
      </section>

      <section className="sidebar-section">
        <button type="button" className="sidebar-action hov-soft" title="Search">
          <SearchIcon aria-hidden="true" size={13.5} />
          <span className="sidebar-action-label">Search</span>
          <span className="kbd">⌘K</span>
        </button>
        <button type="button" className="sidebar-action hov-soft" title="New paper">
          <PlusIcon aria-hidden="true" size={13.5} />
          <span className="sidebar-action-label">New paper</span>
          <span className="kbd">C</span>
        </button>
      </section>

      <section className="sidebar-section">
        <div className="sidebar-label-row">
          <p className="sidebar-label">Projects</p>
          <button type="button" className="sidebar-icon-btn project-add-btn" aria-label="Add project" title="Add project">
            <PlusIcon aria-hidden="true" size={13} />
          </button>
        </div>
        <div className="project-list">
          {projects.map((project) => {
            const active = project.id === state.activeProjectId;
            return (
              <button
                key={project.id}
                type="button"
                className={`project-item hov ${active ? 'is-active' : ''}`}
                data-ares-role="project-item"
                data-ares-project-id={project.id}
                data-ares-project-name={project.name}
                onClick={() => onProjectChange(project.id)}
                title={project.name}
              >
                <span className="project-swatch" style={{ background: project.color || activeTab.color }} />
                <span className="project-item-label">{project.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="sidebar-section sidebar-section--scroll">
        <button type="button" className="workflow-toggle">
          <span className="sidebar-label" style={{ padding: 0 }}>Workflow</span>
          {state.workflowOpen ? <ChevronDownIcon aria-hidden="true" size={12} /> : <ChevronRightIcon aria-hidden="true" size={12} />}
        </button>
        <div className="workflow-list">
          {workflowExpanded
            ? WORKFLOW_TABS.map((tab) => {
                const active = tab.id === activeTab.id;
                return (
                  <div key={tab.id} className={`workflow-item ${active ? 'is-active' : ''}`} data-ares-role="workflow-row" data-ares-tab={tab.id}>
                    <button
                      type="button"
                      className="workflow-stage-btn hov"
                      aria-label={tab.label}
                      data-ares-role="workflow-stage"
                      data-ares-tab={tab.id}
                      data-ares-stage={tab.defaultStage}
                      onClick={() => onTabChange(tab.id)}
                      title={tab.label}
                    >
                      <span
                        className="workflow-stage-icon"
                        style={{
                          background: active ? tab.color : `${tab.color}1a`,
                          color: active ? '#ffffff' : tab.color,
                        }}
                      >
                        <WorkflowIcon name={tab.iconName} size={13} />
                      </span>
                      <span className="workflow-stage-copy">
                        <span className="workflow-stage-label">{tab.shortLabel || tab.label}</span>
                      </span>
                    </button>
                    <div className="workflow-side-actions">
                      <button type="button" className="sidebar-icon-btn" aria-label={`${tab.label} context menu`}>
                        <MoreHorizontalIcon aria-hidden="true" size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
            : null}
        </div>
      </section>

      <section className="sidebar-section sidebar-section--collapse">
        <button type="button" className="sidebar-action sidebar-collapse-btn hov-soft" aria-label="Collapse sidebar" title="Collapse sidebar">
          <span className="sidebar-collapse-icon" aria-hidden="true">
            <SidebarIcon size={13.5} />
          </span>
          <span className="sidebar-action-label">Collapse sidebar</span>
        </button>
      </section>

      <section className="sidebar-section">
        <div className="sidebar-account" title="Dokyung · Pro plan">
          <span className="account-mark">DK</span>
          <span className="brand-copy">
            <span className="account-name">Dokyung</span>
            <span className="account-plan">Pro plan</span>
          </span>
        </div>
      </section>
    </aside>
  );
}

function Topbar({ activeProject, onThemeModeChange, state }: Pick<AppChromeProps, 'activeProject' | 'onThemeModeChange' | 'state'>) {
  const stage = stageById(state.activeStage);
  const tab = workflowTabByStageId(stage.id);

  return (
    <header className="main-topbar" data-ares-surface="topbar" data-ares-stage={stage.id} data-ares-tab={tab.id}>
      <div className="topbar-stage">
        <span className="topbar-stage-badge" style={{ background: tab.color }}>
          <WorkflowIcon name={tab.iconName} size={13} />
        </span>
        <span className="topbar-stage-label">{tab.shortLabel || tab.label}</span>
        {stage.tabId === tab.id && stage.label !== tab.label ? (
          <>
            <span className="topbar-separator">/</span>
            <span className="topbar-stage-mode">{stage.modeLabel || stage.label}</span>
          </>
        ) : null}
        {activeProject ? (
          <>
            <span className="topbar-separator topbar-breadcrumb-bridge">/</span>
            <nav className="topbar-breadcrumb" aria-label="Project breadcrumb">
              <span className="topbar-crumb-current">{activeProject.name}</span>
            </nav>
          </>
        ) : null}
      </div>
      <div className="topbar-actions">
        <ThemeSwitcher onThemeModeChange={onThemeModeChange} themeMode={state.themeMode} />
        <button type="button" className="btn-s">
          <ShareIcon aria-hidden="true" size={12} /> Share
        </button>
        <button type="button" className="btn-s" disabled={stage.id !== 'search'}>
          <FilterIcon aria-hidden="true" size={12} /> Filter
        </button>
      </div>
    </header>
  );
}

function WorkflowModeNav({ onStageChange, state }: Pick<AppChromeProps, 'onStageChange' | 'state'>) {
  const tab = workflowTabByStageId(state.activeStage);
  const stages = WORKFLOW_STAGES.filter((stage) => stage.tabId === tab.id);
  if (stages.length < 2) {
    return null;
  }

  return (
    <nav className="workflow-mode-nav" aria-label={`${tab.label} modes`} data-ares-role="workflow-mode-nav" data-tab-id={tab.id}>
      <div className="workflow-mode-context">
        <span className="workflow-mode-kicker">{tab.shortLabel}</span>
        <span className="workflow-mode-title">{tab.shortLabel || tab.label}</span>
      </div>
      <div className="workflow-mode-list">
        {stages.map((stage) => {
          const active = stage.id === state.activeStage;
          const label = stage.id === 'reading' && state.readingView === 'detail' ? 'Reader' : stage.modeLabel || stage.label;
          const hint = stage.id === 'search' ? 'Discover' : stage.id === 'reading' ? 'Reader opens selected paper' : stage.label;
          return (
            <button
              key={stage.id}
              type="button"
              className={`workflow-mode-btn ${active ? 'is-active' : ''}`}
              onClick={() => onStageChange(stage.id)}
              style={{ '--mode-color': stage.color, '--mode-tint': `${stage.color}12` } as React.CSSProperties}
            >
              <WorkflowIcon name={stage.iconName} size={13} />
              <span>{label}</span>
              <small>{hint}</small>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function BottomNav({ onTabChange, state }: Pick<AppChromeProps, 'onTabChange' | 'state'>) {
  const activeTab = workflowTabByStageId(state.activeStage);
  const activeIndex = Math.max(0, WORKFLOW_TABS.findIndex((tab) => tab.id === activeTab.id));

  return (
    <nav className="bottom-nav" aria-label="Workflow tabs" data-ares-surface="bottom-nav" data-ares-role="navigation">
      <span
        className="bottom-nav-indicator"
        aria-hidden="true"
        style={{
          opacity: 1,
          transform: `translateX(calc(${activeIndex} * 100%))`,
          width: 'calc((100% - 8px) / 4)',
        }}
      />
      {WORKFLOW_TABS.map((tab) => {
        const active = tab.id === activeTab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className={`nav-item ${active ? 'active' : ''}`}
            aria-label={tab.label}
            aria-current={active ? 'page' : 'false'}
            onClick={() => onTabChange(tab.id)}
            style={{ '--stage-color': tab.color, '--stage-tint': `${tab.color}12` } as React.CSSProperties}
            data-ares-role="bottom-stage"
            data-ares-tab={tab.id}
            data-ares-stage={tab.defaultStage}
            data-bottom-nav-tab={tab.id}
          >
            <WorkflowIcon name={tab.iconName} size={20} />
            <span>{tab.shortLabel}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function AppChrome({
  activeProject,
  children,
  onProjectChange,
  onStageChange,
  onTabChange,
  onThemeModeChange,
  projects,
  state,
}: AppChromeProps) {
  const activeTab = workflowTabByStageId(state.activeStage);

  return (
    <div
      className="app-shell"
      data-ares-react-app
      data-active-stage={state.activeStage}
      data-active-tab={activeTab.id}
      data-active-project-id={activeProject?.id || ''}
      data-active-project-name={activeProject?.name || ''}
    >
      <DesktopSidebar onProjectChange={onProjectChange} onTabChange={onTabChange} projects={projects} state={state} />
      <main className="workspace" data-ares-surface="workspace" data-ares-stage={state.activeStage}>
        <Topbar activeProject={activeProject} onThemeModeChange={onThemeModeChange} state={state} />
        <div className="stage-wrap" data-ares-surface="stage-wrap" data-ares-stage={state.activeStage}>
          <WorkflowModeNav onStageChange={onStageChange} state={state} />
          {children}
        </div>
      </main>
      <BottomNav onTabChange={onTabChange} state={state} />
    </div>
  );
}
