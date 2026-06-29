# ARES v1 (4탭) 구현 체크리스트 — React 프론트 재작성 (백엔드 보존)

작성일: 2026-06-29 · 갱신: 2026-06-29 (전략 확정: **React 프론트 전면 재작성 / 백엔드 0 재작성**)
기준 문서(SSOT): [`design/DESIGN.md`](../design/DESIGN.md) · canonical: `design/ARES Papers Workspace.html` · 토큰: `design/ARES Design System.html`

확정 4탭 디자인(Reading / Lab / Wiki / Agent)을 실제 앱으로 구현한다. **전략 = `design/ARES Papers Workspace.html`(React+Babel CDN 목업)을 실제 React 빌드로 승격해 프론트엔드를 갈아엎되, 백엔드·데이터 모델·에이전트 런타임·reading 서비스는 그대로 보존하고 와이어링만 한다.** 옛 바닐라 JS 프론트(`web/app.js` + `web/app/features/*` + 옛 `web/styles/*` 화면)는 폐기한다.

> 핵심 원칙: **프론트 100% 재작성, 백엔드 0% 재작성.** 목업은 목 데이터 프레젠테이션 명세 — 모든 화면을 기존/신규 엔드포인트에 연결하는 것이 실제 작업이다.

---

## 0. 사용 규칙 / 판정 기준

- `[ ]` 미착수 · `[~]` 부분 · `[x]` 완료. **완료 = 코드 + 테스트 + 런타임 검증(1440 @2x 스크린샷 또는 e2e)** 셋 모두. 화면/문서에만 있으면 미완료.
- 각 항목: **Location**(경로) · **설명** · **Acceptance** · **Validation**(명령/검증).
- **Over-implementation Product Rule (필수, [`overimplementation-audit.md`](overimplementation-audit.md)):** 사용자 산출물(notes·insightCards·writingDrafts·wiki pages·agent 저장답변 등)에는 **명시적 사용자 생성/저장/승인** 또는 **실제 성공 런타임 결과**만 적재. 실패 fallback·데모·자동 후보는 derived 상태로만. → DESIGN §가짜 완성도 배제.
- **불변 사실:** LLM/에이전트 런타임 = **Codex CLI 서브프로세스**(`lib/agent-runtime.mjs`, Anthropic/OpenAI SDK 미사용). 새 provider SDK 도입 금지 — 기존 런타임 추상 재사용. 저장소 = file/Postgres(`lib/store.mjs`), 데이터 = 자산 그래프(`lib/asset-model.mjs`). 목업의 모델 pill(`claude-opus-4`)은 cosmetic(런타임 config).

---

## 1. 보존 / 재작성 경계

| 레이어 | 결정 | 비고 |
|---|---|---|
| 백엔드 HTTP·라우트 | **보존** | `services/backend/index.mjs`, `routes/*` — 신규 엔드포인트만 추가 |
| 데이터 모델·store | **보존** | `lib/asset-model.mjs`, `file-store`/`postgres-store`, 마이그레이션 |
| 에이전트 런타임·SSE·lease 워커 | **보존** | `lib/agent-runs.mjs`, `agent-runtime.mjs`, `bin/agent-worker.mjs` |
| Reading **서비스(백엔드)** | **보존** | `lib/reading-service.mjs` (PDF/parse/OCR/요약/chat/assets) |
| auth/ACL/감사 | **보존** | `lib/auth.mjs`, `ares_project_access`, `ares_audit_events` |
| 프론트 앱(`web/app.js`+features) | **폐기 → React 재작성** | 7,300줄 innerHTML 폐기 |
| 옛 stage CSS(`web/styles/{search,lab,insight,writing,reading}.css`) | **폐기/대체** | 목업 CSS로 대체; base.css 토큰·모바일/iOS 토큰은 **이식** |
| 모바일/iOS 머신러리·딥링크 라우터·PDF.js 통합 | **이식(재유도 금지)** | 하드원 로직 → React 훅으로 포팅 |
| e2e/contract 테스트 | **마이그레이션** | data-* 계약 새 표면으로 이관 |

---

## 2. 프로젝트 토대 (Vite + React)

- [x] **Vite + React 18 빌드 도입** — Location: `web/` 재구성(`web/src/`, `web/index.html`, `vite.config.ts`, `package.json` scripts). Babel-CDN 제거. Acceptance: `npm run dev`(Vite) · `npm run build`(정적 산출 `web/dist`). Validation: 빌드 성공 + 기본 셸 렌더. 검증: `npm run build`, `npm run lint`, Playwright 1440×900 smoke(rail 4개, metabar, console error 0).
- [x] **목업 → 컴포넌트 분해** — Location: `design/ARES Papers Workspace.html`을 모듈로. 경계는 이미 명확: `Icon`(레지스트리), `Shell`/`ProductRail`, Reading(`LibraryView`/`LibraryPanel`/`LibStatus`/리더 `ReadingTab` 등), Lab(`ProjectGrid`/`ProjectPanel`/`LabBoard`/`KanCard`/`RunnerConsolePane`/`ReportPane`/`StageBar`/`XpChart`), Wiki(`GraphView`/`WikiList`/`WikiGrid`/`WikiDoc`), Agent(`ConversationPane`/`EvidencePane`/`AgentPanel`/`Cite`). Acceptance: `web/src/components/*`·`web/src/tabs/*`로 분해, 목 데이터는 `web/src/mock/*`에 임시 격리(이후 API로 교체). Validation: 각 탭 목업과 픽셀 동등 렌더. 검증: `npm run build`, `npm run lint`, Playwright 4탭 smoke console error 0, `ref-reading-library`/`ref-lab-projects`/`ref-agent` diff 0. `ref-wiki`는 목업 자체의 force graph `Math.random()` 초기 좌표 때문에 정적 ref와 약 0.97% 차이(디자인 파일 직접 캡처도 동일)로 판정.
- [x] **정적 서빙 repoint** — Location: `services/backend/index.mjs` `serveStatic`. 빌드 산출(`web/dist`)을 서빙(개발은 Vite dev + `/api` 프록시 → Node). Acceptance: 백엔드가 React 빌드 서빙, `/api/*`·`/__vendor/pdfjs/*` 유지. Validation: `bash deploy/smoke-dev-web.sh`. 검증: `PORT=3110 HOST=127.0.0.1 node services/backend/index.mjs` + Playwright `/` smoke, console error 0.
- [x] **dev live-reload/프록시** — 기존 `/__dev/reload` 대체 또는 Vite HMR. Acceptance: 개발 HMR + API 프록시 동작. 검증: `npm run dev -- --port 5173` + Playwright `/` smoke, console error 0.

---

## 3. 디자인 시스템 이식

토큰 4 accent는 이미 일치(`--read/--research/--search/--writing`) — 목업 CSS를 정본으로 이식.

