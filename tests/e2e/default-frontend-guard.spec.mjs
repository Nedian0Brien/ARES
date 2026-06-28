import { expect, test } from '@playwright/test';

function collectBrowserDiagnostics(page) {
  const browserErrors = [];
  const failedRequests = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      browserErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    browserErrors.push(error.message);
  });
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`.trim());
  });

  return {
    assertClean() {
      expect(browserErrors).toEqual([]);
      expect(failedRequests).toEqual([]);
    },
  };
}

async function expectReactDefaultFrontend(page) {
  await page.goto('/');
  await expect(page.locator('[data-ares-react-app]')).toBeVisible();
  await expect(page.locator('[data-ares-app="true"]')).toHaveCount(0);
  await expect(page.locator('[data-ares-surface="workspace"]')).toBeVisible();

  const loadedAssets = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    scripts: [...document.querySelectorAll('script[src]')].map((script) => script.getAttribute('src')),
    stylesheets: [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => link.getAttribute('href')),
  }));

  expect(loadedAssets.overflow).toBe(false);
  expect(loadedAssets.scripts.some((src) => /\/assets\/index-.*\.js/.test(src || ''))).toBe(true);
  expect(loadedAssets.scripts.some((src) => /app\.js/.test(src || ''))).toBe(false);
  expect(loadedAssets.stylesheets.some((src) => /\/assets\/index-.*\.css/.test(src || ''))).toBe(true);
}

test('default desktop frontend serves the React ARES port', async ({ page }) => {
  const diagnostics = collectBrowserDiagnostics(page);

  await page.setViewportSize({ width: 1440, height: 980 });
  await expectReactDefaultFrontend(page);
  await expect(page.locator('.desktop-sidebar')).toBeVisible();
  await expect(page.locator('[data-ares-surface="bottom-nav"]')).toBeHidden();

  diagnostics.assertClean();
});

test('default mobile frontend serves the React ARES port', async ({ page }) => {
  const diagnostics = collectBrowserDiagnostics(page);

  await page.setViewportSize({ width: 375, height: 812 });
  await expectReactDefaultFrontend(page);
  await expect(page.locator('.desktop-sidebar')).toBeHidden();
  await expect(page.locator('[data-ares-surface="bottom-nav"]')).toBeVisible();

  diagnostics.assertClean();
});
