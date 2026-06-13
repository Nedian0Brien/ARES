# ARES Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce ARES maintainability hotspots without changing user-visible behavior.

**Architecture:** Refactor along existing feature boundaries. Shared pure view helpers move into small modules first; backend parsing gets a single artifact materialization path; route and styling splits happen only after tests prove the existing behavior is covered.

**Tech Stack:** Plain ESM JavaScript, Node test runner, Playwright, existing ARES CSS tokens, existing `rtk` command wrapper.

---

## Current Evidence

- Large files: `web/app.js` (7,229 lines), `web/styles.css` (9,917 lines), `services/backend/lib/reading-service.mjs` (2,359 lines), `web/app/features/reading.js` (2,302 lines), `services/backend/index.mjs` (1,087 lines).
- Direct duplication exists between `web/app.js` and `web/app/features/reading.js` for Reading view helpers such as `clampValue`, `readingText`, `readingExcerpt`, `readingSentence`, `readingCategoryMeta`, `readingSectionPage`, and `readingMatchSectionIndex`.
- `services/backend/lib/reading-service.mjs` repeats the same materialization sequence across metadata, text-layer PDF, built-in OCR, and external OCR import paths.
- `web/app.js` still owns Reading-specific partial DOM patching orchestration, even though PDF rendering and DOM transplant helpers have already started moving into focused modules.
- `services/backend/index.mjs` routes several product domains through one long request handler.
- `web/styles.css` groups all product surface CSS in one file.

## Non-Goals

- No feature behavior changes.
- No visual redesign.
- No dependency replacement.
- No database destructive operation.
- No cleanup of unrelated existing dirty worktree changes.

## Sprint 1: Shared Reading View Helpers

**Goal:** Remove behavior-preserving duplicated pure helpers between app shell and Reading feature renderer.

**Demo/Validation:**
- `rtk npm run lint`
- `rtk npm test -- services/backend/tests/search-reading-tab-contract.test.mjs`
- `rtk rg -n "function clampValue|function readingText|function readingExcerpt|function readingSentence|function readingCategoryMeta|function readingSectionPage|function readingMatchSectionIndex" web/app.js web/app/features/reading.js`

### Task 1.1: Add shared Reading view helper module

**Files:**
- Create: `web/app/features/reading-view-helpers.js`
- Modify: `web/app.js`
- Modify: `web/app/features/reading.js`

- [x] Create `createReadingViewHelpers({ TOKENS })` exporting pure helpers.
- [x] Import helpers in `web/app.js`.
- [x] Import helpers in `web/app/features/reading.js`.
- [x] Remove duplicate local helper definitions where behavior is identical.
- [x] Keep `readingProgress` local until both call sites agree on exact semantics.
- [x] Validate with lint and Reading contract tests.

## Sprint 2: Reading Artifact Materialization

**Goal:** Consolidate repeated backend parse materialization into a single helper without changing parse outputs.

**Demo/Validation:**
- `rtk npm test -- services/backend/tests/reading-service.test.mjs`
- `rtk npm test -- services/backend/tests/reading-routes.test.mjs`
- `rtk npm run lint`

### Task 2.1: Extract artifact materialization helper

**Files:**
- Modify: `services/backend/lib/reading-service.mjs`

- [x] Add an internal helper that takes `session`, `pages`, `source metadata`, `imagePages`, `tablePages`, and optional `pdfBuffer`.
- [x] Have metadata parse, text-layer parse, and built-in OCR parse call the helper.
- [x] Keep external OCR import as a separate call first, then fold it in only if the shape matches cleanly.
- [x] Validate that parse, OCR, asset quality, evidence coverage, and summary tests remain green.

## Sprint 3: Reading DOM Patch Boundary

**Goal:** Move Reading-specific partial DOM patch orchestration out of the global app shell.

**Demo/Validation:**
- `rtk npm test -- services/backend/tests/search-reading-tab-contract.test.mjs`
- `rtk npm run test:e2e`
- `rtk npm run lint`

### Task 3.1: Extract Reading patch controller

**Files:**
- Create: `web/app/features/reading-stage-patch.js`
- Modify: `web/app.js`

