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
