import { Buffer } from 'node:buffer';

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

async function deleteProjectAsset(request, collectionPath, id) {
  if (!id) return;
  const response = await request.delete(`/api/projects/rag-reranker/${collectionPath}/${encodeURIComponent(id)}`, {
    data: {
      confirmDelete: true,
      reason: `cleanup temporary ${collectionPath} e2e asset created by Playwright`,
    },
    timeout: 5000,
  });
  expect(response.ok() || response.status() === 404).toBeTruthy();
}

async function deleteLibraryPaper(request, paperId) {
  if (!paperId) return;
  const response = await request.delete(`/api/projects/rag-reranker/library/${encodeURIComponent(paperId)}`);
  expect(response.ok() || response.status() === 404).toBeTruthy();
}

async function expectVisibleDisabledButtonsToLookDisabled(page, rootSelector = '.main') {
  const offenders = await page.evaluate((selector) => {
    const root = document.querySelector(selector) || document;
    return Array.from(root.querySelectorAll('button:disabled'))
      .filter((button) => {
        const rect = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.right > 0 &&
          rect.top < window.innerHeight &&
          rect.left < window.innerWidth &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        );
      })
      .map((button) => {
        const style = getComputedStyle(button);
        return {
          className: button.className,
          cursor: style.cursor,
          label: button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent.trim(),
          opacity: Number(style.opacity),
        };
      })
      .filter((button) => button.cursor === 'pointer' || button.opacity > 0.8);
  }, rootSelector);
  expect(offenders).toEqual([]);
}

test('React workspace loads the four top-level tabs without browser errors', async ({ page, request }) => {
  const diagnostics = collectBrowserDiagnostics(page);
  const libraryPayload = await (await request.get('/api/projects/rag-reranker/library')).json();
  const firstPaperTitle = libraryPayload.results?.[0]?.title || '';

  await page.goto('/');
  const workspaceNav = page.getByRole('navigation', { name: '주요 작업 영역' });
  await expect(workspaceNav).toBeVisible();
  await expect(workspaceNav.getByRole('button')).toHaveCount(4);
  await expect(page.getByRole('main', { name: 'Reading 작업 영역' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reading 작업 영역 열기' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.metabar .title')).toHaveText('라이브러리');
  await expect(page.locator('.lib-count')).toContainText(String(libraryPayload.results?.length || 0));
  if (firstPaperTitle) {
    await expect(page.locator('.lib-row', { hasText: firstPaperTitle })).toBeVisible();
  } else {
    await expect(page.getByText('저장된 논문이 없습니다.')).toBeVisible();
  }

  await page.getByRole('button', { name: 'Lab 작업 영역 열기' }).click();
  await expect(page.getByRole('button', { name: 'Lab 작업 영역 열기' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('main', { name: 'Lab 작업 영역' })).toBeVisible();
  await expect(page.locator('.metabar .title')).toHaveText('프로젝트');

  await page.getByRole('button', { name: 'Wiki 작업 영역 열기' }).click();
  await expect(page.getByRole('button', { name: 'Wiki 작업 영역 열기' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('main', { name: 'Wiki 작업 영역' })).toBeVisible();
  await expect(page.locator('.metabar .title')).toHaveText('Knowledge map');
  await expect(page.locator('.wiki-explorer')).toBeVisible();

  await page.getByRole('button', { name: 'Agent 작업 영역 열기' }).click();
  await expect(page.getByRole('button', { name: 'Agent 작업 영역 열기' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('main', { name: 'Agent 작업 영역' })).toBeVisible();
  await expect(page.locator('.ag-box textarea')).toBeVisible();

  diagnostics.assertClean();
});

test('Agent tab shows a load failure state instead of an empty thread list', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route('**/api/projects/rag-reranker/agent/threads**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      status: 500,
      body: JSON.stringify({ error: 'temporary e2e failure' }),
    });
  });

  await page.goto('/#/projects/rag-reranker/agent');
  await expect(page.getByRole('main', { name: 'Agent 작업 영역' })).toBeVisible();
  await expect(page.locator('.ag-conv').getByText('Agent 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')).toBeVisible();
  await expect(page.getByText('아직 스레드가 없습니다.')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '컨텍스트 추가' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '컨텍스트', exact: true })).toBeDisabled();
  const width = await page.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth));
  expect(width).toBeLessThanOrEqual(320);

  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto('/#/projects/rag-reranker/agent');
  await expect(page.locator('.float-panel').getByText('Agent 데이터를 불러오지 못했습니다.', { exact: true })).toBeVisible();
  await expect(page.locator('.metabar').getByRole('button', { name: 'Context' })).toBeDisabled();
  await expect(page.locator('.metabar').getByRole('button', { name: '공유' })).toBeDisabled();
  await expect(page.locator('.metabar').getByRole('button', { name: '더보기' })).toBeDisabled();
});

test('Reading library renders server-backed tags, collections, and flags', async ({ page, request }) => {
  const diagnostics = collectBrowserDiagnostics(page);
  const paperId = 'e2e-library-meta';

  try {
    const created = await request.post('/api/projects/rag-reranker/library', {
      data: {
        paper: {
          abstract: 'Temporary e2e library metadata paper.',
          authors: ['E2E Tester'],
          collectionIds: ['c-e2e'],
          flag: true,
          keywords: ['e2e'],
          paperId,
          readingProgress: 100,
          sourceName: 'Playwright',
          sourceProvider: 'e2e',
          tags: ['e2e-meta'],
          title: 'E2E Library Metadata Paper',
          venue: 'ARES E2E',
          year: 2026,
        },
      },
    });
    expect(created.ok()).toBeTruthy();

    const filtered = await (await request.get('/api/projects/rag-reranker/library?shelf=flag&collection=c-e2e&tag=e2e-meta')).json();
    expect(filtered.results.map((paper) => paper.paperId)).toContain(paperId);

    await page.goto('/');
    const row = page.locator('.lib-row.flagged', { hasText: 'E2E Library Metadata Paper' });
    await expect(row).toBeVisible();
    await expect(row.locator('.lib-tag', { hasText: 'e2e-meta' })).toBeVisible();

    await page.getByLabel('라이브러리 검색').fill('E2E Library Metadata Paper');
    await expect(page.locator('.lib-body')).toHaveAttribute('data-library-query', /q=E2E\+Library\+Metadata\+Paper/);
    await expect(row).toBeVisible();
    await expect(page.locator('.lib-count')).toContainText('1 /');

    await page.locator('.lib-tagc', { hasText: 'e2e-meta' }).click();
    await expect(page.locator('.lib-body')).toHaveAttribute('data-library-query', /tag=e2e-meta/);
    await expect(row).toBeVisible();

    await page.locator('.lib-shelf', { hasText: '중요 표시' }).click();
    await expect(page.locator('.lib-body')).toHaveAttribute('data-library-query', /shelf=flag/);
    await expect(row).toBeVisible();

    diagnostics.assertClean();
  } finally {
    await deleteLibraryPaper(request, paperId);
  }
});

test('Reading library uploads a PDF through the React action', async ({ page, request }) => {
  const diagnostics = collectBrowserDiagnostics(page);
  const uploadedPaperIds = [];

  try {
    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles({
      buffer: Buffer.from('%PDF-1.4\n%%EOF'),
      mimeType: 'application/pdf',
      name: 'e2e-upload.pdf',
    });

    await expect(page.getByText('추가했습니다.')).toBeVisible();
    await expect(page.locator('.lib-row', { hasText: 'e2e-upload' })).toBeVisible();

    const uploaded = await (await request.get('/api/projects/rag-reranker/library?q=e2e-upload')).json();
    for (const paper of uploaded.results || []) {
      if (paper.title === 'e2e-upload') {
        uploadedPaperIds.push(paper.paperId);
      }
    }
    expect(uploadedPaperIds.length).toBeGreaterThan(0);

    diagnostics.assertClean();
  } finally {
    const uploaded = await (await request.get('/api/projects/rag-reranker/library?q=e2e-upload')).json();
    for (const paper of uploaded.results || []) {
      if (paper.title === 'e2e-upload' && !uploadedPaperIds.includes(paper.paperId)) {
        uploadedPaperIds.push(paper.paperId);
      }
    }
    for (const paperId of uploadedPaperIds) {
      await deleteLibraryPaper(request, paperId);
    }
  }
});