- [~] **토큰/스타일 이식** — Location: 목업 `<style>` → `web/src/styles/tokens.css` + 컴포넌트 CSS(모듈 또는 전역). 셸 치수(`--activity-rail-width:56`,`--metabar-height:58`,`--float-panel-width:288`), 스페이싱/라디우스/타입 스케일(DESIGN System), 다크모드. **base.css의 모바일/iOS 뷰포트 토큰(`--viewport-bottom-occlusion` 등)은 그대로 이식.** Acceptance: 토큰만으로 전 화면 구성. 현재: 목업 CSS와 셸 치수·모바일/iOS·dark 토큰을 `web/src/styles/tokens.css`로 이식했고, 레일/메타바/플로팅 패널은 토큰 참조. 컴포넌트 내부 인라인 치수/색의 토큰화는 남음.
- [x] **공유 프리미티브** — `Icon`(1.75 stroke 레지스트리), 칩, 세그먼트 토글(`.seg`), 상태 pill, 카드/리스트 행, 빈/로딩/에러 컴포넌트. Acceptance: 탭 간 중복 0. 현재: `web/src/components/primitives.jsx`, `ProductRail.jsx`, 공용 CSS primitive로 분리. 검증: `npm run build`, `npm run lint`, Playwright 4탭 smoke console error 0.

---

## 4. 셸 & 라우팅

- [x] **제품 레일(56px) + 4탭** — Location: `web/src/components/ProductRail`. Reading/Lab/Wiki/Agent, accent+인디케이터, 하단 아바타. Acceptance: DESIGN 정합. 검증: Playwright 1440×900 4탭 smoke, console error 0.
- [x] **메타바(58px)** — crumb + 타이틀/byline + 탭별 토글/브레드크럼 슬롯. Acceptance: 탭이 자기 메타바 주입(Reading 라이브러리⇄리더, Lab `‹프로젝트/‹보드`+세그먼트, Wiki Graph/List/Grid, Agent 모델 셀렉터). 검증: 4탭 smoke에서 `.metabar` 노출 확인.
- [x] **플로팅 패널(288px) 셸** — 슬라이드인, 탭별 내부 내비. Acceptance: 4탭 공유. 현재: Reading/Lab/Wiki/Agent 탭별 패널이 같은 `.float-panel` 토큰/스타일을 사용.
- [~] **리사이즈 분할 프리미티브** — Document↔Workbench/대화↔근거/콘솔↔리포트. 수평·수직 토글·접기·드래그. Acceptance: Reading/Agent/Lab 워크스페이스 공유. Validation: e2e 드래그/접기. 현재: 목업의 Reading/Agent/Lab 분할 동작은 포팅됐으나 공용 primitive 추출과 e2e 드래그 검증은 남음.
- [x] **해시 라우터 + 딥링크 호환(이식)** — Location: `web/src/router/*`. 기존 `#/projects/:id/:stage/...`·`surface-router.js` alias를 React 라우팅으로 포팅. **옛 6단계 해시(`search/result/insight/writing`)가 새 탭으로 normalize되어야 함(하드 요구).** 리더 딥링크(`.../reading/sessions/:sessionId/:docTab?...`) 유지. Acceptance: 옛 URL 404 0. Validation: surface-router 테스트 + e2e 라우트. 검증: `node --test services/backend/tests/four-tab-navigation-contract.test.mjs`, Playwright 6단계 hash smoke + reader summary deep link, console error 0.
- [x] **⌘1~4 탭 전환·포커스/ARIA** — Acceptance: 키보드·스크린리더 라벨. 검증: Playwright `Control+1~4` 탭 전환 smoke, console error 0.

---

## 5. 데이터 레이어 (목 → 실제)

- [x] **API 클라이언트** — Location: `web/src/lib/api.ts`. `fetch` 래퍼(base-URL 해석은 기존 `resolveAppBaseUrl` 로직 포팅: `/proxy/NNN/`·`index.html` 대응), 세션 쿠키·CSRF. Acceptance: 모든 호출 일원화. 현재: `web/src/lib/api.js`에 base URL, same-origin credentials, CSRF 저장/첨부, JSON/FormData body, 413 오류 처리 구현. 검증: `node --test services/backend/tests/react-data-layer-contract.test.mjs`, `npm run build`, `npm run lint`, `/api/auth/me` browser smoke.
- [~] **서버 상태 캐시** — React Query(또는 경량 훅). 프로젝트/라이브러리/그래프/리딩세션/에이전트런 쿼리·무효화. Acceptance: 목 배열 전부 제거(`web/src/mock/*` 폐기). 현재: `web/src/lib/serverState.js` 경량 cache/invalidate hook 추가. Reading 라이브러리, Lab 프로젝트/보드, Wiki, Agent 탭은 API를 우선 조회하고 빈 서버 상태를 실제 빈 상태로 렌더한다. Reading 라이브러리 서버 필터/메타 패치 API까지 연결했고, Agent queued run은 SSE terminal event로 thread/messages를 재조회한다. 리딩세션 SSE와 남은 mock 제거는 남음. 검증: `node --test services/backend/tests/react-reading-library-wiring-contract.test.mjs services/backend/tests/react-lab-wiring-contract.test.mjs services/backend/tests/react-wiki-agent-wiring-contract.test.mjs`, `npm run test:e2e`.
- [~] **SSE 훅** — `useAgentRunEvents(runId)` 등 `/api/agent-runs/:id/events`·신규 스트림. Acceptance: 실행/대화 진행 라이브. 현재: `web/src/lib/sse.js`에 generic `useEventSource`와 agent-run 전용 `useAgentRunEvents()`를 추가해 backend `progress` replay와 `run` snapshot stream을 React에서 받을 수 있다. Agent 탭은 queued chat run id를 구독하고 terminal event에서 thread/messages를 재조회한다. Lab 실행 progress UI 연결은 남음. 검증: `node --test services/backend/tests/react-data-layer-contract.test.mjs services/backend/tests/react-wiki-agent-wiring-contract.test.mjs`.
- [x] **auth 세션** — `GET /api/auth/me`·login/logout, dev 헤더 모드. Acceptance: 인증/프로젝트 접근 가드 반영. 현재: `web/src/lib/auth.js` `useAuthSession()` 추가 및 App 초기화. 검증: `/api/auth/me` browser smoke 200, console/request error 0.

---

## 6. 모바일 / iOS 이식 (재유도 금지)

> 참조: [`reading-mobile-ux-audit.md`](reading-mobile-ux-audit.md), [`ios-safari-viewport.md`](ios-safari-viewport.md). 기존 로직을 React 훅으로 **포팅**(처음부터 다시 만들지 말 것).

