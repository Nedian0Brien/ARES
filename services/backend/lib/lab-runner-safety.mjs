const DEFAULT_TIMEOUT_MS = 300_000;
const MAX_TIMEOUT_MS = 600_000;
const ALLOWED_COMMANDS = new Set(['bash', 'node', 'npm', 'python', 'python3', 'uv']);
const DESTRUCTIVE_COMMANDS = new Set(['dd', 'mkfs', 'rm', 'shred']);
const SECRET_KEY_PATTERN = /(api[_-]?key|auth|credential|password|secret|token)/i;
const SHELL_CONTROL_PATTERN = /[;&|<>`]|[$]\(/;

function ensureText(value, fallback = '') {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function ensureStringArray(value, limit = 64) {
  return Array.isArray(value)
    ? value.map((entry) => ensureText(entry)).filter(Boolean).slice(0, limit)
    : [];
}

function normalizeRelativePath(value, fallback = '.') {
  const text = ensureText(value, fallback).replace(/\\/g, '/');
  return text || fallback;
}

function hasPathTraversal(value) {
  const text = normalizeRelativePath(value);
  return text === '..' || text.startsWith('../') || text.includes('/../') || text.startsWith('/');
}

function normalizeRunnerEnv(env = {}) {
  const source = env && typeof env === 'object' && !Array.isArray(env) ? env : {};
  const next = {};

  for (const [key, value] of Object.entries(source)) {
    const name = ensureText(key);
    if (!name || SECRET_KEY_PATTERN.test(name)) {
      continue;
    }
    next[name] = String(value ?? '');
  }

  return next;
}

function tokenizeCommandString(value) {
  const text = ensureText(value);
  const tokens = [];
  let current = '';
  let quote = '';

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '\\') {
      index += 1;
      current += text[index] || '';
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = '';
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }

  if (quote) {
    throw new Error('Reproduction command has an unterminated quote.');
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

export function parseReproductionCommandString(value = '') {
  const text = ensureText(value);
  if (!text) {
    throw new Error('Reproduction command string is required.');
  }
  if (SHELL_CONTROL_PATTERN.test(text)) {
    throw new Error('Reproduction command strings cannot include shell control syntax.');
  }

  const [command, ...args] = tokenizeCommandString(text);
  if (!command) {
    throw new Error('Reproduction command string is required.');
  }
  if (command === 'bash' && args.some((arg) => arg === '-c' || arg === '-lc')) {
    throw new Error('Reproduction command strings cannot require shell execution.');
  }

  return {
    args,
    command,
    cwd: '.',
  };
}

export function normalizeReproductionCommand(input = {}) {
  const command = ensureText(input.command).split(/\s+/)[0] || '';
  const timeoutMs = Number(input.timeoutMs);

  return {
    args: ensureStringArray(input.args, 128),
    command,
    cwd: normalizeRelativePath(input.cwd),
    env: normalizeRunnerEnv(input.env),
    expectedMetrics: ensureStringArray(input.expectedMetrics, 32),
    network: ensureText(input.network, 'disabled') === 'enabled' ? 'enabled' : 'disabled',
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.floor(timeoutMs) : DEFAULT_TIMEOUT_MS,
  };
}

export function assessRunnerCommandRisk(command = {}) {
  const normalized = normalizeReproductionCommand(command);
  const categories = new Set();
  const reasons = [];
  const rawEnv = command.env && typeof command.env === 'object' && !Array.isArray(command.env) ? command.env : {};

  if (!ALLOWED_COMMANDS.has(normalized.command)) {
    categories.add('destructive');
    reasons.push(`Command "${normalized.command || '(empty)'}" is not in the runner allowlist.`);
  }
  if (DESTRUCTIVE_COMMANDS.has(normalized.command)) {
    categories.add('destructive');
    reasons.push(`Command "${normalized.command}" is destructive and cannot run in the default sandbox.`);
  }
  if (normalized.args.some((arg) => /^--?rf$/.test(arg) || arg === '--no-preserve-root')) {
    categories.add('destructive');
    reasons.push('Command arguments include destructive filesystem flags.');
  }
  if (normalized.network === 'enabled') {
    categories.add('network');
    reasons.push('Network access is disabled by default for runner commands.');
  }
  if (Object.keys(rawEnv).some((key) => SECRET_KEY_PATTERN.test(key))) {
    categories.add('secret');
    reasons.push('Secret-like environment variables are stripped from runner commands.');
  }
  if (hasPathTraversal(normalized.cwd) || normalized.args.some((arg) => hasPathTraversal(arg))) {
    categories.add('path');
    reasons.push('Runner paths must stay inside the approved workspace.');
  }
  if (normalized.timeoutMs > MAX_TIMEOUT_MS) {
    categories.add('timeout');
    reasons.push(`Runner timeout must be ${MAX_TIMEOUT_MS}ms or less.`);
  }

  const resultCategories = Array.from(categories);
  const hardBlock = resultCategories.some((category) => ['destructive', 'path', 'secret'].includes(category));

  return {
    allowedToRun: !hardBlock,
    categories: resultCategories,
    level: hardBlock ? 'high' : resultCategories.length ? 'medium' : 'low',
    reasons,
    requiresApproval: resultCategories.length > 0,
  };
}