test('Reading reader hydrates a real session PDF in the React PDF tab', async ({ page, request }) => {
  const diagnostics = collectBrowserDiagnostics(page);
  const paperId = `e2e-react-pdf-${Date.now()}`;
  let sessionId = '';

  try {
    const created = await request.post('/api/projects/rag-reranker/reading-sessions', {
      data: {
        paper: {
          abstract: 'A deterministic e2e paper for React PDF hydration.',
          authors: ['ARES E2E'],
          keyPoints: ['PDF renders through the React reader.'],
          paperId,
          paperUrl: `https://example.org/papers/${paperId}`,
          pdfUrl: `https://example.org/papers/${paperId}.pdf`,
          sourceProvider: 'e2e',
          summary: 'A deterministic React PDF hydration paper.',
          title: 'E2E React PDF Hydration',
          venue: 'ARES QA',
          year: 2026,
        },
      },
    });
    expect(created.ok()).toBeTruthy();
    sessionId = (await created.json()).readingSession.id;

    await page.goto(`/#/projects/rag-reranker/reading/sessions/${encodeURIComponent(sessionId)}/pdf`);
    await expect(page.locator('[data-reading-pdf-host="true"]')).toBeVisible();
    await expect(page.locator('.reading-pdf-canvas').first()).toBeVisible();
    await expect(page.locator('.reading-pdf-text-layer span').first()).toBeVisible();
    const textLayerSelectionStyle = await page.locator('.reading-pdf-text-layer').first().evaluate((layer) => {
      const layerStyle = window.getComputedStyle(layer);
      const selectionStyle = window.getComputedStyle(layer, '::selection');
      const firstTextRun = layer.querySelector('span:not(.markedContent)');
      const firstTextRunStyle = firstTextRun ? window.getComputedStyle(firstTextRun) : null;
      return {
        opacity: layerStyle.opacity,
        selectionBackground: selectionStyle.backgroundColor,
        textRunPosition: firstTextRunStyle?.position || '',
        textRunTransformOrigin: firstTextRunStyle?.transformOrigin || '',
        textRunWhiteSpace: firstTextRunStyle?.whiteSpace || '',
      };
    });
    expect(Number(textLayerSelectionStyle.opacity)).toBeGreaterThan(0.95);
    expect(textLayerSelectionStyle.selectionBackground).not.toMatch(/^(transparent|rgba\(0,\s*0,\s*0,\s*0\))$/);
    expect(textLayerSelectionStyle.textRunPosition).toBe('absolute');
    expect(textLayerSelectionStyle.textRunTransformOrigin).toMatch(/^0(px)? 0(px)?/);
    expect(textLayerSelectionStyle.textRunWhiteSpace).toBe('pre');

    diagnostics.assertClean();
  } finally {
    await deleteLibraryPaper(request, paperId);
  }
});

test('Reading PDF smart selection snaps to words and clamps paragraph overflow', async ({ page, request }) => {
  const diagnostics = collectBrowserDiagnostics(page);
  const paperId = `e2e-smart-pdf-selection-${Date.now()}`;
  let existingNoteId = '';
  let sessionId = '';

  try {
    const created = await request.post('/api/projects/rag-reranker/reading-sessions', {
      data: {
        paper: {
          abstract: 'A deterministic e2e paper for validating smart PDF text selection.',
          authors: ['ARES E2E'],
          keyPoints: ['PDF drag selection stays word bounded.'],
          paperId,
          paperUrl: `https://example.org/papers/${paperId}`,
          pdfUrl: `https://example.org/papers/${paperId}.pdf`,
          sourceProvider: 'e2e',
          summary: 'A deterministic smart selection paper.',
          title: 'E2E Smart Selection Boundary',
          venue: 'ARES QA',
          year: 2026,
        },
      },
    });
    expect(created.ok()).toBeTruthy();
    sessionId = (await created.json()).readingSession.id;
    const noteResponse = await request.post(`/api/reading-sessions/${encodeURIComponent(sessionId)}/notes`, {
      data: {
        body: 'Existing synthesis note',
        kind: 'note',
      },
    });
    expect(noteResponse.ok()).toBeTruthy();
    existingNoteId = (await noteResponse.json()).note.id;

    await page.goto(`/#/projects/rag-reranker/reading/sessions/${encodeURIComponent(sessionId)}/pdf`);
    await expect.poll(() => page.evaluate(() => window.location.hash)).toContain(`/reading/sessions/${encodeURIComponent(sessionId)}/pdf`);

    await expect(page.locator('.reading-pdf-text-layer span').first()).toBeVisible();
    await page.getByRole('button', { name: '페이지 미리보기' }).click();
    await expect(page.locator('.dock-pages .pgt.has-image img')).toHaveCount(3);
    const previewImages = await page.locator('.dock-pages .pgt.has-image img').evaluateAll((images) => images.map((image) => image.getAttribute('src') || ''));
    expect(previewImages.every((src) => /^data:image\/jpeg;base64,/.test(src))).toBeTruthy();
    await page.getByRole('button', { name: '페이지 미리보기' }).click();

    const dragPoints = await page.evaluate(() => {
      function wordRect(span, word) {
        const node = Array.from(span.childNodes).find((child) => child.nodeType === Node.TEXT_NODE);
        const start = node?.textContent?.indexOf(word) ?? -1;
        if (!node || start < 0) return null;
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, start + word.length);
        const rect = range.getBoundingClientRect();
        return { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top };
      }

      const spans = Array.from(document.querySelectorAll('.reading-pdf-text-layer span:not(.markedContent)'));
      const titleSpan = spans.find((span) => span.textContent.includes('Smart Selection Boundary'));
      const titleRect = titleSpan.getBoundingClientRect();
      const abstractSpan = spans.find((span) => span.textContent.includes('deterministic e2e paper'));
      const abstractRect = abstractSpan.getBoundingClientRect();
      const startRect = wordRect(abstractSpan, 'deterministic');
      const laterSpan = spans.find((span) => {
        const rect = span.getBoundingClientRect();
        return rect.top > Math.max(titleRect.bottom, abstractRect.bottom) + 24 && span.textContent.trim().length > 8;
      });
      const laterRect = laterSpan.getBoundingClientRect();
      return {
        end: { x: laterRect.left + Math.min(16, laterRect.width / 2), y: laterRect.top + laterRect.height / 2 },
        laterText: laterSpan.textContent.trim().split(/\s+/)[0],
        start: { x: startRect.left + (startRect.right - startRect.left) * 0.55, y: startRect.top + (startRect.bottom - startRect.top) / 2 },
      };
    });

    await page.mouse.move(dragPoints.start.x, dragPoints.start.y);
    await page.mouse.down();
    await page.mouse.move(dragPoints.end.x, dragPoints.end.y, { steps: 14 });
    await page.mouse.up();

    await expect(page.locator('.dock-wrap .sel-chip')).toBeVisible();
    await expect(page.getByRole('button', { name: '하이라이트' })).toBeEnabled();
    await expect(page.getByRole('button', { name: '메모 추가' })).toBeEnabled();
    await expect(page.getByRole('button', { name: '노트 링크' })).toBeEnabled();
    const selectedText = await page.evaluate(() => window.getSelection().toString().replace(/\s+/g, ' ').trim());
    expect(selectedText).toMatch(/^deterministic\b/);
    expect(selectedText).toContain('selection');
    expect(selectedText).not.toContain(dragPoints.laterText);

    await page.getByRole('button', { name: '노트 링크' }).click();
    const linkSheet = page.getByRole('dialog', { name: '노트 링크 선택' });
    await expect(linkSheet).toBeVisible();
    await linkSheet.getByRole('button', { name: /노트에 연결: Existing synthesis note/ }).click();
    await expect(page.locator('.pdf-toast')).toContainText('노트에 연결했습니다.');
    let sessions = await (await request.get('/api/projects/rag-reranker/reading-sessions')).json();
    let savedSession = sessions.results.find((entry) => entry.id === sessionId);
    const linkedNote = savedSession.notes.find((note) => note.id === existingNoteId);
    expect(linkedNote?.quote).toContain('deterministic');
    expect(linkedNote?.sourceBounds?.unit).toBe('page-ratio');

    await page.mouse.move(dragPoints.start.x, dragPoints.start.y);
    await page.mouse.down();
    await page.mouse.move(dragPoints.end.x, dragPoints.end.y, { steps: 14 });
    await page.mouse.up();
    await expect(page.locator('.dock-wrap .sel-chip')).toBeVisible();

    await page.getByRole('button', { name: '하이라이트' }).click();
    await expect(page.locator('.pdf-toast')).toContainText('하이라이트를 저장했습니다.');
    sessions = await (await request.get('/api/projects/rag-reranker/reading-sessions')).json();
    savedSession = sessions.results.find((entry) => entry.id === sessionId);
    const savedHighlight = savedSession.notes.find((note) => note.kind === 'highlight' && note.quote.includes('deterministic'));
    expect(savedHighlight).toBeTruthy();
    expect(savedHighlight.sourceBounds?.unit).toBe('page-ratio');

    diagnostics.assertClean();
  } finally {
    await deleteLibraryPaper(request, paperId);
  }
});

