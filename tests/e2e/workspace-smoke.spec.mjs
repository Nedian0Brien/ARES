import { expect, test } from '@playwright/test';

function collectBrowserDiagnostics(page, { allowedBrowserErrors = [] } = {}) {
  const browserErrors = [];
  const failedRequests = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      const text = message.text();
      if (!allowedBrowserErrors.some((pattern) => pattern.test(text))) {
        browserErrors.push(text);
      }
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

    failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`.trim());
  });

  return {
    assertClean() {
      expect(browserErrors).toEqual([]);
      expect(failedRequests).toEqual([]);
    },
  };
}

async function createParsedReadingSession(request) {
  const paperId = `e2e-pdf-reader-flow-${Date.now()}`;
  const created = await request.post('/api/projects/rag-reranker/reading-sessions', {
    data: {
      paper: {
        abstract: 'A deterministic e2e paper for validating ARES Reader PDF navigation and Lab handoff.',
        authors: ['ARES E2E'],
        keyPoints: ['Reader parses the PDF.', 'Notes can move to Lab.'],
        paperId,
        paperUrl: `https://example.org/papers/${paperId}`,
        pdfUrl: `https://example.org/papers/${paperId}.pdf`,
        sourceProvider: 'e2e',
        summary: 'A deterministic paper for Reader flow smoke tests.',
        title: 'E2E Reader Flow Demo',
        venue: 'ARES QA',
        year: 2026,
      },
      status: 'todo',
    },
  });
  expect(created.ok()).toBeTruthy();
  const createdPayload = await created.json();
  const sessionId = createdPayload.readingSession.id;

  const parsed = await request.post(`/api/reading-sessions/${encodeURIComponent(sessionId)}/parse`);
  expect(parsed.ok()).toBeTruthy();
  const parsedPayload = await parsed.json();
  expect(parsedPayload.session.parseStatus).toBe('done');
  expect(parsedPayload.session.notes.length).toBeGreaterThan(0);

  return parsedPayload.session;
}

async function createOcrRecoveryReadingSession(request) {
  const id = `e2e-ocr-import-${Date.now()}`;
  const title = `E2E OCR Import Demo ${id}`;
  const created = await request.post('/api/projects/rag-reranker/reading-sessions', {
    data: {
      paper: {
        abstract: 'A scanned paper placeholder that needs external OCR text for Reader recovery.',
        authors: ['ARES E2E'],
        keyPoints: [],
        paperId: id,
        paperUrl: 'https://example.org/papers/e2e-ocr-import',
        pdfUrl: 'https://invalid.localhost/ares-e2e-scanned.pdf',
        sourceProvider: 'e2e',
        summary: '',
        title,
        venue: 'ARES QA',
        year: 2026,
      },
      status: 'todo',
    },
  });
  expect(created.ok()).toBeTruthy();
  const createdPayload = await created.json();
  const sessionId = createdPayload.readingSession.id;

  const parsed = await request.post(`/api/reading-sessions/${encodeURIComponent(sessionId)}/parse`);
  expect(parsed.ok()).toBeTruthy();
  const parsedPayload = await parsed.json();
  expect(parsedPayload.session.parseStatus).toBe('error');

  return parsedPayload.session;
}

test('ARES workspace loads core tabs without browser errors', async ({ page }) => {
  const diagnostics = collectBrowserDiagnostics(page);

  await page.goto('/');
  await expect(page.locator('[data-ares-role="workflow-mode-nav"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Research Queue' })).toBeVisible();

  await page.locator('[data-action="select-stage"][data-stage-id="reading"]').click();
  await expect(page.getByRole('heading', { name: 'Reading Library' })).toBeVisible();

  for (const tabId of ['lab', 'insight', 'writing', 'papers']) {
    await page.locator(`[data-action="select-workflow-tab"][data-tab-id="${tabId}"]`).first().click();
  }

  await page.locator('[data-action="select-stage"][data-stage-id="reading"]').click();
  await expect(page.getByRole('heading', { name: 'Reading Library' })).toBeVisible();
  diagnostics.assertClean();
});

