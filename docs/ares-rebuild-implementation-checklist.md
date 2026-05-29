# ARES Rebuild Implementation Checklist

작성일: 2026-05-29
기준 문서: [ARES Rebuild Target Architecture](./ares-rebuild-target-architecture.md)

## 1. 목표

이 체크리스트는 ARES를 stage/tab 중심 앱에서 asset graph 중심 Research OS로 재구성하기 위한 실행 목록이다.

체크박스는 실제 코드, 테스트, 런타임 검증까지 끝났을 때만 완료 처리한다. 문서에만 존재하거나 화면에만 보이는 기능은 완료로 보지 않는다.

## 2. Definition of Done

전체 재구성은 아래 조건을 모두 만족해야 완료다.

- [ ] `Paper -> ReadingPacket -> ReproductionPlan -> ExperimentRun -> ResultDossier -> InsightCard -> DraftSection` 흐름이 저장소 모델로 표현된다.
- [ ] Reader에서 만든 evidence가 Lab, Evidence, Draft까지 같은 ID로 추적된다.
- [ ] Agent run output이 message가 아니라 asset candidate 또는 asset mutation으로 저장된다.
- [ ] Queue, Reader, Lab, Evidence, Draft surface가 각각 자신의 산출물을 실제로 만들고 조회한다.
- [ ] 기존 Search/Reading 기능이 새 asset graph 아래에서 동작한다.
- [ ] placeholder action은 제거되거나 disabled/setup-required 상태로 명확히 표시된다.
- [ ] `npm run lint`와 `npm test`가 통과한다.
- [ ] dev 배포 또는 로컬 dev server smoke를 통해 `https://lawdigest.kr/proxy/3100/`에서 확인 가능하다.

## 3. Sprint 0: 기준 고정

**Goal**: 재구성의 기준 문서와 추적 가능한 체크리스트를 만든다.

**Demo/Validation**:

- 문서가 `docs/`에 존재한다.
- `git diff --check`가 통과한다.

### Task 0.1: 목표 아키텍처 문서 작성

- **Status**: Done
- **Location**: `docs/ares-rebuild-target-architecture.md`
- **Description**: asset graph 중심 목표 구조, surface 책임, API boundary, migration policy를 문서화한다.
- **Validation**:
  - `docs/ares-rebuild-target-architecture.md` 존재

### Task 0.2: 구현 체크리스트 작성

- **Status**: Done
- **Location**: `docs/ares-rebuild-implementation-checklist.md`
- **Description**: 재구성 완료까지 추적할 atomic checklist를 작성한다.
- **Validation**:
  - `docs/ares-rebuild-implementation-checklist.md` 존재

## 4. Sprint 1: Asset Graph Foundation

**Goal**: 새 구조의 중심 자산 모델과 저장소 계약을 만든다.

**Demo/Validation**:

- seed/runtime store에서 새 asset collection을 읽고 쓸 수 있다.
- 기존 프로젝트와 paper 데이터가 새 graph endpoint에서 조회된다.
- 기존 테스트가 유지되고 asset graph 테스트가 추가된다.

### Task 1.1: Asset model contract 정의

- **Status**: Done
- **Location**:
  - `services/backend/lib/asset-model.mjs`
  - `services/backend/tests/asset-model.test.mjs`
- **Description**: `ResearchQuestion`, `Paper`, `ReadingPacket`, `EvidenceLink`, `ReproductionPlan`, `ExperimentRun`, `ResultDossier`, `InsightCard`, `DraftSection`의 normalize/validate helper를 만든다.
- **Acceptance Criteria**:
  - 필수 필드가 누락되면 안전한 기본값 또는 명시적 오류로 처리된다.
  - legacy paper/session shape를 새 모델로 매핑할 수 있다.
- **Validation**:
  - `node --test services/backend/tests/asset-model.test.mjs`
  - `npm test`

### Task 1.2: File store asset graph collection 추가

- **Status**: Done
- **Location**:
  - `services/backend/lib/file-store.mjs`
  - `services/backend/tests/store.test.mjs` 또는 신규 `asset-store.test.mjs`