test('Reading workbench renders parsed session summary, notes, and assets from the API', async ({ page, request }) => {
  test.setTimeout(60000);
  const diagnostics = collectBrowserDiagnostics(page);
  const stamp = Date.now();
  const paperId = `e2e-reading-workbench-${stamp}`;
  let sessionId = '';
  let wikiPageId = '';

  try {
    const created = await request.post('/api/projects/rag-reranker/reading-sessions', {
      data: {
        paper: {
          abstract: 'A deterministic e2e paper for validating parsed Reading workbench data.',
          authors: ['ARES E2E'],
          keyPoints: ['Workbench reads session data.', 'Assets come from parsing.'],
          paperId,
          paperUrl: `https://example.org/papers/${paperId}`,
          pdfUrl: `https://example.org/papers/${paperId}.pdf`,
          sourceProvider: 'e2e',
          summary: 'A deterministic Reading workbench paper.',
          title: `E2E Reading Workbench ${stamp}`,
          venue: 'ARES QA',
          year: 2026,
        },
      },
    });
    expect(created.ok()).toBeTruthy();
    sessionId = (await created.json()).readingSession.id;

    const parsed = await request.post(`/api/reading-sessions/${encodeURIComponent(sessionId)}/parse`);
    expect(parsed.ok()).toBeTruthy();
    const parsedPayload = await parsed.json();
    expect(parsedPayload.session.parseStatus).toBe('done');
    expect(parsedPayload.session.assets.length).toBeGreaterThan(0);

    const note = await request.post(`/api/reading-sessions/${encodeURIComponent(sessionId)}/notes`, {
      data: {
        body: `Workbench note ${stamp}`,
        kind: 'claim',
        page: 1,
        quote: 'Workbench reads session data.',
      },
    });
    expect(note.ok()).toBeTruthy();
    const notePayload = await note.json();
    const noteId = notePayload.note.id;
    const unsavedLibrary = await (await request.get(`/api/projects/rag-reranker/library?q=${encodeURIComponent(`E2E Reading Workbench ${stamp}`)}`)).json();
    expect(unsavedLibrary.results?.some((entry) => entry.paperId === paperId)).toBeFalsy();

    await page.goto(`/#/projects/rag-reranker/reading/sessions/${encodeURIComponent(sessionId)}/pdf`);
    await expect(page.locator('.reading-reader-metabar .title')).toContainText(`E2E Reading Workbench ${stamp}`);
    await expect(page.locator('.pane-tab', { hasText: 'PDF Document' })).toContainText(`${parsedPayload.session.pageCount}p`);
    await expect(page.getByRole('button', { name: 'Add reading item' })).toHaveCount(0);
    await page.locator('.fp-subnav button', { hasText: 'Outline' }).click();
    await expect(page.locator('.float-panel .outline-item', { hasText: parsedPayload.session.sections[0].label })).toBeVisible();
    await page.locator('.fp-subnav button', { hasText: 'Notes' }).click();
    await expect(page.locator('.float-panel .outline-item', { hasText: `Workbench note ${stamp}` })).toBeVisible();
    await page.locator('.pane-tab', { hasText: 'Summary' }).click();
    await expect(page.locator('.summary-wrap')).toContainText(parsedPayload.session.summaryCards.tldr);

    await page.locator('.pane-tab', { hasText: 'Notes' }).click();
    const noteCard = page.locator('.note-card', { hasText: `Workbench note ${stamp}` });
    await expect(noteCard).toBeVisible();
    await noteCard.getByRole('button', { name: 'Wiki' }).click();
    await expect(noteCard).toContainText('Wiki에 저장했습니다.');
    await expect.poll(async () => {
      const wiki = await (await request.get('/api/projects/rag-reranker/wiki')).json();
      const saved = wiki.results.find((page) => page.properties?.noteId === noteId);
      wikiPageId = saved?.id || '';
      return saved?.properties?.readingSessionId || '';
    }).toBe(sessionId);

    const manualNoteText = `Manual note ${stamp}`;
    const updatedNoteText = `Manual note updated ${stamp}`;
    await page.getByLabel('새 노트 본문').fill(manualNoteText);
    await page.getByLabel('새 노트 인용').fill('Manual quote');
    await page.getByLabel('새 노트 페이지').fill('1');
    await page.getByRole('button', { name: 'New manual note' }).click();
    await expect(page.getByText('노트를 저장했습니다.')).toBeVisible();
    await expect(page.locator('.note-card', { hasText: manualNoteText })).toBeVisible();

    let manualNoteId = '';
    await expect.poll(async () => {
      const sessions = await (await request.get('/api/projects/rag-reranker/reading-sessions')).json();
      const current = sessions.results.find((entry) => entry.id === sessionId);
      manualNoteId = current?.notes?.find((entry) => entry.body === manualNoteText)?.id || '';
      return manualNoteId;
    }).not.toBe('');

    const manualNoteCard = page.locator('.note-card', { hasText: manualNoteText });
    await manualNoteCard.getByRole('button', { name: 'Edit' }).click();
    await manualNoteCard.getByLabel('노트 본문').fill(updatedNoteText);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.note-card', { hasText: updatedNoteText })).toBeVisible();

    await page.locator('.note-card', { hasText: updatedNoteText }).getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('.note-card', { hasText: updatedNoteText })).toHaveCount(0);
    await expect.poll(async () => {
      const sessions = await (await request.get('/api/projects/rag-reranker/reading-sessions')).json();
      const current = sessions.results.find((entry) => entry.id === sessionId);
      return current?.notes?.some((entry) => entry.id === manualNoteId) || false;
    }).toBe(false);

    await page.locator('.pane-tab', { hasText: 'Assets' }).click();
    await expect(page.locator('.assets-toolbar')).toContainText(`All ${parsedPayload.session.assets.length}`);
    await page.getByRole('button', { name: 'Refresh assets' }).click();
    await expect(page.getByText('Assets updated.')).toBeVisible();
    await expect.poll(async () => {
      const sessions = await (await request.get('/api/projects/rag-reranker/reading-sessions')).json();
      const current = sessions.results.find((entry) => entry.id === sessionId);
      return current?.assets?.length || 0;
    }).toBe(parsedPayload.session.assets.length);
    const firstAsset = parsedPayload.session.assets[0];
    const firstAssetText = firstAsset.caption || firstAsset.sourceText || `${firstAsset.kind} ${firstAsset.number}`;
    await expect(page.locator('.asset-card').first()).toBeVisible();
    await page.locator('.asset-card').first().click();
    await expect(page.locator('.asset-detail')).toBeVisible();
    await expect(page.locator('.asset-detail')).toContainText(firstAssetText);
    await expect(page.locator('.asset-source-map')).toBeVisible();
    await page.getByRole('button', { name: 'Go to source page' }).click();
    await expect(page.locator('.asset-detail-status')).toContainText(`p.${firstAsset.sourceBounds?.page || firstAsset.page}`);

    const figureWithoutData = parsedPayload.session.assets.find((asset) => asset.kind === 'figure' && !asset.dataPath);
    const tableWithoutImage = parsedPayload.session.assets.find((asset) => asset.kind === 'table' && !asset.thumbPath);
    expect(figureWithoutData).toBeTruthy();
    expect(tableWithoutImage).toBeTruthy();

    const figureText = figureWithoutData.caption || figureWithoutData.sourceText || `${figureWithoutData.kind} ${figureWithoutData.number}`;
    await page.locator('.asset-card', { hasText: figureText }).click();
    await expect(page.locator('.asset-detail').getByRole('button', { name: 'Open data' })).toBeDisabled();
    await expect(page.locator('.asset-detail').getByRole('link', { name: 'Open data' })).toHaveCount(0);

    const tableText = tableWithoutImage.caption || tableWithoutImage.sourceText || `${tableWithoutImage.kind} ${tableWithoutImage.number}`;
    await page.locator('.asset-card', { hasText: tableText }).click();
    await expect(page.locator('.asset-detail').getByRole('button', { name: 'Open image' })).toBeDisabled();
    await expect(page.locator('.asset-detail').getByRole('link', { name: 'Open image' })).toHaveCount(0);

    diagnostics.assertClean();
  } finally {
    await deleteProjectAsset(request, 'wiki-pages', wikiPageId);
    await deleteLibraryPaper(request, paperId);
  }
});

