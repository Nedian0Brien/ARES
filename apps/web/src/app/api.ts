export type ApiProject = {
  id: string;
  name: string;
  color?: string;
  defaultQuery?: string;
  focus?: string;
  keywords?: string[];
  libraryCount?: number;
  queueCount?: number;
  readingSessionCount?: number;
  activeRunCount?: number;
  recentLibrary?: ApiPaper[];
  recentReadingSessions?: ApiReadingSession[];
};

export type ProjectsResponse = {
  projects: ApiProject[];
};

export type ApiPaper = {
  paperId: string;
  title: string;
  authors?: string[];
  venue?: string;
  year?: number;
  abstract?: string;
  summary?: string;
  keyPoints?: string[];
  keywords?: string[];
  matchedKeywords?: string[];
  paperUrl?: string;
  pdfUrl?: string;
  sourceName?: string;
  sourceProvider?: string;
  citedByCount?: number;
  openAccess?: boolean;
  relevance?: number;
  saved?: boolean;
  queued?: boolean;
  savedAt?: string;
  updatedAt?: string;
};

export type ApiReadingSession = {
  id: string;
  projectId?: string;
  paperId?: string;
  title?: string;
  authors?: string[];
  venue?: string;
  year?: number;
  abstract?: string;
  summary?: string;
  pdfUrl?: string;
  pageCount?: number;
  parseStatus?: string;
  summaryStatus?: string;
  progress?: number;
  parsedArtifactPath?: string;
  parseError?: string;
  summaryError?: string;
  assets?: unknown[];
  sections?: unknown[];
  notes?: unknown[];
  chatMessages?: unknown[];
  updatedAt?: string;
  createdAt?: string;
};

export type LibraryResponse = {
  results: ApiPaper[];
};

export type ReadingSessionsResponse = {
  results: ApiReadingSession[];
};

export type SearchMode = 'keyword' | 'scout';

export type SearchResponse = {
  project: ApiProject;
  questionId?: string;
  query: string;
  provider?: string;
  live?: boolean;
  total?: number;
  warning?: string;
  searchMode?: SearchMode;
  agentRuntime?: string;
  results: ApiPaper[];
  availableVenues?: string[];
  totalSaved?: number;
  totalQueued?: number;
};

export type ApiProjectGraph = {
  activityEvents?: unknown[];
  commentThreads?: unknown[];
  drafts?: Array<Record<string, unknown>>;
  draftSections?: Array<Record<string, unknown>>;
  draftRevisions?: unknown[];
  evidenceLinks?: Array<Record<string, unknown>>;
  experimentRuns?: Array<Record<string, unknown>>;
  graphVersion?: number;
  insightCards?: Array<Record<string, unknown>>;
  notifications?: unknown[];
  papers?: ApiPaper[];
  project?: ApiProject;
  readingPackets?: Array<Record<string, unknown>>;
  reproductionPlans?: Array<Record<string, unknown>>;
  researchQuestions?: Array<Record<string, unknown>>;
  resultDossiers?: Array<Record<string, unknown>>;
};

export type ProjectAssetRoute =
  | 'draft-sections'
  | 'drafts'
  | 'evidence-links'
  | 'experiment-runs'
  | 'insight-cards'
  | 'reading-packets'
  | 'reproduction-plans'
  | 'research-questions'
  | 'result-dossiers';

export type ReadingAnalysisStep = 'analyze' | 'parse' | 'summarize' | 'extract-assets';

export const MAX_READING_PDF_UPLOAD_BYTES = 100 * 1024 * 1024;
export const MAX_READING_PDF_UPLOAD_LABEL = '100MB';

const LOCAL_GRAB_HOSTS = new Set(['127.0.0.1', 'localhost']);
const PROXY_DEV_PATH_PATTERN = /^\/proxy\/\d+(?:\/|$)/;

type LocationLike = {
  href: string;
  hostname: string;
  origin: string;
  pathname: string;
};

export function resolveAppBaseUrl(locationLike: LocationLike = globalThis.location): URL {
  const current = new URL(locationLike.href);
  const proxyPath = current.pathname.match(PROXY_DEV_PATH_PATTERN)?.[0];

  if (proxyPath) {
    const normalizedProxyPath = proxyPath.endsWith('/') ? proxyPath : `${proxyPath}/`;
    return new URL(normalizedProxyPath, current.origin);
  }

  if (current.pathname.endsWith('/index.html')) {
    const basePath = current.pathname.replace(/index\.html$/, '') || '/';
    return new URL(basePath, current.origin);
  }

  const hasFileExtension = /\.[a-z0-9]+$/i.test(current.pathname);
  if (LOCAL_GRAB_HOSTS.has(current.hostname) && current.pathname !== '/' && !current.pathname.endsWith('/') && !hasFileExtension) {
    return new URL(`${current.pathname}/`, current.origin);
  }

  return new URL('./', current);
}

export function appUrl(path: string, baseUrl = resolveAppBaseUrl()): URL {
  return new URL(String(path || '').replace(/^\/+/, ''), baseUrl);
}

