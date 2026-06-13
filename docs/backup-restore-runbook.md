# Backup and Restore Runbook

## Scope

This runbook covers ARES production data:

- PostgreSQL application data.
- S3-compatible artifact objects for PDFs, thumbnails, tables, parsed artifacts, and exports.

## Backup

1. Put the deployment in maintenance mode or pause write-heavy workers.
2. Create a database backup with `pg_dump --format=custom`.
3. Export an object storage manifest with key, size, checksum, and last modified timestamp.
4. Store database and object backups in separate retention buckets.
5. Record the app commit, migration ids, backup paths, and object manifest path.

## Restore Rehearsal

Run the dry-run rehearsal locally:

```bash
node scripts/backup-restore-rehearsal.mjs --mode dry-run
```

The dry-run writes a representative database backup marker, object manifest, and restore report into a temporary directory. It does not connect to a real database or object bucket.

## Production Restore

1. Provision a clean database and object bucket.
2. Restore the database backup with `pg_restore --clean --if-exists`.
3. Restore objects from the manifest source.
4. Start ARES with `ARES_AUTO_MIGRATE=false`.
5. Verify `/api/health`, latest migration ids, project list access, one PDF download, and one asset detail file.

## Evidence

- Rehearsal script: `scripts/backup-restore-rehearsal.mjs`
- Script test: `services/backend/tests/backup-restore-rehearsal.test.mjs`