- **Description**: 파일 store에 questions, readingPackets, evidenceLinks, reproductionPlans, experimentRuns, resultDossiers, insightCards, drafts/draftSections collection을 추가한다.
- **Acceptance Criteria**:
  - 기존 seed shape와 호환된다.
  - 새 collection이 없어도 bootstrap이 실패하지 않는다.
  - create/list/get/update 최소 API가 있다.
- **Validation**:
  - `node --test services/backend/tests/asset-store.test.mjs`
  - `npm test`

### Task 1.3: PostgreSQL store asset graph collection 추가

- **Status**: Done
- **Location**:
  - `services/backend/lib/postgres-store.mjs`
  - `services/backend/tests/store.test.mjs` 또는 신규 `postgres-store-contract.test.mjs`
- **Description**: Postgres store에도 file store와 같은 asset graph contract를 구현한다.
- **Acceptance Criteria**:
  - JSONB payload 기반이라도 file store와 같은 public method를 제공한다.
  - 빈 DB bootstrap이 기존 seed와 호환된다.
- **Validation**:
  - `node --check services/backend/lib/postgres-store.mjs`
  - `npm test`

### Task 1.4: Asset graph API 추가

- **Status**: Done
- **Location**:
  - `services/backend/index.mjs`
  - `services/backend/tests/asset-routes.test.mjs`
- **Description**: `GET /api/projects/:projectId/graph`와 핵심 asset list/create route를 추가한다.
- **Acceptance Criteria**:
  - graph endpoint가 paper, reading packet, evidence, lab, insight, draft summary를 반환한다.
  - 기존 `/api/projects`, `/api/search`, `/api/projects/:id/reading-sessions` route가 깨지지 않는다.
- **Validation**:
  - `node --test services/backend/tests/asset-routes.test.mjs`
  - `npm test`

## 5. Sprint 2: Reader Rebuild

**Goal**: 기존 Reading v1을 새 `ReadingPacket`과 `EvidenceLink` 중심으로 재배치한다.

**Demo/Validation**:

- Search 또는 Queue에서 paper를 열면 ReadingPacket이 생성된다.
- PDF 선택, note, citation이 EvidenceLink로 저장된다.
- Reader chat은 선택한 evidence context를 prompt와 저장 결과에 반영한다.

### Task 2.1: Reading session to ReadingPacket adapter

- **Status**: Done
- **Location**:
  - `services/backend/lib/reading-model.mjs`
  - `services/backend/lib/reading-service.mjs`
  - `services/backend/tests/reading-service.test.mjs`
- **Description**: 기존 reading session 저장 결과를 새 ReadingPacket shape로 변환하고 저장한다.
- **Acceptance Criteria**:
  - 기존 session 조회 API는 유지된다.
  - 새 graph API에서는 같은 데이터가 ReadingPacket으로 보인다.
- **Validation**:
  - 기존 reading tests 통과
  - 신규 adapter test 통과
  - `npm test`

### Task 2.2: EvidenceLink 생성 API와 note/citation 연결

- **Status**: Done
- **Location**:
  - `services/backend/index.mjs`
  - `services/backend/lib/reading-service.mjs`
  - `web/app.js`
  - `web/app/features/reading.js`
- **Description**: note 생성, citation chip, selected PDF text를 EvidenceLink로 저장한다.
- **Acceptance Criteria**:
  - note에서 quote/page/section이 evidence로 남는다.
  - evidence ID가 Reading UI에 표시되거나 내부 state에 유지된다.
- **Validation**:
  - `services/backend/tests/reading-service.test.mjs`
  - 기존 Reader UI의 citation/page jump 및 PDF selection note action 유지
  - note 생성/수정 시 `EvidenceLink` 생성 및 `ReadingPacket.evidenceLinkIds` 반영

### Task 2.3: Citation/page navigation

- **Status**: Done
- **Location**:
  - `web/app.js`
  - `web/app/features/reading.js`
  - `web/app/lib/pdf-viewer.js`
