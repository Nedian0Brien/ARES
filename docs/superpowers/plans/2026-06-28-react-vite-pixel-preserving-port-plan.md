# Plan: React/Vite Pixel-Preserving Port for ARES

**Generated**: 2026-06-28  
**Estimated Complexity**: High  
**Primary Goal**: 기존 `web/` ARES 디자인과 동작을 픽셀 보존 기준으로 React/Vite 구조에 이식한다. 새 UI를 만들지 않는다.

## Overview

React/Vite 전환의 성공 기준은 "React 앱이 뜬다"가 아니라, 기존 ARES 제품 화면과 같은 구조, 밀도, 위계, 색, 타이포그래피, 반응형 동작을 유지하면서 내부 구현만 React 컴포넌트로 바뀌는 것이다.

이 계획은 현재 실패한 `apps/web/src/App.tsx` 셸을 포팅 기준으로 사용하지 않는다. 기존 기준은 `web/index.html`, `web/styles/base.css`, `web/app.js`, `design/ARES Design System.html`, 그리고 현재 운영되는 `web/app/features/*` 모듈이다.

## Research Findings

### Finding 1: Existing app entrypoint is the visual baseline
- **File**: `web/index.html:1-18`
- **What**: 기존 앱은 `#app`에 `styles.css`와 `app.js`를 로드한다. 폰트는 Inter, JetBrains Mono, Newsreader를 사용한다.
- **Why**: React/Vite 포팅 후에도 첫 화면의 시각 결과는 이 엔트리포인트와 동일해야 한다. `#root` 기반 새 셸은 기준이 아니다.

### Finding 2: ARES tokens are already defined and must remain source of truth
- **File**: `web/styles/base.css:1-60`
- **What**: `--bg`, `--sb`, `--s1`, `--b1`, `--tx`, `--read`, `--search`, `--research`, `--insight`, `--writing` 등 핵심 토큰이 정의되어 있다.
- **Why**: Tailwind/shadcn 토큰은 이 값을 래핑해야 한다. 새 색, 새 팔레트, 새 radius 체계로 재설계하면 실패다.

### Finding 3: Sidebar and workflow chrome have fixed dimensions and density
- **File**: `web/styles/base.css:369-690`
- **What**: 데스크톱 사이드바는 232px, collapsed는 56px이며 workflow item, icon, label, hover/action 영역의 밀도가 세밀하게 정의되어 있다.
- **Why**: React 컴포넌트는 이 DOM 구조와 치수를 재현해야 한다. generic sidebar/card layout은 불합격이다.

### Finding 4: Product workflow contract exists in legacy JS
- **File**: `web/app.js:113-226`
- **What**: 4개 top-level tab과 6개 workflow stage, label, sub, color, icon, keyboard contract가 정의되어 있다.
- **Why**: React 타입/상수는 이 계약에서 파생되어야 한다. 별도 용어 또는 축약 구조를 만들지 않는다.

### Finding 5: State and routing are broad and product-connected
- **File**: `web/app.js:228-432`
- **What**: route aliases, localStorage keys, theme, project/library/results/reading/lab/insight/writing 상태가 하나의 앱 상태로 연결되어 있다.
- **Why**: React 포팅은 단순 화면 재현이 아니라 실제 API/state 흐름을 유지해야 한다. 데모 데이터 사용은 금지한다.

### Finding 6: Backend default serving must protect the existing design
- **File**: `services/backend/index.mjs:61-69`
- **What**: 기본 `WEB_DIR`는 `LEGACY_WEB_DIR`이며, `ARES_WEB_DIR`가 있을 때만 다른 프론트엔드를 서빙한다.
- **Why**: React 포팅이 완료되기 전까지 기존 디자인을 다시 덮지 않게 하는 안전장치다.

### Finding 7: Current React shell is not a valid baseline
- **File**: `apps/web/src/App.tsx:17-220`
- **What**: `recentPapers`, `labRuns` 등 데모 데이터와 generic Card/Tabs 기반 레이아웃이 들어 있다.
- **Why**: 이 파일은 재사용하지 않고 삭제/대체한다. 기존 UI를 React로 보존 이식하는 방향으로 다시 작성해야 한다.

