import { expect, test } from '@playwright/test';

const reactParityEnabled = process.env.ARES_REACT_PARITY === '1';
const fullParityEnabled = process.env.ARES_REACT_FULL_PARITY === '1';

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
    const failure = request.failure()?.errorText || '';
    if (request.url().includes('/events') && /ERR_ABORTED/i.test(failure)) {
      return;
    }
    if (/\/api\/reading-sessions\/[^/]+\/pdf$/.test(new URL(request.url()).pathname) && /ERR_ABORTED/i.test(failure)) {
      return;
    }
    failedRequests.push(`${request.method()} ${request.url()} ${failure}`.trim());
  });

  return {
    assertClean() {
      expect(browserErrors).toEqual([]);
      expect(failedRequests).toEqual([]);
    },
  };
}

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1 || document.body.scrollWidth > window.innerWidth + 1,
  );
  expect(overflow).toBe(false);
}

async function expectBottomNavDoesNotCoverVisibleContent(page) {
  const covered = await page.evaluate(() => {
    const nav = document.querySelector('[data-ares-surface="bottom-nav"]');
    if (!nav || getComputedStyle(nav).display === 'none') {
      return [];
    }

    const navRect = nav.getBoundingClientRect();
    const points = [
      [navRect.left + 24, navRect.top + 8],
      [navRect.left + navRect.width / 2, navRect.top + 8],
      [navRect.right - 24, navRect.top + 8],
      [navRect.left + navRect.width / 2, navRect.bottom - 8],
    ];

    return points
      .map(([x, y]) => {
        const visibleStack = document.elementsFromPoint(x, y);
        const firstNonNav = visibleStack.find(
          (element) => !nav.contains(element) && element !== nav && element.tagName !== 'HTML' && element.tagName !== 'BODY',
        );
        if (!firstNonNav || firstNonNav.classList.contains('app-shell')) {
          return null;
        }
        return {
          className: String(firstNonNav.className || ''),
          tagName: firstNonNav.tagName,
          text: (firstNonNav.textContent || '').trim().slice(0, 80),
        };
      })
      .filter(Boolean);
  });

  expect(covered).toEqual([]);
}

async function expectReactRoute(page, route, surface, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(`/?reactParity=${encodeURIComponent(route)}#/projects/rag-reranker/${route}`, { waitUntil: 'networkidle' });
  await expect(page.locator('[data-ares-react-app]')).toBeVisible();
  await expect(page.locator(`[data-ares-surface="${surface}"]`)).toBeVisible();
  await expect(page.locator('[data-ares-surface="workspace"]')).toHaveAttribute('data-ares-stage', route);
  await expectNoHorizontalOverflow(page);
  await expectBottomNavDoesNotCoverVisibleContent(page);
}

test.describe('React opt-in ARES parity smoke', () => {
  test.skip(!reactParityEnabled, 'Set ARES_REACT_PARITY=1 and ARES_E2E_BASE_URL to the React opt-in server.');

  for (const [name, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['tablet', { width: 768, height: 1024 }],
    ['small mobile', { width: 320, height: 740 }],
    ['mobile', { width: 375, height: 812 }],
  ]) {
    test(`preserves React opt-in chrome and completed surfaces on ${name}`, async ({ page }) => {
      const diagnostics = collectBrowserDiagnostics(page);

      for (const [route, surface] of [
        ['search', 'search-stage'],
        ['reading', 'reading-stage'],
        ['research', 'lab-stage'],
        ['result', 'lab-stage'],
        ['insight', 'insight-stage'],
        ['writing', 'writing-stage'],
      ]) {
        await expectReactRoute(page, route, surface, viewport);
      }

      if (viewport.width >= 901) {
        await expect(page.locator('.desktop-sidebar')).toBeVisible();
        await expect(page.locator('[data-ares-surface="bottom-nav"]')).toBeHidden();
      } else {
        await expect(page.locator('.desktop-sidebar')).toBeHidden();
        await expect(page.locator('[data-ares-surface="bottom-nav"]')).toBeVisible();
      }

      diagnostics.assertClean();
    });
  }
});

