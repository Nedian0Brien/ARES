import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';

function parseArgs(argv = []) {
  const options = {
    mode: 'dry-run',
    outputDir: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--mode') {
      options.mode = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--output-dir') {
      options.outputDir = argv[index + 1] || '';
      index += 1;
    }
  }

  return options;
}

async function ensureOutputDir(outputDir) {
  if (outputDir) {
    await fs.mkdir(outputDir, { recursive: true });
    return outputDir;
  }
  return fs.mkdtemp(path.join(os.tmpdir(), 'ares-backup-rehearsal-'));
}

export async function runBackupRestoreRehearsal({ mode = 'dry-run', outputDir = '' } = {}) {
  if (mode !== 'dry-run') {
    throw new Error('Only dry-run backup rehearsal is supported by this script.');
  }

  const rehearsalDir = await ensureOutputDir(outputDir);
  const dbBackupPath = path.join(rehearsalDir, 'db-backup.sql');
  const objectManifestPath = path.join(rehearsalDir, 'object-manifest.json');
  const restoreReportPath = path.join(rehearsalDir, 'restore-report.json');

  await fs.writeFile(
    dbBackupPath,
    [
      '-- ARES dry-run database backup rehearsal',
      '-- Production command: pg_dump --format=custom --file=<backup.dump> "$ARES_DATABASE_URL"',
      'SELECT 1;',
      '',
    ].join('\n'),
    'utf8',
  );
  await fs.writeFile(
    objectManifestPath,
    JSON.stringify(
      {
        artifacts: [
          {
            checksum: 'dry-run',
            key: 'data/runtime/reading/example/source.pdf',
            sizeBytes: 0,
          },
        ],
        provider: 's3-compatible',
      },
      null,
      2,
    ),
    'utf8',
  );

  const [dbBackup, objectManifest] = await Promise.all([
    fs.readFile(dbBackupPath, 'utf8'),
    fs.readFile(objectManifestPath, 'utf8').then((content) => JSON.parse(content)),
  ]);
  const report = {
    checkedAt: new Date().toISOString(),
    dbBackupPath,
    objectManifestPath,
    ok: dbBackup.includes('SELECT 1;') && objectManifest.artifacts.length > 0,
    restoreReportPath,
  };
  await fs.writeFile(restoreReportPath, JSON.stringify(report, null, 2), 'utf8');
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await runBackupRestoreRehearsal(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
