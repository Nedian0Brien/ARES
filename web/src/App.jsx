import { useEffect, useState } from 'react';
import { ProductRail } from './components/ProductRail.jsx';
import { AgentTab } from './tabs/agent/AgentTab.jsx';
import { useAuthSession } from './lib/auth.js';
import { useVisualViewportOcclusion } from './lib/mobileViewport.js';
import { LabTab } from './tabs/lab/LabTab.jsx';
import { ReadingTab } from './tabs/reading/ReadingTab.jsx';
import { WikiTab } from './tabs/wiki/WikiTab.jsx';
import { hashForTab, parseHashRoute } from './router/hashRouter.js';

const TAB_PANEL_LABELS = {
  agent: 'Agent 작업 영역',
  lab: 'Lab 작업 영역',
  reading: 'Reading 작업 영역',
  wiki: 'Wiki 작업 영역',
};

function App() {
  useAuthSession();
  useVisualViewportOcclusion();
  const [route, setRoute] = useState(() => parseHashRoute(window.location.hash));
  const [readSub, setReadSub] = useState('overview');
  const tab = route.tab;
  const selectTab = (nextTab) => {
    const nextHash = hashForTab(nextTab, route.projectId);
    if (window.location.hash === nextHash) {
      setRoute(parseHashRoute(nextHash));
      return;
    }
    window.location.hash = nextHash;
  };

  useEffect(() => {
    const onHashChange = () => setRoute(parseHashRoute(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!(event.metaKey || event.ctrlKey) || !/^[1-4]$/.test(event.key)) {
        return;
      }
      event.preventDefault();
      selectTab(['reading', 'lab', 'wiki', 'agent'][Number(event.key) - 1]);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [route.projectId]);

  return (
    <div className="app" style={{ flexDirection:'row' }}>
      <ProductRail tab={tab} setTab={selectTab}/>
      <div id="ares-workspace-panel" role="main" aria-label={TAB_PANEL_LABELS[tab] || 'ARES 작업 영역'} style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
        {tab==='reading' && <ReadingTab projectId={route.projectId} readSub={readSub} route={route} setReadSub={setReadSub}/>}
        {tab==='wiki' && <WikiTab projectId={route.projectId}/>}
        {tab==='agent' && <AgentTab projectId={route.projectId}/>}
        {tab==='lab' && <LabTab projectId={route.projectId}/>}
      </div>
    </div>
  );
}

export { App };