### Finding 8: shadcn project exists but must be subordinated to ARES design
- **File**: `apps/web/src/styles/globals.css:1-139`, `apps/web/components.json`
- **What**: Vite, Tailwind v4, radix-nova, lucide 기반 shadcn 구성이 존재한다.
- **Why**: shadcn은 접근성 있는 primitive/source component로 사용하되, 외형 결정권은 ARES token/layout에 둔다.

### Finding 9: Design system explicitly forbids arbitrary design drift
- **File**: `design/ARES Design System.html:259-268`, `design/ARES Design System.html:744-758`, `design/ARES Design System.html:900-938`
- **What**: 색상 파생 규칙, 레이아웃 기준 수치, 모바일 기준, 금지 패턴, "문서 밖에서 새로 만들지 않는다"는 원칙이 명시되어 있다.
- **Why**: 픽셀 보존 포팅의 acceptance 기준이다.

## Non-Goals

- 새 SaaS 레이아웃 설계 금지
- 기존 `web/` 기능 축소 금지
- 하드코딩된 데모 데이터 금지
- `web-dist/` 자동 기본 서빙 재도입 금지
- 디자인 개선 명목의 토큰/타이포/레이아웃 변경 금지
- shadcn 기본 외형을 ARES 디자인보다 우선하는 것 금지

## Prerequisites

- Worktree: `/home/ubuntu/project/ARES/.worktrees/react-vite-shadcn`
- Existing design baseline screenshots:
  - desktop: current `/` from legacy `web/`
  - mobile: 320, 375, 768, 1440px
- Current shadcn context:
  - framework: Vite
  - Tailwind: v4
  - base: radix
  - style: radix-nova
  - aliases: `@/components`, `@/components/ui`
- Required review gate:
  - independent frontend quality review before completion

## Sprint 0: Lock Baselines and Prevent Regression

**Goal**: React work cannot overwrite the good existing design until it passes visual parity.

**Demo/Validation**:
- `/` continues to serve legacy ARES.
- React build can be served only with explicit `ARES_WEB_DIR`.

### Task 0.1: Keep backend default on legacy `web/`
- **Location**: `services/backend/index.mjs:61-69`
- **Description**: Preserve current default `LEGACY_WEB_DIR` behavior. Do not auto-detect `web-dist`.
- **Dependencies**: none
- **Acceptance Criteria**:
  - `ARES_WEB_DIR` is the only opt-in path to React build.
  - `web-dist` presence alone cannot change served default.
- **Validation**:
  - `node --test services/backend/tests/react-vite-frontend-contract.test.mjs`
  - Playwright `/`: `hasLegacyApp=1`, `hasReactApp=0`

### Task 0.2: Capture baseline screenshots
- **Location**: `design/screenshots/react-port-baseline/`
- **Description**: Capture legacy `/` at 320, 375, 768, 1440px and store as the comparison baseline.
- **Dependencies**: Task 0.1
- **Acceptance Criteria**:
  - Baselines include desktop sidebar, mobile bottom nav, Read/Discover surface.
  - Baselines are referenced by future reviews.
- **Validation**:
  - Playwright screenshot script emits deterministic PNGs.
  - `view_image` confirms no React shell.

### Task 0.3: Add visual regression guard for default route
- **Location**: `services/backend/tests/react-vite-frontend-contract.test.mjs`, optional `tests/e2e/*`
- **Description**: Extend the contract so default serving cannot regress to React shell before explicit cutover.
- **Dependencies**: Task 0.1
- **Acceptance Criteria**:
  - Test asserts no `WEB_DIST_DIR` auto-selection.
  - Browser smoke asserts legacy app markers and legacy scripts/styles.
- **Validation**:
  - `npm test`
  - targeted Playwright smoke

## Sprint 1: Extract Legacy Contracts Before Writing React UI

**Goal**: Move constants and state contracts into React-consumable modules without changing pixels.

**Demo/Validation**:
- Legacy app still runs unchanged.
- React app can import typed workflow/token contracts but does not become default.

### Task 1.1: Create shared workflow contract from legacy values
- **Location**: `apps/web/src/app/workflow.ts`, source reference `web/app.js:113-226`
- **Description**: Replace hand-written React workflow constants with a faithful typed copy of legacy `WORKFLOW_TABS`, `WORKFLOW_STAGES`, route aliases, labels, colors, icons, and default stages.
- **Dependencies**: Sprint 0
- **Acceptance Criteria**:
  - React constants match legacy labels, ids, color role, default stages.
  - No additional workflow names or labels.
