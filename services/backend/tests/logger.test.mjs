import test from 'node:test';
import assert from 'node:assert/strict';

import { createLogger } from '../lib/logger.mjs';

function createSink() {
  const lines = [];
  return {
    lines,
    error(line) {
      lines.push(line);
    },
    log(line) {
      lines.push(line);
    },
    warn(line) {
      lines.push(line);
    },
  };
}

test('logger writes structured JSON with inherited bindings', () => {
  const sink = createSink();
  const logger = createLogger({
    bindings: {
      requestId: 'req-12345678',
      service: 'ares-test',
    },
    sink,
  });

  const child = logger.child({ projectId: 'project-1' });
  const payload = child.info('Project loaded.', { statusCode: 200 });

  assert.equal(sink.lines.length, 1);
  assert.deepEqual(JSON.parse(sink.lines[0]), payload);
  assert.equal(payload.level, 'info');
  assert.equal(payload.message, 'Project loaded.');
  assert.equal(payload.projectId, 'project-1');
  assert.equal(payload.requestId, 'req-12345678');
  assert.equal(payload.service, 'ares-test');
  assert.equal(payload.statusCode, 200);
  assert.match(payload.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});
