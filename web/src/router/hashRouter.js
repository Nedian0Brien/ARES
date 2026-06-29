const DEFAULT_PROJECT_ID = 'rag-reranker';

const TAB_TO_STAGE = {
  agent: 'writing',
  lab: 'research',
  reading: 'reading',
  wiki: 'insight',
};

const STAGE_TO_TAB = {
  agent: 'agent',
  insight: 'wiki',
  insights: 'wiki',
  lab: 'lab',
  papers: 'reading',
  read: 'reading',
  reading: 'reading',
  research: 'lab',
  result: 'lab',
  results: 'lab',
  search: 'reading',
  wiki: 'wiki',
  writing: 'agent',
};

function splitHash(hash) {
  return String(hash || '')
    .replace(/^#\/?/, '')
    .split('/')
    .map((part) => decodeURIComponent(part))
    .filter(Boolean);
}

function parseHashRoute(hash) {
  const parts = splitHash(hash);
  const projectIndex = parts[0] === 'projects' ? 1 : -1;
  const projectId = projectIndex >= 0 ? parts[projectIndex] || DEFAULT_PROJECT_ID : DEFAULT_PROJECT_ID;
  const stageIndex = projectIndex >= 0 ? projectIndex + 1 : 0;
  const stage = parts[stageIndex] || 'reading';
  const tab = STAGE_TO_TAB[stage] || 'reading';
  const rest = parts.slice(stageIndex + 1);
  const isReadingSession = tab === 'reading' && rest[0] === 'sessions';
  const docTab = isReadingSession && ['assets', 'notes', 'pdf', 'summary'].includes(rest[2]) ? rest[2] : '';

  return {
    hash: String(hash || ''),
    projectId,
    stage,
    tab,
    reading: {
      docTab,
      sessionId: isReadingSession ? rest[1] || '' : '',
      view: isReadingSession ? 'reader' : 'library',
    },
  };
}

function hashForTab(tab, projectId = DEFAULT_PROJECT_ID) {
  const stage = TAB_TO_STAGE[tab] || 'reading';
  return `#/projects/${encodeURIComponent(projectId || DEFAULT_PROJECT_ID)}/${stage}`;
}

export { DEFAULT_PROJECT_ID, STAGE_TO_TAB, TAB_TO_STAGE, hashForTab, parseHashRoute };
