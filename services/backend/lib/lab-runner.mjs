import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { assessRunnerCommandRisk, normalizeReproductionCommand } from './lab-runner-safety.mjs';

const METRIC_LINE_PATTERN = /^\s*([a-zA-Z][\w ./%-]{0,60})\s*[:=]\s*([-+]?\d+(?:\.\d+)?%?)\s*$/;
const MAX_ARTIFACT_BYTES = 1_000_000;

function normaliseMetricName(value) {
  return String(value || 'primary').trim().toLowerCase().replace(/\s+/g, '_');
}

function metricNumber(value) {
  const text = String(value || '').trim();
  if (!text) {
    return null;
  }

  const number = Number(text.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? number : null;
}

function metricDeltaValue(paperValue, observedValue) {
  const paperNumber = metricNumber(paperValue);
  const observedNumber = metricNumber(observedValue);
  if (paperNumber === null || observedNumber === null) {
    return null;
  }
  const delta = observedNumber - paperNumber;
  return Math.round(delta * 1000) / 1000;
}

function metricDelta(paperValue, observedValue) {
  const deltaValue = metricDeltaValue(paperValue, observedValue);
  if (deltaValue === null) {
    return observedValue ? 'Needs analysis' : 'Awaiting result';
  }

  return `${deltaValue > 0 ? '+' : ''}${deltaValue}`;
}

function parseRunnerMetrics(output) {
  const metrics = {};
  for (const line of String(output || '').split(/\r?\n/)) {
    const match = line.match(METRIC_LINE_PATTERN);
    if (!match) {
      continue;
    }

    const name = normaliseMetricName(match[1]);
    if (!metrics[name]) {
      metrics[name] = match[2];
    }
  }
  return metrics;
}

function commandPreview(command) {
  return [command.command, ...command.args].filter(Boolean).join(' ');
}

function riskScore(risk) {
  if (risk.level === 'high') {
    return 100;
  }
  if (risk.level === 'medium') {
    return 50;
  }
  return 0;
}

function approvalState({ approval = {}, command, risk }) {
  return {
    approvedAt: approval.approvedAt || '',
    approvedBy: approval.approvedBy || '',
    commandPreview: commandPreview(command),
    riskCategories: risk.categories,
    riskScore: riskScore(risk),
    state: approval.state === 'approved' ? 'approved' : risk.requiresApproval ? 'required' : 'not-required',
  };
}

function isApproved(approval = {}) {
  return approval.state === 'approved' && Boolean(approval.approvedBy);
}

function workspacePath(rootDir, relativePath) {
  const root = path.resolve(rootDir);
  const target = path.resolve(root, relativePath || '.');
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error('Runner cwd must stay inside the workspace.');
  }
  return target;
}

function declaredArtifacts(input = {}) {
  return Array.isArray(input.artifacts)
    ? input.artifacts
        .map((artifact) => ({
          label: String(artifact?.label || artifact?.path || 'artifact').trim(),
          path: String(artifact?.path || '').trim().replace(/\\/g, '/'),
          type: String(artifact?.type || 'file').trim(),
        }))
        .filter((artifact) => artifact.path && !artifact.path.startsWith('/') && !artifact.path.includes('..'))
        .slice(0, 16)
    : [];
}

async function captureDeclaredArtifacts({ cwd, input }) {
  const artifacts = [];

  for (const artifact of declaredArtifacts(input)) {
    const artifactPath = path.resolve(cwd, artifact.path);
    if (artifactPath !== cwd && !artifactPath.startsWith(`${cwd}${path.sep}`)) {
      continue;
    }

    let content = '';
    try {
      content = await readFile(artifactPath, 'utf8');
    } catch {
      continue;
    }

    const sizeBytes = Buffer.byteLength(content);
    if (sizeBytes > MAX_ARTIFACT_BYTES) {
      continue;
    }

    artifacts.push({
      content,
      label: artifact.label,
      path: artifact.path,
      sizeBytes,
      type: artifact.type,
    });
  }

  return artifacts;
}

function buildPolicyBlockedResult({ approval, command, risk, type = 'policy' }) {
  return {
    approval: approvalState({ approval, command, risk }),
    artifacts: [],
    command,
    exitCode: null,
    failure: {
      message: risk.reasons.join(' ') || 'Runner command blocked by policy.',
      type,
    },
    logs: {
      stderr: '',
      stdout: '',
    },
    metrics: {},
    risk,
    status: 'blocked',
  };
}

function buildFailureResult({ approval, artifacts = [], command, code, signal, stderr, stdout }) {
  const message = String(stderr || stdout || `Runner exited with code ${code ?? signal ?? 'unknown'}`).trim();
  return {
    approval,
    artifacts,
    command,
    exitCode: code,
    failure: {
      message,
      signal,
      type: 'exit_code',
    },
    logs: {
      stderr,
      stdout,
    },
    metrics: parseRunnerMetrics(stdout),
    status: 'error',
  };
}

function buildMetricMissingResult({ approval, artifacts = [], command, code, metrics, missingMetrics, stderr, stdout }) {
  return {
    approval,
    artifacts,
    command,
    exitCode: code,
    failure: {
      message: `Missing expected metric: ${missingMetrics.join(', ')}`,
      missingMetrics,
      type: 'metric_missing',
    },
    logs: {
      stderr,
      stdout,
    },
    metrics,
    status: 'error',
  };
}

function buildTimeoutResult({ approval, command, stderr, stdout }) {
  return {
    approval,
    artifacts: [],
    command,
    exitCode: null,
    failure: {
      message: `Runner timed out after ${command.timeoutMs}ms.`,
      type: 'timeout',
    },
    logs: {
      stderr,
      stdout,
    },
    metrics: parseRunnerMetrics(stdout),
    status: 'error',
  };
}

