import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assessRunnerCommandRisk,
  normalizeReproductionCommand,
  parseReproductionCommandString,
} from '../lib/lab-runner-safety.mjs';

test('normalizes reproduction command into a typed runner contract', () => {
  const command = normalizeReproductionCommand({
    args: ['scripts/eval.py', '--dataset', 'fixtures/tiny.jsonl'],
    command: 'python',
    cwd: 'fixtures/repro',
    env: {
      HF_TOKEN: 'secret',
      PYTHONHASHSEED: '0',
    },
    expectedMetrics: ['accuracy'],
    timeoutMs: 5000,
  });

  assert.deepEqual(command, {
    args: ['scripts/eval.py', '--dataset', 'fixtures/tiny.jsonl'],
    command: 'python',
    cwd: 'fixtures/repro',
    env: {
      PYTHONHASHSEED: '0',
    },
    expectedMetrics: ['accuracy'],
    network: 'disabled',
    timeoutMs: 5000,
  });
});

test('classifies destructive, network, secret, and traversal runner risks', () => {
  const risk = assessRunnerCommandRisk({
    args: ['-rf', '../data'],
    command: 'rm',
    cwd: '../outside',
    env: {
      AWS_SECRET_ACCESS_KEY: 'secret',
    },
    network: 'enabled',
    timeoutMs: 700_000,
  });

  assert.equal(risk.requiresApproval, true);
  assert.equal(risk.allowedToRun, false);
  assert.deepEqual(risk.categories.sort(), ['destructive', 'network', 'path', 'secret', 'timeout'].sort());
  assert.ok(risk.reasons.some((reason) => /rm/i.test(reason)));
  assert.ok(risk.reasons.some((reason) => /network/i.test(reason)));
  assert.ok(risk.reasons.some((reason) => /secret/i.test(reason)));
  assert.ok(risk.reasons.some((reason) => /workspace/i.test(reason)));
});

test('allows low-risk fixture commands without human approval', () => {
  const risk = assessRunnerCommandRisk(
    normalizeReproductionCommand({
      args: ['scripts/eval.py'],
      command: 'python',
      cwd: 'fixtures/repro',
      env: {
        PYTHONHASHSEED: '0',
      },
      timeoutMs: 1000,
    }),
  );

  assert.equal(risk.level, 'low');
  assert.equal(risk.requiresApproval, false);
  assert.equal(risk.allowedToRun, true);
  assert.deepEqual(risk.categories, []);
});

test('parses reproduction plan command strings without invoking a shell', () => {
  assert.deepEqual(parseReproductionCommandString('python scripts/run_baseline.py --dataset fixtures/tiny.jsonl'), {
    args: ['scripts/run_baseline.py', '--dataset', 'fixtures/tiny.jsonl'],
    command: 'python',
    cwd: '.',
  });
  assert.deepEqual(parseReproductionCommandString('node -e "console.log(\\"accuracy: 0.95\\")"'), {
    args: ['-e', 'console.log("accuracy: 0.95")'],
    command: 'node',
    cwd: '.',
  });
});

test('rejects reproduction plan command strings that require shell interpretation', () => {
  assert.throws(() => parseReproductionCommandString('python eval.py && rm -rf data'), /shell control/i);
  assert.throws(() => parseReproductionCommandString('bash -lc "python eval.py"'), /shell execution/i);
});
