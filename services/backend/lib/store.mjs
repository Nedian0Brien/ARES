import { createFileStore } from './file-store.mjs';
import { createPostgresStore } from './postgres-store.mjs';

export function resolveStoreBackend({ backend, databaseUrl } = {}) {
  const normalized = String(backend || '')
    .trim()
    .toLowerCase();

  if (normalized === 'postgres' || normalized === 'postgresql' || normalized === 'pg') {
    return 'postgres';
  }

  if (normalized === 'file' || normalized === 'json') {
    return 'file';
  }

  return databaseUrl ? 'postgres' : 'file';
}

export async function createStore(options = {}) {
  const backend = resolveStoreBackend(options);

  if (backend === 'postgres') {
    if (!options.databaseUrl) {
      throw new Error('DATABASE_URL or ARES_DATABASE_URL is required when ARES store backend is postgres.');
    }

    return createPostgresStore(options);
  }

  return createFileStore(options);
}
