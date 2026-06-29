# ARES v1 구현 핸드아웃 (실행 에이전트용)

작성일: 2026-06-29 · 대상: 구현을 맡을 다른 에이전트
두 진실 소스: **디자인** [`design/ARES Papers Workspace.html`](../design/ARES%20Papers%20Workspace.html) · **체크리스트** [`docs/ares-v1-4tab-implementation-checklist.md`](ares-v1-4tab-implementation-checklist.md)

---

## 0. 미션 (한 줄)

`design/ARES Papers Workspace.html`(확정 4탭 디자인: Reading / Lab / Wiki / Agent)을 **React/Vite 실제 앱**으로 구현한다.
**절대 원칙: 디자인은 그 파일 그대로 픽셀 하나까지 동일하게.** 임의 재해석·개선·변형 금지. 시각적 판단이 필요하면 디자인 파일이 최종 결정권자다.

---

## 1. 두 진실 소스를 쓰는 법

- **`design/ARES Papers Workspace.html`** = 시각·인터랙션의 **단일 진실 소스(SSOT)**. React+Babel CDN 단일 파일, 전부 목 데이터. 이건 "어떻게 보이고 동작하는가"의 명세다. **마크업 구조·CSS·토큰·치수·간격·상태·애니메이션을 그대로 옮긴다.** 이 파일은 살아있는 오라클 — 어떤 상태든 브라우저로 열어 직접 비교할 수 있다.
- **`docs/ares-v1-4tab-implementation-checklist.md`** = "무엇을, 어떤 순서로, 무엇에 연결하는가"의 실행 명세. 20개 섹션, 각 항목에 Location·Acceptance·Validation. **작업 단위는 이 체크리스트를 따른다.**
- 둘의 관계: **디자인 파일 = 픽셀, 체크리스트 = 배선·순서·완료기준.** 충돌 시 — *외형*은 디자인 파일, *작업 범위·연결*은 체크리스트.
- 보조: [`design/DESIGN.md`](../design/DESIGN.md)(구조 요약·탭별 내비), [`design/ARES Design System.html`](../design/ARES%20Design%20System.html)(토큰 근거).

---

## 2. 전략 (확정)

**프론트엔드 100% 재작성(React/Vite) · 백엔드 0% 재작성.** 목업을 실제 React 빌드로 승격하고, 모든 화면을 기존/신규 백엔드 엔드포인트에 연결한다. 목업은 목 데이터 프레젠테이션이므로 **실제 작업의 절반은 "목 배열 → 실제 API 배선"** 이다.

| 레이어 | 결정 |
|---|---|
| 프론트(`web/app.js` + `web/app/features/*` + 옛 stage CSS) | **폐기 → React 재작성** |
| 백엔드 HTTP·라우트·데이터 모델·store·마이그레이션 | **보존** (신규 엔드포인트만 추가) |
| 에이전트 런타임(Codex 서브프로세스)·SSE·lease 워커 | **보존** |
| Reading **서비스(백엔드)** = PDF/parse/OCR/요약/chat/assets | **보존** (프론트만 React로 다시) |
| auth/ACL/감사 | **보존** |
| 모바일/iOS 뷰포트 로직 · 딥링크 해시 라우터 · PDF.js 통합 | **이식**(재유도 금지 — 기존 로직을 React로 포팅) |
| e2e/contract 테스트 | **마이그레이션**(data-* 계약 새 표면으로) |

자세한 경계·근거는 체크리스트 §1.

---

## 3. 픽셀 퍼펙트 — 달성 & 검증 방법 (반드시 이 루프로)

**달성:** 목업의 `<style>` 블록과 컴포넌트 마크업을 **그대로 이식**한다. 토큰·치수·라디우스·간격·폰트·그림자·애니메이션을 임의로 바꾸지 않는다. 목업 컴포넌트 경계가 이미 명확하므로(아래 §9) 분해는 기계적이다.

**검증 루프(증분마다):**
1. 기준 스크린샷은 `design/screenshots/ref-*.png` (목업에서 1440 @2x로 캡처됨): `ref-reading-library`, `ref-reading-reader`, `ref-lab-projects`, `ref-lab-board`, `ref-lab-workspace`, `ref-wiki`, `ref-agent`.
2. 내가 만든 React 화면을 **동일 뷰포트(1440×900, deviceScaleFactor 2)** 로 같은 상태까지 내비게이션 후 캡처.
3. ref와 **나란히 비교**. 다르면 디자인 파일이 옳다 — React를 고친다.
4. **콘솔 에러 0** 을 항상 함께 확인.
5. 목업에 없는 상태(예: 다른 데이터)가 필요하면, 목업을 그 상태로 만들어 재캡처해 오라클로 삼는다.

> 픽셀 퍼펙트는 "근사치"가 아니다. 간격 2px, 라디우스, 폰트 weight 하나까지 디자인 파일과 일치시킨다.

---