test('Reading workbench opens as a mobile detail panel from explicit actions', async ({ page, request }) => {
  test.setTimeout(60000);
  const diagnostics = collectBrowserDiagnostics(page);
  const stamp = Date.now();
  const paperId = `e2e-reading-mobile-workbench-${stamp}`;
  let sessionId = '';

  try {
    const created = await request.post('/api/projects/rag-reranker/reading-sessions', {
      data: {
        paper: {
          abstract: 'A deterministic e2e paper for validating the mobile Reading workbench.',
          authors: ['ARES E2E'],
          keyPoints: ['Mobile reader keeps the document first.', 'Workbench opens from explicit actions.'],
          paperId,
          paperUrl: `https://example.org/papers/${paperId}`,
          pdfUrl: `https://example.org/papers/${paperId}.pdf`,
          sourceProvider: 'e2e',
          summary: 'A deterministic mobile Reading workbench paper.',
          title: `E2E Reading Mobile Workbench ${stamp}`,
          venue: 'ARES QA',
          year: 2026,
        },
      },
    });
    expect(created.ok()).toBeTruthy();
    sessionId = (await created.json()).readingSession.id;

    const parsed = await request.post(`/api/reading-sessions/${encodeURIComponent(sessionId)}/parse`);
    expect(parsed.ok()).toBeTruthy();
    const note = await request.post(`/api/reading-sessions/${encodeURIComponent(sessionId)}/notes`, {
      data: {
        body: `Mobile workbench note ${stamp}`,
        kind: 'claim',
        page: 1,
        quote: 'Mobile reader keeps the document first.',
      },
    });
    expect(note.ok()).toBeTruthy();

    const assertMobileWorkbenchDefault = async (viewport) => {
      await page.setViewportSize(viewport);
      await page.goto(`/#/projects/rag-reranker/reading/sessions/${encodeURIComponent(sessionId)}/pdf`);

      await expect(page.locator('.reading-doc-pane')).toBeVisible();
      await expect(page.locator('.reading-workbench-pane')).toBeHidden();
      await expect(page.locator('.reading-main > .float-panel')).toBeHidden();
      await expect(page.locator('.mobile-wb-actions')).toBeVisible();

      const actionBoxes = await page.locator('.mobile-wb-actions button').evaluateAll((buttons) => buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { height: rect.height, width: rect.width };
      }));
      expect(actionBoxes).toHaveLength(3);
      for (const box of actionBoxes) {
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }

      const scrollMetrics = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(scrollMetrics.scrollWidth).toBeLessThanOrEqual(scrollMetrics.clientWidth + 1);
    };

    for (const viewport of [
      { width: 320, height: 568 },
      { width: 375, height: 667 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 860, height: 900 },
    ]) {
      await assertMobileWorkbenchDefault(viewport);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/#/projects/rag-reranker/reading/sessions/${encodeURIComponent(sessionId)}/pdf`);

    await page.getByRole('button', { name: /Assets/ }).click();
    await expect(page.locator('.reading-workbench-pane.mobile-open')).toBeVisible();
    await expect(page.locator('.asset-card').first()).toBeVisible();
    await expect(page.locator('.reading-workbench-pane .pane-tab', { hasText: 'Assets' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Close workbench' }).click();
    await expect(page.locator('.reading-workbench-pane')).toBeHidden();

    await page.getByRole('button', { name: /Notes/ }).click();
    await expect(page.locator('.reading-workbench-pane.mobile-open')).toBeVisible();
    await expect(page.locator('.note-card', { hasText: `Mobile workbench note ${stamp}` })).toBeVisible();
    await page.getByRole('button', { name: 'Close workbench' }).click();

    await page.getByRole('button', { name: /Chat/ }).click();
    await expect(page.locator('.reading-workbench-pane.mobile-open .chat-box')).toBeVisible();
    await expect(page.locator('.dock')).toBeHidden();
    await page.getByRole('button', { name: 'Close workbench' }).click();
    await expect(page.locator('.reading-workbench-pane')).toBeHidden();
    await expect(page.locator('.dock')).toBeVisible();

    diagnostics.assertClean();
  } finally {
    await deleteLibraryPaper(request, paperId);
  }
});

test('Reading PDF dock opens mobile tool sheets without viewport overflow', async ({ page, request }) => {
  test.setTimeout(60000);
  const diagnostics = collectBrowserDiagnostics(page);
  const stamp = Date.now();
  const paperId = `e2e-reading-mobile-pdf-dock-${stamp}`;
  let sessionId = '';

  try {
    const created = await request.post('/api/projects/rag-reranker/reading-sessions', {
      data: {
        paper: {
          abstract: 'A deterministic e2e paper for validating the mobile PDF dock sheet.',
          authors: ['ARES E2E'],
          keyPoints: ['Mobile PDF tools open as sheets.', 'Search and page navigation stay in bounds.'],
          paperId,
          paperUrl: `https://example.org/papers/${paperId}`,
          pdfUrl: `https://example.org/papers/${paperId}.pdf`,
          sourceProvider: 'e2e',
          summary: 'A deterministic mobile PDF dock paper.',
          title: `E2E Reading Mobile PDF Dock ${stamp}`,
          venue: 'ARES QA',
          year: 2026,
        },
      },
    });
    expect(created.ok()).toBeTruthy();
    sessionId = (await created.json()).readingSession.id;

    const parsed = await request.post(`/api/reading-sessions/${encodeURIComponent(sessionId)}/parse`);
    expect(parsed.ok()).toBeTruthy();

    for (const viewport of [
      { width: 320, height: 568 },
      { width: 375, height: 667 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`/#/projects/rag-reranker/reading/sessions/${encodeURIComponent(sessionId)}/pdf`);
      await expect(page.locator('[data-reading-pdf-host="true"]')).toBeVisible();
      await expect(page.locator('.dock')).toBeVisible();
      const dockMetrics = await page.locator('.dock').evaluate((dock) => {
        const rect = dock.getBoundingClientRect();
        const buttons = Array.from(dock.querySelectorAll('button'))
          .map((button) => {
            const box = button.getBoundingClientRect();
            return { height: box.height, width: box.width };
          })
          .filter((box) => box.height > 0 && box.width > 0);
        return {
          bodyWidth: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
          bottom: rect.bottom,
          clientWidth: dock.clientWidth,
          left: rect.left,
          right: rect.right,
          scrollWidth: dock.scrollWidth,
          top: rect.top,
          buttons,
        };
      });
      expect(dockMetrics.bodyWidth).toBeLessThanOrEqual(viewport.width);
      expect(dockMetrics.left).toBeGreaterThanOrEqual(56);
      expect(dockMetrics.right).toBeLessThanOrEqual(viewport.width);
      expect(dockMetrics.bottom).toBeLessThanOrEqual(viewport.height);
      expect(dockMetrics.scrollWidth).toBeLessThanOrEqual(dockMetrics.clientWidth + 1);
      for (const button of dockMetrics.buttons) {
        expect(button.height).toBeGreaterThanOrEqual(44);
        expect(button.width).toBeGreaterThanOrEqual(44);
      }

      await page.getByRole('button', { name: '본문 검색' }).click();
      const searchSheet = page.locator('.pdf-dock-sheet', { hasText: '본문 검색' });
      await expect(searchSheet).toBeVisible();
      await page.getByRole('searchbox', { name: 'PDF 검색어' }).fill('Mobile');
      await expect(page.locator('.pdf-search-result').first()).toBeVisible();
      const searchMetrics = await searchSheet.evaluate((sheet) => {
        const rect = sheet.getBoundingClientRect();
        const input = sheet.querySelector('input')?.getBoundingClientRect();
        const result = sheet.querySelector('.pdf-search-result')?.getBoundingClientRect();
        return {
          bottom: rect.bottom,
          inputHeight: input?.height || 0,
          left: rect.left,
          resultHeight: result?.height || 0,
          right: rect.right,
          top: rect.top,
        };
      });
      expect(searchMetrics.left).toBeGreaterThanOrEqual(56);
      expect(searchMetrics.right).toBeLessThanOrEqual(viewport.width);
      expect(searchMetrics.bottom).toBeLessThanOrEqual(viewport.height);
      expect(searchMetrics.inputHeight).toBeGreaterThanOrEqual(44);
      expect(searchMetrics.resultHeight).toBeGreaterThanOrEqual(44);
      await page.locator('.pdf-search-result').first().click();
      await expect(searchSheet).toBeHidden();

      await page.getByRole('button', { name: '페이지 미리보기' }).click();
      const pageSheet = page.locator('.pdf-dock-sheet', { hasText: '페이지 미리보기' });
      await expect(pageSheet).toBeVisible();
      const pageMetrics = await pageSheet.evaluate((sheet) => {
        const rect = sheet.getBoundingClientRect();
        const buttons = Array.from(sheet.querySelectorAll('.pgi')).map((button) => {
          const box = button.getBoundingClientRect();
          return { height: box.height, width: box.width };
        });
        return { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top, buttons };
      });
      expect(pageMetrics.left).toBeGreaterThanOrEqual(56);
      expect(pageMetrics.right).toBeLessThanOrEqual(viewport.width);
      expect(pageMetrics.bottom).toBeLessThanOrEqual(viewport.height);
      for (const button of pageMetrics.buttons.slice(0, 4)) {
        expect(button.height).toBeGreaterThanOrEqual(44);
        expect(button.width).toBeGreaterThanOrEqual(44);
      }

      await page.getByRole('button', { name: '목차' }).click();
      const tocSheet = page.locator('.pdf-dock-sheet', { hasText: '목차' });
      await expect(tocSheet).toBeVisible();
      const tocMetrics = await tocSheet.evaluate((sheet) => {
        const rect = sheet.getBoundingClientRect();
        const row = sheet.querySelector('.toc-row')?.getBoundingClientRect();
        return {
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          rowHeight: row?.height || 0,
          top: rect.top,
        };
      });
      expect(tocMetrics.left).toBeGreaterThanOrEqual(56);
      expect(tocMetrics.right).toBeLessThanOrEqual(viewport.width);
      expect(tocMetrics.bottom).toBeLessThanOrEqual(viewport.height);
      expect(tocMetrics.rowHeight).toBeGreaterThanOrEqual(44);
    }

    diagnostics.assertClean();
  } finally {
    await deleteLibraryPaper(request, paperId);
  }
});

test('Legacy six-stage hashes normalize into the React four-tab shell', async ({ page }) => {
  const diagnostics = collectBrowserDiagnostics(page);
  const cases = [
    ['search', 'Reading'],
    ['reading', 'Reading'],
    ['research', 'Lab'],
    ['result', 'Lab'],
    ['insight', 'Wiki'],
    ['writing', 'Agent'],
  ];

  for (const [stage, label] of cases) {
    await page.goto(`/#/projects/rag-reranker/${stage}`);
    await expect(page.locator('.rail-btn.active .lbl')).toHaveText(label);
  }

  await page.goto('/#/projects/rag-reranker/reading/sessions/session-e2e/summary');
  await expect(page.locator('.rail-btn.active .lbl')).toHaveText('Reading');
  await expect(page.locator('.pane-tab.active', { hasText: 'Summary' })).toBeVisible();

  diagnostics.assertClean();
});

test('Wiki tab renders stored wiki pages and backlinks from the API', async ({ page, request }) => {
  test.setTimeout(60000);
  const diagnostics = collectBrowserDiagnostics(page);
  const stamp = Date.now();
  const createdIds = [`e2e-wiki-a-${stamp}`, `e2e-wiki-b-${stamp}`];
  const folderId = `e2e-wiki-folder-${stamp}`;
  const folderTitle = `E2E Wiki Folder ${stamp}`;
  const alphaTitle = `E2E Wiki Alpha ${stamp}`;
  const betaTitle = `E2E Wiki Beta ${stamp}`;
  try {
    const folder = await request.post('/api/projects/rag-reranker/wiki-folders', {
      data: {
        id: folderId,
        name: folderTitle,
      },
    });
    expect(folder.ok()).toBeTruthy();

    const first = await request.post('/api/projects/rag-reranker/wiki', {
      data: {
        body: [{ type: 'heading', text: 'Definition' }, { type: 'paragraph', text: 'A server-backed wiki page.' }],
        folderId,
        id: createdIds[0],
        links: [createdIds[1]],
        paperIds: ['paper-e2e'],
        tags: ['e2e'],
        title: alphaTitle,
        type: 'concept',
      },
    });
    const second = await request.post('/api/projects/rag-reranker/wiki', {
      data: {
        body: [{ type: 'paragraph', text: 'A linked wiki page.' }],
        id: createdIds[1],
        links: [],
        title: betaTitle,
        type: 'system',
      },
    });
    expect(first.ok()).toBeTruthy();
    expect(second.ok()).toBeTruthy();

    await page.goto('/#/projects/rag-reranker/insight');
    await page.getByRole('button', { name: `${alphaTitle} 문서 열기` }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.ntitle')).toHaveText(alphaTitle);
    await page.locator('.pane-tab', { hasText: 'List' }).click();
    await expect(page.locator('.tree-row.doc', { hasText: alphaTitle })).toBeVisible();
    await expect(page.locator('.tree-row.doc', { hasText: betaTitle })).toBeVisible();
    await expect(page.locator('.chipf', { hasText: folderTitle })).toBeVisible();
    await page.locator('.chipf', { hasText: folderTitle }).click();
    await expect(page.locator('.tree-row.doc', { hasText: alphaTitle })).toBeVisible();
    await expect(page.locator('.tree-row.doc', { hasText: betaTitle })).toHaveCount(0);
    await page.locator('.chipf', { hasText: 'All' }).click();
    await page.locator('.tree-row.doc', { hasText: betaTitle }).click();
    await expect(page.locator('.ntitle')).toHaveText(betaTitle);
    await expect(page.locator('.nrefs')).toContainText(alphaTitle);

    diagnostics.assertClean();
  } finally {
    await deleteProjectAsset(request, 'wiki-pages', createdIds[0]);
    await deleteProjectAsset(request, 'wiki-pages', createdIds[1]);
    await deleteProjectAsset(request, 'wiki-folders', folderId);
  }
});

test('Wiki tab opens and closes the mobile document overlay without horizontal overflow', async ({ page, request }) => {
  test.setTimeout(60000);
  const diagnostics = collectBrowserDiagnostics(page);
  const stamp = Date.now();
  const pageId = `e2e-wiki-mobile-${stamp}`;
  const folderId = `e2e-wiki-mobile-folder-${stamp}`;
  const folderTitle = `E2E Mobile Wiki Folder ${stamp}`;
  const pageTitle = `E2E Mobile Wiki Page ${stamp}`;
  const viewport = { width: 390, height: 844 };
  const measureHorizontalOverflow = () => (
    Math.max(
      document.body.scrollWidth,
      document.documentElement.scrollWidth
    ) - window.innerWidth
  );

  try {
    const folder = await request.post('/api/projects/rag-reranker/wiki-folders', {
      data: {
        id: folderId,
        name: folderTitle,
      },
    });
    const pageAsset = await request.post('/api/projects/rag-reranker/wiki', {
      data: {
        body: [{ type: 'paragraph', text: 'A mobile overlay wiki page.' }],
        folderId,
        id: pageId,
        links: [],
        paperIds: ['paper-e2e'],
        tags: ['mobile'],
        title: pageTitle,
        type: 'concept',
      },
    });
    expect(folder.ok()).toBeTruthy();
    expect(pageAsset.ok()).toBeTruthy();

    await page.setViewportSize(viewport);
    await page.goto('/#/projects/rag-reranker/insight');
    await page.locator('.pane-tab', { hasText: 'List' }).click();
    const search = page.getByPlaceholder('Search nodes');
    await expect(search).toBeEnabled();
    await search.fill(pageTitle);
    const mobilePageRow = page.getByRole('button', { name: `${pageTitle} 문서 열기` });
    await expect(mobilePageRow).toBeVisible();
    expect(await page.evaluate(measureHorizontalOverflow)).toBeLessThanOrEqual(0);

    await mobilePageRow.focus();
    await page.keyboard.press('Enter');
    const viewer = page.locator('.wiki-viewer');
    await expect(viewer).toHaveClass(/open/);
    await expect(page.locator('.ntitle')).toHaveText(pageTitle);
    await expect.poll(async () => {
      const box = await viewer.boundingBox();
      return box ? Math.round(box.x) : Number.NaN;
    }).toBe(0);
    const backButton = viewer.locator('.wiki-back');
    await expect(backButton).toBeVisible();
    const backBox = await backButton.boundingBox();
    expect(backBox?.width || 0).toBeGreaterThanOrEqual(44);
    expect(backBox?.height || 0).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(measureHorizontalOverflow)).toBeLessThanOrEqual(0);

    await backButton.click();
    await expect(viewer).not.toHaveClass(/open/);
    await expect(page.locator('.wiki-explorer')).toBeVisible();
    expect(await page.evaluate(measureHorizontalOverflow)).toBeLessThanOrEqual(0);

    diagnostics.assertClean();
  } finally {
    await deleteProjectAsset(request, 'wiki-pages', pageId);
    await deleteProjectAsset(request, 'wiki-folders', folderId);
  }
});

test('Lab tab renders experiment runs from the project graph API', async ({ page, request }) => {
  const diagnostics = collectBrowserDiagnostics(page);
  let runId = '';

  try {
    const created = await request.post('/api/projects/rag-reranker/experiment-runs', {
      data: {
        id: 'e2e-lab-run',
        kind: 'smoke',
        metrics: { ndcg: 42.1 },
        status: 'done',
        title: 'E2E Lab graph run',
      },
    });
    expect(created.ok()).toBeTruthy();
    runId = (await created.json()).asset.id;

    await page.goto('/#/projects/rag-reranker/research');
    await page.locator('.proj-card').first().click();
    await expect(page.locator('.kan-card', { hasText: 'E2E Lab graph run' })).toBeVisible();
    await expect(page.locator('.metabar .byline')).toContainText('experiments');

    diagnostics.assertClean();
  } finally {
    await deleteProjectAsset(request, 'experiment-runs', runId);
  }
});

test('Lab execute API stores runner results that appear on the board', async ({ page, request }) => {
  const diagnostics = collectBrowserDiagnostics(page);
  let runId = '';
  let dossierId = '';

  try {
    const created = await request.post('/api/projects/rag-reranker/experiment-runs', {
      data: {
        id: 'e2e-lab-execute-run',
        kind: 'smoke',
        status: 'draft',
        title: 'E2E Lab executed run',
      },
    });
    expect(created.ok()).toBeTruthy();
    runId = (await created.json()).asset.id;

    const executed = await request.post(`/api/projects/rag-reranker/experiment-runs/${encodeURIComponent(runId)}/execute`, {
      data: {
        command: {
          args: ['-e', 'console.log("accuracy: 0.95")'],
          command: 'node',
          cwd: '.',
          expectedMetrics: ['accuracy'],
          timeoutMs: 5000,
        },
        reason: 'temporary e2e Lab execute smoke',
      },
    });
    expect(executed.ok()).toBeTruthy();
    const payload = await executed.json();
    dossierId = payload.resultDossier?.id || '';
    expect(payload.runnerResult.status).toBe('done');
    expect(payload.experimentRun.metrics.accuracy).toBe('0.95');

    await page.goto('/#/projects/rag-reranker/research');
    await page.locator('.proj-card').first().click();
    const executedRunCard = page.locator('.kan-card', { hasText: 'accuracy: 0.95' });
    await expect(executedRunCard).toBeVisible();
    await executedRunCard.getByRole('button', { name: /워크스페이스 열기/ }).click();
    await expect(page.getByText('실행 지표 차트')).toBeVisible();
    await expect(page.locator('.xp-chart')).toContainText('accuracy');
    await expectVisibleDisabledButtonsToLookDisabled(page);
    const reportTableContract = await page.locator('.xp-rt .rr.h').evaluate((row) => ({
      cells: row.children.length,
      columns: getComputedStyle(row).gridTemplateColumns.split(' ').filter(Boolean).length,
    }));
    expect(reportTableContract.columns).toBe(reportTableContract.cells);

    diagnostics.assertClean();
  } finally {
    await deleteProjectAsset(request, 'result-dossiers', dossierId);
    await deleteProjectAsset(request, 'experiment-runs', runId);
  }
});

test('Lab board executes a command through the React action', async ({ page, request }) => {
  const diagnostics = collectBrowserDiagnostics(page);
  let runId = '';
  let dossierId = '';

  try {
    const created = await request.post('/api/projects/rag-reranker/experiment-runs', {
      data: {
        config: {
          command: {
            args: ['-e', 'console.log("accuracy: 0.96")'],
            command: 'node',
            cwd: '.',
            expectedMetrics: ['accuracy'],
            timeoutMs: 5000,
          },
        },
        id: 'e2e-lab-ui-execute-run',
        kind: 'smoke',
        status: 'draft',
        title: 'E2E Lab UI execute run',
      },
    });
    expect(created.ok()).toBeTruthy();
    runId = (await created.json()).asset.id;

    await page.goto('/#/projects/rag-reranker/research');
    await page.locator('.proj-card').first().click();
    const card = page.locator('.kan-card', { hasText: 'E2E Lab UI execute run' });
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: /E2E Lab UI execute run 실행/ }).click();
    await expect(page.getByText('실행 완료')).toBeVisible();
    await expect(page.locator('.kan-card', { hasText: 'accuracy: 0.96' })).toBeVisible();

    const graph = await (await request.get('/api/projects/rag-reranker/graph')).json();
    dossierId = (graph.resultDossiers || []).find((dossier) => dossier.experimentRunIds?.includes(runId))?.id || '';

    diagnostics.assertClean();
  } finally {
    await deleteProjectAsset(request, 'result-dossiers', dossierId);
    await deleteProjectAsset(request, 'experiment-runs', runId);
  }
});

test('Lab mobile opens a board card into a full-width workspace without page overflow', async ({ page, request }) => {
  const diagnostics = collectBrowserDiagnostics(page);
  const stamp = Date.now();
  const runTitle = `E2E Lab mobile workspace ${stamp}`;
  let runId = '';

  try {
    const created = await request.post('/api/projects/rag-reranker/experiment-runs', {
      data: {
        config: {
          command: {
            args: ['-e', 'console.log("accuracy: 0.97")'],
            command: 'node',
            cwd: '.',
            expectedMetrics: ['accuracy'],
            timeoutMs: 5000,
          },
        },
        id: `e2e-lab-mobile-workspace-${stamp}`,
        kind: 'smoke',
        status: 'draft',
        title: runTitle,
      },
    });
    expect(created.ok()).toBeTruthy();
    runId = (await created.json()).asset.id;

    for (const viewport of [
      { width: 320, height: 568 },
      { width: 375, height: 667 },
      { width: 768, height: 1024 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/#/projects/rag-reranker/research');
      await page.locator('.proj-card').first().click();
      await expect(page.locator('.kanban')).toBeVisible();
      await expect(page.locator('.main > .float-panel')).toBeHidden();
      const boardMetrics = await page.evaluate(() => {
        const kanban = document.querySelector('.kanban');
        const add = document.querySelector('.kan-colh .cadd');
        const addStyle = add ? getComputedStyle(add) : null;
        return {
          addCursor: addStyle?.cursor || '',
          addDisabled: Boolean(add?.disabled),
          bodyWidth: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
          kanbanClientWidth: kanban?.clientWidth || 0,
          kanbanScrollWidth: kanban?.scrollWidth || 0,
        };
      });
      expect(boardMetrics.bodyWidth).toBeLessThanOrEqual(viewport.width);
      expect(boardMetrics.addDisabled).toBe(false);
      expect(boardMetrics.addCursor).toBe('pointer');
      expect(boardMetrics.kanbanScrollWidth).toBeGreaterThan(boardMetrics.kanbanClientWidth);
      await expectVisibleDisabledButtonsToLookDisabled(page);

      const card = page.locator('.kan-card', { hasText: runTitle });
      await expect(card).toBeVisible();
      await card.getByRole('button', { name: /워크스페이스 열기/ }).click();
      await expect(page.locator('.metabar .title')).toHaveText(runTitle);
      await expect(page.locator('.run-pane')).toBeVisible();
      await expect(page.locator('.report-pane')).toBeHidden();
      await expect(page.locator('.main > .float-panel')).toBeHidden();

      const workspaceMetrics = await page.evaluate(() => {
        const runPane = document.querySelector('.run-pane')?.getBoundingClientRect();
        const stageBar = document.querySelector('.stage-bar');
        const back = document.querySelector('.lab-back')?.getBoundingClientRect();
        return {
          backHeight: back?.height || 0,
          bodyWidth: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
          runLeft: runPane?.left || 0,
          runRight: runPane?.right || 0,
          stageClientWidth: stageBar?.clientWidth || 0,
          stageScrollWidth: stageBar?.scrollWidth || 0,
        };
      });
      expect(workspaceMetrics.bodyWidth).toBeLessThanOrEqual(viewport.width);
      expect(workspaceMetrics.runLeft).toBeGreaterThanOrEqual(56);
      expect(workspaceMetrics.runRight).toBeLessThanOrEqual(viewport.width);
      expect(workspaceMetrics.backHeight).toBeGreaterThanOrEqual(44);
      expect(workspaceMetrics.stageScrollWidth).toBeLessThanOrEqual(workspaceMetrics.stageClientWidth);
      await expectVisibleDisabledButtonsToLookDisabled(page);

      await page.locator('.lab-back').click();
      await expect(page.locator('.kanban')).toBeVisible();
      await expect(page.locator('.metabar .title')).not.toHaveText(runTitle);
      await page.locator('.lab-back').click();
      await expect(page.locator('.proj-card').first()).toBeVisible();
    }

    diagnostics.assertClean();
  } finally {
    await deleteProjectAsset(request, 'experiment-runs', runId);
  }
});

test('Agent tab creates a real thread and stores user messages without fake assistant output', async ({ page, request }) => {
  const diagnostics = collectBrowserDiagnostics(page);
  const questionText = `e2e grounded question ${Date.now()}`;
  let threadId = '';
  let messageIds = [];

  try {
    const beforeThreads = await (await request.get('/api/projects/rag-reranker/agent/threads')).json();
    const beforeThreadIds = new Set((beforeThreads.results || []).map((entry) => entry.id));

    await page.goto('/#/projects/rag-reranker/writing');
    await page.locator('.meta-actions').getByRole('button', { name: '새 스레드' }).click();
    await expect
      .poll(async () => {
        const threads = await (await request.get('/api/projects/rag-reranker/agent/threads')).json();
        const created = (threads.results || []).find((entry) => !beforeThreadIds.has(entry.id));
        threadId = created?.id || '';
        return threadId;
      })
      .not.toBe('');
    await expect(page.locator('.metabar .title')).toHaveText('New thread');

    await page.locator('.ag-box textarea').fill(questionText);
    await page.locator('.ag-send').click();
    await expect(page.getByText('질문이 저장되었습니다.')).toBeVisible();
    await expect(page.locator('.ag-turn.user .ag-ubub', { hasText: questionText })).toHaveText(questionText);
    await expect(page.getByText('아직 연결된 근거가 없습니다.')).toBeVisible();

    const messages = await (await request.get(`/api/projects/rag-reranker/agent/threads/${encodeURIComponent(threadId)}/messages`)).json();
    messageIds = messages.messages.map((message) => message.id);
    expect(messages.messages).toHaveLength(1);
    expect(messages.messages[0]).toMatchObject({
      role: 'user',
      text: questionText,
    });

    diagnostics.assertClean();
  } finally {
    for (const messageId of messageIds) {
      await deleteProjectAsset(request, 'agent-messages', messageId);
    }
    await deleteProjectAsset(request, 'agent-threads', threadId);
  }
});

test('Agent tab saves assistant messages to graph assets through explicit actions', async ({ page, request }) => {
  const diagnostics = collectBrowserDiagnostics(page);
  const stamp = Date.now();
  const threadId = `e2e-agent-save-thread-${stamp}`;
  const messageId = `e2e-agent-save-message-${stamp}`;
  const threadTitle = `E2E agent save ${stamp}`;
  const answerText = 'E2E agent answer should become an idea asset.';
  let insightCardId = '';
  let wikiPageId = '';

  try {
    const threadResponse = await request.post('/api/projects/rag-reranker/agent/threads', {
      data: {
        id: threadId,
        title: threadTitle,
      },
    });
    expect(threadResponse.ok()).toBeTruthy();

    const messageResponse = await request.post(`/api/projects/rag-reranker/agent/threads/${encodeURIComponent(threadId)}/messages`, {
      data: {
        id: messageId,
        role: 'assistant',
        text: answerText,
      },
    });
    expect(messageResponse.ok()).toBeTruthy();

    await page.goto('/#/projects/rag-reranker/writing');
    await page.locator('.ag-thread', { hasText: threadTitle }).click();
    const assistantTurn = page.locator('.ag-turn.assistant', { hasText: answerText });
    await expect(assistantTurn).toBeVisible();
    await assistantTurn.getByRole('button', { name: 'Idea' }).click();
    await expect(page.getByText('Idea에 저장했습니다.')).toBeVisible();
    await assistantTurn.getByRole('button', { name: 'Wiki' }).click();
    await expect(page.getByText('Wiki에 저장했습니다.')).toBeVisible();

    await page.locator('.evid-tab', { hasText: 'Artifacts' }).click();
    const evidenceArtifactCards = page.locator('.ag-evid .art-card', { hasText: answerText });
    await expect(evidenceArtifactCards).toHaveCount(2);
    const evidenceArtifactTexts = await evidenceArtifactCards.allTextContents();
    expect(evidenceArtifactTexts.some((text) => text.trim().endsWith('Idea'))).toBeTruthy();
    expect(evidenceArtifactTexts.some((text) => text.trim().endsWith('Wiki'))).toBeTruthy();
    await page.getByRole('button', { name: /Saved/ }).click();
    const savedArtifactCards = page.locator('.float-panel .art-card', { hasText: answerText });
    await expect(savedArtifactCards).toHaveCount(2);
    const savedArtifactTexts = await savedArtifactCards.allTextContents();
    expect(savedArtifactTexts.some((text) => text.trim().endsWith('Idea'))).toBeTruthy();
    expect(savedArtifactTexts.some((text) => text.trim().endsWith('Wiki'))).toBeTruthy();

    await expect.poll(async () => {
      const messages = await (await request.get(`/api/projects/rag-reranker/agent/threads/${encodeURIComponent(threadId)}/messages`)).json();
      const artifacts = messages.messages.find((message) => message.id === messageId)?.artifacts || [];
      insightCardId = artifacts.find((artifact) => artifact.collection === 'insightCards')?.id || '';
      wikiPageId = artifacts.find((artifact) => artifact.collection === 'wikiPages')?.id || '';
      return Boolean(insightCardId && wikiPageId);
    }).toBeTruthy();

    const graph = await (await request.get('/api/projects/rag-reranker/graph')).json();
    expect(graph.insightCards.some((card) => card.id === insightCardId && card.claim === answerText)).toBeTruthy();
    const wiki = await (await request.get('/api/projects/rag-reranker/wiki')).json();
    expect(wiki.results.some((page) => page.id === wikiPageId && page.title === answerText)).toBeTruthy();

    diagnostics.assertClean();
  } finally {
    await deleteProjectAsset(request, 'wiki-pages', wikiPageId);
    await deleteProjectAsset(request, 'insight-cards', insightCardId);
    await deleteProjectAsset(request, 'agent-messages', messageId);
    await deleteProjectAsset(request, 'agent-threads', threadId);
  }
});

test('Agent tab opens the mobile evidence bottom sheet from the conversation', async ({ page, request }) => {
  const diagnostics = collectBrowserDiagnostics(page);
  const stamp = Date.now();
  const threadId = `e2e-agent-mobile-evidence-thread-${stamp}`;
  const messageId = `e2e-agent-mobile-evidence-message-${stamp}`;
  const threadTitle = `E2E mobile evidence ${stamp}`;
  const answerText = 'E2E assistant answer with reusable evidence.';

  try {
    const threadResponse = await request.post('/api/projects/rag-reranker/agent/threads', {
      data: {
        id: threadId,
        title: threadTitle,
      },
    });
    expect(threadResponse.ok()).toBeTruthy();

    const messageResponse = await request.post(`/api/projects/rag-reranker/agent/threads/${encodeURIComponent(threadId)}/messages`, {
      data: {
        citations: [
          {
            id: 'paper-cite',
            kind: 'paper',
            loc: 'p. 4',
            quote: 'Dense retrievers improve recall when paired with reranking.',
            src: 'Mobile Evidence Paper',
            tag: 'retrieval',
          },
          {
            id: 'wiki-cite',
            kind: 'wiki',
            loc: 'Wiki note',
            quote: 'ARES records reusable reasoning notes in the project graph.',
            src: 'ARES Evidence Wiki',
            tag: 'graph',
          },
        ],
        id: messageId,
        role: 'assistant',
        text: answerText,
      },
    });
    expect(messageResponse.ok()).toBeTruthy();

    for (const viewport of [
      { width: 320, height: 568 },
      { width: 375, height: 667 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/#/projects/rag-reranker/writing');
      await expect(page.locator('.metabar .title')).toHaveText(threadTitle);
      await expect(page.locator('.ag-turn.assistant', { hasText: answerText })).toBeVisible();
      await expect(page.locator('.ag-evid')).toBeHidden();

      const evidenceButton = page.getByRole('button', { name: /근거 모두 보기/ });
      await expect(evidenceButton).toBeVisible();
      const triggerBox = await evidenceButton.boundingBox();
      expect(triggerBox?.height || 0).toBeGreaterThanOrEqual(44);
      await evidenceButton.click();

      const sheet = page.locator('.ag-evid.mobile-open');
      await expect(sheet).toBeVisible();
      await expect(sheet).toHaveAttribute('role', 'dialog');
      await expect(sheet.locator('.evid-tab', { hasText: 'Evidence' })).toContainText('2');
      await expect(sheet.locator('.ecard', { hasText: 'Mobile Evidence Paper' })).toBeVisible();
      await expect(sheet.locator('.ecard', { hasText: 'ARES Evidence Wiki' })).toBeVisible();

      await expect(page.getByRole('button', { name: '근거 닫기' })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect.poll(async () => page.evaluate(() => {
        const sheetNode = document.querySelector('.ag-evid.mobile-open');
        return Boolean(sheetNode && sheetNode.contains(document.activeElement));
      })).toBeTruthy();

      const metrics = await page.evaluate(() => {
        const sheetRect = document.querySelector('.ag-evid.mobile-open')?.getBoundingClientRect();
        const closeRect = document.querySelector('.mobile-evid-close')?.getBoundingClientRect();
        return {
          bodyWidth: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
          closeHeight: closeRect?.height || 0,
          closeRight: closeRect?.right || 0,
          closeWidth: closeRect?.width || 0,
          sheetBottom: sheetRect?.bottom || 0,
          sheetLeft: sheetRect?.left || 0,
          sheetRight: sheetRect?.right || 0,
        };
      });
      expect(metrics.bodyWidth).toBeLessThanOrEqual(viewport.width);
      expect(metrics.sheetLeft).toBeGreaterThanOrEqual(0);
      expect(metrics.sheetRight).toBeLessThanOrEqual(viewport.width);
      expect(metrics.sheetBottom).toBeLessThanOrEqual(viewport.height);
      expect(metrics.closeHeight).toBeGreaterThanOrEqual(44);
      expect(metrics.closeWidth).toBeGreaterThanOrEqual(44);
      expect(metrics.closeRight).toBeLessThanOrEqual(viewport.width);

      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
      await expect(evidenceButton).toBeFocused();
    }

    diagnostics.assertClean();
  } finally {
    await deleteProjectAsset(request, 'agent-messages', messageId);
    await deleteProjectAsset(request, 'agent-threads', threadId);
  }
});

test('Representative mobile viewport loads the React shell without browser errors', async ({ page }) => {
  const diagnostics = collectBrowserDiagnostics(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/projects/rag-reranker/insight');
  await expect(page.locator('.icon-rail')).toBeVisible();
  await expect(page.locator('.metabar .title')).toHaveText('Knowledge map');
  await expect(page.locator('.wiki-explorer')).toBeVisible();

  const viewportVars = await page.evaluate(() => ({
    bottom: getComputedStyle(document.documentElement).getPropertyValue('--viewport-bottom-occlusion').trim(),
    safe: getComputedStyle(document.documentElement).getPropertyValue('--viewport-safe-bottom').trim(),
  }));
  expect(viewportVars.bottom).not.toBe('');
  expect(viewportVars.safe).not.toBe('');

  diagnostics.assertClean();
});
