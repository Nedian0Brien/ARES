import type { ComponentType } from 'react';
import { BarChart3Icon, BookOpenIcon, FlaskConicalIcon, PenLineIcon, SearchIcon, SparklesIcon } from 'lucide-react';

export type WorkflowTabId = 'papers' | 'lab' | 'insight' | 'writing';
export type WorkflowStageId = 'search' | 'reading' | 'research' | 'result' | 'insight' | 'writing';
export type WorkflowIconName = 'book' | 'chart' | 'flask' | 'pen' | 'search' | 'sparkles';

export const TOKENS = {
  bg: 'var(--bg)',
  sb: 'var(--sb)',
  s1: 'var(--s1)',
  s2: 'var(--s2)',
  s3: 'var(--s3)',
  b1: 'var(--b1)',
  b2: 'var(--b2)',
  tx: 'var(--tx)',
  t2: 'var(--t2)',
  t3: 'var(--t3)',
  t4: 'var(--t4)',
  search: '#5e9c6f',
  read: '#5e6ad2',
  research: '#8957c9',
  result: '#c07b3a',
  insight: '#c04e68',
  writing: '#3aa3a3',
} as const;

export const PROJECT_COLOR_OPTIONS = [
  TOKENS.read,
  TOKENS.search,
  TOKENS.research,
  TOKENS.insight,
  TOKENS.writing,
  TOKENS.result,
] as const;

export const WORKFLOW_ICONS: Record<WorkflowIconName, ComponentType> = {
  book: BookOpenIcon,
  chart: BarChart3Icon,
  flask: FlaskConicalIcon,
  pen: PenLineIcon,
  search: SearchIcon,
  sparkles: SparklesIcon,
};

export type WorkflowTab = {
  id: WorkflowTabId;
  label: string;
  shortLabel: string;
  sub: string;
  color: string;
  iconName: WorkflowIconName;
  kbd: string;
  defaultStage: WorkflowStageId;
  icon: ComponentType;
};

export type WorkflowStage = {
  id: WorkflowStageId;
  tabId: WorkflowTabId;
  modeLabel: string;
  label: string;
  sub: string;
  color: string;
  iconName: WorkflowIconName;
  kbd: string;
  icon: ComponentType;
};

export const WORKFLOW_TABS: WorkflowTab[] = [
  {
    id: 'papers',
    label: 'Search + Reading',
    shortLabel: 'Read',
    sub: '논문 수집과 이해',
    color: TOKENS.read,
    iconName: 'book',
    kbd: '1',
    defaultStage: 'reading',
    icon: WORKFLOW_ICONS.book,
  },
  {
    id: 'lab',
    label: 'Research + Result',
    shortLabel: 'Lab',
    sub: '재현 설계와 결과 비교',
    color: TOKENS.research,
    iconName: 'flask',
    kbd: '2',
    defaultStage: 'research',
    icon: WORKFLOW_ICONS.flask,
  },
  {
    id: 'insight',
    label: 'Insight',
    shortLabel: 'Insight',
    sub: '해석, 가설, 결정',
    color: TOKENS.insight,
    iconName: 'sparkles',
    kbd: '3',
    defaultStage: 'insight',
    icon: WORKFLOW_ICONS.sparkles,
  },
  {
    id: 'writing',
    label: 'Writing',
    shortLabel: 'Write',
    sub: '문서 조립과 초안화',
    color: TOKENS.writing,
    iconName: 'pen',
    kbd: '4',
    defaultStage: 'writing',
    icon: WORKFLOW_ICONS.pen,
  },
];

export const WORKFLOW_STAGES: WorkflowStage[] = [
  {
    id: 'search',
    tabId: 'papers',
    modeLabel: 'Discover',
    label: 'Search',
    sub: '논문 서치 및 수집',
    color: TOKENS.search,
    iconName: 'search',
    kbd: '1',
    icon: WORKFLOW_ICONS.search,
  },
  {
    id: 'reading',
    tabId: 'papers',
    modeLabel: 'Library',
    label: 'Reading',
    sub: 'AI 논문 리딩',
    color: TOKENS.read,
    iconName: 'book',
    kbd: '2',
    icon: WORKFLOW_ICONS.book,
  },
  {
    id: 'research',
    tabId: 'lab',
    modeLabel: 'Plan',
    label: 'Research',
    sub: '재현연구 및 실험',
    color: TOKENS.research,
    iconName: 'flask',
    kbd: '3',
    icon: WORKFLOW_ICONS.flask,
  },
  {
    id: 'result',
    tabId: 'lab',
    modeLabel: 'Compare',
    label: 'Result',
    sub: '결과 도출 및 정리',
    color: TOKENS.result,
    iconName: 'chart',
    kbd: '4',
    icon: WORKFLOW_ICONS.chart,
  },
  {
    id: 'insight',
    tabId: 'insight',
    modeLabel: 'Claims',
    label: 'Insight',
    sub: '인사이트 취합',
    color: TOKENS.insight,
    iconName: 'sparkles',
    kbd: '5',
    icon: WORKFLOW_ICONS.sparkles,
  },
  {
    id: 'writing',
    tabId: 'writing',
    modeLabel: 'Draft',
    label: 'Writing',
    sub: '논문 작성 보조',
    color: TOKENS.writing,
    iconName: 'pen',
    kbd: '6',
    icon: WORKFLOW_ICONS.pen,
  },
];

export const SURFACE_ROUTE_ALIASES: Record<string, WorkflowStageId> = {
  papers: 'reading',
  lab: 'research',
  search: 'search',
  reading: 'reading',
  research: 'research',
  result: 'result',
  results: 'result',
  insight: 'insight',
  insights: 'insight',
  writing: 'writing',
  read: 'reading',
};

export function resolveStageForTab(tabId: string): WorkflowStage {
  const tab = WORKFLOW_TABS.find((item) => item.id === tabId) ?? WORKFLOW_TABS[0];
  return WORKFLOW_STAGES.find((stage) => stage.id === tab.defaultStage) ?? WORKFLOW_STAGES[0];
}

export function stageById(stageId: string | null | undefined): WorkflowStage {
  return WORKFLOW_STAGES.find((stage) => stage.id === normalizeWorkflowStage(stageId)) ?? WORKFLOW_STAGES[0];
}

export function workflowTabById(tabId: string | null | undefined): WorkflowTab {
  return WORKFLOW_TABS.find((tab) => tab.id === tabId) ?? WORKFLOW_TABS[0];
}

export function workflowTabByStageId(stageId: string | null | undefined): WorkflowTab {
  return workflowTabById(stageById(stageId).tabId);
}

export function normalizeWorkflowStage(value: string | null | undefined): WorkflowStageId {
  const resolved = SURFACE_ROUTE_ALIASES[String(value || '')] || value;
  return WORKFLOW_STAGES.some((stage) => stage.id === resolved) ? (resolved as WorkflowStageId) : 'search';
}
