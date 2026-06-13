import test from 'node:test';
import assert from 'node:assert/strict';

import { parseLabImportPayload } from '../../../web/app/features/lab-import.js';

test('parseLabImportPayload extracts metrics, status, command, and artifacts from pasted run logs', () => {
  const parsed = parseLabImportPayload({
    artifactLabel: 'metrics.json',
    artifactUrl: 'file:///tmp/metrics.json',
    command: 'python eval.py --dataset demo',
    log: [
      'accuracy: 0.842',
      'f1 = 0.791',
      'completed successfully',
    ].join('\n'),
  });

  assert.equal(parsed.status, 'done');
  assert.equal(parsed.metricName, 'accuracy');
  assert.equal(parsed.observedMetric, '0.842');
  assert.deepEqual(parsed.metrics, { accuracy: '0.842', f1: '0.791', primary: '0.842' });
  assert.deepEqual(parsed.artifacts, [{ label: 'metrics.json', type: 'external', url: 'file:///tmp/metrics.json' }]);
  assert.equal(parsed.config.command, 'python eval.py --dataset demo');
  assert.equal(parsed.config.importSource, 'external-paste');
  assert.match(parsed.config.rawLog, /accuracy: 0\.842/);
});

test('parseLabImportPayload marks failing logs as error and still preserves first metric', () => {
  const parsed = parseLabImportPayload({
    command: 'python eval.py',
    log: 'loss: 1.8\nRuntimeError: CUDA out of memory',
  });

  assert.equal(parsed.status, 'error');
  assert.equal(parsed.metricName, 'loss');
  assert.equal(parsed.observedMetric, '1.8');
  assert.deepEqual(parsed.metrics, { loss: '1.8', primary: '1.8' });
  assert.deepEqual(parsed.artifacts, []);
});