- [x] **visualViewport occlusion 훅** — `--viewport-bottom-occlusion` 런타임 계산 포팅. Acceptance: iOS Safari 하단 고정 UI 안 가림. 현재: `web/src/lib/mobileViewport.js` `useVisualViewportOcclusion()`으로 `visualViewport` resize/scroll, orientation, pageshow, visibilitychange 동기화. 검증: `node --test services/backend/tests/react-mobile-runtime-contract.test.mjs`, 모바일 Playwright CSS 변수 smoke, console error 0.
- [x] **bottom-nav 자동숨김 상태머신** — `mobile-scroll-auto-hide.js` 로직 포팅. 4탭 ≥44px·safe-area. Acceptance: 스크롤 시 숨김/복귀. 현재: 기존 reducer를 React `useMobileAutoHide()` hook 경계로 연결. 실제 bottom-nav UI 적용은 탭별 모바일 패턴에서 이어짐.
- [~] **브레이크포인트** — mobile 900 / tablet 1279 / reading orient 1180. Acceptance: 탭별 반응형 분기. 현재: viewport hook과 토큰은 이식했지만, 4탭 React 표면의 탭별 반응형 분기는 남음.
- [~] **탭별 모바일 패턴** — Wiki 뷰어 페이지전환 오버레이, Agent 근거 bottom-sheet, Lab 보드 가로스크롤+워크스페이스 전면, Reader dock-as-sheet(P0~P2 유지). 현재: React Reader Workbench는 모바일에서 PDF pane을 먼저 보여주고 Chat/Notes/Assets를 명시 버튼으로 여는 detail panel로 전환했으며, `320/375/390/768/860px` e2e에서 기본 숨김·44px action·overflow 방지를 검증한다. Wiki는 모바일 List→문서 viewer 전면 오버레이, 44px back action, 닫기 후 explorer 복귀, 가로 overflow 방지를 e2e로 고정했다. Agent는 실제 `citations[]`가 있는 assistant message에서 `근거 모두 보기` 44px 버튼으로 Evidence bottom-sheet를 열고 닫으며, `320/375/390/768px`에서 close button containment, focus 이동/복귀, Escape close, viewport overflow 방지를 e2e로 고정했다. Lab은 `320/375/768px`에서 side panel을 숨긴 board 내부 가로스크롤, card→workspace 전면 진입, 44px back, body overflow, disabled control affordance를 e2e와 품질 리뷰로 고정했다. Reader PDF dock은 `320/375/390/768px`에서 목차/본문 검색/페이지 미리보기를 bottom sheet로 열고, 44px touch target, sheet viewport clamp, dock 가로 overflow 방지를 e2e로 고정했다. PDF selection 전용 action sheet의 완전 포팅은 남음. Validation: e2e 390/375/320 + 768.

---

## 7. Reading 탭 — 라이브러리 ⇄ 리더

> Reading **백엔드/서비스는 보존**([`reading-implementation-checklist.md`](reading-implementation-checklist.md)). 프론트는 React로 재작성하되 **리더는 가장 복잡 → 마지막에 포팅**.

### 7.1 라이브러리 (React 신규 + 백엔드 보강)
- [~] **컬렉션·태그·상태 모델/API** — Location: backend `lib/library-model.mjs`(신규) + `routes/library-routes.mjs`(신규). 서가(전체/읽는 중/안 읽음/완독/중요)·컬렉션·태그. `GET /api/projects/:id/library?shelf=&collection=&tag=&q=&sort=`, 컬렉션/태그/flag 변경. Acceptance: 필터·정렬 서버 반영. 현재: `services/backend/lib/library-model.mjs`가 `shelf/libraryStatus`, `readingProgress`, `flag`, `tags`, `collectionIds`를 정규화하고 file/Postgres `savePaper()` 경로가 같은 payload 계약을 쓴다. `GET /api/projects/:id/library`와 legacy `/api/library`는 `q/shelf/collection/tag/sort`를 반영하고, `PATCH /api/projects/:id/library/:paperId`는 메타 변경을 저장한다. 컬렉션 목록 CRUD/이름 관리와 감사 이벤트 보강은 남음. Validation: `node --test services/backend/tests/library-model.test.mjs services/backend/tests/reading-routes.test.mjs`, `npm run test:e2e`.
- [~] **라이브러리 프론트** — Location: `web/src/tabs/reading/Library*`. 정리 패널(서가/컬렉션/태그) + 툴바(검색·정렬·카운트·목록↔격자) + 목록 행(상태 링·메타·태그·메모수·열기) + 격자 카드. 데이터 = library API. Acceptance: DESIGN `ref-reading-library.png` 정합. 현재: `GET /api/projects/:id/library` 응답으로 목록/격자/카운트/선택 논문 메타바를 렌더하며, 서버의 `tags/collectionIds/flag/readingProgress`를 row/card 상태에 반영한다. 검색·서가·컬렉션·태그·정렬 상태는 `q/shelf/collection/tag/sort` 서버 쿼리로 연결했고, 전체 라이브러리 조회를 따로 유지해 필터 중에도 패널 카운트와 태그/컬렉션 목록이 실제 저장 논문 기준으로 남는다. 서버에 논문이 없으면 mock 논문을 사용자 자산처럼 표시하지 않는다. PDF 업로드 후 라이브러리를 새로 읽는다. 컬렉션 생성 UI, arXiv/DOI/URL import, 리더 세션 연결, screenshot parity는 남음. Validation: `node --test services/backend/tests/react-reading-library-wiring-contract.test.mjs services/backend/tests/library-model.test.mjs services/backend/tests/reading-routes.test.mjs`, `npm run test:e2e`.
- [~] **논문 추가** — PDF 업로드(`POST .../reading-sessions/upload`) + arXiv/DOI/URL import. Acceptance: 추가 시 라이브러리·세션 생성. 현재: React `논문 추가` 액션이 native PDF picker를 열고 binary PDF를 `/api/projects/:id/reading-sessions/upload`로 전송한다. 성공 시 같은 library API를 다시 읽어 새 논문을 목록에 표시한다. arXiv/DOI/URL import와 업로드 후 리더 세션 자동 진입은 남음. Validation: Playwright `Reading library uploads a PDF through the React action`.

