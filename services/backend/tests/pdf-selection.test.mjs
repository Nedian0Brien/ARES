import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isPdfTextRunArtifact,
  mapWordsToTextRuns,
  resolveSmartWordRange,
  segmentWords,
} from '../../../web/src/lib/pdfSelection.js';

test('segmentWords keeps English academic tokens as word-sized selections', () => {
  const words = segmentWords("Step-by-step diffusion improves OOD-score calibration.");

  assert.deepEqual(words.map((word) => word.text), [
    'Step-by-step',
    'diffusion',
    'improves',
    'OOD-score',
    'calibration',
  ]);
});

test('mapWordsToTextRuns rebuilds words split across PDF text spans', () => {
  const words = mapWordsToTextRuns([
    { rect: { bottom: 12, height: 12, left: 0, right: 5, top: 0, width: 5 }, text: 'p' },
    { rect: { bottom: 12, height: 12, left: 5, right: 10, top: 0, width: 5 }, text: 'r' },
    { rect: { bottom: 12, height: 12, left: 10, right: 15, top: 0, width: 5 }, text: 'e' },
    { rect: { bottom: 12, height: 12, left: 15, right: 20, top: 0, width: 5 }, text: 's' },
    { rect: { bottom: 12, height: 12, left: 20, right: 25, top: 0, width: 5 }, text: 'e' },
    { rect: { bottom: 12, height: 12, left: 25, right: 30, top: 0, width: 5 }, text: 'n' },
    { rect: { bottom: 12, height: 12, left: 30, right: 35, top: 0, width: 5 }, text: 't' },
    { rect: { bottom: 12, height: 12, left: 35, right: 38, top: 0, width: 3 }, text: ' ' },
    { rect: { bottom: 12, height: 12, left: 38, right: 92, top: 0, width: 54 }, text: 'diffusion' },
  ]);

  assert.deepEqual(words.map((word) => word.text), ['present', 'diffusion']);
  assert.deepEqual(words[0], {
    endOffset: 1,
    endRunIndex: 6,
    globalTextEnd: 7,
    globalTextStart: 0,
    startOffset: 0,
    startRunIndex: 0,
    text: 'present',
  });
});

test('mapWordsToTextRuns inserts separators for visual gaps and line breaks', () => {
  const words = mapWordsToTextRuns([
    { rect: { bottom: 12, height: 12, left: 0, right: 42, top: 0, width: 42 }, text: 'Tutorial' },
    { rect: { bottom: 29, height: 12, left: 0, right: 42, top: 17, width: 42 }, text: 'Preetum' },
    { rect: { bottom: 46, height: 12, left: 0, right: 24, top: 34, width: 24 }, text: 'flow' },
    { rect: { bottom: 63, height: 12, left: 0, right: 48, top: 51, width: 48 }, text: 'matching' },
  ]);

  assert.deepEqual(words.map((word) => word.text), ['Tutorial', 'Preetum', 'flow', 'matching']);
});

test('isPdfTextRunArtifact detects rotated arXiv margin labels', () => {
  assert.equal(isPdfTextRunArtifact({
    rect: { bottom: 836.1, height: 453.6, left: 425, right: 450.5, top: 382.4, width: 25.6 },
    text: 'arXiv:2605.18864v1 [cs.LG] 15 May 2026',
    transform: 'matrix(0, -1.03627, 1, 0, 0, 0)',
  }), true);

  assert.equal(isPdfTextRunArtifact({
    rect: { bottom: 367.7, height: 12.8, left: 501.4, right: 751.7, top: 354.9, width: 250.3 },
    text: 'Recent studies observe that reinforcement learn-',
    transform: 'matrix(0.921623, 0, 0, 1, 0, 0)',
  }), false);
});