test('Reader imports external OCR text to recover an unparsed paper', async ({ page, request }) => {
  const diagnostics = collectBrowserDiagnostics(page, {
    allowedBrowserErrors: [/Failed to load resource: the server responded with a status of 409 \(Conflict\)/],
  });
  const session = await createOcrRecoveryReadingSession(request);

  await page.goto(`/#/projects/rag-reranker/reading/sessions/${encodeURIComponent(session.id)}/pdf?workbench=chat`);
  await expect(page.locator('.reading-metabar-title')).toHaveText(session.title);
  const textImportForm = page.locator('[data-action="submit-reading-text-import-form"]:visible');
  await expect(textImportForm).toBeVisible();
  await expect(textImportForm.getByText('Built-in OCR fallback')).toBeVisible();
  await expect(textImportForm.locator('[name="readingTextImportSource"]')).toHaveValue('External OCR import');
  await textImportForm.locator('[name="readingTextImport"]').fill([
    'Abstract',
    'External OCR text restores Reader parsing for scanned papers.',
    'Method',
    'The user pastes extracted text from an external OCR tool.',
    'Results',
    'Recovered text produces sections, notes, summary cards, and chat citations.',
  ].join('\n'));
  const importResponse = page.waitForResponse((response) =>
    response.url().includes(`/api/reading-sessions/${encodeURIComponent(session.id)}/import-text`) &&
    response.request().method() === 'POST',
  );
  await textImportForm.locator('button[type="submit"]').click();
  expect((await importResponse).ok()).toBeTruthy();

  await expect(page.locator('[data-reading-document-tab="summary"]')).toHaveClass(/active/);
  await expect(page.locator('.reading-summary-body').first()).toContainText(/External OCR text/i);
  await expect.poll(async () => {
    const response = await request.get('/api/projects/rag-reranker/reading-sessions');
    const nextSession = (await response.json()).results.find((entry) => entry.id === session.id);
    return nextSession?.parseStatus;
  }).toBe('done');

  diagnostics.assertClean();
});

