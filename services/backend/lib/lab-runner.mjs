import { spawn } from 'node:child_process';
import path from 'node:path';

import { assessRunnerCommandRisk, normalizeReproductionCommand } from './lab-runner-safety.mjs';

const METRIC_LINE_PATTERN = /^\s*([a-zA-Z][\w ./%-]{0,60})\s*[:=]\s*([-+]?\d+(?:\.\d+)?%?)\s*$/;

function normaliseMetricName(value) {
  return String(value || 'primary').trim().toLowerCase().replace(/\s+/g, '_');
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

function buildFailureResult({ approval, command, code, signal, stderr, stdout }) {
  const message = String(stderr || stdout || `Runner exited with code ${code ?? signal ?? 'unknown'}`).trim();
  return {
    approval,
    artifacts: [],
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
          env: command.env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (chunk) => {
          stdout += chunk.toString();
        });
        child.stderr?.on('data', (chunk) => {
          stderr += chunk.toString();
        });
        child.on('error', (error) => {
          resolve({
            approval,
            artifacts: [],
            command,
            exitCode: null,
            failure: {
              message: error.message,
              type: 'spawn_error',
            },
            logs: {
              stderr,
              stdout,
            },
            metrics: parseRunnerMetrics(stdout),
            status: 'error',
          });
        });
        child.on('close', (code, signal) => {
          if (code === 0) {
            resolve({
              approval,
              artifacts: [],
              command,
              completedAt: new Date().toISOString(),
              exitCode: code,
              logs: {
                stderr,
                stdout,
              },
              metrics: parseRunnerMetrics(stdout),
              status: 'done',
            });
            return;
          }

          resolve(buildFailureResult({ approval, command, code, signal, stderr, stdout }));
        });
      });
    },
  };
}