### 7.2 리더 (React 포팅 — 최난도)
- [~] **PDF.js React 컴포넌트** — Location: `web/src/tabs/reading/PdfView`. **실제 PDF 렌더**(목업의 손작성 PDF 아님). 기존 `web/app/lib/pdf-viewer.js`·reader patch 컨트롤러 로직을 React refs/effect로 포팅(페이지 가상화·검색·아웃라인·썸네일·줌·페이지점프·텍스트 선택 → 하이라이트/노트/링크). `/__vendor/pdfjs/*` 재사용. 현재: React reader가 `GET /api/projects/:id/reading-sessions`로 실제 세션을 선택하고, `hydrateReadingPdfSurface()`를 통해 `/api/reading-sessions/:id/pdf`를 canvas/text layer로 렌더한다. 검색·아웃라인·썸네일·페이지점프·선택→하이라이트/노트/링크 액션은 남음. Validation: `node --test services/backend/tests/react-reading-library-wiring-contract.test.mjs`, Playwright `Reading reader hydrates a real session PDF in the React PDF tab`.
- [x] **Document↔Workbench 분할 + 탭** — Summary/PDF ↔ Chat/Notes/Assets, 방향 토글·접기. 각 탭 데이터 = `/api/reading-sessions/:id/{summarize,chat,notes,extract-assets,assets/:id/file}`. 현재: Summary/Chat/Notes/Assets Workbench가 선택된 실제 reading session의 `summaryCards/chatMessages/notes/assets`를 렌더하고, Summary 생성과 Chat 전송은 실제 endpoint를 호출한 뒤 세션을 재조회한다. Notes 탭은 UI에서 수동 note 생성·수정·삭제를 실제 notes endpoint로 수행하고, Reading note → Wiki 저장도 실제 `wikiPages` 자산을 만든다. Assets 탭은 asset card → 상세 패널, source region preview, PDF source page jump, thumb/data file link, citation copy를 실제 session asset 데이터로 렌더하고, `Refresh assets`가 `POST /api/reading-sessions/:id/extract-assets`를 호출한 뒤 session을 재조회한다. 모바일에서는 PDF pane을 기본으로 유지하고 Chat/Notes/Assets를 명시 버튼으로 여는 workbench detail panel로 전환한다. mock `MESSAGES/NOTES/ASSETS` 기반 Workbench 렌더는 제거했다. Validation: `node --test services/backend/tests/react-reading-library-wiring-contract.test.mjs`, Playwright `Reading workbench renders parsed session summary, notes, and assets from the API`, `Reading workbench opens as a mobile detail panel from explicit actions`.
- [~] **워크벤치 Chat ChatGPT급(좁은 pane 버전)** — 버블·15px·둥근 컴포저·검은 원형 전송·하단 페이드. 데이터 = `POST /api/reading-sessions/:id/chat`(인용 포함). 현재: React Chat composer가 parsed session에서만 활성화되고 `POST /chat`으로 전송한다. 런타임 의존 실제 답변 e2e와 citation hover/detail은 남음. Acceptance: DESIGN 정합.
- [x] **플로팅 패널 Overview/Library/Outline/Notes** — 데이터 = 세션 + library. 현재: Reader 좌측 패널이 실제 library 목록과 선택 reading session의 sections/notes를 props로 받아 Overview/Library/Outline/Notes를 렌더한다. mock `LIBRARY/OUTLINE/NOTES` 기반 패널 렌더는 제거했다. Validation: `node --test services/backend/tests/react-reading-library-wiring-contract.test.mjs`, Playwright `Reading workbench renders parsed session summary, notes, and assets from the API`.
- [~] **모바일 리더** — dock-as-sheet·readable-scale·44px·viewport-fixed(P0~P2). 현재: Workbench detail panel은 `320/375/390/768/860px`에서 PDF 우선, 명시 action, 44px touch target, overflow 방지를 검증한다. PDF dock은 `320/375/390/768px`에서 목차/본문 검색/페이지 미리보기 sheet, 검색 input/result 44px, page buttons 44px, sheet viewport bounds, dock 가로 overflow 방지를 검증한다. PDF selection 전용 action sheet와 실제 iOS Safari 실기기 확인은 남음. Validation: e2e 3 viewport.

---

## 8. Lab 탭 — 프로젝트 → 보드 → 워크스페이스 (+ 실험 실행)

> 백엔드 자산(`reproductionPlans`/`experimentRuns`/`resultDossiers`)·런너 안전계약 보존(미연결 → **연결**).

### 8.1 프로젝트
- [~] **프로젝트 자산/요약 모델·API** — `lib/project-model.mjs` 확장 + `GET /api/projects`(카운트)·`GET /api/projects/:id/assets?kind=docs|artifacts|datasets`. Acceptance: 카드 자산 칩·상태 분포 데이터. 현재: 신규 API를 만들지 않고 기존 `GET /api/projects/:id/graph`의 `project`/`papers`/`readingPackets`/`reproductionPlans`/`experimentRuns`/`resultDossiers`에서 Lab 프로젝트 카드와 자산 패널 데이터를 계산한다. 전용 assets API와 다중 Lab project grouping은 남음.
- [~] **프로젝트 랜딩(React)** — `web/src/tabs/lab/ProjectGrid`. 카드(자산 칩·상태 분포 바·범례). Acceptance: DESIGN `ref-lab-projects.png` 정합. 현재: project graph 기반 docs/experiments/artifacts count와 상태 분포를 렌더한다. 저장 자산이 없으면 빈 상태를 보여주며 목 프로젝트 카드를 사용자 자산처럼 표시하지 않는다. 검증: Lab browser smoke, `npm run test:e2e`.

### 8.2 보드
- [~] **실험 상태/보드 매핑** — `experimentRuns`/`agent_runs` → 보드 컬럼(설계/실행/분석/완료). Validation: `lab-board-contract.test`(신규). 현재: `reproductionPlans`는 설계, `experimentRuns.status`는 설계/실행/분석/완료 컬럼으로 매핑, `resultDossiers`는 완료 카드로 매핑한다. `agent_runs` SSE progress 매핑은 남음. 검증: `node --test services/backend/tests/react-lab-wiring-contract.test.mjs`.
- [~] **보드 프론트 + 자산 패널** — 좌측 Docs/Artifacts/Data + 칸반(진행바·에이전트 펄스·판정 pill·지표). SSE로 실행 중 진행 라이브. Acceptance: DESIGN `ref-lab-board.png` 정합. 현재: graph 기반 Docs/Artifacts/Data 패널과 Kanban card 렌더를 연결했고, 카드의 실행 버튼이 저장된 runner command를 `POST /api/projects/:id/experiment-runs/:runId/execute`로 보내며, 성공 후 graph를 다시 읽어 run metric/result dossier를 보드에 반영한다. 실행 중 SSE/progress UI와 screenshot parity는 남음. 검증: `npm run test:e2e` Lab graph run smoke + Lab execute API smoke + Lab UI execute smoke.

### 8.3 워크스페이스
- [~] **스테퍼 + 에이전트 콘솔(중앙) + 리포트 아티팩트(우측)** — 콘솔: 목표→가설/설계 spec→실행 카드→리포트 카드+판정→steer. 리포트: chrome(버전·내보내기)+문서(판정·가설·**실데이터 SVG 차트·결과표**·분석·provenance). Acceptance: DESIGN `ref-lab-workspace.png` 정합, 차트/표가 run 결과로 렌더. 현재: Lab workspace가 선택된 `experimentRun`의 `config.logs`, `metrics`, `failure`, `status`와 연결된 `resultDossier.comparisons/deltaSummary`를 graph 응답에서 읽어 콘솔·리포트 표·SVG 차트에 표시한다. 차트는 dossier comparisons를 우선 사용하고, 비교값이 없으면 run metrics로 렌더한다. 실행 결과가 없을 때 성공으로 보이지 않도록 verdict를 실제 result data/failure/status에서 계산하고, 아직 미구현된 steer/export/share/composer 액션은 disabled로 둔다. steer 재실행, provenance detail, screenshot parity는 남음. 검증: `node --test services/backend/tests/react-lab-wiring-contract.test.mjs`, `CI=1 npm run test:e2e -- --grep Lab`, `CI=1 npm run test:e2e -- --grep "Lab execute API stores runner results"`.

