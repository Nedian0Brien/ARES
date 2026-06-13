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

test('lab runner requires human approval for medium-risk commands', async () => {
  const { calls, spawnImpl } = createSpawn();
  const runner = createLabRunnerAdapter({ rootDir: '/workspace', spawnImpl });

  const result = await runner.run({
    args: ['scripts/eval.py'],
    command: 'python',
    cwd: 'fixtures/repro',
    network: 'enabled',
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.failure.type, 'approval_required');
  assert.equal(result.approval.state, 'required');
  assert.equal(result.approval.riskScore, 50);
  assert.match(result.approval.commandPreview, /python scripts\/eval\.py/);
  assert.equal(calls.length, 0);
});

test('lab runner executes approved medium-risk commands while preserving the approval record', async () => {
  const { calls, spawnImpl } = createSpawn({ stdout: 'accuracy: 0.93\n' });
  const runner = createLabRunnerAdapter({ rootDir: '/workspace', spawnImpl });

  const result = await runner.run(
    {
      args: ['scripts/eval.py'],
      command: 'python',
      cwd: 'fixtures/repro',
      network: 'enabled',
    },
    {
      approval: {
        approvedAt: '2026-06-14T00:00:00.000Z',
        approvedBy: 'researcher@example.com',
        state: 'approved',
      },
    },
  );

  assert.equal(result.status, 'done');
  assert.equal(result.approval.state, 'approved');
  assert.equal(result.approval.approvedBy, 'researcher@example.com');
  assert.equal(result.metrics.accuracy, '0.93');
  assert.equal(calls.length, 1);
});
