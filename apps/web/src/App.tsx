import { useEffect, useMemo, useState } from 'react';

import {
  createReadingSession,
  createReadingNote,
  deleteReadingNote,
  listProjectLibrary,
  listProjects,
  listReadingSessions,
  loadProjectGraph,
  removePaperFromLibrary,
  runReadingAnalysisStep,
  savePaperToLibrary,
  searchPapers,
  sendReadingChatMessage,
  upsertProjectAsset,
  updateReadingNote,
  type ApiPaper,
  type ApiProject,
  type ApiProjectGraph,
  type ApiReadingSession,
  type ReadingAnalysisStep,
} from '@/app/api';
import { buildDraftExportBundle } from '@/app/draftExport';
import { parseAresRoute, routeHashForStage, routeHashForTab } from '@/app/router';
import { createInitialAresState, type AresAppState, type ThemeMode } from '@/app/state';
import { resolveStageForTab, stageById, workflowTabByStageId, type WorkflowStageId, type WorkflowTabId } from '@/app/workflow';
import { AppChrome } from '@/components/chrome/AppChrome';
import { InsightStage } from '@/components/insight/InsightStage';
import { LabStage } from '@/components/lab/LabStage';
import { ReadingDetailStage } from '@/components/reading/ReadingDetailStage';
import { ReadingHomeStage } from '@/components/reading/ReadingHomeStage';
import { SearchStage } from '@/components/search/SearchStage';
import { WritingStage } from '@/components/writing/WritingStage';

function applyThemeMode(mode: ThemeMode) {
  const resolved =
    mode === 'system' && globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : mode === 'system'
        ? 'light'
        : mode;
  document.documentElement.dataset.themeMode = mode;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.style.colorScheme = resolved;
}

function StagePlaceholder({ state }: { state: AresAppState }) {
  const stage = stageById(state.activeStage);
  return (
    <section className="react-stage-placeholder" data-ares-surface="react-stage-placeholder" data-ares-stage={stage.id} aria-label={stage.label}>
      <div className="placeholder-main">
        <p className="placeholder-kicker">{workflowTabByStageId(stage.id).shortLabel}</p>
        <h1 className="placeholder-title">{stage.modeLabel || stage.label}</h1>
      </div>
    </section>
  );
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object') : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function isReadingSessionRecord(value: unknown): value is ApiReadingSession {
  return value !== null && typeof value === 'object' && 'id' in value && typeof value.id === 'string';
}

function firstRecordId(value: unknown): string {
  return text(value);
}

function activeResearchQuestionId(graph: ApiProjectGraph | null): string {
  return firstRecordId(graph?.researchQuestions?.[0]?.id);
}

function graphEvidenceItems(graph: ApiProjectGraph | null) {
  const evidenceLinks = graph?.evidenceLinks || [];
  const resultDossiers = graph?.resultDossiers || [];
  const linkItems = evidenceLinks.map((link) => ({
    evidenceLinkIds: [text(link.id)].filter(Boolean),
    text: text(link.quote, 'Linked evidence'),
  }));
  const resultItems = resultDossiers.flatMap((dossier) =>
    recordArray(dossier.comparisons).map((comparison) => ({
      evidenceLinkIds: stringArray(dossier.evidenceLinkIds),
      text: text(comparison.summary, text(comparison.delta, text(dossier.deltaSummary, 'Result delta'))),
    })),
  );
  return [...linkItems, ...resultItems];
}

function labMetricNumber(value: unknown): number | null {
  const source = text(value).match(/-?\d+(?:\.\d+)?/);
  return source ? Number(source[0]) : null;
}

function labMetricDelta(paperValue: unknown, reproducedValue: unknown): string {
  const baseline = labMetricNumber(paperValue);
  const observed = labMetricNumber(reproducedValue);
  if (baseline === null || observed === null) {
    return text(reproducedValue) ? 'Needs analysis' : 'Awaiting result';
  }
  const delta = Number((observed - baseline).toFixed(3));
  return `${delta > 0 ? '+' : ''}${delta}`;
}