function missingExpectedMetrics(command, metrics) {
  return command.expectedMetrics.filter((metric) => {
    const name = normaliseMetricName(metric);
    return !Object.hasOwn(metrics, name);
  });
}

function pickDossierMetric(runnerResult = {}) {
  const expected = Array.isArray(runnerResult.command?.expectedMetrics) ? runnerResult.command.expectedMetrics : [];
  const metric = expected.find((entry) => Object.hasOwn(runnerResult.metrics || {}, normaliseMetricName(entry)));
  if (metric) {
    return normaliseMetricName(metric);
  }

  return Object.keys(runnerResult.metrics || {})[0] || 'primary';
}

function baselineMetricValue(reproductionPlan = {}, metric = 'primary') {
  const baseline = reproductionPlan.baseline && typeof reproductionPlan.baseline === 'object' ? reproductionPlan.baseline : {};
  const value = baseline[metric] ?? baseline.metrics?.[metric] ?? baseline.primary ?? 'linked evidence';
  if (value && typeof value === 'object') {
    return value.value ?? value.paperValue ?? 'linked evidence';
  }
  return String(value || 'linked evidence');
}

function baselineMetricUnit(reproductionPlan = {}, metric = 'primary') {
  const baseline = reproductionPlan.baseline && typeof reproductionPlan.baseline === 'object' ? reproductionPlan.baseline : {};
  const value = baseline[metric] ?? baseline.metrics?.[metric];
  if (value && typeof value === 'object') {
    return String(value.unit || '');
  }
  return String(baseline.unit || '');
}

export function buildResultDossierFromRunnerResult({
  paperId = '',
  questionId = '',
  reproductionPlan = {},
  runId = '',
  runnerResult = {},
} = {}) {
  const metric = pickDossierMetric(runnerResult);
  const reproducedValue = String(runnerResult.metrics?.[metric] || '').trim();
  const paperValue = baselineMetricValue(reproductionPlan, metric);
  const delta = metricDelta(paperValue, reproducedValue);
  const deltaValue = metricDeltaValue(paperValue, reproducedValue);
  const comparison = {
    delta,
    deltaValue,
    metric,
    paperValue,
    reproducedValue: reproducedValue || 'pending',
    status: deltaValue === null ? 'needs-review' : 'measured',
    summary: reproducedValue ? `Runner observed ${metric}: ${reproducedValue}` : `Runner did not report ${metric}.`,
    unit: baselineMetricUnit(reproductionPlan, metric),
  };

  return {
    comparisons: [comparison],
    deltaSummary: comparison.delta,
    evidenceLinkIds: Array.isArray(reproductionPlan.evidenceLinkIds) ? reproductionPlan.evidenceLinkIds : [],
    experimentRunIds: [runId].filter(Boolean),
    paperId,
    questionId: questionId || reproductionPlan.questionId || '',
    status: runnerResult.status === 'done' ? 'done' : 'draft',
  };
}

export function createLabRunnerAdapter({ rootDir, spawnImpl = spawn } = {}) {
  if (!rootDir) {
    throw new Error('rootDir is required to create the Lab runner adapter.');
  }

  return {
    name: 'local-safe',

    async run(input = {}, options = {}) {
      const command = normalizeReproductionCommand(input);
      const risk = assessRunnerCommandRisk(input);
      const approval = approvalState({ approval: options.approval, command, risk });

      if (!risk.allowedToRun) {
        return buildPolicyBlockedResult({ approval: options.approval, command, risk });
      }
      if (risk.requiresApproval && !isApproved(options.approval)) {
        return buildPolicyBlockedResult({
          approval: options.approval,
          command,
          risk,
          type: 'approval_required',
        });
      }

      const cwd = workspacePath(rootDir, command.cwd);

      return new Promise((resolve) => {
        const child = spawnImpl(command.command, command.args, {
          cwd,
          env: {
            PATH: process.env.PATH || '',
            ...command.env,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        let settled = false;

        function finish(result) {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timeoutHandle);
          resolve(result);
        }

        const timeoutHandle = setTimeout(() => {
          try {
            child.kill?.('SIGTERM');
          } catch {
            // The timeout result below is still the source of truth.
          }
          finish(buildTimeoutResult({ approval, command, stderr, stdout }));
        }, command.timeoutMs);

        child.stdout?.on('data', (chunk) => {
          stdout += chunk.toString();
        });
        child.stderr?.on('data', (chunk) => {
          stderr += chunk.toString();
        });
        child.on('error', (error) => {
          finish({
            approval,
            artifacts: [],
            command,
            exitCode: null,
            failure: {
              message: error.message,
              type: error.code === 'ENOENT' ? 'dependency' : 'spawn_error',
            },
            logs: {
              stderr,
              stdout,
            },
            metrics: parseRunnerMetrics(stdout),
            status: 'error',
          });
        });
        child.on('close', async (code, signal) => {
          if (settled) {
            return;
          }

          const artifacts = await captureDeclaredArtifacts({ cwd, input });
          const metrics = parseRunnerMetrics(stdout);

          if (code === 0) {
            const missingMetrics = missingExpectedMetrics(command, metrics);
            if (missingMetrics.length) {
              finish(
                buildMetricMissingResult({
                  approval,
                  artifacts,
                  code,
                  command,
                  metrics,
                  missingMetrics,
                  stderr,
                  stdout,
                }),
              );
              return;
            }

            finish({
              approval,
              artifacts,
              command,
              completedAt: new Date().toISOString(),
              exitCode: code,
              logs: {
                stderr,
                stdout,
              },
              metrics,
              status: 'done',
            });
            return;
          }

          finish(buildFailureResult({ approval, artifacts, command, code, signal, stderr, stdout }));
        });
      });
    },
  };
}