- **Validation**:
  - Contract test compares React constants against a parsed or fixture copy of legacy values.

### Task 1.2: Map ARES CSS variables into Tailwind/shadcn tokens
- **Location**: `apps/web/src/styles/globals.css`, source reference `web/styles/base.css:1-60`
- **Description**: Expand token mapping so React CSS variables preserve legacy `--on-accent`, controls, hover backgrounds, scrollbar, shadows, bottom-nav variables, and theme values.
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - Tailwind/shadcn semantic tokens point to ARES tokens.
  - `body` typography matches legacy font family, feature settings, 14px size, letter spacing.
  - No new raw palette beyond ARES tokens.
- **Validation**:
  - CSS grep for unauthorized raw colors in app-authored files.
  - Screenshot diff against baseline after first shell port.

### Task 1.3: Isolate API/state contracts
- **Location**: `apps/web/src/app/api.ts`, new `apps/web/src/app/state.ts`
- **Description**: Mirror the legacy API calls and app state shape from `web/app.js:333-432` without demo data.
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - Projects, graph, library, reading sessions, search results, agent runs use real API fetchers.
  - No static `recentPapers`, `labRuns`, fake progress, or mock metrics.
- **Validation**:
  - Typecheck.
  - API smoke against `/api/projects`.

## Sprint 2: Rebuild Chrome With Pixel Parity

**Goal**: React shell matches the existing ARES app chrome before any feature surface is ported.

**Demo/Validation**:
- `ARES_WEB_DIR=$(pwd)/web-dist node services/backend/index.mjs` shows React chrome visually matching legacy screenshots.

### Task 2.1: Delete generic React shell content
- **Location**: `apps/web/src/App.tsx:17-220`, `apps/web/src/components/chrome/AppChrome.tsx`
- **Description**: Remove demo surfaces and card/grid shell. Replace with app-level layout slots matching `.app-shell`, `.desktop-sidebar`, `.workspace`, topbar, mobile nav.
- **Dependencies**: Sprint 1
- **Acceptance Criteria**:
  - No demo datasets.
  - No generic Card/Tabs screen layout for primary shell.
  - App root exposes markers useful for testing without changing visual output.
- **Validation**:
  - `rg "recentPapers|labRuns|PDF preview|Reader workbench" apps/web/src` returns nothing.

### Task 2.2: Port desktop sidebar structure
- **Location**: `apps/web/src/components/chrome/DesktopSidebar.tsx`, source reference `web/styles/base.css:369-690`
- **Description**: Recreate workspace switch, search/new paper actions, project list, workflow list, collapse area, account section with matching classes/tokens.
- **Dependencies**: Task 2.1
- **Acceptance Criteria**:
  - 232px sidebar, 56px collapsed state.
  - Active workflow item, icons, hover actions match baseline.
  - Keyboard shortcut hints preserved.
- **Validation**:
  - Playwright desktop screenshot diff.
  - Keyboard tab/focus pass.

### Task 2.3: Port topbar and mobile bottom nav
- **Location**: `apps/web/src/components/chrome/Topbar.tsx`, `apps/web/src/components/chrome/MobileWorkflowNav.tsx`
- **Description**: Recreate topbar breadcrumbs/actions and ARIS-style floating bottom nav with safe-area and auto-hide behavior.
- **Dependencies**: Task 2.2
- **Acceptance Criteria**:
  - Mobile bottom nav follows `design/ARES Design System.html:752-758`.
  - No content overlap at 320/375/414px.
  - Labels remain one line.
- **Validation**:
  - Playwright at 320, 375, 414, 768.
  - `smallControls=[]`, `overflow=false`.

### Task 2.4: Decide shadcn usage per component, not globally
- **Location**: `apps/web/src/components/ui/*`, chrome components
- **Description**: Use shadcn/Radix only where it improves accessibility or behavior: Tooltip, DropdownMenu, Dialog, Sheet, Tabs where applicable. Keep ARES visual classes and tokens.
- **Dependencies**: Task 2.1
- **Acceptance Criteria**:
  - shadcn components do not impose generic card/tabs/button look on app shell.
  - Dialog/Sheet/Tooltip have required titles/labels and focus behavior.