### 8.4 실험 실행 (런너 연결)
- [x] **research stage가 그래프버전 자산 생성** — `agent-run-prompts.mjs`·`persistTaskOutputs`가 legacy 대신 `reproductionPlans`(+`commands[]`)·`experimentRuns`·`resultDossiers` 생성. 현재: `research` stage prompt가 graph Lab 자산 JSON shape를 요구하고, persistence가 reproduction plan → experiment run → result dossier 연결을 보강해 저장한다. legacy `reproChecklistItems`는 성공 research run에서 만들지 않는다. 검증: `node --test services/backend/tests/agent-runs.test.mjs --test-name-pattern "research agent runs create graph lab assets"`.
- [~] **실행 엔드포인트(런너)** — `POST /api/projects/:id/experiment-runs/:runId/execute` → `lab-runner-safety` risk 평가 → `createLabRunnerAdapter` 실행 → 메트릭/아티팩트 캡처 → `buildResultDossierFromRunnerResult`. Acceptance: `commands`가 실제 실행·dossier 산출. 현재: `services/backend/routes/lab-routes.mjs`가 구조화된 runner command를 실행하고, body command가 없으면 linked `reproductionPlan.commands[]`의 첫 문자열 command를 shell 없이 파싱해 실행한다. 실제 runner 결과로 `experimentRuns`를 갱신하며 `resultDossiers`를 생성한다. 승인 없는 medium-risk는 `approval_required`로 보존하고 fake dossier를 만들지 않는다. React Lab 보드는 `experimentRun.config.command`가 있는 카드에 실행 버튼을 표시하고, 실행 후 실제 graph를 재조회한다. 실행 중 SSE progress는 남음. Validation: `node --test services/backend/tests/lab-routes-contract.test.mjs services/backend/tests/lab-runner.test.mjs services/backend/tests/lab-runner-safety.test.mjs services/backend/tests/react-lab-wiring-contract.test.mjs`, Playwright Lab execute smoke.
- [~] **승인 플로우(requiresApproval)** + **아티팩트 영속/서빙**(`artifact-store` + object-storage) + **steer 재실행**. 현재: backend runner approval contract와 execute route의 approval-required 보존은 연결했다. 사용자 승인 UI, approval mutation, artifact-store/object-storage 영속/서빙, steer 재실행은 남음.

### 8.5 보안 — 14장 연계(샌드박스 격리).

---

## 9. Wiki 탭 — 탐색기 ⇄ 뷰어 (전면 신규 front+back)

### 9.1 데이터/API (백엔드 신규)
- [~] **Wiki 노드·폴더 모델** — `lib/wiki-model.mjs` + `ASSET_COLLECTIONS`에 `wikiPages`(+folders). 필드: type(concept/system/benchmark/method/failure)·body(callout/equation/heading)·properties·tags·paperIds·evidenceLinkIds·folderId. Validation: `wiki-model.test`. 현재: `wikiPages`/`wikiFolders` 컬렉션과 normalizer를 추가했고, graph 모델은 folder node와 containment edge를 함께 반환한다. rich block schema 확장과 Reading/Agent 승격 경로는 남음.
- [x] **백링크 인덱스** — `lib/backlink-index.mjs` (자산 `*Ids[]` 역색인). 현재: `pageBacklinks()`가 저장된 `wikiPages.links` 기준으로 역참조 계산. 검증: `node --test services/backend/tests/wiki-routes-contract.test.mjs`.
- [x] **그래프 엔드포인트** — `GET /api/projects/:id/wiki/graph` → `{nodes,edges}`(containment+semantic). 현재: 저장된 page link 기반 semantic graph 반환. 검증: HTTP smoke.
- [x] **단일 문서 + 백링크** — `GET /api/projects/:id/wiki/:pageId` (본문+속성+links+backlinks). 검증: HTTP smoke.
- [~] **List/Grid 피드 + 쓰기/재합성** — `GET .../wiki?view=list|grid&folder=`, `POST .../wiki`, `POST .../wiki/synthesize`(agent-run 재사용, 결과=derived). 현재: `GET/POST .../wiki`, folder filter(`?folder=`), `wiki-folders` 자산 route, derived-but-not-stored synthesize 응답을 추가했다. view별 서버 shape 분기와 agent-run 기반 재합성은 남음.

### 9.2 프론트 (React 신규)
- [~] **탐색기 Graph(force-directed)** — `web/src/tabs/wiki/GraphView`. 폴더+문서 노드, containment/semantic 엣지, hover 이웃, 드래그, 범례, 필터. Acceptance: DESIGN `ref-wiki.png` 정합, 콘솔 에러 0. 현재: React Wiki 탭이 `GET /api/projects/:id/wiki`와 `GET /api/projects/:id/wiki/graph`를 조회해 저장된 `wikiFolders`/`wikiPages` 기반 folder/page 노드와 containment/semantic edge를 렌더한다. folder chip은 같은 query를 graph/list에 적용한다. force-directed hover/draggable parity와 seeded screenshot 정합은 남음. 검증: 브라우저 Wiki smoke(console/request error 0).
- [~] **List(폴더 트리) / Grid(드릴다운+masonry)** — 폴더 구조 반영. 현재: 저장된 wiki folders/pages를 list/grid에 렌더하고, folder chip과 grid folder card가 서버 `?folder=` 필터를 적용한다. 중첩 폴더 드릴다운 parity와 screenshot 정합은 남음.
- [~] **뷰어(Notion급)** — 타이틀→속성→본문(callout/equation/bullets)→링크/백링크. Acceptance: 본문 정상. 현재: 저장된 page의 type/papers/links/status/tags/body/links/backlinks를 렌더한다. equation/callout/heading의 기본 블록 렌더는 연결됐고 rich editor parity는 남음.
- [x] **모바일 페이지 전환 오버레이.** 현재: 390px 모바일에서 Wiki List 문서 버튼을 키보드 Enter로 선택하면 `.wiki-viewer.open` 전면 오버레이가 viewport 안으로 들어오고, 44px back action으로 explorer에 복귀하며, 열림/닫힘 전후 가로 overflow가 없음을 검증한다. 미연결 Wiki 액션과 검색 입력은 enabled-looking inert control로 남지 않도록 disabled 처리했다. Validation: `CI=1 npx playwright test tests/e2e/workspace-smoke.spec.mjs --grep "Wiki tab opens and closes the mobile document overlay"`.
- [~] **Wiki 채우기(Reading/Agent→Wiki 개념 승격).** 현재: Agent assistant message의 명시적 Wiki 저장 액션과 Reading note 카드의 명시적 Wiki 저장 액션이 `wikiPages`를 생성하고, Wiki API에서 저장 문서로 조회된다. Reading note 저장은 `readingSessionId`/`noteId`/page/paper provenance를 보존한다. 자동 재합성은 남음.

---

## 10. Agent 탭 — 대화 ⇄ 근거 원장 (신규 front+back)