- **Description**: citation, note, section click이 PDF page로 이동하도록 한다.
- **Acceptance Criteria**:
  - citation p.N 클릭 시 PDF tab으로 전환되고 해당 page가 focus된다.
  - page 정보가 없는 항목은 실행 가능한 버튼처럼 보이지 않는다.
- **Validation**:
  - 기존 `jump-reading-page` action과 `readingPdfController.scrollToPage(page)` 경로 확인
  - `npm test`

### Task 2.4: PDF text selection to EvidenceLink

- **Status**: Done
- **Location**:
  - `web/app/lib/pdf-viewer.js`
  - `web/app.js`
  - `web/app/features/reading.js`
- **Description**: PDF 선택 텍스트를 note/evidence로 저장하는 action을 구현한다.
- **Acceptance Criteria**:
  - 선택한 텍스트, page, session, paper context가 저장된다.
  - chat composer의 remembered selection과 evidence 생성 흐름이 충돌하지 않는다.
- **Validation**:
  - 기존 PDF selection capture와 `create-reading-note-from-selection` action 확인
  - `services/backend/tests/reading-service.test.mjs`

## 6. Sprint 3: Queue Surface

**Goal**: Search를 독립 stage가 아니라 Queue 안의 수집 모드로 재배치한다.

**Demo/Validation**:

- project/question별 paper candidate가 Queue에서 보인다.
- Scout run 결과가 Paper candidate로 남는다.

### Task 3.1: ResearchQuestion UI/API 연결

- **Status**: Done
- **Location**:
  - `services/backend/index.mjs`
  - `web/app.js`
  - `web/app/features/search.js`
- **Description**: 기존 project defaultQuery를 ResearchQuestion으로 승격한다.
- **Acceptance Criteria**:
  - active question이 search, queue, reader context에 포함된다.
- **Validation**:
  - `services/backend/tests/asset-store.test.mjs`
  - `services/backend/tests/search.test.mjs`
  - `services/backend/tests/search-agentic-render.test.mjs`

### Task 3.2: Queue shell 추가

- **Status**: Done
- **Location**:
  - `web/app.js`
  - `web/styles.css`
  - 신규 가능: `web/app/features/queue.js`
- **Description**: Search dashboard를 Queue surface로 재배치하고, pending papers/agent results/handoffs를 보여준다.
- **Acceptance Criteria**:
  - 기존 search 기능은 유지된다.
  - 화면 copy는 기능적이고 짧다.
- **Validation**:
  - `npm run lint`
  - `services/backend/tests/search-agentic-render.test.mjs`
  - 기존 Search 기능은 같은 renderer 안에서 유지

## 7. Sprint 4: Lab Minimal Core

**Goal**: Lab을 placeholder가 아니라 저장 가능한 연구 실행 자산 surface로 만든다.

**Demo/Validation**:

- ReadingPacket에서 ReproductionPlan을 만들 수 있다.
- 수동 ExperimentRun과 ResultDossier를 만들고 조회할 수 있다.

### Task 4.1: ReproductionPlan 생성 flow

- **Status**: Done
- **Location**:
  - `services/backend/lib/agent-runs.mjs`
  - `services/backend/index.mjs`
  - `web/app.js`
- **Description**: Reader에서 `Send to Lab` 실행 시 ReproductionPlan draft 또는 agent-generated candidate를 만든다.
- **Acceptance Criteria**:
  - ReadingPacket/EvidenceLink ID가 plan에 포함된다.
  - stage 이동만 하고 끝나는 action이 아니다.
- **Validation**:
  - `services/backend/tests/lab-tab-contract.test.mjs`
  - `npm test`

### Task 4.2: ExperimentRun manual entry

- **Status**: Done
- **Location**:
  - `services/backend/index.mjs`
  - `web/app.js`
  - `web/styles.css`
- **Description**: 자동 실행 전 단계로 metric/config/result를 수동 입력해 ExperimentRun으로 저장한다.
- **Acceptance Criteria**:
  - run status, metric, artifact note가 저장된다.
  - ResultDossier 생성에 사용할 수 있다.
