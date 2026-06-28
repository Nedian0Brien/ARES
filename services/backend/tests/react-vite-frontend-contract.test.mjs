import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..');

async function readProjectFile(relativePath) {
  return readFile(path.join(rootDir, relativePath), 'utf8');
}

async function readJson(relativePath) {
  return JSON.parse(await readProjectFile(relativePath));
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL('/api/health', baseUrl));
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the server is ready.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timed out waiting for ${baseUrl}/api/health`);
}

async function startBackend({ dataRootDir, env = {}, port }) {
  const child = spawn('node', ['services/backend/index.mjs'], {
    cwd: rootDir,
    env: {
      ...process.env,
      ARES_DATA_ROOT_DIR: dataRootDir,
      ARES_ENABLE_DEMO_PDF: 'true',
      HOST: '127.0.0.1',
      PORT: String(port),
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForServer(baseUrl);
  } catch (error) {
    child.kill('SIGTERM');
    throw new Error(`${error.message}\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  }

  return {
    baseUrl,
    async close() {
      child.kill('SIGTERM');
      await new Promise((resolve) => {
        child.once('exit', resolve);
        setTimeout(resolve, 1000);
      });
    },
    stderr() {
      return stderr;
    },
  };
}

test('root package exposes React/Vite frontend build and typecheck scripts', async () => {
  const packageJson = await readJson('package.json');

  assert.equal(packageJson.scripts['web:dev'], 'vite --config apps/web/vite.config.ts --host 0.0.0.0');
  assert.equal(packageJson.scripts['web:build'], 'vite build --config apps/web/vite.config.ts');
  assert.equal(packageJson.scripts.typecheck, 'tsc -p apps/web/tsconfig.json --noEmit');
  assert.match(packageJson.scripts.build, /web:build/);

  assert.ok(packageJson.dependencies['@vitejs/plugin-react']);
  assert.ok(packageJson.dependencies.vite);
  assert.ok(packageJson.dependencies.typescript);
  assert.ok(packageJson.dependencies.react);
  assert.ok(packageJson.dependencies['react-dom']);
  assert.ok(packageJson.dependencies['lucide-react']);
  assert.ok(packageJson.dependencies.sonner);
});

test('React app shell preserves ARES route and workflow contracts', async () => {
  const requiredFiles = [
    'apps/web/index.html',
    'apps/web/src/main.tsx',
    'apps/web/src/App.tsx',
    'apps/web/src/app/router.ts',
    'apps/web/src/app/workflow.ts',
    'apps/web/src/app/api.ts',
    'apps/web/src/components/chrome/AppChrome.tsx',
    'apps/web/src/components/ui/button.tsx',
    'apps/web/src/components/ui/tabs.tsx',
  ];

  for (const relativePath of requiredFiles) {
    assert.equal(existsSync(path.join(rootDir, relativePath)), true, `${relativePath} should exist`);
  }

  const workflow = await readProjectFile('apps/web/src/app/workflow.ts');
  assert.match(workflow, /id:\s*['"]papers['"][\s\S]*label:\s*['"]Search \+ Reading['"]/);
  assert.match(workflow, /id:\s*['"]lab['"][\s\S]*label:\s*['"]Research \+ Result['"]/);
  assert.match(workflow, /search:\s*['"]search['"]/);
  assert.match(workflow, /papers:\s*['"]reading['"]/);
  assert.match(workflow, /lab:\s*['"]research['"]/);

  const app = await readProjectFile('apps/web/src/App.tsx');
  const appChrome = await readProjectFile('apps/web/src/components/chrome/AppChrome.tsx');
  assert.match(app, /<AppChrome/);
  assert.match(appChrome, /data-ares-react-app/);
  assert.doesNotMatch(app, /recentPapers|labRuns|PDF preview|Reader workbench/);
});

test('shadcn configuration maps generated UI components into the React app', async () => {
  const components = await readJson('apps/web/components.json');

  assert.equal(components.tsx, true);
  assert.equal(components.aliases.components, '@/components');
  assert.equal(components.aliases.ui, '@/components/ui');
  assert.equal(components.iconLibrary, 'lucide');

  const globalCss = await readProjectFile('apps/web/src/styles/globals.css');
  assert.match(globalCss, /--background:\s*var\(--bg\)/);
  assert.match(globalCss, /--foreground:\s*var\(--tx\)/);
  assert.match(globalCss, /--primary:\s*var\(--read\)/);
  assert.match(globalCss, /--workflow-search:\s*var\(--search\)/);
});

test('backend defaults to the React build with an explicit legacy override', async () => {
  const backend = await readProjectFile('services/backend/index.mjs');

  assert.match(backend, /ARES_WEB_DIR/);
  assert.match(backend, /ARES_USE_LEGACY_WEB/);
  assert.match(backend, /resolveWebDir/);
  assert.match(backend, /LEGACY_WEB_DIR/);
  assert.match(backend, /WEB_DIST_DIR/);
  assert.match(backend, /fs\.stat\(path\.join\(WEB_DIST_DIR, ['"]index\.html['"]\)\)/);
});

test('backend serves React build by default when web-dist exists and keeps legacy override', async () => {
  const dataRootDir = await mkdtemp(path.join(os.tmpdir(), 'ares-react-default-'));
  const webDistDir = path.join(rootDir, 'web-dist');
  const webDistAlreadyExists = existsSync(webDistDir);
  let server = null;

  try {
    await mkdir(path.join(dataRootDir, 'data'), { recursive: true });
    await copyFile(path.join(rootDir, 'data', 'store.seed.json'), path.join(dataRootDir, 'data', 'store.seed.json'));

    if (!webDistAlreadyExists) {
      await mkdir(webDistDir, { recursive: true });
      await writeFile(
        path.join(webDistDir, 'index.html'),
        '<!doctype html><div data-ares-react-app>React build should be default</div>',
        'utf8',
      );
    }

    const port = await getFreePort();
    server = await startBackend({ dataRootDir, port });
    const response = await fetch(server.baseUrl);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /data-ares-react-app|<script type="module" crossorigin src="\/assets\/index-[^"]+\.js"><\/script>/);

    await server.close();
    server = await startBackend({ dataRootDir, env: { ARES_USE_LEGACY_WEB: '1' }, port: await getFreePort() });
    const legacyResponse = await fetch(server.baseUrl);
    const legacyHtml = await legacyResponse.text();

    assert.equal(legacyResponse.status, 200);
    assert.match(legacyHtml, /<script type="module" src="app\.js(?:\?[^"]*)?"><\/script>/);
    assert.match(legacyHtml, /<link rel="stylesheet" href="styles\.css(?:\?[^"]*)?" \/>/);
    assert.doesNotMatch(legacyHtml, /data-ares-react-app/);
  } finally {
    if (server) {
      await server.close();
    }
    if (!webDistAlreadyExists) {
      await rm(webDistDir, { force: true, recursive: true });
    }
    await rm(dataRootDir, { force: true, recursive: true });
  }
});