## 4. 하드 제약 (gotchas — 어기면 재작업)

1. **목업은 컴포넌트 소스, 옛 바닐라 앱은 폐기 대상.** `web/app.js`의 구조를 베끼지 말 것 — 목업(React)이 출발점이다. 단, 옛 앱에서 **이식**할 것: 모바일/iOS 뷰포트 머신러리, 딥링크 해시 라우터(`web/app/features/surface-router.js` alias), PDF.js 통합. (처음부터 다시 만들지 말고 포팅.)
2. **백엔드 건드리지 말 것** — 데이터 모델/store/런타임 재작성 금지. 화면을 기존 엔드포인트에 연결하고, **부족한 것만 신규 엔드포인트로 추가**(체크리스트가 명시: library collections, wiki, agent chat, lab-execute, 단일 자산 GET).
3. **LLM/에이전트는 기존 Codex 서브프로세스 런타임 재사용** (`lib/agent-runtime.mjs`). **새 provider SDK(Anthropic/OpenAI 등) 도입 금지.** 목업의 `claude-opus-4` pill은 cosmetic(런타임 config).
4. **딥링크 호환은 하드 요구.** 옛 6단계 해시(`#/projects/:id/{search,reading,research,result,insight,writing}/...`)가 404 없이 새 4탭으로 normalize돼야 한다.
5. **Over-implementation Product Rule (절대 준수, [`overimplementation-audit.md`](overimplementation-audit.md)):** 사용자 산출물 컬렉션에는 **명시적 사용자 생성/저장/승인** 또는 **실제 성공 런타임 결과**만. 실패 fallback·데모·자동 후보를 사용자 자산처럼 적재 금지. Wiki 재합성·Agent 답변은 **derived** — 사용자가 저장할 때만 자산. (= DESIGN §가짜 완성도 배제: 미연결 액션은 상태/범위를 명시.)
6. **Reading 리더는 최난도 → 마지막에.** 실제 PDF.js 렌더(목업의 PDF는 손작성 가짜) + 리더 patch 로직 + 모바일 dock-as-sheet 포팅이 핵심 위험. 먼저 손대지 말 것.
7. **빅뱅 금지.** 탭별 컷오버. 각 탭은 스크린샷 + contract/e2e 통과로 닫는다.

---

## 5. 실행 순서 (컷오버)

체크리스트 §16·§20과 동일:

1. **토대** — Vite+React 스캐폴딩, 목업 컴포넌트 분해, 토큰/셸/라우팅/데이터레이어/모바일 이식. (모든 것의 전제)
2. **Wiki · Agent** — net-new(옛 코드 없음)라 무손실. 백엔드 신규 엔드포인트 + 프론트. (먼저 컷오버)
3. **Lab** — 프로젝트→보드→워크스페이스 + 실험 런너 연결(+샌드박스 보안).
4. **Reading** — 라이브러리 먼저, **리더(PDF.js) 마지막**.
5. **마무리** — 크로스탭 핸드오프, 테스트 마이그레이션, 옛 프론트 폐기, Completion Gate.

---

## 6. 증분별 완료 정의 + Completion Gate

**증분(탭/화면) 완료 =** 코드 + 해당 contract/e2e 통과 + **1440 @2x 스크린샷이 `ref-*.png`와 일치** + 콘솔 에러 0.

**v1 Completion Gate (체크리스트 §17):**
- [ ] `npm run build`(Vite) · `npm run lint`
- [ ] `npm test` (백엔드 전체 — 신규 모델/라우트/contract 포함)
- [ ] `npm run test:e2e` (4탭 smoke + 모바일 3 viewport)
- [ ] Postgres E2E 통과
- [ ] 4탭 × 기준 상태 스크린샷 = `ref-*.png` 정합, 콘솔 에러 0
- [ ] 옛 6단계 딥링크 호환 회귀 통과
- [ ] `GET /api/health` 정상 · Over-impl 가드 위반 0

---

## 7. 실행 · 검증 명령

- **백엔드 기동:** `node services/backend/index.mjs` (file store 기본; Playwright는 `127.0.0.1:3110`에서 자동 기동 — `playwright.config.mjs`).
- **프론트 dev:** Vite dev 서버(신설) + `/api`·`/__vendor/pdfjs/*` 프록시 → Node 백엔드. **빌드 산출은 백엔드 정적 서빙으로 repoint** (체크리스트 §2).
- **테스트:** `npm test` (백엔드 node:test) · `npm run test:e2e` (Playwright) · `npm run lint` (`node --check`).
- **스크린샷 검증 레시피:** Playwright chromium, `viewport 1440×900, deviceScaleFactor 2`, 클릭으로 목표 상태까지 내비, 캡처 → `design/screenshots/ref-*.png`와 비교, `pageerror`/console `error` 0 단언.
- **디자인 오라클 보기:** `design/ARES Papers Workspace.html`을 브라우저/정적서버로 열어 임의 상태 직접 확인.

