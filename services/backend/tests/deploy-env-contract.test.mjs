import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);

async function readProjectFile(relativePath) {
  return readFile(path.join(process.cwd(), relativePath), 'utf8');
}

test('dev PM2 ecosystem forwards the shared ARES data root', () => {
  const previousDataRootDir = process.env.ARES_DATA_ROOT_DIR;
  const previousRuntimeRoot = process.env.ARES_RUNTIME_ROOT;
  const previousWebPort = process.env.WEB_PORT;
  process.env.ARES_DATA_ROOT_DIR = '/tmp/ares-shared-data';
  process.env.ARES_RUNTIME_ROOT = '/tmp/ares-runtime';
  process.env.WEB_PORT = '3999';
  delete require.cache[require.resolve('../../../deploy/ecosystem.config.cjs')];

  try {
    const config = require('../../../deploy/ecosystem.config.cjs');
    assert.equal(config.apps[0].env.ARES_DATA_ROOT_DIR, '/tmp/ares-shared-data');
  } finally {
    setEnvValue('ARES_DATA_ROOT_DIR', previousDataRootDir);
    setEnvValue('ARES_RUNTIME_ROOT', previousRuntimeRoot);
    setEnvValue('WEB_PORT', previousWebPort);
    delete require.cache[require.resolve('../../../deploy/ecosystem.config.cjs')];
  }
});

test('dev deploy scripts pass ARES_DATA_ROOT_DIR through PM2 restarts', async () => {
  const deployScript = await readProjectFile('deploy/deploy-dev-web.sh');
  const ensureScript = await readProjectFile('deploy/ensure-dev-web-pm2.sh');

  assert.ok(deployScript.includes('ARES_DATA_ROOT_DIR="${ARES_DATA_ROOT_DIR:-${ROOT_DIR}}"'));
  assert.ok(deployScript.includes('ARES_DATA_ROOT_DIR="$ARES_DATA_ROOT_DIR" \\'));
  assert.ok(ensureScript.includes('ARES_DATA_ROOT_DIR="${ARES_DATA_ROOT_DIR:-${ROOT_DIR}}"'));
  assert.ok(ensureScript.includes('ARES_DATA_ROOT_DIR="$ARES_DATA_ROOT_DIR" \\'));
  assert.ok(ensureScript.includes('data root 드리프트'));
});

function setEnvValue(name, value) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
