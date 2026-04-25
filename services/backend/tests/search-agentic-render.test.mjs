import test from 'node:test';
import assert from 'node:assert/strict';

import { createSearchFeature } from '../../../web/app/features/search.js';

const TOKENS = {
  b1: '#e8e8e6',
  read: '#5e6ad2',
  research: '#8957c9',
  result: '#c07b3a',
  search: '#5e9c6f',
  t3: '#8a8a92',
  t4: '#b0b0b8',
  tx: '#0a0a0b',
  writing: '#3aa3a3',
};

const SEARCH_MODES = {
  scout: {
    compactLabel: 'Agent',
    ctaLabel: 'Agent Search',
    icon: 'compass',
  },
  keyword: {
    compactLabel: 'Keyword',
    ctaLabel: 'Keyword Search',
    icon: 'keywordBook',
  },
};

const SEARCH_TARGET_TYPES = {
  conference: { color: TOKENS.read, icon: 'building', label: 'Conference' },
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function createFeature(stateOverrides = {}) {
  const state = {
    error: '',
    filterPanelOpen: true,
    filterSections: { rel: false, scope: true, venue: true, year: false },
    filters: {
      minRelevance: 60,
      openAccessOnly: false,
      savedOnly: false,
      venues: new Set(),
      years: new Set(['2025', '2024', '2023', 'earlier', 'unknown']),
    },
    hasSearched: false,
    loading: false,
    previewPanelOpen: true,
    results: [],
    scopePicker: null,
    scopePickerQuery: '',
    searchAgentRun: null,
    searchInput: 'Diffusion LoRA forgetting trade-offs',
    searchLayout: 'desktop',
    searchMeta: {
      agentRuntime: '',
      live: false,
      provider: '',
      query: '',
      searchMode: 'scout',
      total: 0,
      warning: '',
    },
    searchMode: 'scout',
    searchScopes: [{ id: 'iclr24', label: 'ICLR 2024', type: 'conference' }],
    selectedPaperId: '',
    ...stateOverrides,
  };

  return createSearchFeature({
    SEARCH_MODES,
    SEARCH_TARGET_CATALOG: { conference: { popular: [], recent: [] } },
    SEARCH_TARGET_TYPES,
    TOKENS,
    actualReadingSessions: () => [],
    dashboardAreaPath: () => '',
    dashboardCumulativeCounts: () => [],
    dashboardDailyCounts: () => [],
    dashboardLibraryItems: () => [],
    dashboardPaperTags: () => [],
    dashboardPercent: () => 0,
    dashboardQueuedPaperIds: () => new Set(),
    dashboardRecentCount: () => 0,
    dashboardRelativeAge: () => 'now',
    dashboardSeriesPath: () => '',
    dashboardVenueBreakdown: () => [],
    escapeHtml,
    formatAuthors: (authors = []) => authors.join(', ') || 'Unknown authors',
    icon: (name) => `<svg data-icon="${escapeHtml(name)}"></svg>`,
    isTabletSearchLayout: () => false,
    renderTag: (label) => `<span>${escapeHtml(label)}</span>`,
    selectedPaper: () => null,
    state,
    visibleResults: () => [],
    yearBucket: () => 'unknown',
    yearBucketLabel: (bucket) => bucket,
  });
}

test('search dashboard renders stacked agentic home and run stages', () => {
  const feature = createFeature({
    searchAgentRun: {
      id: 'run-test',
      startedAt: '2026-04-25T12:00:00.000Z',
      status: 'running',
    },
  });

  const html = feature.renderSearchStage({ id: 'demo', libraryCount: 0, queueCount: 0 });

  assert.match(html, /search-agentic-entry/);
  assert.match(html, /class="stage-home"/);
  assert.match(html, /class="stage-run"/);
  assert.match(html, /class="run-badge"/);
  assert.match(html, /class="q-block"/);
  assert.match(html, /tabindex="-1"/);
  assert.match(html, /Diffusion LoRA forgetting trade-offs/);
  assert.match(html, /SCOUT/);
  assert.match(html, /aria-live="polite"/);
});

test('search dashboard renders live Scout progress events before final results', () => {
  const feature = createFeature({
    searchAgentRun: {
      id: 'run-progress',
      input: {
        query: '"local inference" llm quantization serving',
      },
      progressEvents: [
        {
          detail: 'Fetching OpenAlex candidates for local inference serving.',
          label: 'OpenAlex tool call',
          status: 'running',
          type: 'tool',
        },
        {
          detail: 'Scout selected quantized serving papers from the candidates.',
          label: 'Agent response',
          status: 'done',
          type: 'agent_message',
        },
      ],
      startedAt: '2026-04-25T12:00:00.000Z',
      status: 'running',
    },
  });

  const html = feature.renderSearchStage({ id: 'demo', libraryCount: 0, queueCount: 0 });

  assert.match(html, /agent-trace/);
  assert.match(html, /OpenAlex tool call/);
  assert.match(html, /Fetching OpenAlex candidates/);
  assert.match(html, /Agent response/);
  assert.match(html, /Scout selected quantized serving papers/);
  assert.doesNotMatch(html, /Agentic search failed/);
});

test('search dashboard renders failed agentic run as an explicit error', () => {
  const feature = createFeature({
    searchAgentRun: {
      error: 'Scout agent failed: runtime timeout',
      id: 'run-failed',
      outputSummary: 'Agentic search failed: Scout agent failed: runtime timeout',
      status: 'error',
    },
  });

  const html = feature.renderSearchStage({ id: 'demo', libraryCount: 0, queueCount: 0 });

  assert.match(html, /Failed/);
  assert.match(html, /오류/);
  assert.match(html, /Scout agent failed: runtime timeout/);
  assert.doesNotMatch(html, /Reader phase complete/);
  assert.doesNotMatch(html, /Reading 큐에 자동 저장/);
});
