# Plan: Reading 탭 미구현/부분구현 대응 우선순위

**Generated**: 2026-04-25
**Estimated Complexity**: High
**Source**: `docs/reading-implementation-checklist.md`

## Overview

Reading 탭은 이미 실제 PDF 기반 v1 파이프라인이 들어와 있으므로, 다음 대응은 “화면에 보이지만 아직 실제 기능이 아닌 것”부터 걷어내는 방향이 가장 좋다.

우선순위는 다음 원칙으로 잡는다.

- 먼저 사용자가 눌렀을 때 기대와 실제가 어긋나는 `목업/미구현` 항목을 실제 기능으로 바꾼다.
- 그 다음 이미 동작하지만 품질/범위가 약한 `부분 구현` 항목을 제품 수준으로 올린다.
- 구현 순서는 Reading workflow의 핵심 가치인 `읽기 -> 근거 추출 -> 메모/채팅 -> Research handoff` 흐름을 기준으로 둔다.

## Priority Map

| 순위 | 구분 | 항목 | 이유 |
| --- | --- | --- | --- |
| P0 | 목업/미구현 | Reading -> Research handoff | 현재 버튼이 stage 이동에 머물러 사용자 기대와 가장 크게 어긋난다. |
| P1 | 목업/미구현 | Citation/page navigation | Chat/summary citation이 보여도 근거 위치로 이동하지 못하면 reader workflow가 끊긴다. |
| P2 | 목업/미구현 | PDF text selection highlight/note | Reading의 핵심 인터랙션이며 Notes를 수동 CRUD 이상으로 만든다. |
| P3 | 목업/미구현 | Asset detail/source navigation | Assets 탭이 카드 목록에서 끝나지 않고 실제 근거 뷰어가 되어야 한다. |
| P4 | 목업/미구현 | Reading context menu | 눈에 보이는 `...`가 무동작이면 품질 신뢰를 깎는다. |
| P5 | 목업/미구현 | Metadata-only/OCR 정책 UX 정리 | 범위를 넓히기보다 unsupported state를 명확히 처리한다. |
| P6 | 부분 구현 | Assets 실제 thumb/source 렌더링 | 이미 backend 경로가 있으므로 제품화 효율이 좋다. |
| P7 | 부분 구현 | Chat retrieval 고도화 | 동작은 하지만 답변 품질을 좌우한다. |
| P8 | 부분 구현 | AI/fallback provenance 표시 | “진짜 AI 결과인지 fallback인지” 혼동을 줄인다. |
| P9 | 부분 구현 | Highlight seed 품질 개선 | text selection 이후 보강하면 중복 작업을 줄일 수 있다. |

## Sprint 1: Mock 제거 1차 - Research handoff와 citation navigation

**Goal**: Reading에서 만든 결과물을 다음 단계로 실제 전달하고, citation/page 근거로 이동할 수 있게 만든다.

**Demo/Validation**:

- Reading note 또는 asset에서 Research handoff 실행 시 Research run/input에 선택한 Reading context가 들어간다.
- Chat citation chip 또는 section summary를 클릭하면 PDF 탭의 해당 page로 이동한다.
- 기존 Reading session 생성/parse/summarize/chat/note flow가 유지된다.

### Task 1.1: Reading handoff contract 정의

- **Location**: `services/backend/lib/agent-runs.mjs`, `services/backend/lib/reading-model.mjs`
- **Description**: Research run이 받을 Reading handoff payload 형태를 정한다.
- **Dependencies**: 없음
- **Acceptance Criteria**:
  - handoff payload가 `readingSessionId`, `noteIds`, `assetIds`, `sectionIds`, `sourceRefs`를 표현한다.
  - 기존 `readingSession` context와 충돌하지 않는다.
- **Validation**:
  - route/unit test에서 payload가 Research context로 들어가는지 확인한다.

### Task 1.2: Reading -> Research API/action 연결

- **Location**: `services/backend/index.mjs`, `web/app.js`, `web/app/features/reading.js`
- **Description**: Notes의 `Send to Research`를 단순 `select-stage`가 아니라 Research run 생성 또는 Research input draft 생성으로 연결한다.
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - note 선택 없이 누르면 현재 session summary/notes/assets를 기본 context로 넘긴다.
  - note card 단위 handoff도 가능하다.
  - 완료 후 Research 탭으로 이동하고 생성된 run/input이 선택된다.
