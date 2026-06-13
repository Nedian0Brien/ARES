const SECTION_ORDER = [
  ['abstract', 'Abstract'],
  ['introduction', 'Introduction'],
  ['method', 'Method'],
  ['experiments', 'Experiments'],
  ['analysis', 'Analysis'],
  ['conclusion', 'Conclusion'],
];

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values) {
  return Array.from(
    new Set(
      ensureArray(values)
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  );
}

function truncate(value, limit = 200) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }

  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

function firstSentence(text, fallback = '') {
  const match = String(text || '')
    .trim()
    .match(/(.+?[.!?])(?:\s|$)/);
  return truncate(match?.[1] || text || fallback, 180);
}

function assetRef(type, id, extras = {}) {
  return {
    id: String(id),
    type: String(type),
    ...extras,
  };
}

function uniqueSourceRefs(refs) {
  const seen = new Set();
  const next = [];

  for (const ref of refs.filter(Boolean)) {
    const key = `${ref.type}:${ref.id}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    next.push(ref);
  }

  return next;
}

function searchContextSummary(context) {
  const query = String(context.searchQuery || '').trim() || context.project?.defaultQuery || 'untitled search';
  const scopes = ensureArray(context.searchScopes)
    .map((scope) => scope.label || scope.id)
    .filter(Boolean);

  return {
    query,
    scopeLabel: scopes.length ? scopes.join(', ') : 'project default scope',
  };
}

function sectionSummaryFromPaper(sectionId, project, paper) {
  const abstract = String(paper.abstract || paper.summary || '').trim();
  const keyPoints = uniqueStrings(paper.keyPoints || []);
  const keywords = uniqueStrings([...(paper.keywords || []), ...(paper.matchedKeywords || [])]);

  if (sectionId === 'abstract') {
    return firstSentence(paper.summary || abstract || `${paper.title} is relevant to ${project.name}.`);
  }

  if (sectionId === 'introduction') {
    return firstSentence(
      `${paper.title} aligns with the project focus on ${project.focus || project.name}.`,
      `${paper.title} introduces a direction relevant to ${project.name}.`,
    );
  }

  if (sectionId === 'method') {
    return firstSentence(
      keyPoints[0] || `${paper.title} appears to center on ${keywords.slice(0, 3).join(', ') || 'its core method'}.`,
      'Method details require a deeper read.',
    );
  }

  if (sectionId === 'experiments') {
    return firstSentence(
      keyPoints[1] || `${paper.title} reports evaluation outcomes around ${keywords.slice(0, 2).join(', ') || 'the target benchmarks'}.`,
      'Experiment details should be validated in the full paper.',
    );
  }

  if (sectionId === 'analysis') {
    return firstSentence(
      keyPoints[2] || `${paper.title} still leaves open questions around robustness, efficiency, or reproducibility.`,
      'Analysis notes can be expanded after a closer pass.',
    );
  }

  return firstSentence(
    `${paper.title} looks worth carrying into reproduction if the project prioritises ${keywords[0] || 'this topic'}.`,
    'Conclusion notes will be refined as the reading progresses.',
  );
}

function buildReadingSections(project, paper) {
  return SECTION_ORDER.map(([id, label], index) => ({
    id,
    label,
    status: index < 2 ? 'done' : index < 4 ? 'queue' : 'todo',
    summary: sectionSummaryFromPaper(id, project, paper),
  }));
}

function buildHighlights(paper) {
  const keyPoints = uniqueStrings(paper.keyPoints || []);
  const summary = String(paper.summary || paper.abstract || '').trim();
  const fallbackPoints = summary ? summary.split(/[.!?]\s+/).filter(Boolean).slice(0, 3) : [];
  const candidates = [...keyPoints, ...fallbackPoints].slice(0, 4);
  const types = ['claim', 'method', 'result', 'limit'];
  const sections = ['abstract', 'method', 'experiments', 'analysis'];

  return candidates.map((text, index) => ({
    id: `${paper.paperId}-highlight-${index + 1}`,
    section: sections[index] || 'analysis',
    text: truncate(text, 180),
    type: types[index] || 'claim',
  }));
}

function buildReproParams(project, paper) {
  const keywords = uniqueStrings([...(paper.keywords || []), ...(paper.matchedKeywords || [])]);
  return [
    {
      label: 'Primary topic',
      value: keywords.slice(0, 3).join(', ') || project.name,
    },
    {
      label: 'Venue / year',
      value: `${paper.venue || 'Unknown'}${paper.year ? ` · ${paper.year}` : ''}`.trim(),
    },
    {
      label: 'Access path',
      value: paper.pdfUrl || paper.paperUrl || 'Metadata only',
    },
    {
      label: 'Replication focus',
      value: keywords[0] || firstSentence(project.focus || paper.summary || paper.abstract || project.name),
    },
    {
      label: 'Compute note',
      value: paper.openAccess ? 'Likely reproducible with public resources' : 'Expect manual environment validation',
    },
  ];
}

export function buildReadingFallback({ context, error }) {
  const { paper, project } = context;
  const sections = buildReadingSections(project, paper);

  return {
    outputSummary: `Reading session prepared for ${paper.title}.`,
    readingSessions: [
      {
        abstract: paper.abstract || '',
        authors: ensureArray(paper.authors).slice(0, 8),
        citedByCount: Number(paper.citedByCount) || 0,
        highlights: buildHighlights(paper),
        keyPoints: ensureArray(paper.keyPoints).slice(0, 6),
        keywords: ensureArray(paper.keywords).slice(0, 8),
        matchedKeywords: ensureArray(paper.matchedKeywords).slice(0, 8),
        notes: [
          {
            id: `${paper.paperId}-reader-note`,
            label: 'Reader summary',
            value: firstSentence(paper.summary || paper.abstract || `${paper.title} is queued for deeper reading.`),
          },
        ],
        openAccess: Boolean(paper.openAccess),
        paperId: paper.paperId,
        paperUrl: paper.paperUrl || null,
        pdfUrl: paper.pdfUrl || null,
        relevance: Number(paper.relevance) || 0,
        reproParams: buildReproParams(project, paper),
        sections,
        sourceName: paper.sourceName || 'ARES',
        sourceProvider: paper.sourceProvider || 'reader-fallback',
        status: 'done',
        summary: firstSentence(paper.summary || paper.abstract || `${paper.title} is ready for structured reading.`),
        title: paper.title,
        venue: paper.venue || 'Unknown',
        warning: error ? `Reader fallback used: ${error.message}` : '',
        year: paper.year ?? null,
      },
    ],
  };
}

export function buildResearchFallback({ context, error }) {
  const paper = context.paper;
  const readingSession = context.readingSession;
  const sourceRefs = uniqueSourceRefs([
    assetRef('paper', paper.paperId, { label: paper.title }),
    readingSession ? assetRef('readingSession', readingSession.id, { label: readingSession.title }) : null,
  ]);
  const focus = firstSentence(
    readingSession?.summary || paper.summary || paper.abstract || `${paper.title} reproduction plan`,
    `${paper.title} reproduction plan`,
  );

  return {
    experimentRuns: [
      {
        title: `${paper.title} baseline reproduction`,
        kind: 'baseline',
        metricTarget: truncate(focus, 120),
        sourceRefs,
        status: 'queue',
        summary: 'Establish the original paper setting and verify that the reported setup can run locally.',
      },
      {
        title: `${paper.title} scoped ablation`,
        kind: 'ablation',
        metricTarget: 'Validate one controllable simplification before broader experimentation.',
        sourceRefs,
        status: 'todo',
        summary: 'After the baseline, isolate a single parameter or component change to measure sensitivity.',
      },
    ],
    outputSummary: `Research plan drafted for ${paper.title}.`,
    reproChecklistItems: [
      {
        category: 'repo',
        detail: 'Locate the reference implementation or closest public baseline.',
        sourceRefs,
        status: 'queue',
        title: 'Confirm code availability',
      },
      {
        category: 'env',
        detail: 'Capture package versions, runtime requirements, and any GPU assumptions.',
        sourceRefs,
        status: 'todo',
        title: 'Validate environment setup',
      },
      {
        category: 'data',
        detail: 'Confirm the datasets, splits, and preprocessing steps implied by the paper.',
        sourceRefs,
        status: 'todo',
        title: 'Reconstruct data recipe',
      },
      {
        category: 'eval',
        detail: 'List the primary metrics and expected variance before running experiments.',
        sourceRefs,
        status: 'todo',
        title: 'Lock evaluation protocol',
        warning: error ? `Runtime fallback used: ${error.message}` : '',
      },
    ],
  };
}

export function buildSearchFallback({ context, error }) {
  const { query, scopeLabel } = searchContextSummary(context);
  const suffix = error ? ` Runtime fallback used: ${error.message}` : '';

  return {
    outputSummary: `Agentic search prepared for "${truncate(query, 120)}" across ${scopeLabel}.${suffix}`,
  };
}

export function buildResultFallback({ context, error }) {
  const paper = context.paper;
  const experimentRuns = ensureArray(context.experimentRuns);
  const baseline = experimentRuns[0];
  const sourceRefs = uniqueSourceRefs([
    assetRef('paper', paper.paperId, { label: paper.title }),
    ...experimentRuns.map((run) => assetRef('experimentRun', run.id, { label: run.title })),
  ]);

  return {
    outputSummary: `Result comparison prepared for ${paper.title}.`,
    resultComparisons: [
      {
        metric: 'Primary outcome',
        paperValue: 'Reported in paper',
        reproducedValue: baseline?.observedValue || 'Pending run',
        delta: baseline?.observedValue ? 'Compare against paper claim' : 'Awaiting experiment output',
        sourceRefs,
        status: baseline?.observedValue ? 'done' : 'queue',
        summary: error
          ? `Fallback comparison created after runtime failure: ${error.message}`
          : 'Use this comparison record to log reproduction deltas once the first baseline completes.',
        title: `${paper.title} comparison`,
      },
    ],
  };
}

export function buildInsightFallback({ context, error }) {
  const paper = context.paper;
  const comparisons = ensureArray(context.resultComparisons);
  const firstComparison = comparisons[0];

  return {
    insightNotes: [
      {
        hypothesis: 'The strongest follow-up direction is likely to come from the first unstable assumption in the pipeline.',
        sourceRefs: uniqueSourceRefs([
          assetRef('paper', paper.paperId, { label: paper.title }),
          ...comparisons.map((comparison) => assetRef('resultComparison', comparison.id, { label: comparison.title })),
        ]),
        status: firstComparison?.status === 'done' ? 'done' : 'queue',
        summary: firstComparison?.summary || firstSentence(paper.summary || paper.abstract || `${paper.title} remains promising.`),
        title: `${paper.title} insight note`,
        validationState: firstComparison?.status === 'done' ? 'supported-by-results' : 'needs-results',
        warning: error ? `Runtime fallback used: ${error.message}` : '',
      },
    ],
    outputSummary: `Insight note drafted for ${paper.title}.`,
  };
}

export function buildWritingFallback({ context, error }) {
  const paper = context.paper;
  const insights = ensureArray(context.insightNotes);
  const comparisons = ensureArray(context.resultComparisons);
  const summary = firstSentence(paper.summary || paper.abstract || `${paper.title} draft`);
  const paragraphs = [
    `## Motivation\n${summary}`,
    `## Reading Notes\n${firstSentence(context.readingSession?.summary || summary)}`,
    `## Result Snapshot\n${firstSentence(comparisons[0]?.summary || 'Result comparison is still being filled in.')}`,
    `## Insight\n${firstSentence(insights[0]?.summary || 'The next step is to validate the first unstable assumption.')}`,
  ];

  return {
    outputSummary: `Writing draft created for ${paper.title}.`,
    writingDrafts: [
      {
        sections: [
          { id: 'motivation', label: 'Motivation', text: paragraphs[0] },
          { id: 'reading-notes', label: 'Reading Notes', text: paragraphs[1] },
          { id: 'result-snapshot', label: 'Result Snapshot', text: paragraphs[2] },
          { id: 'insight', label: 'Insight', text: paragraphs[3] },
        ],
        sourceRefs: uniqueSourceRefs([
          assetRef('paper', paper.paperId, { label: paper.title }),
          ...insights.map((note) => assetRef('insightNote', note.id, { label: note.title })),
          ...comparisons.map((comparison) => assetRef('resultComparison', comparison.id, { label: comparison.title })),
        ]),
        status: 'done',
        summary,
        title: `${paper.title} draft`,
        warning: error ? `Runtime fallback used: ${error.message}` : '',
      },
    ],
  };
}
