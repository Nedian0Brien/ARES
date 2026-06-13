import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { createLabRunnerAdapter } from '../lib/lab-runner.mjs';

function createSpawn({ code = 0, stderr = '', stdout = '' } = {}) {
  const calls = [];

  function spawnImpl(command, args, options) {
    calls.push({ args, command, options });
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {};

    process.nextTick(() => {
      child.stdout.write(stdout);
      child.stderr.write(stderr);
      child.stdout.end();
      child.stderr.end();
      child.emit('close', code, null);
    });

    return child;
  }

  return { calls, spawnImpl };
}

test('lab runner executes a low-risk fixture command inside the workspace boundary', async () => {
  const { calls, spawnImpl } = createSpawn({ stdout: 'accuracy: 0.91\n' });
  const runner = createLabRunnerAdapter({ rootDir: '/workspace', spawnImpl });

  const result = await runner.run({
    args: ['scripts/eval.py'],
    command: 'python',
    cwd: 'fixtures/repro',
    env: {
      PYTHONHASHSEED: '0',
    },
    expectedMetrics: ['accuracy'],
    timeoutMs: 1000,
  });

  assert.equal(result.status, 'done');
  assert.equal(result.exitCode, 0);
  assert.equal(result.metrics.accuracy, '0.91');
  assert.deepEqual(calls[0], {
    args: ['scripts/eval.py'],
    command: 'python',
    options: {
      cwd: '/workspace/fixtures/repro',
      env: {
        PYTHONHASHSEED: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  });
});

test('lab runner returns a typed failure result when the command exits non-zero', async () => {
  const { spawnImpl } = createSpawn({ code: 2, stderr: 'missing dataset\n' });
  const runner = createLabRunnerAdapter({ rootDir: '/workspace', spawnImpl });

  const result = await runner.run({
    args: ['scripts/eval.py'],
    command: 'python',
    cwd: 'fixtures/repro',
  });

  assert.equal(result.status, 'error');
  assert.equal(result.failure.type, 'exit_code');
  assert.match(result.failure.message, /missing dataset/);
});

test('lab runner blocks unsafe commands before spawning a process', async () => {
  const { calls, spawnImpl } = createSpawn();
  const runner = createLabRunnerAdapter({ rootDir: '/workspace', spawnImpl });

  const result = await runner.run({
    args: ['-rf', '../data'],
    command: 'rm',
    cwd: '../outside',
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.failure.type, 'policy');
  assert.equal(calls.length, 0);
});