- **Validation**:
  - `services/backend/tests/lab-tab-contract.test.mjs`
  - `npm test`

### Task 4.3: ResultDossier comparison view

- **Status**: Done
- **Location**:
  - `web/app.js`
  - 신규 가능: `web/app/features/lab.js`
- **Description**: original metric과 reproduction metric의 delta를 ResultDossier로 보여준다.
- **Acceptance Criteria**:
  - dossier가 evidence link와 experiment run을 참조한다.
  - unsupported 자동 실행은 setup-required로 표시된다.
- **Validation**:
  - `services/backend/tests/lab-tab-contract.test.mjs`
  - `npm test`

## 8. Sprint 5: Evidence Board

**Goal**: ARES의 차별점인 근거 기반 연구 판단 surface를 만든다.

**Demo/Validation**:

- ReadingPacket/ResultDossier에서 InsightCard를 만들 수 있다.
- 각 InsightCard는 evidence source를 가진다.

### Task 5.1: Evidence stream

- **Status**: Done
- **Location**:
  - 신규 가능: `web/app/features/evidence.js`
  - `web/app.js`
  - `web/styles.css`
- **Description**: project evidence links를 source별로 모아 보여준다.
- **Acceptance Criteria**:
  - paper quote, note, result delta가 구분된다.
  - evidence 없는 claim 생성은 기본 flow가 아니다.
- **Validation**:
  - `services/backend/tests/insight-tab-contract.test.mjs`
  - `npm test`

### Task 5.2: InsightCard CRUD

- **Status**: Done
- **Location**:
  - `services/backend/index.mjs`
  - `web/app.js`
  - `web/app/features/evidence.js`
- **Description**: claim, hypothesis, decision 타입의 InsightCard를 생성/수정한다.
- **Acceptance Criteria**:
  - evidenceLinkIds, confidence, nextAction이 저장된다.
  - Writing 또는 Lab으로 handoff할 수 있다.
- **Validation**:
  - `services/backend/tests/asset-routes.test.mjs`
  - `services/backend/tests/insight-tab-contract.test.mjs`
  - `npm test`

## 9. Sprint 6: Draft Studio

**Goal**: Writing을 placeholder가 아니라 insight/evidence 기반 draft 조립 surface로 만든다.

**Demo/Validation**:

- InsightCard를 선택해 DraftSection을 만든다.
- DraftSection은 source evidence를 추적한다.

### Task 6.1: Draft and DraftSection store/API

- **Status**: Done
- **Location**:
  - `services/backend/index.mjs`
  - store implementations
  - `services/backend/tests/asset-routes.test.mjs`
- **Description**: draft와 section을 저장하고 조회한다.
- **Acceptance Criteria**:
  - DraftSection이 insightCardIds/evidenceLinkIds를 가진다.
- **Validation**:
  - `services/backend/tests/asset-routes.test.mjs`
  - `npm test`

### Task 6.2: Draft Studio UI

- **Status**: Done
- **Location**:
  - 신규 가능: `web/app/features/draft.js`
  - `web/app.js`
  - `web/styles.css`
- **Description**: section list, editor, evidence sidebar를 구성한다.
- **Acceptance Criteria**:
  - 문단이 어떤 insight/evidence에서 왔는지 확인 가능하다.
  - export 전에도 draft state가 저장된다.
- **Validation**:
  - `services/backend/tests/writing-tab-contract.test.mjs`
  - `npm test`

## 10. Sprint 7: Runtime Hardening

**Goal**: Agent run을 asset graph와 durable하게 연결한다.

**Demo/Validation**:

- agent run progress, output, generated asset IDs가 저장된다.
- 프로세스 재시작 후에도 완료된 run 결과와 asset output을 조회할 수 있다.

### Task 7.1: AgentRun output asset linkage

- **Status**: Done
- **Location**:
  - `services/backend/lib/agent-runs.mjs`
  - store implementations
  - `services/backend/tests/agent-runs.test.mjs`
