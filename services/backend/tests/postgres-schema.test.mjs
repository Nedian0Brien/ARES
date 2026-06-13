import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { POSTGRES_MIGRATIONS } from '../lib/postgres-store.mjs';

test('postgres lookup index migration is registered and mirrored by SQL snapshot', async () => {
  const lookupMigration = POSTGRES_MIGRATIONS.find((migration) => migration.id === '002_lookup_indexes');
  assert.ok(lookupMigration, '002_lookup_indexes migration must be registered');

  const sql = await fs.readFile(path.join(process.cwd(), 'migrations', '002_lookup_indexes.sql'), 'utf8');
  const statements = lookupMigration.statements.map((statement) => `${statement};`);

  assert.ok(statements.some((statement) => statement.includes('ares_users_status_idx')));
  assert.ok(statements.some((statement) => statement.includes('ares_project_assets_project_updated_idx')));
  for (const statement of statements) {
    assert.ok(sql.includes(statement), `SQL snapshot is missing: ${statement}`);
  }
});

test('postgres agent run lease migration is registered and mirrored by SQL snapshot', async () => {
  const leaseMigration = POSTGRES_MIGRATIONS.find((migration) => migration.id === '003_agent_run_leases');
  assert.ok(leaseMigration, '003_agent_run_leases migration must be registered');

  const sql = await fs.readFile(path.join(process.cwd(), 'migrations', '003_agent_run_leases.sql'), 'utf8');
  const statements = leaseMigration.statements.map((statement) => `${statement};`);

  assert.ok(statements.some((statement) => statement.includes('lease_owner')));
  assert.ok(statements.some((statement) => statement.includes('ares_agent_runs_claim_idx')));
  for (const statement of statements) {
    assert.ok(sql.includes(statement), `SQL snapshot is missing: ${statement}`);
  }
});

test('postgres store claims agent runs with row locks', async () => {
  const source = await fs.readFile(path.join(process.cwd(), 'services', 'backend', 'lib', 'postgres-store.mjs'), 'utf8');

  assert.match(source, /FOR UPDATE SKIP LOCKED/);
});