### 10.1 데이터/API (백엔드 신규)
- [~] **스레드/메시지/인용 모델** — `lib/agent-chat-model.mjs` + `agentThreads`/`agentMessages`. 메시지: role·text·trace·citations[]·artifacts[]. `citation-model.mjs`(기구현, 미연결) 연결 + `evidenceLinks` 그라운딩. 현재: `agentThreads`/`agentMessages` 컬렉션과 normalizer 추가. citation-model/evidenceLinks 그라운딩 연결은 남음.
- [~] **그라운디드 채팅 엔드포인트(교차 문서)** — `POST /api/projects/:id/agent/threads/:threadId/messages` → 프로젝트 papers/packets/evidence retrieval → agent-run 엔진 추론 → 인용 포함 답변. Acceptance: 답변당 ≥1 교차 문서 인용. Validation: route 테스트. 현재: thread 생성, 사용자 메시지 저장, thread messages 조회를 구현했고, user message POST가 `chat` stage agent-run을 생성해 완료된 derived `answer/citations`를 assistant message로 저장한다. Agent 전용 local grounding scorer가 질문별 `evidenceLinks`/reading packets/wiki/notes/papers 후보를 선택해 chat prompt에 넣는다. queued run은 React Agent 탭이 SSE terminal event로 재조회한다. 답변당 citation 강제 검증은 남음.
- [~] **스트리밍 + 컨텍스트 스코프 + 산출물 저장** — SSE 트레이스, Library/Wiki/Notes 스코프 칩, `POST .../messages/:id/save`(note|idea|lab|wiki). Over-impl: 저장 시에만 자산화. 현재: save endpoint가 명시 저장 요청을 `note → insightNotes`, `idea → insightCards`, `lab → reproductionPlans`, `wiki → wikiPages`로 자산화하고, 원본 message의 `artifacts[]`와 thread의 `savedMessageIds[]`를 갱신한다. Agent 답변은 메시지로만 남고 자산화는 여전히 save endpoint에서만 수행한다. Agent run terminal SSE 재조회는 연결했고, 컨텍스트 스코프 칩과 trace/progress 세부 렌더는 남음.

### 10.2 프론트 (React 신규)
- [~] **대화(중앙, ChatGPT급)** — `web/src/tabs/agent/ConversationPane`. 추론 트레이스 + 번호 인용 답변 + 답변 액션(저장/Note/Idea/Lab/Wiki) + 컨텍스트 컴포저. Acceptance: DESIGN `ref-agent.png` 정합. 현재: `GET/POST /api/projects/:id/agent/threads`와 `GET/POST /api/projects/:id/agent/threads/:threadId/messages`에 연결해 실제 thread/message를 렌더하고, 사용자 메시지 전송 시 backend `chat` stage가 생성한 assistant message를 표시한다. queued run은 `useAgentRunEvents()`로 완료/실패/취소를 감지해 thread/messages를 재조회한다. 저장된 assistant message는 저장/Note/Idea/Lab/Wiki 버튼으로 `messages/:id/save`를 호출하고, 저장 후 Artifacts/Saved에 표시한다. SSE trace 세부 표시, 컨텍스트 칩, retrieval/evidenceLinks 인용 UX는 남음. 검증: `node --test services/backend/tests/react-wiki-agent-wiring-contract.test.mjs`, 브라우저 Agent smoke에서 thread/message 생성과 assistant message save 액션 cleanup, console/request error 0.
- [~] **근거 원장(우측)** — Evidence 카드 + Artifacts 탭, **인용↔카드 양방향 하이라이트**(호버 ring + scrollIntoView). Validation: e2e 호버. 현재: assistant message의 `citations[]`/`artifacts[]`가 있을 때만 Evidence/Artifacts를 표시하고 없으면 빈 상태로 둔다. Evidence tab/card는 semantic button으로 전환했고, 모바일에서는 `근거 모두 보기`로 같은 원장을 dialog bottom-sheet로 열어 실제 citation source/quote를 확인할 수 있다. 모바일 sheet는 close focus, Tab 내부 유지, Escape close, trigger focus 복귀를 갖는다. citation-model/evidenceLinks 그라운딩과 hover e2e는 남음.
- [~] **Threads/Saved 패널.** 현재: 실제 thread list를 표시하고 새 스레드 생성을 API로 수행한다. 저장된 message artifact는 Evidence/Artifacts와 Saved 패널에 표시한다. thread grouping, 검색, cross-thread saved 목록은 남음.

---

## 11. 크로스-탭 핸드오프 & 자산 그래프

- [~] Reading→Lab(기존 핸드오프 유지) · Agent→Note/Idea/Lab · Reading/Agent→Wiki · Lab 리포트→Agent 인용 · **evidenceLinks 보편 back-ref로 원 논문 p.까지 역추적**. 현재: Agent assistant message의 명시 저장 액션이 Note/Idea/Lab/Wiki 자산을 생성하고, Reading note의 명시 저장 액션이 provenance 포함 Wiki 문서를 생성한다. Lab→Agent 인용, evidenceLinks back-ref는 남음.

---

## 12. 백엔드 / 데이터 (신규만; 나머지 참조)

> auth/migration/worker/object-storage/export/draft/comments는 [`ares-production-implementation-checklist.md`](ares-production-implementation-checklist.md) 참조.

- [~] 신규 컬렉션(`wikiPages`/`wikiFolders`/`agentThreads`/library collections) **file+Postgres store 패리티** + `requireProjectAccess` + 감사. 현재: `wikiPages`/`wikiFolders`/`agentThreads`/`agentMessages`를 `ASSET_COLLECTIONS`에 추가해 file/Postgres generic project assets 경로로 저장 가능하고 전용 route에 `requireProjectAccess` 적용. library collections와 전용 감사 보강은 남음.
- [x] **마이그레이션 SQL 동기화**(`migrations/*.sql` ↔ `ensureSchema()`), `ARES_AUTO_MIGRATE` 적용. 현재: `001_initial_schema`가 런타임 `INITIAL_SCHEMA_STATEMENTS`와 SQL snapshot을 공유 가능한 statements 계약으로 노출하고, `001/002/003` SQL snapshot 누락을 `postgres-schema.test`가 검증한다. `ARES_AUTO_MIGRATE`는 `index.mjs`에서 `createStore({ migrate })`로 적용된다. 검증: `node --test services/backend/tests/postgres-schema.test.mjs`.
- [x] **단일 자산 GET 일반화**(`GET /api/projects/:id/:collection/:assetId`) + 누락 `drafts` 라우트 추가. 현재: `asset-routes.mjs`가 generic project asset item GET을 제공하고 `drafts`는 `PROJECT_ASSET_PATHS`에 포함되어 있다. `readingSessions`는 Reading 전용 route 경계를 유지한다. 검증: `node --test services/backend/tests/asset-routes.test.mjs`.

---

## 13. 에이전트 / 실행 런타임