test('Reader PDF navigation, selection note, and Lab handoff work together', async ({ page, request }) => {
  const diagnostics = collectBrowserDiagnostics(page);
  const session = await createParsedReadingSession(request);
  const route = `/#/projects/rag-reranker/reading/sessions/${encodeURIComponent(session.id)}/pdf?workbench=notes`;

  await page.goto(route);
  await expect(page.locator('[data-reading-pdf-host="true"]')).toBeVisible();
  await expect(page.locator('[data-reading-pdf-page="1"]')).toBeVisible();
  await expect(page.locator('.reading-note-card').first()).toBeVisible();
  await expect(page.locator('.reading-pdf-annotation-marker').first()).toBeVisible();

  await page.locator('[data-action="toggle-reading-pdf-dock-panel"][data-reading-pdf-dock-panel="search"]').click();
  await expect(page.locator('.pdf-search-panel.visible')).toBeVisible();
  await page.locator('[name="readingPdfSearchQuery"]').fill('deterministic');
  await expect(page.locator('.pdf-search-result').first()).toBeVisible();
  await page.locator('.pdf-search-result').first().click();
  await expect(page.locator('[data-reading-pdf-page="1"]')).toHaveClass(/is-targeted/);

  const initialPdfWidth = await page.locator('[data-reading-pdf-page="1"] .reading-pdf-page-surface').evaluate((node) =>
    Math.round(node.getBoundingClientRect().width),
  );
  await page.locator('[data-action="set-reading-pdf-zoom"][data-reading-pdf-zoom-delta="10"]').click();
  await expect(page.locator('.zoom-val')).toContainText('110%');
  await expect
    .poll(async () =>
      page.locator('[data-reading-pdf-page="1"] .reading-pdf-page-surface').evaluate((node) =>
        Math.round(node.getBoundingClientRect().width),
      ),
    )
    .toBeGreaterThan(initialPdfWidth);
  await page.locator('[data-action="fit-reading-pdf-zoom"]').click();
  await expect(page.locator('.zoom-val')).toContainText('100%');

  await page.locator('[data-action="toggle-reading-pdf-dock-panel"][data-reading-pdf-dock-panel="pageGrid"]').click();
  await expect(page.locator('.page-grid-panel.visible')).toBeVisible();
  await page.locator('.page-grid-item').first().click();
  await expect(page.locator('[data-reading-pdf-page="1"]')).toHaveClass(/is-targeted/);

  const jumpButton = page.locator('.reading-note-card [data-action="jump-reading-page"]:not([disabled])').first();
  const jumpPage = await jumpButton.getAttribute('data-reading-page');
  await jumpButton.click();
  await expect(page.locator(`[data-reading-pdf-page="${jumpPage}"]`)).toHaveClass(/is-targeted/);

  const textLayer = page.locator('.reading-pdf-text-layer span').first();
  await expect(textLayer).toBeVisible();
  await page.evaluate(() => {
    const textNode = document.querySelector('.reading-pdf-text-layer span')?.firstChild;
    if (!textNode) {
      throw new Error('PDF text layer is missing selectable text.');
    }

    const range = document.createRange();
    range.selectNodeContents(textNode);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await expect(page.locator('.reading-pdf-dock-layer.has-selection')).toBeVisible();

  const beforeNotes = await request.get(`/api/projects/rag-reranker/reading-sessions`);
  const beforeSession = (await beforeNotes.json()).results.find((entry) => entry.id === session.id);
  const beforeNoteCount = beforeSession.notes.length;

  await page.locator('[data-action="create-reading-note-from-selection"]').click();
  await expect.poll(async () => {
    const response = await request.get(`/api/projects/rag-reranker/reading-sessions`);
    const nextSession = (await response.json()).results.find((entry) => entry.id === session.id);
    return nextSession.notes.length;
  }).toBeGreaterThan(beforeNoteCount);

  await page.locator('[data-action="set-reading-document-tab"][data-reading-document-tab="assets"]').click();
  await expect(page.locator('.reading-asset-card').first()).toBeVisible();
  await page.locator('.reading-asset-card').first().click();
  await expect(page.locator('.reading-asset-detail')).toBeVisible();
  await expect(page.locator('[data-action="copy-reading-asset-citation"]')).toBeVisible();
  await expect(page.locator('[data-action="create-reading-asset-evidence"]')).toBeVisible();

  await page.locator('.reading-asset-detail [data-action="jump-reading-page"]:not([disabled])').first().click();
  await expect(page.locator('.reading-pdf-source-highlight')).toBeVisible();

  await page.locator('[data-action="set-reading-document-tab"][data-reading-document-tab="assets"]').click();
  await expect(page.locator('.reading-asset-detail')).toBeVisible();

  const beforeGraph = await request.get('/api/projects/rag-reranker/graph');
  const beforeEvidenceCount = (await beforeGraph.json()).evidenceLinks.length;
  await page.locator('[data-action="create-reading-asset-evidence"]').click();
  await expect.poll(async () => {
    const response = await request.get('/api/projects/rag-reranker/graph');
    return (await response.json()).evidenceLinks.length;
  }).toBeGreaterThan(beforeEvidenceCount);

  await page.locator('[data-action="handoff-reading-to-research"]').click();
  await expect(page.getByRole('heading', { name: 'Plan reproduction run' })).toBeVisible();
  await expect(page.locator('.lab-handoff-context')).toContainText(/notes ·/);
  diagnostics.assertClean();
});

test('Mobile bottom nav can drive Read and Reader PDF dock flows', async ({ page, request }) => {
  const diagnostics = collectBrowserDiagnostics(page);
  const session = await createParsedReadingSession(request);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const bottomNav = page.locator('[data-ares-surface="bottom-nav"]');
  await expect(bottomNav).toBeVisible();
  await expect(bottomNav.locator('[data-bottom-nav-tab="papers"]')).toBeVisible();

  for (const tabId of ['lab', 'insight', 'writing', 'papers']) {
    await bottomNav.locator(`[data-bottom-nav-tab="${tabId}"]`).click();
    await expect(bottomNav.locator(`[data-bottom-nav-tab="${tabId}"]`)).toHaveClass(/active/);
  }

  await page.locator('[data-action="select-stage"][data-stage-id="reading"]').click();
  await expect(page.getByRole('heading', { name: 'Reading Library' })).toBeVisible();

  await page.goto(`/#/projects/rag-reranker/reading/sessions/${encodeURIComponent(session.id)}/pdf?workbench=notes`);
  await expect(page.locator('[data-reading-pdf-host="true"]')).toBeVisible();
  await expect(page.locator('.reading-pdf-text-layer span').first()).toBeVisible();

  await page.locator('[data-action="toggle-reading-pdf-dock-panel"][data-reading-pdf-dock-panel="search"]').click();
  await expect(page.locator('.pdf-search-panel.visible')).toBeVisible();
  await page.locator('[name="readingPdfSearchQuery"]').fill('reader');
  await expect(page.locator('.pdf-search-result').first()).toBeVisible();

  await page.locator('[data-action="set-reading-pdf-zoom"][data-reading-pdf-zoom-delta="10"]').click();
  await expect(page.locator('.zoom-val')).toContainText('110%');
  await page.locator('[data-action="fit-reading-pdf-zoom"]').click();
  await expect(page.locator('.zoom-val')).toContainText('100%');

  await page.locator('[data-action="toggle-reading-pdf-dock-panel"][data-reading-pdf-dock-panel="pageGrid"]').click();
  await expect(page.locator('.page-grid-panel.visible')).toBeVisible();
  await expect(page.locator('.page-grid-item').first()).toBeVisible();
  await expect(page.locator('.reading-pdf-text-layer span').first()).toBeVisible();

  await page.evaluate(() => {
    const textNode = document.querySelector('.reading-pdf-text-layer span')?.firstChild;
    if (!textNode) {
      throw new Error('PDF text layer is missing selectable text.');
    }

    const range = document.createRange();
    range.selectNodeContents(textNode);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await expect(page.locator('.reading-pdf-dock-layer.has-selection')).toBeVisible();
  await expect(page.locator('[data-action="create-reading-note-from-selection"]')).toBeVisible();

  const navBox = await bottomNav.boundingBox();
  const dockBox = await page.locator('.reading-pdf-dock-layer.has-selection').boundingBox();
  expect(navBox).not.toBeNull();
  expect(dockBox).not.toBeNull();
  expect(dockBox.y + dockBox.height).toBeLessThanOrEqual(navBox.y + 1);
  diagnostics.assertClean();
});
