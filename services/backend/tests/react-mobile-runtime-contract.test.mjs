import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..');

async function readProjectFile(relativePath) {
  return readFile(path.join(rootDir, relativePath), 'utf8');
}

test('React mobile viewport hook ports the iOS bottom chrome contract', async () => {
  const [mobileRuntime, app, tokens] = await Promise.all([
    readProjectFile('web/src/lib/mobileViewport.js'),
    readProjectFile('web/src/App.jsx'),
    readProjectFile('web/src/styles/tokens.css'),
  ]);

  assert.match(mobileRuntime, /window\.visualViewport/);
  assert.match(mobileRuntime, /--viewport-browser-bottom/);
  assert.match(mobileRuntime, /--viewport-browser-bottom-fallback/);
  assert.match(mobileRuntime, /visualViewport\?\.addEventListener\('resize'/);
  assert.match(mobileRuntime, /visualViewport\?\.addEventListener\('scroll'/);
  assert.match(app, /useVisualViewportOcclusion\(\)/);
  assert.match(tokens, /--viewport-bottom-occlusion:max/);
});

test('React mobile auto-hide hook reuses the established reducer', async () => {
  const mobileRuntime = await readProjectFile('web/src/lib/mobileViewport.js');

  assert.match(mobileRuntime, /primeAutoHideScrollState/);
  assert.match(mobileRuntime, /reduceAutoHideScrollState/);
  assert.match(mobileRuntime, /AUTO_HIDE_RESUME_GUARD_MS = 240/);
  assert.match(mobileRuntime, /hideAfterScrollY:\s*72/);
  assert.match(mobileRuntime, /useMobileAutoHide/);
});