- **Validation**:
  - For each used shadcn component, run `npx shadcn@latest docs <component>`.
  - Read generated files before use.

## Sprint 3: Port Read / Search Surface With Real Data

**Goal**: The default Read/Discover screen matches baseline and uses actual ARES state/API.

**Demo/Validation**:
- React opt-in route shows the same Research Queue screen as legacy.

### Task 3.1: Port Read/Discover overview surface
- **Location**: `apps/web/src/features/search/*`, source references `web/app.js`, `web/styles/search.css`, baseline screenshot
- **Description**: Recreate Research Queue hero, search box, target chips, overview metrics, analytics panels, worklist filters.
- **Dependencies**: Sprint 2
- **Acceptance Criteria**:
  - No fake counts; values derive from project graph/library/search state.
  - Newsreader heading, search bar density, metric panels match baseline.
- **Validation**:
  - Screenshot diff desktop/mobile.
  - API/state tests for count derivation.

### Task 3.2: Port search interaction
- **Location**: `apps/web/src/features/search/*`, backend `/api/projects/:id/search`
- **Description**: Wire Agent/Keyword search, scope picker, filters, saving/queueing papers to real endpoints.
- **Dependencies**: Task 3.1
- **Acceptance Criteria**:
  - Search button triggers real request.
  - Loading/error states are user-facing and not fake success.
  - Saved/queued states persist.
- **Validation**:
  - Existing backend tests.
  - Browser smoke for search input, filter, save/queue.

### Task 3.3: Port Library/Reader entry states
- **Location**: `apps/web/src/features/reading/*`, source references `web/app/features/reading.js`, `web/styles/reading.css`
- **Description**: Preserve library, upload, selected paper, and Reader entry behavior without porting all PDF internals yet.
- **Dependencies**: Task 3.2
- **Acceptance Criteria**:
  - Existing PDF upload entry remains real.
  - Reader opens selected paper or shows the same empty/loading states as legacy.
- **Validation**:
  - Upload modal smoke.
  - Reading session API smoke.

## Sprint 4: Port Deep Reader, Lab, Insight, Writing In Order

**Goal**: Migrate feature surfaces one at a time while keeping legacy as default until each surface passes parity.

**Demo/Validation**:
- Each stage is demoable through React opt-in, not default cutover.

### Task 4.1: Port Reader detail shell and PDF host
- **Location**: `apps/web/src/features/reading/*`, source references `web/app/lib/pdf-viewer.js`, `web/app/features/reading-pdf-controller.js`
- **Description**: Preserve PDF canvas host, split panes, workbench, notes/chat/assets tabs, selection and source highlights.
- **Dependencies**: Sprint 3
- **Acceptance Criteria**:
  - Existing PDF rendering and annotation behavior remains.
  - No PDF placeholder replaces actual document host.
- **Validation**:
  - Existing PDF tests.
  - Browser smoke with sample PDF.

### Task 4.2: Port Lab surface
- **Location**: `apps/web/src/features/lab/*`, source references `web/app/features/lab.js`, `web/styles/lab.css`
- **Description**: Port plan/run/compare/import behavior with real graph and lab-runner state.
- **Dependencies**: Task 4.1
- **Acceptance Criteria**:
  - Destructive/medium-risk runner constraints remain.
  - Import/save paths persist to graph.
- **Validation**:
  - Lab backend tests.
  - Browser smoke for manual import and run state.

### Task 4.3: Port Insight surface
- **Location**: `apps/web/src/features/insight/*`, source references `web/app/features/evidence.js`, `web/styles/insight.css`
- **Description**: Port evidence-to-claim cards, quality criteria, contradiction traces, and draft handoff.
- **Dependencies**: Task 4.2
- **Acceptance Criteria**:
  - Existing insight card data model preserved.
  - No decorative placeholder columns.
- **Validation**:
  - Existing insight tests.
  - Browser smoke for create/edit/delete/select.

### Task 4.4: Port Writing surface
- **Location**: `apps/web/src/features/writing/*`, source references `web/app/features/draft.js`, `web/styles/writing.css`
- **Description**: Port outline, draft sections, sources, suggestions, exports.
- **Dependencies**: Task 4.3
- **Acceptance Criteria**:
  - Export bundle output remains unchanged.
  - Missing evidence warnings remain visible.