- **Validation**:
  - Reading note에서 handoff 후 Research 화면에서 해당 note quote/body가 보이는지 확인한다.

### Task 1.3: PDF page navigation state 추가

- **Location**: `web/app.js`, `web/app/lib/pdf-viewer.js`
- **Description**: `state.readingPdfTargetPage` 또는 equivalent state를 추가하고 PDF viewer가 해당 page로 scroll/focus한다.
- **Dependencies**: 없음
- **Acceptance Criteria**:
  - page number를 가진 citation/note/asset에서 PDF page로 이동할 수 있다.
  - PDF가 아직 렌더링 중이면 hydrate 완료 후 이동한다.
- **Validation**:
  - citation p.2 클릭 -> PDF Document 탭 전환 -> Page 2 canvas 위치로 scroll.

### Task 1.4: Citation/note/section click 연결

- **Location**: `web/app/features/reading.js`, `web/app.js`
- **Description**: Chat citation chip, note page, outline item, section summary에 page jump action을 연결한다.
- **Dependencies**: Task 1.3
- **Acceptance Criteria**:
  - citation click이 동작한다.
  - note page click이 동작한다.
  - page 정보가 없는 항목은 disabled/tooltip로 처리한다.
- **Validation**:
  - Chat, Notes, Summary 각 surface에서 page 이동을 확인한다.

## Sprint 2: Mock 제거 2차 - PDF highlight/note와 context menu

**Goal**: Reading detail을 “보는 화면”에서 “직접 읽고 표시하는 화면”으로 바꾼다.

**Demo/Validation**:

- PDF 텍스트를 선택해 note를 만들 수 있다.
- `...` context menu가 실제 메뉴를 연다.
- unsupported PDF 상태가 명확히 보인다.

### Task 2.1: PDF text layer 렌더링

- **Location**: `web/app/lib/pdf-viewer.js`, `web/styles.css`
- **Description**: PDF.js text content를 page canvas 위/아래에 text layer로 렌더링한다.
- **Dependencies**: Sprint 1 page state
- **Acceptance Criteria**:
  - 사용자가 PDF 텍스트를 선택할 수 있다.
  - text layer가 canvas alignment를 크게 깨뜨리지 않는다.
- **Validation**:
  - 실제 PDF page에서 텍스트 선택 가능 여부 확인.

### Task 2.2: Selection -> note 생성

- **Location**: `web/app/lib/pdf-viewer.js`, `web/app.js`, `web/app/features/reading.js`
- **Description**: PDF selection quote/page를 note 생성 API로 넘기는 액션을 추가한다.
- **Dependencies**: Task 2.1
- **Acceptance Criteria**:
  - 선택한 quote가 note quote로 저장된다.
  - page number가 note에 들어간다.
  - 저장 후 Notes 탭에서 바로 확인된다.
- **Validation**:
  - PDF에서 문장 선택 -> Add note -> Notes에 quote 표시.

### Task 2.3: Reading context menu 구현

- **Location**: `web/app/features/reading.js`, `web/app.js`, `web/styles.css`
- **Description**: detail metabar `...`와 Home preview more button에 실제 메뉴를 연결한다.
- **Dependencies**: 없음
- **Acceptance Criteria**:
  - detail menu: Copy citation, Export notes, Re-parse, Delete session 또는 Open source 중 최소 3개 구현.
  - Home preview menu: Open source, Start/Reopen Reading, Copy paper link 구현.
  - 아직 위험한 삭제 기능은 confirm을 둔다.
- **Validation**:
  - 각 메뉴 item 클릭 시 상태 변화 또는 clipboard/action 확인.

### Task 2.4: Unsupported state 정리

- **Location**: `web/app/features/reading.js`, `services/backend/lib/reading-service.mjs`
- **Description**: metadata-only, scanned PDF, parse error 상태를 명확한 CTA와 recovery path로 정리한다.
- **Dependencies**: 없음
- **Acceptance Criteria**:
  - `No PDF`, `OCR unsupported`, `download failed`, `parse failed`가 서로 구분되어 보인다.
  - 가능한 경우 Search로 돌아가기/Open paper source/Re-try parse CTA가 있다.