function normaliseLabMetricComparison({
  metricName,
  metricUnit,
  paperMetricValue,
  reproducedValue,
  summary,
}: {
  metricName: string;
  metricUnit: string;
  paperMetricValue: string;
  reproducedValue: string;
  summary: string;
}) {
  const paperValue = text(paperMetricValue, 'linked evidence');
  const observedValue = text(reproducedValue);
  const baseline = labMetricNumber(paperValue);
  const observed = labMetricNumber(observedValue);
  const deltaValue = baseline === null || observed === null ? null : Number((observed - baseline).toFixed(3));
  return {
    delta: labMetricDelta(paperValue, observedValue),
    deltaValue,
    metric: text(metricName, 'primary'),
    paperValue,
    reproducedValue: observedValue || 'pending',
    status: deltaValue === null ? 'needs-review' : 'measured',
    summary,
    unit: text(metricUnit),
  };
}

export default function App() {
  const [state, setState] = useState<AresAppState>(() => createInitialAresState());
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [projectLibrary, setProjectLibrary] = useState<ApiPaper[]>([]);
  const [readingSessions, setReadingSessions] = useState<ApiReadingSession[]>([]);
  const [searchResults, setSearchResults] = useState<ApiPaper[]>([]);
  const [availableVenues, setAvailableVenues] = useState<string[]>([]);
  const [projectGraph, setProjectGraph] = useState<ApiProjectGraph | null>(null);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === state.activeProjectId) ?? projects[0] ?? null,
    [projects, state.activeProjectId],
  );

  useEffect(() => {
    let canceled = false;
    listProjects()
      .then((payload) => {
        if (canceled) {
          return;
        }
        const nextProjects = payload.projects || [];
        setProjects(nextProjects);
        setState((current) => ({
          ...current,
          activeProjectId: current.activeProjectId || nextProjects[0]?.id || '',
          booting: false,
          error: '',
          projects: nextProjects,
          searchInput: current.searchInput || nextProjects[0]?.defaultQuery || '',
        }));
      })
      .catch((error) => {
        if (canceled) {
          return;
        }
        setState((current) => ({
          ...current,
          booting: false,
          error: error instanceof Error ? error.message : '프로젝트 정보를 불러오지 못했습니다.',
        }));
      });
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeProject?.id) {
      setProjectLibrary([]);
      setReadingSessions([]);
      setProjectGraph(null);
      return;
    }

    let canceled = false;
    setState((current) => ({ ...current, readingLoading: true }));
    Promise.all([listProjectLibrary(activeProject.id), listReadingSessions(activeProject.id), loadProjectGraph(activeProject.id)])
      .then(([libraryPayload, sessionsPayload, graphPayload]) => {
        if (canceled) {
          return;
        }
        const nextLibrary = libraryPayload.results || [];
        const nextSessions = sessionsPayload.results || [];
        setProjectLibrary(nextLibrary);
        setReadingSessions(nextSessions);
        setProjectGraph(graphPayload);
        setState((current) => ({
          ...current,
          activeReadingSessionId: current.activeReadingSessionId || nextSessions[0]?.id || '',
          error: '',
          projectGraph: graphPayload,
          projectLibrary: nextLibrary,
          readingHomeSelectedPaperId: current.readingHomeSelectedPaperId || nextLibrary[0]?.paperId || '',
          readingLoading: false,
          readingSessions: nextSessions,
          searchInput: current.searchInput || activeProject.defaultQuery || '',
        }));
      })
      .catch((error) => {
        if (canceled) {
          return;
        }
        setProjectLibrary([]);
        setReadingSessions([]);
        setProjectGraph(null);
        setState((current) => ({
          ...current,
          error: error instanceof Error ? error.message : '라이브러리를 불러오지 못했습니다.',
          projectGraph: null,
          projectLibrary: [],
          readingLoading: false,
          readingSessions: [],
        }));
      });

    return () => {
      canceled = true;
    };
  }, [activeProject?.id, activeProject?.defaultQuery]);

  useEffect(() => {
    applyThemeMode(state.themeMode);
  }, [state.themeMode]);

  useEffect(() => {
    function applyBrowserRoute() {
      const route = parseAresRoute();
      setState((current) => ({
        ...current,
        activeProjectId: route.projectId || current.activeProjectId,
        activeReadingSessionId: route.activeReadingSessionId || current.activeReadingSessionId,
        activeStage: route.activeStage,
        readingAssetDetailId: route.readingAssetDetailId || current.readingAssetDetailId,
        readingAssetsFilter: route.readingAssetsFilter || current.readingAssetsFilter,
        readingDocumentTab: route.readingDocumentTab || current.readingDocumentTab,
        readingView: route.readingView || (route.activeStage === 'reading' ? current.readingView : 'home'),
        readingWorkbenchCollapsed: route.readingWorkbenchRequested ? false : current.readingWorkbenchCollapsed,
        readingWorkbenchTab: route.readingWorkbenchTab || current.readingWorkbenchTab,
        scopePicker: null,
      }));
    }

    globalThis.addEventListener?.('hashchange', applyBrowserRoute);
    globalThis.addEventListener?.('popstate', applyBrowserRoute);
    return () => {
      globalThis.removeEventListener?.('hashchange', applyBrowserRoute);
      globalThis.removeEventListener?.('popstate', applyBrowserRoute);
    };
  }, []);

  function updateStage(stageId: WorkflowStageId) {
    setState((current) => ({
      ...current,
      activeStage: stageId,
      readingView: stageId === 'reading' ? 'home' : current.readingView,
      scopePicker: null,
    }));
    const projectId = activeProject?.id || state.activeProjectId || 'rag-reranker';
    globalThis.history?.replaceState(null, '', routeHashForStage(projectId, stageId));
  }

  function updateTab(tabId: WorkflowTabId) {
    const stage = resolveStageForTab(tabId);
    setState((current) => ({ ...current, activeStage: stage.id, scopePicker: null }));
    const projectId = activeProject?.id || state.activeProjectId || 'rag-reranker';
    globalThis.history?.replaceState(null, '', routeHashForTab(projectId, tabId));
  }

  function updateProject(projectId: string) {
    const project = projects.find((entry) => entry.id === projectId);
    setState((current) => ({
      ...current,
      activeProjectId: projectId,
      hasSearched: false,
      results: [],
      searchInput: project?.defaultQuery || '',
      selectedPaperId: '',
    }));
    setSearchResults([]);
    setAvailableVenues([]);
    globalThis.history?.replaceState(null, '', routeHashForStage(projectId, state.activeStage));
  }

  function updateThemeMode(themeMode: ThemeMode) {
    setState((current) => ({ ...current, themeMode }));
    globalThis.localStorage?.setItem('ares.theme.mode', themeMode);
  }

  async function reloadProjectCollections(projectId: string) {
    const [libraryPayload, sessionsPayload, projectsPayload, graphPayload] = await Promise.all([
      listProjectLibrary(projectId),
      listReadingSessions(projectId),
      listProjects(),
      loadProjectGraph(projectId),
    ]);
    setProjectLibrary(libraryPayload.results || []);
    setReadingSessions(sessionsPayload.results || []);
    setProjects(projectsPayload.projects || []);
    setProjectGraph(graphPayload);
    setState((current) => ({
      ...current,
      projectGraph: graphPayload,
      projectLibrary: libraryPayload.results || [],
      projects: projectsPayload.projects || [],
      readingSessions: sessionsPayload.results || [],
    }));
  }

  function syncReadingSession(nextSession: ApiReadingSession | null | undefined) {
    if (!nextSession?.id) {
      return;
    }
    setReadingSessions((current) => current.map((entry) => (entry.id === nextSession.id ? nextSession : entry)));
    setState((current) => ({
      ...current,
      readingSessions: current.readingSessions.map((entry) =>
        isReadingSessionRecord(entry) && entry.id === nextSession.id ? nextSession : entry,
      ),
    }));
  }

  async function submitSearch() {
    if (!activeProject?.id || !state.searchInput.trim()) {
      return;
    }

    setState((current) => ({ ...current, error: '', hasSearched: true, loading: true, previewPanelOpen: true }));
    try {
      const payload = await searchPapers({
        mode: state.searchMode,
        projectId: activeProject.id,
        query: state.searchInput.trim(),
        scopes: state.searchScopes,
      });
      const nextResults = payload.results || [];
      setSearchResults(nextResults);
      setAvailableVenues(payload.availableVenues || []);
      setProjects((current) => current.map((project) => (project.id === payload.project.id ? payload.project : project)));
      setState((current) => ({
        ...current,
        availableVenues: payload.availableVenues || [],
        error: '',
        filters: {
          ...current.filters,
          venues: new Set(payload.availableVenues || []),
        },
        loading: false,
        results: nextResults,
        searchMeta: {
          agentRuntime: payload.agentRuntime || '',
          live: Boolean(payload.live),
          provider: payload.provider || '',
          query: payload.query,
          searchMode: payload.searchMode || current.searchMode,
          total: payload.total || nextResults.length,
          warning: payload.warning || '',
        },
        selectedPaperId: nextResults[0]?.paperId || '',
      }));
    } catch (error) {
      setSearchResults([]);
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : '검색에 실패했습니다.',
        loading: false,
        results: [],
        selectedPaperId: '',
      }));
    }
  }

  async function togglePaperSaved(paper: ApiPaper) {
    if (!activeProject?.id) {
      return;
    }
    setState((current) => ({ ...current, savingPaperId: paper.paperId }));
    try {
      if (paper.saved) {
        const payload = await removePaperFromLibrary(activeProject.id, paper.paperId);
        const nextResults = searchResults.map((entry) => (entry.paperId === paper.paperId ? { ...entry, saved: false } : entry));
        setProjects((current) => current.map((project) => (project.id === payload.project.id ? payload.project : project)));
        setSearchResults(nextResults);
        setState((current) => ({
          ...current,
          results: nextResults,
        }));
      } else {
        const payload = await savePaperToLibrary(activeProject.id, paper);
        const nextResults = searchResults.map((entry) => (entry.paperId === paper.paperId ? { ...entry, saved: true } : entry));
        setProjects((current) => current.map((project) => (project.id === payload.project.id ? payload.project : project)));
        setSearchResults(nextResults);
        setState((current) => ({
          ...current,
          results: nextResults,
        }));
      }
      await reloadProjectCollections(activeProject.id);
    } catch (error) {
      setState((current) => ({ ...current, error: error instanceof Error ? error.message : '저장 상태를 바꾸지 못했습니다.' }));
    } finally {
      setState((current) => ({ ...current, savingPaperId: '' }));
    }
  }

  async function startReading(paper: ApiPaper, targetView: 'detail' | 'home' = 'home') {
    if (!activeProject?.id) {
      return;
    }
    setState((current) => ({
      ...current,
      error: '',
      readingHomeSelectedPaperId: paper.paperId,
      readingStartingPaperId: paper.paperId,
    }));
    try {
      const payload = await createReadingSession(activeProject.id, paper);
      setSearchResults((current) => current.map((entry) => (entry.paperId === paper.paperId ? { ...entry, queued: true, saved: true } : entry)));
      await reloadProjectCollections(activeProject.id);
      setState((current) => ({
        ...current,
        activeReadingSessionId: payload.readingSession.id,
        activeStage: 'reading',
        readingDocumentTab: targetView === 'detail' ? 'pdf' : current.readingDocumentTab,
        readingStartingPaperId: '',
        readingView: targetView,
      }));
      globalThis.history?.replaceState(
        null,
        '',
        targetView === 'detail'
          ? `#/projects/${encodeURIComponent(activeProject.id)}/reading/sessions/${encodeURIComponent(payload.readingSession.id)}/pdf`
          : routeHashForStage(activeProject.id, 'reading'),
      );
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : 'Reader를 시작하지 못했습니다.',
        readingStartingPaperId: '',
      }));
    }
  }

  function openReadingDetail(paperId: string) {
    const session = readingSessions.find((entry) => entry.paperId === paperId || entry.id === paperId);
    if (!session) {
      setState((current) => ({ ...current, readingHomeSelectedPaperId: paperId }));
      return;
    }
    setState((current) => ({
      ...current,
      activeReadingSessionId: session.id,
      activeStage: 'reading',
      readingDocumentTab: 'pdf',
      readingHomeSelectedPaperId: paperId,
      readingView: 'detail',
    }));
    const projectId = activeProject?.id || state.activeProjectId || 'rag-reranker';
    globalThis.history?.replaceState(
      null,
      '',
      `#/projects/${encodeURIComponent(projectId)}/reading/sessions/${encodeURIComponent(session.id)}/pdf`,
    );
  }

  async function analyzeReadingSession(session: ApiReadingSession) {
    if (!activeProject?.id || !session.id) {
      return;
    }
    const refresh =
      session.parseStatus === 'done' &&
      session.summaryStatus === 'done' &&
      Array.isArray(session.assets) &&
      session.assets.length > 0;
    const steps: ReadingAnalysisStep[] = [
      refresh || session.parseStatus !== 'done' || !session.parsedArtifactPath ? 'parse' : null,
      refresh || session.summaryStatus !== 'done' ? 'summarize' : null,
      refresh || !Array.isArray(session.assets) || session.assets.length === 0 ? 'extract-assets' : null,
    ].filter((step): step is ReadingAnalysisStep => Boolean(step));
    const analysisSteps: ReadingAnalysisStep[] = steps.length ? steps : ['analyze'];

    setState((current) => ({
      ...current,
      error: '',
      readingRequest: { completed: 0, sessionId: session.id, total: analysisSteps.length, type: 'analyze' },
    }));
    try {
      for (const [index, step] of analysisSteps.entries()) {
        const payload = await runReadingAnalysisStep(session.id, step, step === 'analyze' ? { refresh } : {});
        const nextSession = payload.readingSession || payload.session || null;
        syncReadingSession(nextSession);
        setState((current) => ({
          ...current,
          readingRequest: { completed: index + 1, sessionId: session.id, total: analysisSteps.length, type: 'analyze' },
        }));
        if (step === 'parse' && nextSession?.parseStatus !== 'done') {
          throw new Error(nextSession?.parseError || 'Analysis could not read this paper.');
        }
        if (step === 'summarize' && nextSession?.summaryStatus === 'error') {
          throw new Error(nextSession?.summaryError || 'Summary generation failed.');
        }
      }
      await reloadProjectCollections(activeProject.id);
    } catch (error) {
      setState((current) => ({ ...current, error: error instanceof Error ? error.message : '분석을 완료하지 못했습니다.' }));
    } finally {
      setState((current) => ({ ...current, readingRequest: null }));
    }
  }

  async function sendReadingQuestion(session: ApiReadingSession, message: string) {
    if (!session.id) {
      return;
    }
    setState((current) => ({
      ...current,
      error: '',
      readingRequest: { sessionId: session.id, type: 'chat' },
    }));
    try {
      const payload = await sendReadingChatMessage(session.id, message);
      syncReadingSession(payload.session);
    } catch (error) {
      setState((current) => ({ ...current, error: error instanceof Error ? error.message : '질문을 보내지 못했습니다.' }));
    } finally {
      setState((current) => ({ ...current, readingRequest: null }));
    }
  }

  async function createReaderNote(session: ApiReadingSession) {
    if (!session.id) {
      return;
    }
    setState((current) => ({
      ...current,
      error: '',
      readingRequest: { sessionId: session.id, type: 'note' },
    }));
    try {
      const payload = await createReadingNote(session.id, {
        body: '',
        kind: 'note',
        origin: 'user',
      });
      syncReadingSession(payload.session);
    } catch (error) {
      setState((current) => ({ ...current, error: error instanceof Error ? error.message : '노트를 만들지 못했습니다.' }));
    } finally {
      setState((current) => ({ ...current, readingRequest: null }));
    }
  }

  async function saveReaderNote(session: ApiReadingSession, noteId: string, body: string) {
    if (!session.id || !noteId) {
      return;
    }
    setState((current) => ({
      ...current,
      error: '',
      readingRequest: { noteId, sessionId: session.id, type: 'note' },
    }));
    try {
      const payload = await updateReadingNote(session.id, noteId, { body });
      syncReadingSession(payload.session);
    } catch (error) {
      setState((current) => ({ ...current, error: error instanceof Error ? error.message : '노트를 저장하지 못했습니다.' }));
    } finally {
      setState((current) => ({ ...current, readingRequest: null }));
    }
  }

  async function deleteReaderNote(session: ApiReadingSession, noteId: string) {
    if (!session.id || !noteId) {
      return;
    }
    setState((current) => ({
      ...current,
      error: '',
      readingRequest: { noteId, sessionId: session.id, type: 'note' },
    }));
    try {
      const payload = await deleteReadingNote(session.id, noteId);
      syncReadingSession(payload.session);
    } catch (error) {
      setState((current) => ({ ...current, error: error instanceof Error ? error.message : '노트를 삭제하지 못했습니다.' }));
    } finally {
      setState((current) => ({ ...current, readingRequest: null }));
    }
  }

  async function createManualExperimentRun() {
    if (!activeProject?.id) {
      return;
    }
    const plan = projectGraph?.reproductionPlans?.[0] || null;
    if (!plan?.id) {
      setState((current) => ({ ...current, error: 'Create a reproduction plan from Reader first.' }));
      return;
    }
    setState((current) => ({ ...current, error: '', labSavingRunId: 'manual' }));
    try {
      const runPayload = await upsertProjectAsset<Record<string, unknown>>(activeProject.id, 'experiment-runs', {
        config: { source: 'manual' },
        kind: 'manual',
        metrics: { primary: 'pending' },
        notes: 'Manual result entry initialized from Lab.',
        reproductionPlanId: text(plan.id),
        status: 'queue',
      });
      await upsertProjectAsset(activeProject.id, 'result-dossiers', {
        comparisons: [
          normaliseLabMetricComparison({
            metricName: 'primary',
            metricUnit: '',
            paperMetricValue: 'linked evidence',
            reproducedValue: 'pending',
            summary: 'Manual run created; attach observed metrics after execution.',
          }),
        ],
        evidenceLinkIds: stringArray(plan.evidenceLinkIds),
        experimentRunIds: [text(runPayload.asset.id)].filter(Boolean),
        paperId: text(readingSessions[0]?.paperId),
        questionId: text(plan.questionId, activeResearchQuestionId(projectGraph)),
        status: 'draft',
      });
      await reloadProjectCollections(activeProject.id);
    } catch (error) {
      setState((current) => ({ ...current, error: error instanceof Error ? error.message : '실험 run을 만들지 못했습니다.' }));
    } finally {
      setState((current) => ({ ...current, labSavingRunId: '' }));
    }
  }

  async function createInsightCardFromEvidence() {
    if (!activeProject?.id) {
      return;
    }
    const evidence = graphEvidenceItems(projectGraph)[0] || null;
    if (!evidence?.text || !evidence.evidenceLinkIds.length) {
      setState((current) => ({ ...current, error: 'Link evidence before creating an insight card.' }));
      return;
    }
    setState((current) => ({ ...current, error: '', insightSavingCardId: 'new' }));
    try {
      const payload = await upsertProjectAsset<Record<string, unknown>>(activeProject.id, 'insight-cards', {
        claim: evidence.text.replace(/\s+/g, ' ').slice(0, 180),
        confidence: 'unrated',
        evidenceLinkIds: evidence.evidenceLinkIds,
        nextAction: 'Send to Writing or Lab',
        questionId: activeResearchQuestionId(projectGraph),
        type: 'claim',
      });
      setState((current) => ({ ...current, activeInsightCardId: text(payload.asset.id, current.activeInsightCardId) }));
      await reloadProjectCollections(activeProject.id);
    } catch (error) {
      setState((current) => ({ ...current, error: error instanceof Error ? error.message : '인사이트 카드를 만들지 못했습니다.' }));
    } finally {
      setState((current) => ({ ...current, insightSavingCardId: '' }));
    }
  }

  async function createFollowUpExperimentFromInsight() {
    if (!activeProject?.id) {
      return;
    }
    const insightCards = projectGraph?.insightCards || [];
    const insightCard =
      insightCards.find((entry) => text(entry.id) === state.activeInsightCardId) ||
      insightCards[0] ||
      null;
    if (!insightCard?.id) {
      setState((current) => ({ ...current, error: 'Select an insight card before creating a follow-up experiment.' }));
      return;
    }
    const plans = projectGraph?.reproductionPlans || [];
    const experimentRuns = projectGraph?.experimentRuns || [];
    const linkedRun = experimentRuns.find((run) => stringArray(insightCard.experimentRunIds).includes(text(run.id)));
    const plan =
      plans.find((entry) => text(entry.id) === text(linkedRun?.reproductionPlanId)) ||
      plans.find((entry) => text(entry.questionId) && text(entry.questionId) === text(insightCard.questionId)) ||
      plans[0] ||
      null;
    if (!plan?.id) {
      setState((current) => ({ ...current, error: 'Create a reproduction plan before follow-up experiments.' }));
      return;
    }
    const followUpNote =
      text(insightCard.followUpExperiment, text(insightCard.nextAction)).replace(/\s+/g, ' ').trim() ||
      `Follow up on insight: ${text(insightCard.claim, 'Untitled insight').replace(/\s+/g, ' ').slice(0, 160)}`;
    setState((current) => ({ ...current, error: '', insightSavingCardId: text(insightCard.id) }));
    try {
      const runPayload = await upsertProjectAsset<Record<string, unknown>>(activeProject.id, 'experiment-runs', {
        config: {
          insightCardId: text(insightCard.id),
          nextAction: followUpNote,
          source: 'insight-follow-up',
          sourceExperimentRunIds: stringArray(insightCard.experimentRunIds),
          sourceResultDossierIds: stringArray(insightCard.resultDossierIds),
        },
        kind: 'follow-up',
        metrics: { primary: 'pending' },
        notes: followUpNote,
        reproductionPlanId: text(plan.id),
        status: 'queue',
      });
      const runId = text(runPayload.asset.id);
      if (runId) {
        await upsertProjectAsset(activeProject.id, 'insight-cards', {
          ...insightCard,
          experimentRunIds: Array.from(new Set([...stringArray(insightCard.experimentRunIds), runId])),
          qualityCriteria: {
            ...(Boolean(insightCard.qualityCriteria) && typeof insightCard.qualityCriteria === 'object' ? insightCard.qualityCriteria : {}),
            followUpExperimentId: runId,
          },
        });
      }
      setState((current) => ({ ...current, activeInsightCardId: text(insightCard.id), activeStage: 'research' }));
      await reloadProjectCollections(activeProject.id);
      globalThis.history?.replaceState(null, '', routeHashForStage(activeProject.id, 'research'));
    } catch (error) {
      setState((current) => ({ ...current, error: error instanceof Error ? error.message : '후속 실험을 만들지 못했습니다.' }));
    } finally {
      setState((current) => ({ ...current, insightSavingCardId: '' }));
    }
  }

  async function createDraftSectionFromInsight() {
    if (!activeProject?.id) {
      return;
    }
    const acceptedInsightCards = (projectGraph?.insightCards || []).filter((card) => text(card.status) === 'accepted');
    const insightCard =
      acceptedInsightCards.find((card) => text(card.id) === state.activeInsightCardId) ||
      acceptedInsightCards[0] ||
      null;
    if (!insightCard?.id) {
      setState((current) => ({ ...current, error: 'Accept an insight card before drafting.' }));
      return;
    }
    const draft = projectGraph?.drafts?.[0] || null;
    if (!draft?.id) {
      setState((current) => ({ ...current, error: 'Create a draft first.' }));
      return;
    }
    setState((current) => ({ ...current, draftSavingSectionId: 'new', error: '' }));
    try {
      const payload = await upsertProjectAsset<Record<string, unknown>>(activeProject.id, 'draft-sections', {
        body: text(insightCard.claim),
        draftId: text(draft.id),
        evidenceLinkIds: stringArray(insightCard.evidenceLinkIds),
        insightCardIds: [text(insightCard.id)].filter(Boolean),
        sectionType: 'method',
        title: 'Method',
      });
      setState((current) => ({ ...current, activeDraftSectionId: text(payload.asset.id, current.activeDraftSectionId) }));
      await reloadProjectCollections(activeProject.id);
    } catch (error) {
      setState((current) => ({ ...current, error: error instanceof Error ? error.message : '초안 섹션을 만들지 못했습니다.' }));
    } finally {
      setState((current) => ({ ...current, draftSavingSectionId: '' }));
    }
  }

  async function exportWritingDraft() {
    const sections = projectGraph?.draftSections || [];
    if (!sections.length) {
      setState((current) => ({ ...current, error: 'Create a draft section before export.' }));
      return;
    }
    const markdown = buildDraftExportBundle({
      evidenceLinks: projectGraph?.evidenceLinks || [],
      sections,
    }).markdown;
    try {
      await globalThis.navigator?.clipboard?.writeText(markdown);
      setState((current) => ({ ...current, error: '' }));
    } catch (error) {
      setState((current) => ({ ...current, error: error instanceof Error ? error.message : '초안을 클립보드에 복사하지 못했습니다.' }));
    }
  }

  function renderStage() {
    if (state.activeStage === 'search') {
      return (
        <SearchStage
          availableVenues={availableVenues}
          error={state.error}
          filters={state.filters}
          hasSearched={state.hasSearched}
          loading={state.loading}
          onPaperRead={startReading}
          onPaperSaveToggle={togglePaperSaved}
          onQueryChange={(searchInput) => setState((current) => ({ ...current, searchInput }))}
          onSearchModeChange={(searchMode) => setState((current) => ({ ...current, searchMode }))}
          onSelectPaper={(selectedPaperId) => setState((current) => ({ ...current, selectedPaperId }))}
          onSubmitSearch={submitSearch}
          previewPanelOpen={state.previewPanelOpen}
          project={activeProject}
          query={state.searchInput}
          results={searchResults}
          savingPaperId={state.savingPaperId}
          searchLayout={state.searchLayout}
          searchMeta={state.searchMeta}
          searchMode={state.searchMode}
          selectedPaperId={state.selectedPaperId}
        />
      );
    }

    if (state.activeStage === 'reading') {
      if (state.readingView === 'detail') {
        return (
          <ReadingDetailStage
            analyzing={Boolean(state.readingRequest)}
            documentTab={state.readingDocumentTab}
            onAnalyze={analyzeReadingSession}
            onBackToLibrary={() => {
              setState((current) => ({ ...current, readingView: 'home' }));
              updateStage('reading');
            }}
            onDocumentTabChange={(readingDocumentTab) => {
              setState((current) => ({ ...current, readingDocumentTab }));
              const sessionId = state.activeReadingSessionId || readingSessions[0]?.id || '';
              const projectId = activeProject?.id || state.activeProjectId || 'rag-reranker';
              if (sessionId) {
                globalThis.history?.replaceState(
                  null,
                  '',
                  `#/projects/${encodeURIComponent(projectId)}/reading/sessions/${encodeURIComponent(sessionId)}/${readingDocumentTab}`,
                );
              }
            }}
            onCreateNote={createReaderNote}
            onDeleteNote={deleteReaderNote}
            onSaveNote={saveReaderNote}
            onSendQuestion={sendReadingQuestion}
            onWorkbenchTabChange={(readingWorkbenchTab) => setState((current) => ({ ...current, readingWorkbenchTab }))}
            project={activeProject}
            readingSessions={readingSessions}
            selectedSessionId={state.activeReadingSessionId}
            workbenchBusy={Boolean(state.readingRequest)}
            workbenchTab={state.readingWorkbenchTab}
          />
        );
      }
      return (
        <ReadingHomeStage
          layout={state.readingHomeLayout}
          library={projectLibrary}
          loading={state.readingLoading}
          onBackToDiscover={() => updateStage('search')}
          onOpenPaper={openReadingDetail}
          onSelectPaper={(readingHomeSelectedPaperId) => setState((current) => ({ ...current, readingHomeSelectedPaperId }))}
          onStartReading={(paper) => startReading(paper, 'detail')}
          project={activeProject}
          readingSessions={readingSessions}
          selectedPaperId={state.readingHomeSelectedPaperId}
        />
      );
    }

    if (state.activeStage === 'research' || state.activeStage === 'result') {
      return (
        <LabStage
          compareActive={state.activeStage === 'result'}
          graph={projectGraph}
          library={projectLibrary}
          onCreateManualRun={createManualExperimentRun}
          onOpenCompare={() => updateStage('result')}
          project={activeProject}
          readingSessions={readingSessions}
          savingRun={Boolean(state.labSavingRunId)}
        />
      );
    }

    if (state.activeStage === 'insight') {
      return (
        <InsightStage
          graph={projectGraph}
          onCreateFollowUpExperiment={createFollowUpExperimentFromInsight}
          onCreateInsightCard={createInsightCardFromEvidence}
          onStageChange={updateStage}
          project={activeProject}
          saving={Boolean(state.insightSavingCardId)}
        />
      );
    }

    if (state.activeStage === 'writing') {
      return (
        <WritingStage
          graph={projectGraph}
          library={projectLibrary}
          onCreateDraftSection={createDraftSectionFromInsight}
          onExportDraft={exportWritingDraft}
          project={activeProject}
          readingSessions={readingSessions}
          saving={Boolean(state.draftSavingSectionId)}
        />
      );
    }

    return <StagePlaceholder state={state} />;
  }

  return (
    <AppChrome
      activeProject={activeProject}
      onProjectChange={updateProject}
      onStageChange={updateStage}
      onTabChange={updateTab}
      onThemeModeChange={updateThemeMode}
      projects={projects}
      state={state}
    >
      {renderStage()}
    </AppChrome>
  );
}
