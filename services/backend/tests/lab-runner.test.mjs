import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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

function createErrorSpawn(error) {
  return function spawnImpl() {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {};

    process.nextTick(() => {
      child.emit('error', error);
    });

    return child;
  };
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

test('lab runner captures declared artifact files from the fixture workspace', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'ares-lab-runner-'));
  await mkdir(path.join(rootDir, 'fixtures', 'repro'), { recursive: true });

  const spawnImpl = (_command, _args, options) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {};

    process.nextTick(async () => {
      await writeFile(path.join(options.cwd, 'metrics.json'), '{"accuracy":0.94}\n');
      child.stdout.write('accuracy: 0.94\n');
      child.stdout.end();
      child.stderr.end();
      child.emit('close', 0, null);
    });

    return child;
  };
  const runner = createLabRunnerAdapter({ rootDir, spawnImpl });

  try {
    const result = await runner.run({
      args: ['scripts/eval.py'],
      artifacts: [{ label: 'metrics.json', path: 'metrics.json', type: 'json' }],
      command: 'python',
      cwd: 'fixtures/repro',
      expectedMetrics: ['accuracy'],
    });

    assert.equal(result.status, 'done');
    assert.deepEqual(result.artifacts, [
      {
        content: '{"accuracy":0.94}\n',
        label: 'metrics.json',
        path: 'metrics.json',
        sizeBytes: 18,
        type: 'json',
      },
    ]);
    assert.equal(result.logs.stdout, 'accuracy: 0.94\n');
    assert.equal(result.metrics.accuracy, '0.94');
  } finally {
    await rm(rootDir, { force: true, recursive: true });
  }
});

test('lab runner reports missing expected metrics as a typed failure', async () => {
  const { spawnImpl } = createSpawn({ stdout: 'completed\n' });
  const runner = createLabRunnerAdapter({ rootDir: '/workspace', spawnImpl });

  const result = await runner.run({
    args: ['scripts/eval.py'],
    command: 'python',
    cwd: 'fixtures/repro',
    expectedMetrics: ['accuracy'],
  });

  assert.equal(result.status, 'error');
  assert.equal(result.failure.type, 'metric_missing');
  assert.deepEqual(result.failure.missingMetrics, ['accuracy']);
});

test('lab runner reports missing executable as a dependency failure', async () => {
  const error = new Error('spawn python ENOENT');
  error.code = 'ENOENT';
  const runner = createLabRunnerAdapter({ rootDir: '/workspace', spawnImpl: createErrorSpawn(error) });

  const result = await runner.run({
    args: ['scripts/eval.py'],
    command: 'python',
    cwd: 'fixtures/repro',
  });

  assert.equal(result.status, 'error');
  assert.equal(result.failure.type, 'dependency');
  assert.match(result.failure.message, /ENOENT/);
});

test('lab runner reports timeout as a typed failure and terminates the child', async () => {
  const killCalls = [];
  const spawnImpl = () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = (signal) => {
      killCalls.push(signal);
      child.emit('close', null, signal);
    };
    return child;
  };
  const runner = createLabRunnerAdapter({ rootDir: '/workspace', spawnImpl });

  const result = await runner.run({
    args: ['scripts/eval.py'],
    command: 'python',
    cwd: 'fixtures/repro',
    timeoutMs: 5,
  });

  assert.equal(result.status, 'error');
  assert.equal(result.failure.type, 'timeout');
  assert.deepEqual(killCalls, ['SIGTERM']);
});