export async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(appUrl(path), {
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (response.status === 413) {
      throw new Error(`Upload a PDF up to ${MAX_READING_PDF_UPLOAD_LABEL}.`);
    }
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export function listProjects(): Promise<ProjectsResponse> {
  return requestJson<ProjectsResponse>('api/projects');
}

export function listProjectLibrary(projectId: string): Promise<LibraryResponse> {
  return requestJson<LibraryResponse>(projectLibraryPath(projectId));
}

export function listReadingSessions(projectId: string): Promise<ReadingSessionsResponse> {
  return requestJson<ReadingSessionsResponse>(readingSessionsPath(projectId));
}

export function loadProjectGraph(projectId: string): Promise<ApiProjectGraph> {
  return requestJson<ApiProjectGraph>(projectGraphPath(projectId));
}

export function upsertProjectAsset<T extends Record<string, unknown>>(
  projectId: string,
  route: ProjectAssetRoute,
  payload: Record<string, unknown>,
): Promise<{ asset: T }> {
  return requestJson<{ asset: T }>(projectAssetPath(projectId, route), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function runReadingAnalysisStep(
  sessionId: string,
  step: ReadingAnalysisStep,
  payload: Record<string, unknown> = {},
): Promise<{ readingSession?: ApiReadingSession; session?: ApiReadingSession }> {
  return requestJson<{ readingSession?: ApiReadingSession; session?: ApiReadingSession }>(readingSessionPath(sessionId, step), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function sendReadingChatMessage(
  sessionId: string,
  message: string,
): Promise<{ messages?: Record<string, unknown>[]; session?: ApiReadingSession }> {
  return requestJson<{ messages?: Record<string, unknown>[]; session?: ApiReadingSession }>(readingSessionPath(sessionId, 'chat'), {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export function createReadingNote(
  sessionId: string,
  payload: Record<string, unknown> = {},
): Promise<{ note?: Record<string, unknown>; session?: ApiReadingSession }> {
  return requestJson<{ note?: Record<string, unknown>; session?: ApiReadingSession }>(readingSessionPath(sessionId, 'notes'), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateReadingNote(
  sessionId: string,
  noteId: string,
  payload: Record<string, unknown>,
): Promise<{ note?: Record<string, unknown>; session?: ApiReadingSession }> {
  return requestJson<{ note?: Record<string, unknown>; session?: ApiReadingSession }>(
    readingSessionPath(sessionId, `notes/${encodeURIComponent(noteId)}`),
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );
}

export function deleteReadingNote(sessionId: string, noteId: string): Promise<{ ok?: boolean; session?: ApiReadingSession }> {
  return requestJson<{ ok?: boolean; session?: ApiReadingSession }>(readingSessionPath(sessionId, `notes/${encodeURIComponent(noteId)}`), {
    method: 'DELETE',
  });
}

export function searchPapers({
  mode,
  projectId,
  query,
  scopes = [],
}: {
  mode: SearchMode;
  projectId: string;
  query: string;
  scopes?: unknown[];
}): Promise<SearchResponse> {
  return requestJson<SearchResponse>('api/search', {
    method: 'POST',
    body: JSON.stringify({
      mode,
      page: 1,
      projectId,
      q: query,
      scopes,
    }),
  });
}

export function savePaperToLibrary(projectId: string, paper: ApiPaper): Promise<{ project: ApiProject; paper: ApiPaper }> {
  return requestJson<{ project: ApiProject; paper: ApiPaper }>(projectLibraryPath(projectId), {
    method: 'POST',
    body: JSON.stringify({ paper }),
  });
}

export function removePaperFromLibrary(projectId: string, paperId: string): Promise<{ project: ApiProject }> {
  return requestJson<{ project: ApiProject }>(`${projectLibraryPath(projectId)}/${encodeURIComponent(paperId)}`, {
    method: 'DELETE',
  });
}

export function createReadingSession(
  projectId: string,
  paper: ApiPaper,
): Promise<{ project?: ApiProject; readingSession: ApiReadingSession }> {
  return requestJson<{ project?: ApiProject; readingSession: ApiReadingSession }>(readingSessionsPath(projectId), {
    method: 'POST',
    body: JSON.stringify({
      paper,
      paperId: paper.paperId,
    }),
  });
}

export function projectGraphPath(projectId: string): string {
  return `api/projects/${encodeURIComponent(projectId)}/graph`;
}

export function projectAssetPath(projectId: string, route: ProjectAssetRoute): string {
  return `api/projects/${encodeURIComponent(projectId)}/${route}`;
}

export function projectLibraryPath(projectId: string): string {
  return `api/projects/${encodeURIComponent(projectId)}/library`;
}

export function projectSearchPath(projectId: string): string {
  return `api/projects/${encodeURIComponent(projectId)}/search`;
}

export function readingSessionsPath(projectId: string): string {
  return `api/projects/${encodeURIComponent(projectId)}/reading-sessions`;
}

export function readingSessionPath(sessionId: string, suffix = ''): string {
  const tail = suffix ? `/${suffix.replace(/^\/+/, '')}` : '';
  return `api/reading-sessions/${encodeURIComponent(sessionId)}${tail}`;
}