- **Validation**:
  - pdfUrl 없는 세션과 text layer 없는 PDF error state를 각각 확인한다.

## Sprint 3: 부분 구현 제품화 1차 - Assets

**Goal**: Assets 탭을 synthetic preview가 아니라 실제 source-backed evidence surface로 만든다.

**Demo/Validation**:

- figure/table card가 실제 `thumbPath` 또는 `dataPath`를 사용한다.
- asset card 클릭 시 detail view가 열리고 source page로 이동할 수 있다.

### Task 3.1: Asset file serving route 추가

- **Location**: `services/backend/index.mjs`, `services/backend/lib/reading-service.mjs`
- **Description**: session runtime asset file을 safe path로 읽어 반환하는 route를 추가한다.
- **Dependencies**: 없음
- **Acceptance Criteria**:
  - `thumbPath`와 `dataPath`가 safe root 밖으로 escape하지 않는다.
  - SVG/PNG/JSON content-type이 맞게 반환된다.
- **Validation**:
  - extracted asset file URL fetch 성공.

### Task 3.2: Asset thumbnail renderer 개선

- **Location**: `web/app/features/reading.js`, `web/styles.css`
- **Description**: `thumbPath`가 있으면 실제 thumbnail을 우선 렌더하고, 없을 때만 synthetic fallback을 쓴다.
- **Dependencies**: Task 3.1
- **Acceptance Criteria**:
  - figure card에 실제 SVG/이미지가 보인다.
  - table card는 rows/dataPath 기반 preview를 유지한다.
- **Validation**:
  - demo PDF figure/table asset에서 실제 thumb 또는 table rows 표시.

### Task 3.3: Asset detail panel/modal

- **Location**: `web/app/features/reading.js`, `web/app.js`, `web/styles.css`
- **Description**: asset card click 시 상세 caption, page, rows/image, source jump를 보여준다.
- **Dependencies**: Task 3.2, Sprint 1 page navigation
- **Acceptance Criteria**:
  - figure detail에서 image/preview와 caption 확인.
  - table detail에서 rows 확인.
  - `Go to source page`가 PDF page로 이동한다.
- **Validation**:
  - Assets card -> detail -> source page jump.

## Sprint 4: 부분 구현 제품화 2차 - Chat/AI provenance

**Goal**: Reader chat과 summary가 “동작한다”에서 “믿고 쓸 수 있다”로 넘어간다.

**Demo/Validation**:

- fallback-generated 결과와 runtime-generated 결과가 구분된다.
- retrieval 품질이 개선되고 citations가 더 안정적으로 붙는다.

### Task 4.1: AI provenance model 추가

- **Location**: `services/backend/lib/reading-model.mjs`, `services/backend/lib/reading-service.mjs`
- **Description**: summary/chat 결과에 `generatedBy`, `runtimeUsed`, `fallbackReason` 같은 provenance metadata를 저장한다.
- **Dependencies**: 없음
- **Acceptance Criteria**:
  - runtime success/fallback이 session에 남는다.
  - legacy session은 기본값으로 정규화된다.
- **Validation**:
  - runtime unavailable test에서 fallback metadata 확인.

### Task 4.2: Provenance UI 표시

- **Location**: `web/app/features/reading.js`, `web/styles.css`
- **Description**: Summary/Chat footer에 `AI generated`, `Fallback summary`, `Local heuristic` 같은 작은 상태 표시를 추가한다.
- **Dependencies**: Task 4.1
- **Acceptance Criteria**:
  - 사용자가 결과의 생성 방식을 구분할 수 있다.
  - UI가 과하게 시끄럽지 않다.
- **Validation**:
  - fallback session과 runtime session 각각 상태 표시 확인.

### Task 4.3: Retrieval scoring 개선

- **Location**: `services/backend/lib/reading-service.mjs`
- **Description**: 현재 lexical count scoring에 section/title/page proximity, phrase match, note focus boost를 추가한다.
- **Dependencies**: 없음
- **Acceptance Criteria**:
  - note 기반 Ask AI가 note section/page chunk를 우선 참조한다.
  - citation 없는 답변 비율이 줄어든다.
- **Validation**:
  - reading-service test에 note focus retrieval case 추가.

### Task 4.4: Empty/low-confidence answer policy