test('resolveSmartWordRange clamps default drag to the starting paragraph', () => {
  const words = [
    { globalIndex: 0, paragraphIndex: 0, text: 'We' },
    { globalIndex: 1, paragraphIndex: 0, text: 'present' },
    { globalIndex: 2, paragraphIndex: 0, text: 'diffusion' },
    { globalIndex: 3, paragraphIndex: 1, text: 'Contents' },
    { globalIndex: 4, paragraphIndex: 1, text: 'begin' },
  ];

  const range = resolveSmartWordRange({ anchorIndex: 1, focusIndex: 4, words });

  assert.equal(range.startIndex, 1);
  assert.equal(range.endIndex, 2);
  assert.equal(range.clamped, true);
});

test('resolveSmartWordRange clamps default drag to the starting visual block', () => {
  const words = [
    { blockIndex: 0, columnIndex: 0, globalIndex: 0, paragraphIndex: 0, text: 'resolve' },
    { blockIndex: 0, columnIndex: 0, globalIndex: 1, paragraphIndex: 0, text: 'SAGE' },
    { blockIndex: 1, columnIndex: 1, globalIndex: 2, paragraphIndex: 1, text: 'alignment' },
    { blockIndex: 1, columnIndex: 1, globalIndex: 3, paragraphIndex: 1, text: 'Among' },
  ];

  const range = resolveSmartWordRange({ anchorIndex: 0, focusIndex: 3, words });

  assert.equal(range.startIndex, 0);
  assert.equal(range.endIndex, 1);
  assert.equal(range.clamped, true);
});

test('resolveSmartWordRange clamps default drag when cursor crosses columns', () => {
  const words = [
    { blockIndex: 0, columnIndex: 0, globalIndex: 0, paragraphIndex: 0, text: 'resolve' },
    { blockIndex: 0, columnIndex: 0, globalIndex: 1, paragraphIndex: 0, text: 'SAGE' },
    { blockIndex: 0, columnIndex: 1, globalIndex: 2, paragraphIndex: 0, text: 'alignment' },
    { blockIndex: 0, columnIndex: 1, globalIndex: 3, paragraphIndex: 0, text: 'Among' },
  ];

  const range = resolveSmartWordRange({ anchorIndex: 0, focusIndex: 3, words });

  assert.equal(range.startIndex, 0);
  assert.equal(range.endIndex, 1);
  assert.equal(range.clamped, true);
});

test('resolveSmartWordRange clamps visually separated lines even when PDF metadata matches', () => {
  const words = [
    {
      blockIndex: 0,
      columnIndex: 0,
      globalIndex: 0,
      lineLeft: 500,
      lineRight: 750,
      paragraphIndex: 0,
      rect: { height: 12, left: 710, right: 750 },
      text: 'resolve',
    },
    {
      blockIndex: 0,
      columnIndex: 0,
      globalIndex: 1,
      lineLeft: 500,
      lineRight: 750,
      paragraphIndex: 0,
      rect: { height: 12, left: 500, right: 740 },
      text: 'SAGE',
    },
    {
      blockIndex: 0,
      columnIndex: 0,
      globalIndex: 2,
      lineLeft: 798,
      lineRight: 1098,
      paragraphIndex: 0,
      rect: { height: 12, left: 798, right: 850 },
      text: 'alignment',
    },
  ];

  const range = resolveSmartWordRange({ anchorIndex: 0, focusIndex: 2, words });

  assert.equal(range.startIndex, 0);
  assert.equal(range.endIndex, 1);
  assert.equal(range.clamped, true);
});

test('resolveSmartWordRange lets raw selection cross paragraph boundaries', () => {
  const words = [
    { globalIndex: 0, paragraphIndex: 0, text: 'We' },
    { globalIndex: 1, paragraphIndex: 0, text: 'present' },
    { globalIndex: 2, paragraphIndex: 0, text: 'diffusion' },
    { globalIndex: 3, paragraphIndex: 1, text: 'Contents' },
    { globalIndex: 4, paragraphIndex: 1, text: 'begin' },
  ];

  const range = resolveSmartWordRange({ anchorIndex: 1, focusIndex: 4, raw: true, words });

  assert.equal(range.startIndex, 1);
  assert.equal(range.endIndex, 4);
  assert.equal(range.clamped, false);
});
