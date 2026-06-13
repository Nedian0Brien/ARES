import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildValidationReport,
  parseValidationArgs,
  parseValidationSampleSet,
  summariseReadingValidation,
  validateValidationSampleCorpus,
  validateReadingSummary,
} from '../../../scripts/validate-reading-sample.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..');

test('reading sample validator defaults to the MixRAG arXiv sample', () => {
  const options = parseValidationArgs([]);

  assert.equal(options.paper.paperId, 'arxiv-2504.09554');
  assert.equal(options.paper.pdfUrl, 'https://arxiv.org/pdf/2504.09554');
  assert.equal(options.minTables, 1);
});

test('reading sample validator summarizes asset kind counts and source bounds', () => {
  const summary = summariseReadingValidation({
    assets: [
      {
        id: 'table-1',
        kind: 'table',
        quality: { score: 0.86, status: 'source-backed' },
        rows: [['a', 'b']],
        sourceBounds: { unit: 'page-ratio' },
        sourceText: 'Table 1',
      },
      {
        id: 'figure-1',
        kind: 'figure',
        quality: { score: 0.74, status: 'source-backed' },
        sourceBounds: { unit: 'page-ratio' },
        thumbPath: 'figure-1.png',
      },
    ],
    pageCount: 12,
    parseStatus: 'done',
    sections: [{ id: 'intro' }, { id: 'method' }],
  });

  assert.equal(summary.tableCount, 1);
  assert.equal(summary.figureCount, 1);
  assert.equal(summary.sourceBoundedAssetCount, 2);
  assert.equal(summary.sourceBackedAssetCount, 2);
  assert.equal(summary.averageAssetQuality, 0.8);
  assert.equal(summary.assets[0].rows, 1);
  assert.equal(summary.assets[0].qualityStatus, 'source-backed');
});

test('reading sample validator reports threshold failures', () => {
  const failures = validateReadingSummary(
    {
      assetCount: 1,
      parseStatus: 'done',
      sourceBoundedAssetCount: 0,
      tableCount: 0,
    },
    {
      minAssets: 2,
      minSourceBackedAssets: 1,
      minSourceBoundedAssets: 1,
      minTables: 1,
    },
  );

  assert.deepEqual(failures, [
    'Expected at least 2 assets, received 1.',
    'Expected at least 1 table assets, received 0.',
    'Expected at least 1 source-bounded assets, received 0.',
    'Expected at least 1 source-backed assets, received 0.',
  ]);
});

test('reading sample validator parses a sample set with per-sample thresholds', () => {
  const sampleSet = parseValidationSampleSet({
    thresholds: {
      minAssets: 3,
      minSourceBackedAssets: 2,
      minSourceBoundedAssets: 2,
      minTables: 1,
    },
    samples: [
      {
        categories: ['table', 'multi-page-table'],
        expectedFeatures: ['dense tables'],
        id: 'dense-table',
        knownLimitations: ['requires table boundary review'],
        title: 'Dense Table Paper',
        pdfUrl: 'https://arxiv.org/pdf/2504.09554',
        thresholds: {
          minTables: 7,
        },
      },
    ],
  });

  assert.equal(sampleSet.thresholds.minAssets, 3);
  assert.equal(sampleSet.samples[0].paper.paperId, 'dense-table');
  assert.equal(sampleSet.samples[0].thresholds.minAssets, 3);
  assert.equal(sampleSet.samples[0].thresholds.minSourceBackedAssets, 2);
  assert.equal(sampleSet.samples[0].thresholds.minTables, 7);
  assert.deepEqual(sampleSet.samples[0].categories, ['table', 'multi-page-table']);
  assert.deepEqual(sampleSet.samples[0].expectedFeatures, ['dense tables']);
  assert.deepEqual(sampleSet.samples[0].knownLimitations, ['requires table boundary review']);
});

test('reading validation corpus covers at least 20 PDFs and required categories', async () => {
  const raw = await readFile(path.join(rootDir, 'scripts', 'reading-validation-samples.json'), 'utf8');
  const corpus = parseValidationSampleSet(JSON.parse(raw));
  const coverage = validateValidationSampleCorpus(corpus);

  assert.equal(coverage.status, 'passed');
  assert.equal(coverage.sampleCount >= 20, true);
  assert.deepEqual(coverage.failures, []);
  assert.equal(coverage.categories.includes('ocr'), true);
  assert.equal(coverage.categories.includes('multi-page-table'), true);
});

test('reading sample validator builds an aggregate report across samples', () => {
  const report = buildValidationReport([
    {
      sample: { id: 'passing', title: 'Passing PDF' },
      failures: [],
      summary: {
        assetCount: 4,
        figureCount: 1,
        sourceBoundedAssetCount: 3,
        sourceBackedAssetCount: 3,
        tableCount: 2,
      },
    },
    {
      sample: { id: 'failing', title: 'Failing PDF' },
      failures: ['Expected at least 2 table assets, received 0.'],
      summary: {
        assetCount: 1,
        figureCount: 0,
        sourceBoundedAssetCount: 0,
        sourceBackedAssetCount: 0,
        tableCount: 0,
      },
    },
  ]);

  assert.equal(report.status, 'failed');
  assert.equal(report.sampleCount, 2);
  assert.equal(report.passedCount, 1);
  assert.equal(report.failedCount, 1);
  assert.equal(report.totals.tableCount, 2);
  assert.equal(report.totals.sourceBackedAssetCount, 3);
  assert.equal(report.samples[1].status, 'failed');
});
