function normalizeMigrationId(id) {
  const value = String(id || '').trim();
  if (!/^[0-9]{3}_[a-z0-9_]+$/.test(value)) {
    throw new Error(`Invalid migration id: ${value}`);
  }
  return value;
}

async function applyMigration(pool, migration) {
  if (typeof migration.up === 'function') {
    await migration.up(pool);
    return;
  }

  for (const statement of migration.statements || []) {
    const sql = String(statement || '').trim();
    if (sql) {
      await pool.query(sql);
    }
  }
}

export async function runPostgresMigrations(pool, migrations = []) {
  if (!pool || typeof pool.query !== 'function') {
    throw new Error('A Postgres pool is required to run migrations.');
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ares_schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const appliedResult = await pool.query('SELECT id FROM ares_schema_migrations ORDER BY id');
  const applied = new Set((appliedResult.rows || []).map((row) => row.id));
  const orderedMigrations = migrations
    .map((migration) => ({
      ...migration,
      id: normalizeMigrationId(migration.id),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  for (const migration of orderedMigrations) {
    if (applied.has(migration.id)) {
      continue;
    }

    await pool.query('BEGIN');
    try {
      await applyMigration(pool, migration);
      await pool.query('INSERT INTO ares_schema_migrations (id) VALUES ($1)', [migration.id]);
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  }
}
