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
    idleMs: Number(argv.find((arg) => arg.startsWith('--idle-ms='))?.split('=')[1]) || 1000,
    leaseMs: Number(argv.find((arg) => arg.startsWith('--lease-ms='))?.split('=')[1]) || 60_000,
    once: argv.includes('--once'),
    workerId: argv.find((arg) => arg.startsWith('--worker-id='))?.split('=')[1] || `agent-worker-${process.pid}`,
  };
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runAgentWorkerLoop({ idleMs = 1000, leaseMs = 60_000, once = false, service, workerId }) {
  let processedRunCount = 0;

  while (true) {
    const result = await service.processNextQueuedRun({ leaseMs, workerId });
    if (result) {
      processedRunCount += 1;
    }

    if (once) {
      return { processedRunCount };
    }

    if (!result) {
      await sleep(idleMs);
    }
  }
}

export async function bootAgentWorker({ dryRun = false, idleMs = 1000, leaseMs = 60_000, once = false, workerId } = {}) {
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
  const recovered = dryRun ? await service.recoverInterruptedRuns() : await service.recoverStaleRuns({ staleMs: leaseMs });
  const workerReport = dryRun
    ? { processedRunCount: 0 }
    : await runAgentWorkerLoop({
        idleMs,
        leaseMs,
        once,
        service,
        workerId,
      });
  const report = {
    dryRun,
    ok: true,
    processedRunCount: workerReport.processedRunCount,
    recoveredRunCount: recovered.length,
    worker: 'agent-worker',
    workerId,
  };

  await store.close?.();
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await bootAgentWorker(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