- **Location**: `services/backend/lib/reading-service.mjs`, `web/app/features/reading.js`
- **Description**: matching chunk가 거의 없을 때 unsupported answer를 명확히 반환하고 UI가 안내한다.
- **Dependencies**: Task 4.3
- **Acceptance Criteria**:
  - 근거 없는 질문에 hallucinated-looking fallback을 줄인다.
  - citations가 없으면 “근거 부족” 상태가 보인다.
- **Validation**:
  - unrelated question test 추가.

## Sprint 5: 부분 구현 제품화 3차 - Highlight 품질과 session lifecycle

**Goal**: seed note/highlight와 session 관리 기능을 안정화한다.

**Demo/Validation**:

- parse seed highlight가 더 예측 가능하게 생성된다.
- 사용자가 오래된 session을 정리하거나 재처리할 수 있다.

### Task 5.1: Highlight seed 개선

- **Location**: `services/backend/lib/reading-service.mjs`
- **Description**: heading/chunk 기반 claim/method/result/limit 후보 추출을 보강한다.
- **Dependencies**: Sprint 2 selection note
- **Acceptance Criteria**:
  - section label이 약한 PDF에서도 최소 claim/method/result seed가 생성된다.
  - 사용자가 만든 note를 덮어쓰지 않는다.
- **Validation**:
  - heading이 부족한 fixture test 추가.

### Task 5.2: Re-parse 데이터 보존 정책 정리

- **Location**: `services/backend/lib/reading-service.mjs`, `services/backend/tests/reading-service.test.mjs`
- **Description**: re-parse 시 user note/chat은 보존하고 generated seed/artifact만 갱신하는 정책을 명확히 한다.
- **Dependencies**: 없음
- **Acceptance Criteria**:
  - user-origin notes는 보존된다.
  - stale generated highlights/assets/summary는 갱신된다.
- **Validation**:
  - user note 보존 test 추가.

### Task 5.3: Delete/archive session

- **Location**: `services/backend/index.mjs`, store files, `web/app.js`, `web/app/features/reading.js`
- **Description**: context menu와 연결되는 session 삭제 또는 archive 기능을 구현한다.
- **Dependencies**: Sprint 2 context menu
- **Acceptance Criteria**:
  - 삭제/아카이브 후 Reading Home 목록에서 사라진다.
  - queue/library와의 관계가 깨지지 않는다.
- **Validation**:
  - session archive/delete route test 추가.

## Recommended Execution Order

1. Sprint 1: Research handoff + citation/page navigation
2. Sprint 2: PDF text selection note + context menu + unsupported state
3. Sprint 3: Assets source-backed rendering/detail
4. Sprint 4: Chat/retrieval/provenance
5. Sprint 5: Highlight/session lifecycle polish

## Testing Strategy

- Backend unit tests:
  - `services/backend/tests/reading-service.test.mjs`
  - add cases for handoff payload, note focus retrieval, provenance, re-parse preservation.

- Backend route tests:
  - `services/backend/tests/reading-routes.test.mjs`
  - add routes for handoff, asset file serving, session lifecycle.

- Frontend static validation:
  - `node --check web/app.js`
  - if changed module syntax, check affected files directly.

- Runtime smoke:
  - isolated `ARES_DATA_ROOT_DIR` with demo PDF session.
  - create -> parse -> summarize -> chat -> note -> handoff -> Research visibility.

- UI smoke:
  - Desktop: Home preview resize, detail split resize, citation jump.
  - Tablet/mobile: drawer/modal preview, rail default, workbench collapse.

## Potential Risks & Gotchas

- PDF.js text layer alignment can be visually fragile. Keep selection text layer minimal first, then improve styling.
- Research handoff may overlap with existing `agent-runs` flow. Prefer extending the existing readingSession context instead of creating a parallel handoff model.
- Asset file serving must be path-safe. Never expose arbitrary runtime path reads.
- Re-parse can accidentally erase user notes/chat. Separate generated seed data from user-origin data before changing parse behavior.
- Runtime-generated AI and fallback-generated summaries can look identical. Provenance should be stored at generation time, not inferred later in UI.

## Rollback Plan

- Keep each sprint committable.
- If a later sprint destabilizes Reading, preserve Sprint 1 page navigation and handoff work as the minimal useful baseline.
- For risky backend changes, add route flags or retain old fields during normalization so existing sessions continue loading.