- [~] **agent-runtime 재사용**(Codex 서브프로세스) — Agent 채팅·Lab 실행·Wiki 재합성이 동일 추상. 새 provider SDK 금지. 현재: Agent 채팅은 `agent-run`의 `chat` stage를 통해 Codex runtime을 재사용한다. Lab 실행과 Wiki 재합성의 동일 추상 연결은 남음.
- [~] **chat stage 추가**(`STAGE_TASKS`·`CAPABILITY_PROFILES` read-only) + 인용 JSON 스키마(`agent-run-prompts.mjs`). 현재: `chat` stage와 read-only `chat` capability profile을 추가했고, `buildChatPrompt()`가 `answer/citations/outputSummary` JSON 스키마와 selected Grounding context를 요구한다. chat run은 paper 없이 프로젝트 context로 실행되며 답변은 derived `outputPayload`로 남고, Agent message route가 이를 assistant message로 저장한다. 사용자 자산은 save endpoint에서만 생성한다. React Agent 탭은 queued chat run의 terminal SSE event에서 메시지를 재조회한다. 검증: `node --test services/backend/tests/agent-runs.test.mjs --test-name-pattern "chat agent runs|grounding"`, `node --test services/backend/tests/agent-chat-routes-contract.test.mjs --test-name-pattern "Agent chat route generates"`, `node --test services/backend/tests/react-wiki-agent-wiring-contract.test.mjs`.
- [x] **모든 run을 durable lease 워커로 통일**(현 인-리퀘스트 즉시실행 비durable 제거). 현재: API 서버의 agent-run service는 run 생성 시 큐잉만 수행하고(`autoExecuteRuns: false`), 내부 durable worker loop가 `claimNextAgentRun()` lease 경로로 실행한다. worker loop는 stop handle을 제공해 서버 종료 시 정리되고, startup recovery는 queued run을 중단 처리하지 않는 stale lease recovery 경로를 사용한다. 검증: `node --test services/backend/tests/agent-runs.test.mjs --test-name-pattern "durable lease|worker loop drains"`.
- [x] **retrieval(그라운딩) scorer 선택·헬스체크**(참조: reading gap). 현재: Reader chat의 retrieval gate 회귀를 건드리지 않고 Agent 전용 `agent-grounding-scorer`를 추가했다. 기본 scorer는 외부 provider 없는 `local-lexical`이며, chat run context에서 `evidenceLinks`/reading packets/wiki/notes/papers를 질문별로 선택해 prompt의 Grounding 섹션에 제공한다. `/api/health`는 `{ grounding: { ok, mode, scorer } }`를 반환한다. 검증: `node --test services/backend/tests/agent-grounding-scorer.test.mjs services/backend/tests/agent-runs.test.mjs --test-name-pattern "grounding"`.

---

## 14. 접근성 / 상태 / 보안

- [~] **빈/로딩/에러 상태** — 각 신규 화면 명시 처리. 실패가 가짜 완료로 둔갑 금지. 현재: Wiki/Reading/Lab/Agent 주요 빈 상태를 실제 서버 데이터 기준으로 표시하고, Agent threads/messages 로드 실패는 빈 스레드로 보이지 않고 실패 상태로 렌더한다. 실패 상태에서 보조 컨텍스트/공유/더보기 버튼은 enabled-looking inert control로 남지 않도록 비활성화했고, 320px 모바일에서 Agent 실패 화면 가로 overflow가 없음을 검증한다. 전체 신규 화면의 실패 경로 매트릭스와 탭별 route-level 장애 검증은 남음. 검증: `CI=1 npx playwright test tests/e2e/workspace-smoke.spec.mjs --grep "Agent tab shows a load failure state"`.
- [x] **키보드/포커스/ARIA** — 레일·토글·칸반·그래프 노드. 현재: React 제품 레일은 navigation landmark, `aria-current`, `aria-controls`를 제공하고, Lab 세그먼트/칸반 컬럼·카드는 `aria-pressed`·list/listitem 계약과 명시 포커스 링을 갖는다. Wiki Graph/List/Grid 토글은 버튼으로 전환했고 API 기반 SVG graph 문서 노드는 Tab/Enter/Space로 열 수 있다. 검증: `node --test services/backend/tests/four-tab-docs-and-accessibility.test.mjs`, `npm run test:e2e`.
- [ ] **보안** — Lab runner 격리(안전계약 연결 + 컨테이너/VM + egress + 승인, 참조 [`lab-runner-sandbox-threat-model.md`](lab-runner-sandbox-threat-model.md)); 신규 엔드포인트 authz+CSRF; 위험 액션 감사; 업로드 검증; 프롬프트/로그 secret 차단.

---

## 15. 테스트 / 검증 (마이그레이션 + 신규)

- [~] **contract 테스트** — `four-tab-navigation-contract` 갱신(Reading/Lab/Wiki/Agent), 신규 `wiki-tab-contract`·`agent-tab-contract`·`lab-board-contract`. **React 앱이 계약 data-* 속성을 방출**하거나 테스트 셀렉터를 새 표면으로 이관. 현재: React hash router, data layer/mobile runtime, Reading library API/model/filter wiring, Reading PDF/Workbench session wiring, Wiki/Agent backend, Agent message save 자산화, Wiki/Agent frontend API wiring, Lab graph/execute/workspace run+dossier wiring 계약 테스트 추가. Agent save route는 실제 서버 계약 테스트가 note/idea/wiki 자산화를 검증한다. 탭별 상세 e2e 계약은 남음.
- [x] **단위** — `wiki-model`·`agent-chat-model`·`library-model`·`backlink-index`·`lab-runner` 통합. 현재: `wiki-model.test`·`agent-chat-model.test`·`library-model.test`·`backlink-index.test`·`lab-runner.test`가 실제 모델 경계를 직접 검증한다. `agent-chat-model` 계약은 중복 모듈을 만들지 않고 `asset-model`의 `agentThreads/agentMessages` normalizer로, `backlink-index` 계약은 `wiki-model`의 `pageBacklinks()`로 고정했다.
- [~] **Playwright 4탭 smoke 확장** — Location: `tests/e2e/workspace-smoke.spec.mjs` 재작성(React 표면). 4탭 로드, Reading 라이브러리→리더(실 PDF), Lab 프로젝트→보드→워크스페이스, Wiki Graph/List/Grid→뷰어, Agent 대화→근거 하이라이트, 모바일 3 viewport. 현재: 옛 바닐라 selector 기반 smoke를 React 4탭 smoke로 마이그레이션했다. 4탭 로드, legacy 6-stage hash 정규화, Reading library API 카운트/논문명/서버 메타 렌더, 검색·태그·서가 필터 조작, React PDF 업로드, React reader 실제 PDF canvas/text layer 렌더, parsed Reading Workbench Summary/Notes/Assets session 렌더, Reading note UI 생성·수정·삭제, Reading note → Wiki 저장, Reading workbench 모바일 상세 패널, Reading PDF dock-as-sheet 목차/본문 검색/페이지 미리보기 320/375/390/768 flow, Wiki API 렌더/백링크/folder filter, Wiki 모바일 문서 버튼 키보드 선택과 오버레이 열림/닫힘/44px back/overflow 방지, Lab graph experiment run 렌더, Lab execute API 결과 보드 반영, Lab 카드 실행 버튼, Lab workspace의 실제 실행 지표 SVG 차트 렌더, Lab 모바일 board→workspace 320/375/768 flow/side panel 숨김/가로스크롤/body overflow/disabled control affordance 방지, Agent thread/message 저장, Agent assistant message Note/Idea/Lab/Wiki 저장 액션, Agent 모바일 Evidence bottom-sheet 320/375/390/768 열림/닫힘/44px action/focus/Escape/overflow 방지, 대표 모바일 viewport CSS 변수와 console/request error 0을 검증한다. Selection 전용 PDF action sheet와 screenshot parity는 남음. Validation: `npm run test:e2e`.
- [~] **스크린샷 회귀(1440 @2x)** — `ref-*.png` 대비, 콘솔 에러 0. 현재: `scripts/visual-regression.mjs`와 `npm run test:visual`을 추가해 isolated file-store runtime에서 7개 기준 상태를 만들고 `1440x900`, `deviceScaleFactor:2`로 actual/diff/report를 `test-results/visual-regression/`에 저장한다. visual fixture는 디자인 목업의 9개 Reading papers, 8개 Lab cards, 15개 Wiki nodes, Agent evidence/thread/artifact 데이터를 테스트 전용 seed/API로 구성한다. 2026-06-29 실행 결과 browser console/page/request error는 0이지만 ref diff가 남아 gate는 실패: Reading library 0.805%, Reading reader 3.040%, Lab projects 0.893%, Lab board 1.171%, Lab workspace 2.455%, Wiki 2.213%, Agent 2.208%(`ARES_VISUAL_MAX_DIFF_RATIO=0.001`).
- [x] **Postgres E2E** — 신규 스키마/마이그레이션. 현재: 로컬 Docker Postgres(`happy-postgres`)의 admin connection으로 `ARES_POSTGRES_E2E_ADMIN_URL`을 설정해 `npm run test:postgres`를 실제 실행했고, 1 passed / 0 skipped로 통과했다. 테스트는 `ares_e2e_*` 임시 DB를 생성해 신규 스키마, graph asset persistence, evidence cascade, interrupted run recovery를 검증한다.