---

## 8. 핵심 경로 레퍼런스

- 디자인 SSOT: `design/ARES Papers Workspace.html` · 기준 샷: `design/screenshots/ref-*.png` · 구조 요약: `design/DESIGN.md` · 토큰: `design/ARES Design System.html`
- 실행 명세: `docs/ares-v1-4tab-implementation-checklist.md`
- 폐기 대상(참고만): `web/app.js`, `web/app/features/*`, 옛 `web/styles/{search,lab,insight,writing,reading}.css`
- 이식 원본: 모바일/iOS = `docs/reading-mobile-ux-audit.md`·`docs/ios-safari-viewport.md`·`web/app/lib/mobile-scroll-auto-hide.js` · 라우터 alias = `web/app/features/surface-router.js` · PDF.js = `web/app/lib/pdf-viewer.js` + `/__vendor/pdfjs/*`
- 보존 백엔드: `services/backend/index.mjs`, `services/backend/routes/*`, `services/backend/lib/{asset-model,reading-service,agent-runs,agent-runtime,lab-runner,lab-runner-safety,citation-model,store,file-store,postgres-store,auth}.mjs`
- 기존 엔드포인트(연결 대상): `GET/POST /api/projects`, `/api/projects/:id/library`, `/api/projects/:id/reading-sessions(/upload)`, `/api/reading-sessions/:id/{pdf,parse,analyze,summarize,extract-assets,chat,notes,assets/:id/file}`, `/api/projects/:id/graph`, `POST /api/agent-runs` + `GET /api/agent-runs/:id/events`(SSE), 일반 자산 CRUD `/api/projects/:id/:collection`
- 신규로 추가할 엔드포인트(체크리스트 §7.1·§8.4·§9·§10·§12): library collections/tags, `wiki/graph`·`wiki/:pageId`·`wiki/synthesize`, `agent/threads/:id/messages`(+SSE)·`messages/:id/save`, `experiment-runs/:id/execute`, 단일 자산 GET, `drafts` 라우트
- 테스트 기반: `tests/e2e/workspace-smoke.spec.mjs`, `services/backend/tests/four-tab-*.test.mjs` + per-tab `*-tab-contract`
- 가드 문서: `docs/overimplementation-audit.md`, `docs/lab-runner-sandbox-threat-model.md`

---

## 9. 목업 컴포넌트 분해 지도 (그대로 옮길 단위)

디자인 파일에 이미 경계가 명확하다 — 이대로 `web/src/`로:
- 공용: `Icon`(1.75 stroke SVG 레지스트리), `Shell`/`ProductRail`(56px 레일), 메타바, 288px 플로팅 패널, 리사이즈 분할, `Tag`/`Kbd`/`StatusIcon`/`.seg` 등 프리미티브, 토큰(`:root`).
- Reading: `LibraryView`/`LibraryPanel`/`LibStatus`(상태 링) + 리더 `ReadingTab`(`PdfView`/`SummaryView`/`ChatView`/`NotesView`/`AssetsView`/`ReadingPanel`/`DocumentHeader`/`WorkbenchHeader`).
- Lab: `ProjectGrid`/`ProjectPanel` · `LabBoard`/`KanCard` · `RunnerConsolePane`/`ReportPane`/`StageBar`/`XpChart` · `LabPanel`.
- Wiki: `WikiTab`/`GraphView`(force-directed)/`WikiList`/`WikiGrid`/`WikiDoc`.
- Agent: `ConversationPane`/`EvidencePane`/`AgentPanel`/`Cite`.

각 컴포넌트의 목 데이터(`LIBRARY`,`KAN`,`PROJECTS`,`WIKI`,`AG_*` 등)는 임시로 `web/src/mock/`에 격리했다가, 해당 탭 배선 시 실제 API 호출로 교체한다.

---

## 10. 하지 말 것

- 디자인 임의 변경/개선/단순화 (픽셀은 디자인 파일).
- 백엔드·데이터 모델·런타임 재작성.
- 새 LLM provider SDK 도입.
- 가짜 완성도(실패 fallback·자동 후보를 사용자 자산으로).
- 빅뱅 전환(전 탭 동시 교체).
- 옛 바닐라 `app.js` 구조 답습.
- 옛 6단계 딥링크 깨뜨리기.

---

## 11. 첫 작업 (시작점)

체크리스트 §2~§6: **Vite+React 스캐폴딩 → 목업 분해(공용 셸 + Icon + 토큰) → 제품 레일·메타바·플로팅 패널·리사이즈 분할 → 해시 라우터+딥링크 alias 이식 → API 클라이언트/SSE 훅 → 모바일/iOS 훅 이식.**
완료 기준: 빈 4탭 셸이 목업과 **픽셀 일치**로 렌더되고 탭 전환·딥링크가 동작, 콘솔 에러 0. 그다음 Wiki → Agent → Lab → Reading 순으로 탭별 구현·컷오버.
