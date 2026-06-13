import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';

import { createAgentRunService } from '../lib/agent-runs.mjs';
import { createStore } from '../lib/store.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DATA_ROOT_DIR = process.env.ARES_DATA_ROOT_DIR || ROOT_DIR;
const SEED_FILE = path.join(DATA_ROOT_DIR, 'data', 'store.seed.json');
const RUNTIME_FILE = path.join(DATA_ROOT_DIR, 'data', 'runtime', 'store.json');

async function ensureEnvLoaded(envFile) {
  try {
    const content = await fs.readFile(envFile, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const separator = trimmed.indexOf('=');
      if (separator <= 0) {
        continue;
      }
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim();
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
}

function parseArgs(argv = []) {
  return {
    dryRun: argv.includes('--dry-run'),
  };
}

export async function bootAgentWorker({ dryRun = false } = {}) {
  await ensureEnvLoaded(path.join(ROOT_DIR, '.env'));

  const store = await createStore({
    backend: process.env.ARES_STORE_BACKEND || '',
    databaseSsl: process.env.ARES_DATABASE_SSL || '',
    databaseUrl: process.env.ARES_DATABASE_URL || process.env.DATABASE_URL || '',
    migrate:
      process.env.ARES_AUTO_MIGRATE === undefined
        ? process.env.NODE_ENV !== 'production'
        : process.env.ARES_AUTO_MIGRATE === '1' || process.env.ARES_AUTO_MIGRATE === 'true',
    seedFile: SEED_FILE,
    runtimeFile: RUNTIME_FILE,
  });
  const service = createAgentRunService({
    rootDir: ROOT_DIR,
    runtimeName: process.env.ARES_AGENT_RUNTIME || process.env.SCOUT_AGENT_RUNTIME || 'codex',
    store,
  });
  const recovered = await service.recoverInterruptedRuns();
  const report = {
    dryRun,
    ok: true,
    recoveredRunCount: recovered.length,
    worker: 'agent-worker',
  };

  await store.close?.();
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await bootAgentWorker(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