- **Description**: run output에 `createdAssetIds`, `candidateAssetIds`, `sourceAssetIds`를 저장한다.
- **Acceptance Criteria**:
  - Reader/Research/Analyst/Writer run이 생성한 자산이 run에 연결된다.
- **Validation**:
  - `services/backend/tests/agent-runs.test.mjs`
  - `npm test`

### Task 7.2: Worker separation plan or implementation

- **Status**: Done
- **Location**:
  - `docs/backend-runtime-overview.md`
  - 구현 시 `services/backend/lib/agent-worker.mjs`
- **Description**: 메모리 Map에 묶인 실행 핸들을 worker/process boundary로 분리한다.
- **Acceptance Criteria**:
  - 최소한 실행/복구/abort 한계가 명시된다.
  - 구현한다면 기존 API가 유지된다.
- **Validation**:
  - `docs/backend-runtime-overview.md`
  - `npm test`

## 11. Sprint 8: Frontend Restructure

**Goal**: 기존 stage/tab 중심 frontend를 Queue/Reader/Lab/Evidence/Draft surface 중심으로 정리한다.

**Demo/Validation**:

- primary nav가 새 surface와 일치한다.
- 각 surface는 asset graph endpoint를 기준으로 render된다.
- 모바일에서 핵심 action이 320px, 375px, 768px, desktop에서 깨지지 않는다.

### Task 8.1: Surface router 도입

- **Status**: Todo
- **Location**:
  - `web/app.js`
- **Description**: legacy stage route를 새 surface route로 normalize한다.
- **Acceptance Criteria**:
  - 기존 deep link가 새 surface로 안전하게 매핑된다.
  - URL과 active state가 일관된다.
- **Validation**:
  - navigation contract test

### Task 8.2: Feature modules 분리

- **Status**: Todo
- **Location**:
  - `web/app/features/queue.js`
  - `web/app/features/reading.js`
  - `web/app/features/lab.js`
  - `web/app/features/evidence.js`
  - `web/app/features/draft.js`
- **Description**: 거대한 `web/app.js` 중심 구현을 surface별 module로 분리한다.
- **Acceptance Criteria**:
  - 기존 search/reading 동작이 유지된다.
  - 새 module은 asset graph state를 입력으로 받는다.
- **Validation**:
  - `npm run lint`
  - `npm test`

## 12. Sprint 9: Compatibility Cleanup

**Goal**: 새 구조가 안정화된 뒤 legacy scaffold와 placeholder를 제거한다.

**Demo/Validation**:

- 사용자에게 보이는 무동작 버튼이 없다.
- docs/specification이 새 구조와 일치한다.
- README가 현재 실행/구조를 정확히 설명한다.

### Task 9.1: Legacy placeholder audit

- **Status**: Todo
- **Location**:
  - `web/app.js`
  - `web/app/features/*`
  - `web/styles.css`
- **Description**: durable action 없는 UI를 제거하거나 disabled/setup-required로 바꾼다.
- **Acceptance Criteria**:
  - 버튼은 handler, route, stored output 중 하나 이상을 가진다.
- **Validation**:
  - static grep audit
  - browser smoke

### Task 9.2: Documentation alignment

- **Status**: Todo
- **Location**:
  - `README.md`
  - `docs/specification.md`
  - `docs/backend-runtime-overview.md`
- **Description**: README와 명세를 asset graph 구조로 갱신한다.
- **Acceptance Criteria**:
  - 오래된 4탭 구조는 historical/reference로만 남는다.
  - 실행 방법과 dev deploy 방법은 현재와 일치한다.
- **Validation**:
  - `git diff --check`

## 13. Ongoing Verification

각 sprint 완료 전 반드시 확인한다.

```bash
npm run lint
npm test
curl -fsS http://127.0.0.1:3100/api/health
```

프론트엔드 UI가 바뀐 sprint는 추가로 확인한다.

- `https://lawdigest.kr/proxy/3100/` 또는 해당 dev port에서 직접 확인
- 320px, 375px, 768px, desktop width에서 overflow/overlap 확인
- 새 action이 실제 저장 결과를 만드는지 API 또는 UI로 확인