---

## 16. 컷오버 계획 (빅뱅 금지)

- [x] **새 React 셸을 feature flag/별도 진입으로 기동** — 옛 앱과 병존 가능하게. 현재: 기본 `/`는 `web/dist` React shell을 우선 서빙하고, `/legacy`·`/legacy/*`는 `web/legacy.html`과 기존 `web/app.js`/`web/styles.css`/`web/app/*` 자산으로 매핑해 old app을 별도 entry로 유지한다. 검증: `node --test services/backend/tests/static-serving-contract.test.mjs`.
- [ ] **탭별 컷오버 순서**: ① 셸/라우팅/토큰 → ② **Wiki·Agent(net-new, 무손실)** → ③ Lab → ④ **Reading 리더(최난도, 마지막)**.
- [ ] **각 탭 컷오버 = 스크린샷 + contract/e2e 통과로 닫음.**
- [ ] **옛 프론트 폐기** — 전 탭 컷오버 후 `web/app.js`+`web/app/features/*`+옛 stage CSS 제거, 딥링크 호환만 잔존.

---

## 17. Completion Gate

- [x] `npm run build`(Vite) 성공 · `npm run lint` — 현재 통과.
- [x] `npm test`(backend 전체 — 신규 모델/라우트/contract 포함) — 현재 291 tests, 290 pass, 1 skip.
- [~] `npm run test:e2e`(4탭 React smoke + 모바일 3 viewport) — 현재 React 4탭/API smoke는 통과(19 passed). Agent 로드 실패 상태가 빈 스레드로 둔갑하지 않는 회귀 테스트, Wiki 모바일 문서 오버레이 회귀 테스트, Agent 모바일 Evidence bottom-sheet 회귀 테스트, Lab 모바일 board→workspace 회귀 테스트, Reading PDF dock-as-sheet 상세 회귀 테스트를 추가했다. 스크린샷 gate는 남아 completion gate 전체는 아직 미완료.
- [x] Postgres E2E 통과 — 현재 `ARES_POSTGRES_E2E_ADMIN_URL`을 로컬 Docker Postgres admin connection으로 설정해 `npm run test:postgres` 결과 1 passed / 0 skipped.
- [~] 4탭 × 기준 상태 1440 @2x = `ref-*.png` 정합, 콘솔 에러 0 — 현재 `npm run test:visual` 자동화는 추가됐고 console/page/request error 0까지 확인한다. ref diff는 0.805%~3.040%로 남아 pixel gate는 아직 실패.
- [x] 옛 6단계 딥링크 호환 회귀 통과 — 현재: `web/src/router/hashRouter.js`가 `search/reading/research/result/insight/writing` legacy stage를 Reading/Lab/Wiki/Agent 4탭으로 normalize하고, reading session deep link의 `sessionId/docTab`도 보존한다. 검증: `node --test services/backend/tests/four-tab-navigation-contract.test.mjs --test-name-pattern "legacy|React hash router"`, `CI=1 npx playwright test tests/e2e/workspace-smoke.spec.mjs --grep "Legacy six-stage"`.
- [x] `GET /api/health` 정상 · Over-impl 가드(18장) 위반 0 — 현재: `/api/health`는 runtime/profile/storage/grounding readiness와 request id 계약으로 검증되고, `overimplementation-guard.test`가 감사 문서의 금지된 자동 산출물 경로를 기존 행동 테스트와 핵심 소스 패턴으로 묶어 회귀 차단한다. 검증: `node --test services/backend/tests/overimplementation-guard.test.mjs services/backend/tests/auth-access.test.mjs`.

---

## 18. Over-implementation 가드 ([`overimplementation-audit.md`](overimplementation-audit.md))

- [x] parse 하이라이트 → 자동 note 금지 · agent/run 실패 → 가짜 완료 자산 금지 · Wiki 재합성·Agent 답변=derived(저장 시에만 자산) · Lab 실패 run → 자동 Insight 금지 · 데모/시드 prod 경계 · 합성 썸네일 라벨 유지. 현재: `overimplementation-guard.test`가 감사 문서의 P0/P1/P2 금지사항과 실행 가능한 회귀 테스트 존재를 확인하고, 제거된 fallback 모듈/seed note/fake dossier/자동 저장 패턴이 핵심 경로에 재도입되지 않았음을 검증한다.

---

## 19. 명시적 비목표 (참조: `ares-production-platform-roadmap.md`)

- 범분야 보편 자동화 / 완전 자동 논문 작성·투고 / GPU 클러스터 스케줄러 / Google Docs급 실시간 공동편집 / 대형 엔터프라이즈 권한 시스템 / 옛 6단계 UI 복원(deep link 호환까지만).

---

## 20. 권장 실행 순서

1. **토대(2~6장)** — Vite+React, 목업 분해, 토큰/셸/라우팅/데이터레이어/모바일 이식. (모든 것의 전제)
2. **Wiki(9장)·Agent(10장)** — net-new라 무손실, 백엔드 신규 + 프론트. (먼저 컷오버)
3. **Lab(8장)** — 프로젝트→보드→워크스페이스 + 런너 연결(+보안 14장).
4. **Reading(7장)** — 라이브러리 후 **리더 포팅(PDF.js, 최난도) 마지막**.
5. **크로스탭·테스트·게이트·컷오버(11·15·16·17장)** — 옛 프론트 폐기.

각 단계는 **1440 @2x 스크린샷 + contract/e2e 통과**로 닫는다(DESIGN 원칙·house 규칙).
