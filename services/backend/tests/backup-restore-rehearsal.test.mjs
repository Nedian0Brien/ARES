import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import { runBackupRestoreRehearsal } from '../../../scripts/backup-restore-rehearsal.mjs';

test('backup restore rehearsal creates dry-run backup artifacts and report', async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ares-backup-test-'));
  const report = await runBackupRestoreRehearsal({ outputDir });

  assert.equal(report.ok, true);
  assert.equal(path.dirname(report.dbBackupPath), outputDir);
  assert.equal(path.dirname(report.objectManifestPath), outputDir);
  assert.equal(path.dirname(report.restoreReportPath), outputDir);
  assert.match(await fs.readFile(report.dbBackupPath, 'utf8'), /pg_dump/);

  const manifest = JSON.parse(await fs.readFile(report.objectManifestPath, 'utf8'));
  assert.equal(manifest.provider, 's3-compatible');
  assert.equal(manifest.artifacts[0].key, 'data/runtime/reading/example/source.pdf');

  const persistedReport = JSON.parse(await fs.readFile(report.restoreReportPath, 'utf8'));
  assert.equal(persistedReport.ok, true);
});

test('backup restore rehearsal refuses non-dry-run mode', async () => {
  await assert.rejects(runBackupRestoreRehearsal({ mode: 'restore' }), /Only dry-run backup rehearsal/);
});
