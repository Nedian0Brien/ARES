import { spawn } from 'node:child_process';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 3110);
const HOST = process.env.HOST || '127.0.0.1';
const BASE_URL = process.env.ARES_BASELINE_BASE_URL || `http://${HOST}:${PORT}`;
const OUTPUT_DIR = path.join(ROOT_DIR, 'design', 'screenshots', 'react-port-baseline');
const DATA_ROOT = path.join(ROOT_DIR, '.runtime', 'react-port-baseline');

const viewports = [
  { name: 'desktop-1440', width: 1440, height: 980, isMobile: false },
  { name: 'tablet-768', width: 768, height: 1024, isMobile: false },
  { name: 'mobile-375', width: 375, height: 812, isMobile: true },
  { name: 'mobile-320', width: 320, height: 740, isMobile: true },
];

async function waitForServer(url) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the local server is ready.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}/api/health`);
}

function startServer() {
  return spawn('node', ['services/backend/index.mjs'], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      HOST,
      PORT: String(PORT),
      ARES_DATA_ROOT_DIR: DATA_ROOT,
      ARES_ENABLE_DEMO_PDF: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function stopServer(server) {
  if (!server || server.exitCode !== null) {
    return;
  }

  server.kill('SIGINT');
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    delay(1000),
  ]);
}

async function captureBaseline() {
  await rm(DATA_ROOT, { force: true, recursive: true });
  await mkdir(path.join(DATA_ROOT, 'data'), { recursive: true });
  await copyFile(path.join(ROOT_DIR, 'data', 'store.seed.json'), path.join(DATA_ROOT, 'data', 'store.seed.json'));
  await mkdir(OUTPUT_DIR, { recursive: true });

  const server = process.env.ARES_BASELINE_BASE_URL ? null : startServer();
  server?.stdout.on('data', (chunk) => process.stdout.write(chunk));
  server?.stderr.on('data', (chunk) => process.stderr.write(chunk));

  try {
    await waitForServer(BASE_URL);

    const browser = await chromium.launch({ headless: true });
    try {
      for (const viewport of viewports) {
        const page = await browser.newPage({
          deviceScaleFactor: viewport.isMobile ? 2 : 1,
          isMobile: viewport.isMobile,
          viewport: { width: viewport.width, height: viewport.height },
        });
        const errors = [];
        page.on('console', (message) => {
          if (message.type() === 'error') {
            errors.push(message.text());
          }
        });
        page.on('pageerror', (error) => errors.push(error.message));

        await page.goto(BASE_URL, { waitUntil: 'networkidle' });
        const result = await page.evaluate(() => ({
          hasLegacyApp: Number(Boolean(document.querySelector('[data-ares-app="true"]'))),
          hasReactApp: Number(Boolean(document.querySelector('[data-ares-react-app]'))),
          overflow: document.documentElement.scrollWidth > window.innerWidth,
        }));
        if (errors.length || !result.hasLegacyApp || result.hasReactApp || result.overflow) {
          throw new Error(`${viewport.name} baseline check failed: ${JSON.stringify({ errors, ...result })}`);
        }

        await page.screenshot({
          fullPage: true,
          path: path.join(OUTPUT_DIR, `${viewport.name}.png`),
        });
        await page.close();
      }
    } finally {
      await browser.close();
    }
  } finally {
    await stopServer(server);
  }
}

await rm(OUTPUT_DIR, { force: true, recursive: true });
await captureBaseline();
console.log(`Captured React port baseline screenshots in ${path.relative(ROOT_DIR, OUTPUT_DIR)}`);