- [x] Move `patchReadingWorkbenchPaneOnly`, `patchReadingDocumentPaneOnly`, `patchReadingPdfSelectionBarOnly`, `patchReadingPdfSelectionSurfaces`, `patchReadingStageUI`, and `refreshReadingStageUI` into a factory that receives state and render callbacks.
- [x] Keep DOM helper functions in `reading-dom-patch.js`.
- [x] Keep global shell routing and stage selection in `web/app.js`.
- [x] Validate Reading PDF selection, PDF dock, chat, and Lab handoff E2E.

## Sprint 4: Backend Route Modules

**Goal:** Reduce `services/backend/index.mjs` request handler size by moving route groups behind explicit handlers.

**Demo/Validation:**
- `rtk npm test -- services/backend/tests/reading-routes.test.mjs`
- `rtk npm test -- services/backend/tests/asset-routes.test.mjs`
- `rtk npm test -- services/backend/tests/agent-runs.test.mjs`
- `rtk npm run lint`

### Task 4.1: Extract Reading routes

**Files:**
- Create: `services/backend/routes/reading-routes.mjs`
- Modify: `services/backend/index.mjs`

- [x] Move PDF, parse, import-text, summarize, extract-assets, chat, note, and asset-file route handling into a focused handler.
- [x] Keep common response helpers in `index.mjs` until a second route group needs them.
- [x] Validate all Reading route tests.

### Task 4.2: Extract asset graph routes

**Files:**
- Create: `services/backend/routes/asset-routes.mjs`
- Modify: `services/backend/index.mjs`

- [x] Move project graph and asset CRUD routes into a focused handler.
- [x] Preserve delete confirmation behavior.
- [x] Validate asset route and store tests.

## Sprint 5: CSS Surface Split

**Goal:** Make product-surface CSS easier to review without changing selectors or tokens.

**Demo/Validation:**
- `rtk npm run lint`
- `rtk npm run test:e2e`
- Browser smoke at desktop and mobile widths if CSS loading changes.

### Task 5.1: Split CSS by surface

**Files:**
- Create: `web/styles/base.css`
- Create: `web/styles/reading.css`
- Create: `web/styles/lab.css`
- Create: `web/styles/insight.css`
- Create: `web/styles/writing.css`
- Modify: `web/styles.css` or `web/index.html`

- [x] Decide whether to keep `web/styles.css` as an import manifest or load multiple files.
- [x] Move selectors in contiguous chunks only.
- [x] Keep CSS variables and token definitions in base.
- [x] Validate no selector renames and no visual flow break in E2E.

## Sprint 6: Agent Run Service Split

**Goal:** Separate prompt builders, fallback builders, execution orchestration, and persistence helpers.

**Demo/Validation:**
- `rtk npm test -- services/backend/tests/agent-runs.test.mjs`
- `rtk npm test -- services/backend/tests/agent-runtime.test.mjs`
- `rtk npm run lint`

### Task 6.1: Extract prompt and fallback builders

**Files:**
- Create: `services/backend/lib/agent-run-prompts.mjs`
- Create: `services/backend/lib/agent-run-fallbacks.mjs`
- Modify: `services/backend/lib/agent-runs.mjs`

- [x] Move pure prompt builders first.
- [x] Move pure fallback builders second.
- [x] Leave `createAgentRunService` orchestration in place until the pure moves are stable.
- [x] Validate agent run tests after each move.

## Final Completion Gate

- [x] All planned tasks complete.
- [x] `rtk npm test` passes.
- [x] `rtk npm run lint` passes.
- [x] `rtk npm run test:e2e` passes.
- [x] `rtk git diff --check` passes.
- [x] Refactor plan checkboxes are updated.
- [x] No duplicated Reading pure helper definitions remain in `web/app.js` and `web/app/features/reading.js`.
- [x] No behavior-changing TODOs are introduced by the refactor.

## Risks & Gotchas

- Existing worktree is already dirty from feature-completion work; every refactor must avoid reverting unrelated changes.
- Some duplicate Reading helpers are not identical. Do not blindly share helpers when semantics differ.
- `web/app.js` partial DOM patching exists to preserve PDF canvas state. Refactors here must be validated with Playwright, not just node tests.
- CSS splitting can change cascade order. Move selectors in original order or keep `styles.css` as an import manifest.
- Route extraction can accidentally change status codes. Preserve current `409`, `404`, and delete confirmation behavior exactly.

## Rollback Plan

- Revert each refactor task as a self-contained patch if its validation fails.
- If a task reveals behavior coupling, stop that task and keep the previous passing boundary.
