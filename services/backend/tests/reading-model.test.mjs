import assert from 'node:assert/strict';
import test from 'node:test';

import { normaliseReadingSession } from '../lib/reading-model.mjs';

test('reading session highlights preserve page-ratio source bounds', () => {
  const session = normaliseReadingSession({
    highlights: [
      {
        id: 'h1',
        page: 2,
        quote: 'important evidence',
        sourceBounds: {
          height: 0.08,
          page: 2,
          rects: [
            { height: 0.03, width: 0.42, x: 0.18, y: 0.34 },
          ],
          unit: 'page-ratio',
          width: 0.42,
          x: 0.18,
          y: 0.34,
        },
        text: 'important evidence',
        type: 'result',
      },
    ],
    paperId: 'paper-1',
    projectId: 'demo',
    title: 'Demo paper',
  });

  assert.deepEqual(session.highlights[0].sourceBounds, {
    height: 0.08,
    page: 2,
    rects: [
      { height: 0.03, width: 0.42, x: 0.18, y: 0.34 },
    ],
    unit: 'page-ratio',
    width: 0.42,
    x: 0.18,
    y: 0.34,
  });
});
