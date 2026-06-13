import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { createReadingService } from '../services/backend/lib/reading-service.mjs';
import { createStore } from '../services/backend/lib/store.mjs';

const DEFAULT_SAMPLE = {
  abstract: 'Validation sample for heterogeneous text-table RAG.',
  authors: ['MixRAG authors'],
  paperId: 'arxiv-2504.09554',
  paperUrl: 'https://arxiv.org/abs/2504.09554',
  pdfUrl: 'https://arxiv.org/pdf/2504.09554',
  sourceName: 'arXiv',
  sourceProvider: 'arxiv',
  title: 'Mixture-of-RAG: Integrating Text and Tables with Large Language Models',
  year: 2025,
};

function readArg(args, name, fallback = '') {
  const index = args.indexOf(name);
  if (index < 0 || index + 1 >= args.length) {
    return fallback;
  }

  return args[index + 1];
}

function numberArg(args, name, fallback = 0) {
  const value = readArg(args, name, '');
  if (!value) {
    return fallback;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normaliseThresholds(input = {}, fallback = {}) {
  return {
    minAssets: Number.isFinite(Number(input.minAssets)) ? Number(input.minAssets) : fallback.minAssets || 1,
    minSourceBackedAssets: Number.isFinite(Number(input.minSourceBackedAssets))
      ? Number(input.minSourceBackedAssets)
      : fallback.minSourceBackedAssets || 1,
    minSourceBoundedAssets: Number.isFinite(Number(input.minSourceBoundedAssets))
      ? Number(input.minSourceBoundedAssets)
      : fallback.minSourceBoundedAssets || 1,
    minTables: Number.isFinite(Number(input.minTables)) ? Number(input.minTables) : fallback.minTables || 1,
  };
}

function normaliseValidationSample(input = {}, thresholds = {}) {
  const id = input.id || input.paperId || DEFAULT_SAMPLE.paperId;
  const paper = {
    ...DEFAULT_SAMPLE,
    abstract: input.abstract || DEFAULT_SAMPLE.abstract,
    authors: Array.isArray(input.authors) ? input.authors : DEFAULT_SAMPLE.authors,
    paperId: id,
    paperUrl: input.paperUrl || DEFAULT_SAMPLE.paperUrl,
    pdfUrl: input.pdfUrl || DEFAULT_SAMPLE.pdfUrl,
    sourceName: input.sourceName || DEFAULT_SAMPLE.sourceName,
    sourceProvider: input.sourceProvider || DEFAULT_SAMPLE.sourceProvider,
    title: input.title || DEFAULT_SAMPLE.title,
    year: Number.isFinite(Number(input.year)) ? Number(input.year) : DEFAULT_SAMPLE.year,
  };

  return {
    id,
    paper,
    thresholds: normaliseThresholds(input.thresholds || {}, thresholds),
  };
}

export function parseValidationArgs(args = []) {
  return {
    samplesFile: readArg(args, '--samples-file', ''),
    minAssets: numberArg(args, '--min-assets', 1),
    minSourceBackedAssets: numberArg(args, '--min-source-backed-assets', 1),
    minSourceBoundedAssets: numberArg(args, '--min-source-bounded-assets', 1),
    minTables: numberArg(args, '--min-tables', 1),
    paper: {
      ...DEFAULT_SAMPLE,
      paperId: readArg(args, '--paper-id', DEFAULT_SAMPLE.paperId),
      paperUrl: readArg(args, '--paper-url', DEFAULT_SAMPLE.paperUrl),
      pdfUrl: readArg(args, '--pdf-url', DEFAULT_SAMPLE.pdfUrl),
      title: readArg(args, '--title', DEFAULT_SAMPLE.title),
    },
  };
}

export function parseValidationSampleSet(input = {}) {
  const thresholds = normaliseThresholds(input.thresholds || {}, {
    minAssets: 1,
    minSourceBackedAssets: 1,
    minSourceBoundedAssets: 1,
    minTables: 1,
  });
  const samples = Array.isArray(input.samples) && input.samples.length ? input.samples : [DEFAULT_SAMPLE];

  return {
    thresholds,
    samples: samples.map((sample) => normaliseValidationSample(sample, thresholds)),
  };
}

export function summariseReadingValidation(session) {
  const assets = Array.isArray(session?.assets) ? session.assets : [];
  const tables = assets.filter((asset) => asset.kind === 'table');
  const figures = assets.filter((asset) => asset.kind === 'figure');
  const qualityScores = assets.map((asset) => Number(asset.quality?.score)).filter((score) => Number.isFinite(score));
  const averageAssetQuality = qualityScores.length
    ? Number((qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length).toFixed(2))
    : 0;
  return {
    averageAssetQuality,
    assetCount: assets.length,
    assets: assets.slice(0, 12).map((asset) => ({
      caption: asset.caption || '',
      dataPath: asset.dataPath || '',
      hasSourceBounds: Boolean(asset.sourceBounds),
      hasSourceText: Boolean(asset.sourceText),
      id: asset.id || '',
      kind: asset.kind || '',
      page: asset.page || null,
      qualityScore: Number(asset.quality?.score) || 0,
      qualityStatus: asset.quality?.status || '',
      rows: Array.isArray(asset.rows) ? asset.rows.length : 0,
      thumbPath: asset.thumbPath || '',
    })),
    figureCount: figures.length,
    pageCount: Number(session?.pageCount) || 0,
    parseStatus: session?.parseStatus || '',
    sectionCount: Array.isArray(session?.sections) ? session.sections.length : 0,
    sourceBackedAssetCount: assets.filter((asset) => asset.quality?.status === 'source-backed').length,
    sourceBoundedAssetCount: assets.filter((asset) => asset.sourceBounds?.unit === 'page-ratio').length,
    tableCount: tables.length,
  };
}

export function validateReadingSummary(
  summary,
  { minAssets = 1, minSourceBackedAssets = 1, minSourceBoundedAssets = 1, minTables = 1 } = {},
) {
  const failures = [];
  if (summary.parseStatus !== 'done') {
    failures.push(`Expected parseStatus=done, received ${summary.parseStatus || 'empty'}.`);
  }

  if (summary.assetCount < minAssets) {
    failures.push(`Expected at least ${minAssets} assets, received ${summary.assetCount}.`);
  }

  if (summary.tableCount < minTables) {
    failures.push(`Expected at least ${minTables} table assets, received ${summary.tableCount}.`);
  }

  if (summary.sourceBoundedAssetCount < minSourceBoundedAssets) {
    failures.push(`Expected at least ${minSourceBoundedAssets} source-bounded assets, received ${summary.sourceBoundedAssetCount}.`);
  }

  if ((Number(summary.sourceBackedAssetCount) || 0) < minSourceBackedAssets) {
    failures.push(`Expected at least ${minSourceBackedAssets} source-backed assets, received ${Number(summary.sourceBackedAssetCount) || 0}.`);
  }

  return failures;
}

export function buildValidationReport(results = []) {
  const samples = results.map((result) => {
    const failures = Array.isArray(result.failures) ? result.failures : [];
    return {
      ...result,
      status: failures.length ? 'failed' : 'passed',
    };
  });
  const totals = samples.reduce(
    (memo, result) => {
      const summary = result.summary || result;
      return {
        assetCount: memo.assetCount + (Number(summary.assetCount) || 0),
        figureCount: memo.figureCount + (Number(summary.figureCount) || 0),
        sourceBackedAssetCount: memo.sourceBackedAssetCount + (Number(summary.sourceBackedAssetCount) || 0),
        sourceBoundedAssetCount: memo.sourceBoundedAssetCount + (Number(summary.sourceBoundedAssetCount) || 0),
        tableCount: memo.tableCount + (Number(summary.tableCount) || 0),
      };
    },
    {
      assetCount: 0,
      figureCount: 0,
      sourceBackedAssetCount: 0,
      sourceBoundedAssetCount: 0,
      tableCount: 0,
    },
  );
  const failedCount = samples.filter((sample) => sample.status === 'failed').length;

  return {
    failedCount,
    passedCount: samples.length - failedCount,
    sampleCount: samples.length,
    samples,
    status: failedCount ? 'failed' : 'passed',
    totals,
  };
}

async function createValidationStore(tempDir) {
  const seedFile = path.join(tempDir, 'data', 'store.seed.json');
  const runtimeFile = path.join(tempDir, 'data', 'runtime', 'store.json');
  await fs.mkdir(path.dirname(seedFile), { recursive: true });
  await fs.writeFile(
    seedFile,
    JSON.stringify(
      {
        agentRuns: [],
        experimentRuns: [],
        insightNotes: [],
        library: { validation: [] },
        projects: [
          {
            color: '#5e6ad2',
            defaultQuery: 'heterogeneous table RAG',
            focus: 'Reader validation',
            id: 'validation',
            keywords: ['rag', 'tables'],
            name: 'Validation',
          },
        ],
        readingQueue: { validation: [] },
        readingSessions: [],
        reproChecklistItems: [],
        resultComparisons: [],
        writingDrafts: [],
      },
      null,
      2,
    ),
  );

  return createStore({ seedFile, runtimeFile });
}

async function readSampleSet(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return parseValidationSampleSet(JSON.parse(raw));
}

async function validateSample({ paper, thresholds }, tempRoot) {
  const tempDir = await fs.mkdtemp(path.join(tempRoot, 'sample-'));
  const store = await createValidationStore(tempDir);
  const service = createReadingService({
    agentRuntime: {
      async checkAvailability() {
        return false;
      },
      async runJsonTask() {
        throw new Error('runtime unavailable');
      },
      parseJsonFromMessages() {
        return {};
      },
    },
    rootDir: tempDir,
    store,
  });

  try {
    const session = await service.createSession({
      paper,
      projectId: 'validation',
    });
    await service.parseSession(session.id);
    const extracted = await service.extractAssets(session.id);
    const summary = summariseReadingValidation(extracted.session);
    const failures = validateReadingSummary(summary, thresholds);
    return {
      failures,
      sample: {
        id: paper.paperId,
        paperUrl: paper.paperUrl,
        pdfUrl: paper.pdfUrl,
        title: paper.title,
      },
      summary,
      tempDir,
      thresholds,
    };
  } finally {
    await store.close?.();
  }
}

async function runValidation() {
  const options = parseValidationArgs(process.argv.slice(2));
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ares-reading-validation-'));
  const sampleSet = options.samplesFile
    ? await readSampleSet(path.resolve(options.samplesFile))
    : {
        samples: [
          {
            paper: options.paper,
            thresholds: {
              minAssets: options.minAssets,
              minSourceBackedAssets: options.minSourceBackedAssets,
              minSourceBoundedAssets: options.minSourceBoundedAssets,
              minTables: options.minTables,
            },
          },
        ],
      };

  const results = [];
  for (const sample of sampleSet.samples) {
    results.push(await validateSample(sample, tempRoot));
  }

  const report = buildValidationReport(results);
  console.log(JSON.stringify({ ...report, tempRoot }, null, 2));
  if (report.failedCount) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runValidation();
}