test.describe('React full cutover parity gate', () => {
  test.skip(!fullParityEnabled, 'Set ARES_REACT_FULL_PARITY=1 only when Reader detail/PDF host is ready for default cutover.');

  test('keeps browser hash changes in sync with the React workspace stage', async ({ page }) => {
    const diagnostics = collectBrowserDiagnostics(page);

    await page.goto('/#/projects/rag-reranker/search', { waitUntil: 'networkidle' });
    await expect(page.locator('[data-ares-react-app]')).toBeVisible();
    await expect(page.locator('[data-ares-surface="workspace"]')).toHaveAttribute('data-ares-stage', 'search');

    await page.evaluate(() => {
      globalThis.location.hash = '#/projects/rag-reranker/writing';
    });
    await expect(page.locator('[data-ares-surface="workspace"]')).toHaveAttribute('data-ares-stage', 'writing');
    await expect(page.locator('[data-ares-surface="writing-stage"]')).toBeVisible();

    diagnostics.assertClean();
  });

  test('requires Reader detail to preserve the existing PDF host before React can be default', async ({ page, request }) => {
    const diagnostics = collectBrowserDiagnostics(page);
    const paperId = `react-cutover-reader-${Date.now()}`;
    const created = await request.post('/api/projects/rag-reranker/reading-sessions', {
      data: {
        paper: {
          abstract: 'Reader detail parity guard paper.',
          authors: ['ARES QA'],
          keyPoints: [],
          paperId,
          paperUrl: `https://example.org/papers/${paperId}`,
          pdfUrl: `https://example.org/papers/${paperId}.pdf`,
          sourceProvider: 'e2e',
          summary: 'Reader detail parity guard paper.',
          title: 'React Cutover Reader Detail Guard',
          venue: 'ARES QA',
          year: 2026,
        },
      },
    });
    expect(created.ok()).toBeTruthy();
    const payload = await created.json();

    await page.goto(`/#/projects/rag-reranker/reading/sessions/${encodeURIComponent(payload.readingSession.id)}/pdf`, {
      waitUntil: 'networkidle',
    });
    await expect(page.locator('[data-ares-react-app]')).toBeVisible();
    await expect(page.locator('[data-reading-pdf-host="true"]')).toBeVisible();
    await expect(page.locator('.reading-pdf-canvas').first()).toBeVisible();
    await expect(page.locator('.reading-pdf-text-layer span').first()).toBeAttached();
    await expect(page.locator('.reading-chat-input textarea[name="readingChatMessage"]')).toBeVisible();
    await expect(page.locator('.reading-chat-send')).toBeVisible();
    await expect(page.locator('.reading-chat-footer')).not.toContainText('reader-agent');
    const workbench = page.locator('.reading-workbench-pane');
    await workbench.getByRole('button', { name: /Notes/ }).click();
    await expect(page.locator('.reading-notes-wrap')).toBeVisible();
    await expect(workbench.getByRole('button', { name: /New note/ })).toBeVisible();
    await workbench.getByRole('button', { name: /Chat/ }).click();
    const initialCanvasBox = await page.locator('.reading-pdf-canvas').first().boundingBox();
    await page.getByLabel('확대').click();
    await expect(page.locator('.zoom-val')).toHaveText('110%');
    await expect.poll(async () => (await page.locator('.reading-pdf-canvas').first().boundingBox())?.width || 0).toBeGreaterThan(
      initialCanvasBox?.width || 0,
    );
    await page.getByLabel('축소').click();
    await expect(page.locator('.zoom-val')).toHaveText('100%');
    await expectNoHorizontalOverflow(page);

    diagnostics.assertClean();
  });

  test('keeps Reader workbench reachable on tablet and mobile detail routes', async ({ page, request }) => {
    const diagnostics = collectBrowserDiagnostics(page);
    const paperId = `react-cutover-mobile-workbench-${Date.now()}`;
    const created = await request.post('/api/projects/rag-reranker/reading-sessions', {
      data: {
        paper: {
          abstract: 'Reader mobile workbench guard paper.',
          authors: ['ARES QA'],
          paperId,
          paperUrl: `https://example.org/papers/${paperId}`,
          pdfUrl: `https://example.org/papers/${paperId}.pdf`,
          sourceProvider: 'e2e',
          summary: 'Reader mobile workbench guard paper.',
          title: 'React Cutover Mobile Workbench Guard',
          venue: 'ARES QA',
          year: 2026,
        },
      },
    });
    expect(created.ok()).toBeTruthy();
    const payload = await created.json();

    for (const viewport of [
      { width: 768, height: 1024 },
      { width: 375, height: 812 },
      { width: 320, height: 740 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`/#/projects/rag-reranker/reading/sessions/${encodeURIComponent(payload.readingSession.id)}/pdf`, {
        waitUntil: 'networkidle',
      });
      await expect(page.locator('.reading-workbench-pane')).toBeVisible();
      await expect(page.locator('.reading-chat-input textarea[name="readingChatMessage"]')).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }

    diagnostics.assertClean();
  });
});