- **Validation**:
  - Existing writing/export tests.
  - Browser smoke for edit/export.

## Sprint 5: Cutover Only After Parity

**Goal**: Make React/Vite the default only after visual, behavioral, and review gates pass.

**Demo/Validation**:
- Default `/` serves React build only when all parity gates pass.

### Task 5.1: Add parity test suite
- **Location**: `tests/e2e/react-parity.spec.mjs`, screenshot baseline directory
- **Description**: Add Playwright checks for root chrome, Read/Discover, Library, Reader, Lab, Insight, Writing at 320/375/768/1440px.
- **Dependencies**: Sprint 4
- **Acceptance Criteria**:
  - Checks validate DOM markers, scripts, no overflow, no console errors.
  - Visual screenshots are reviewed by independent subagent.
- **Validation**:
  - `npm run test:e2e` or targeted Playwright command.

### Task 5.2: Run independent frontend review gate
- **Location**: process gate, no code-only shortcut
- **Description**: Give reviewer URL, screenshots, changed files, baseline, requirements, and verification results.
- **Dependencies**: Task 5.1
- **Acceptance Criteria**:
  - Review result is `pass`.
  - No critical/major visual or behavior findings.
- **Validation**:
  - Subagent review output recorded in completion notes.

### Task 5.3: Change default serving to React build
- **Location**: `services/backend/index.mjs`, tests
- **Description**: Only after passing parity, update default frontend serving path or deployment config to use React build.
- **Dependencies**: Task 5.2
- **Acceptance Criteria**:
  - Default `/` serves React and matches legacy baseline.
  - Rollback to `web/` is one env/config change.
- **Validation**:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run web:build`
  - `npm test`
  - `npm run test:e2e`
  - browser screenshots and subagent pass

## Testing Strategy

- **Static checks**:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run web:build`
- **Backend/unit**:
  - `npm test`
  - targeted tests for state reducers/API adapters
- **Browser**:
  - Playwright desktop: 1440px
  - Playwright tablet: 768px
  - Playwright mobile: 320px and 375px
  - Assert no console/page errors, no horizontal overflow, no undersized touch targets.
- **Visual acceptance**:
  - Compare against stored legacy screenshots.
  - Any obvious quality downgrade from legacy is a block.
- **Review gate**:
  - Independent frontend review must pass before any completion claim.

## Potential Risks & Gotchas

- **Risk**: React shell reintroduces generic card/sidebar layout.
  - **Mitigation**: Delete current generic `App.tsx` surfaces before porting and use baseline screenshots as acceptance tests.
- **Risk**: shadcn default styles override ARES visual language.
  - **Mitigation**: Use ARES classes/tokens for visible styling; use shadcn/Radix selectively for behavior/accessibility.
- **Risk**: Legacy state is too broad for one React rewrite.
  - **Mitigation**: Port one surface at a time behind explicit React opt-in.
- **Risk**: Feature parity breaks while screenshots look close.
  - **Mitigation**: Browser tests must click real actions and verify API/state changes.
- **Risk**: `web-dist` accidentally becomes default again.
  - **Mitigation**: Keep contract test blocking `WEB_DIST_DIR` auto-selection until final cutover.
- **Risk**: Pixel preservation conflicts with accessibility improvements.
  - **Mitigation**: Accessibility changes must be visually neutral or reviewed against baseline.

## Rollback Plan

- Keep `services/backend/index.mjs` defaulting to `LEGACY_WEB_DIR` until Sprint 5.
- If React opt-in fails, unset `ARES_WEB_DIR` and delete `web-dist/`.
- Do not remove legacy `web/` until React has shipped and passed live verification.
- Keep baseline screenshots and legacy tests until at least one stable release after React cutover.

## Completion Criteria

React/Vite port is complete only when:

- Default `/` can serve React without visible downgrade from legacy ARES.
- No demo/fake state remains in visible surfaces.
- Existing project/library/search/reading/lab/insight/writing flows remain real.
- `npm run lint`, `npm run typecheck`, `npm run web:build`, `npm test`, and browser verification pass.
- Independent frontend review returns `pass`.
- User can compare screenshots and see the same or better product quality, not a new generic UI.
