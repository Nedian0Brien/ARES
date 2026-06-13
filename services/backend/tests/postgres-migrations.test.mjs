import test from 'node:test';
import assert from 'node:assert/strict';

import { runPostgresMigrations } from '../lib/postgres-migrations.mjs';

function createFakePool({ appliedIds = [] } = {}) {
  const queries = [];
  const applied = [...appliedIds];

  return {
    get applied() {
      return applied;
    },
    get queries() {
      return queries;
    },
    async query(sql, params = []) {
      const statement = String(sql).replace(/\s+/g, ' ').trim();
      queries.push({ params, statement });
      if (/^SELECT id FROM ares_schema_migrations/i.test(statement)) {
        return { rows: applied.map((id) => ({ id })) };
      }
      if (/^INSERT INTO ares_schema_migrations/i.test(statement)) {
        applied.push(params[0]);
      }
      return { rows: [] };
    },
  };
}

test('postgres migration runner applies pending migrations inside a transaction', async () => {
  const pool = createFakePool();

  await runPostgresMigrations(pool, [
    {
      id: '002_second_change',
      statements: ['CREATE TABLE second_change (id TEXT PRIMARY KEY)'],
    },
    {
      id: '001_initial_schema',
      statements: ['CREATE TABLE initial_schema (id TEXT PRIMARY KEY)'],
    },
  ]);

  const statements = pool.queries.map((query) => query.statement);
  assert.equal(statements[0], 'CREATE TABLE IF NOT EXISTS ares_schema_migrations ( id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW() )');
  assert.equal(statements[1], 'SELECT id FROM ares_schema_migrations ORDER BY id');
  assert.deepEqual(
    statements.filter((statement) => statement === 'BEGIN' || statement === 'COMMIT'),
    ['BEGIN', 'COMMIT', 'BEGIN', 'COMMIT'],
  );
  assert.ok(statements.indexOf('CREATE TABLE initial_schema (id TEXT PRIMARY KEY)') < statements.indexOf('CREATE TABLE second_change (id TEXT PRIMARY KEY)'));
  assert.deepEqual(pool.applied, ['001_initial_schema', '002_second_change']);
});

test('postgres migration runner skips already applied migrations', async () => {
  const pool = createFakePool({ appliedIds: ['001_initial_schema'] });

  await runPostgresMigrations(pool, [
    {
      id: '001_initial_schema',
      statements: ['CREATE TABLE should_not_run (id TEXT PRIMARY KEY)'],
    },
    {
      id: '002_second_change',
      statements: ['CREATE TABLE second_change (id TEXT PRIMARY KEY)'],
    },
  ]);

  const statements = pool.queries.map((query) => query.statement);
  assert.ok(!statements.includes('CREATE TABLE should_not_run (id TEXT PRIMARY KEY)'));
  assert.ok(statements.includes('CREATE TABLE second_change (id TEXT PRIMARY KEY)'));
  assert.deepEqual(pool.applied, ['001_initial_schema', '002_second_change']);
});

test('postgres migration runner rolls back failed migrations', async () => {
  const pool = createFakePool();
  const failure = new Error('migration failed');

  await assert.rejects(
    runPostgresMigrations(pool, [
      {
        id: '001_initial_schema',
        async up() {
          throw failure;
        },
      },
    ]),
    /migration failed/,
  );

  const statements = pool.queries.map((query) => query.statement);
  assert.ok(statements.includes('BEGIN'));
  assert.ok(statements.includes('ROLLBACK'));
  assert.deepEqual(pool.applied, []);
});
