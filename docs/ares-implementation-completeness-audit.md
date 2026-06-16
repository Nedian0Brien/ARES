# ARES 구현 완성도 점검

작성일: 2026-06-12

## 기준

이 문서는 현재 체크아웃의 코드, 문서, 테스트, 로컬 서버 smoke, Playwright CLI 캡처를 기준으로 작성했다.

확인한 대상:

- 제품 구조: `Read`, `Lab`, `Insight`, `Write` 4개 상위 탭과 기존 6단계 호환 라우팅
- 백엔드: HTTP API, agent run orchestration, file/PostgreSQL store, asset graph
- Read: Discover, Library, Reader, PDF parse, summary, chat, notes, assets
- Lab: reproduction plan, experiment run, result dossier, Reading handoff
- Insight: evidence-to-claim board, insight card CRUD, downstream handoff
- Write: draft section, sources, evidence bundle, export surface
- 모바일/반응형: 375px, 1440px 캡처 기준

검증 명령:

- `npm run lint`
- `npm test`
- `ARES_POSTGRES_E2E_ADMIN_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres npm run test:postgres`
- `HOST=127.0.0.1 PORT=3110 npm start`
- `curl -fsS http://127.0.0.1:3110/api/health`
- `curl -fsS http://127.0.0.1:3110/`
- `curl -fsS http://127.0.0.1:3110/api/projects/rag-reranker/reading-sessions`
- `npm run test:e2e`

## 현재 판정

ARES는 화면 목업 단계가 아니다. 현재 앱은 단일 Node 백엔드, asset graph 저장소, agent run, PDF 기반 Reader, Lab/Insight/Write 산출물 CRUD, 모바일 네비게이션을 갖춘 동작 가능한 연구 워크스페이스다.

다만 "프로덕션 사용자에게 제한 없이 열어도 되는 완성"이라고 보기는 어렵다. 남은 리스크는 UI 뼈대보다 데이터 품질, 실행 복구, 고급 PDF/asset 처리, 운영 검증에 있다.

## 영역별 완성도

| 영역 | 판정 | 근거 |
| --- | --- | --- |
| 4탭 네비게이션 | 완료 | 4개 상위 탭, 기존 stage route 호환, keyboard shortcut, 모바일 bottom nav 계약 테스트 통과 |
| Asset graph | 완료 | `Paper -> ReadingPacket -> ReproductionPlan -> ExperimentRun -> ResultDossier -> InsightCard -> DraftSection` 모델과 file/PostgreSQL store 구현 |
| Search/Queue | 부분 완료 | OpenAlex/seed 검색, Scout agent run, queue checkpoint는 동작한다. 고급 필터와 운영 검색 품질 검증은 부족하다 |
| Read/Reader | 부분 완료 | PDF URL, 업로드 PDF, metadata-only 세션을 Reader artifact로 만들 수 있다. PDF 캐시, parse, summary, chat, notes, asset extraction, citation jump, PDF text selection note가 동작한다. Reader chat은 사용자 질문, 선택한 PDF 텍스트, PDF 위치만 agent prompt에 포함한다. Figure thumbnail은 PDF render crop PNG를 우선 사용하고, asset source jump는 PDF canvas 위 source highlight overlay를 표시한다. PDF selection note는 page-ratio source bounds를 저장해 PDF 위 annotation box로 표시하고, 좌표가 없는 note/highlight는 page-level marker로 표시한다. Summary/Chat은 runtime 실패 시 생성물을 저장하지 않는다. Text layer가 없는 PDF는 `tesseract.js` 기반 내장 OCR을 시도하고, 부족한 경우 외부 OCR 텍스트 import로 복구할 수 있다 |
| Lab | 부분 완료 | Reading handoff, reproduction plan, manual run result edit, result dossier 연결이 동작한다. 실제 실험 실행 runner는 없다 |
| Insight | 부분 완료 | Insight card 생성, 선택, 수정, 삭제, evidence/draft 참조 정리가 동작한다. claim clustering과 기본 품질 평가는 자동으로 계산/저장한다. 운영 품질 루프와 사람이 검토할 평가 리포트는 더 확장해야 한다 |
| Write | 부분 완료 | Draft section CRUD와 evidence-backed writing surface가 있다. 완성 문서 export 품질과 citation formatting은 더 검증해야 한다 |
| Backend runtime | 부분 완료 | Agent run 상태 저장, SSE, Codex runtime adapter, 부팅 시 interrupted run 복구가 있다. 취소 요청은 file/PostgreSQL store에 `canceled`, `cancelReason`, `cancelRequestedAt`으로 지속화되며, 늦게 도착한 search 결과가 취소 run을 완료 상태로 덮어쓰지 않는다. Codex runtime은 별도 process group으로 실행되고 취소 시 process group에 SIGTERM을 보낸다. 실패한 stage run은 사용자 asset을 만들지 않고 `error`로 끝난다. Reader summary/chat은 runtime unavailable 생성물을 저장하지 않는다 |
| Storage | 부분 완료 | file store와 PostgreSQL store가 같은 public contract를 제공하고 실제 PostgreSQL E2E를 통과했다. 동시성, migration, 운영 백업 검증은 부족하다 |
| Frontend QA | 부분 완료 | lint, tests, Playwright interaction smoke 통과. Core tab navigation, Read Library 진입, Reader PDF page jump, PDF selection note, Reading -> Lab handoff, mobile bottom nav, mobile PDF dock, console error, failed request 수집을 검증한다. 더 깊은 브라우저/기기 매트릭스 검증은 남아 있다 |

## 완료로 볼 수 있는 기능

- [x] 4개 상위 탭 `Read`, `Lab`, `Insight`, `Write`로 제품 구조를 재편했다.
- [x] 기존 `search`, `reading`, `research`, `result`, `insight`, `writing` route를 새 탭 구조와 호환한다.
- [x] generic placeholder stage fallback을 제거했다.
- [x] file store와 PostgreSQL store가 asset graph collection을 다룬다.
- [x] 프로젝트 graph API가 paper, packet, evidence, lab, insight, draft 자산을 반환한다.
- [x] generic project asset 생성/수정/삭제 API가 있다.
- [x] generic project asset 삭제 API는 `confirmDelete=true`와 사유를 요구하고 audit payload를 반환한다.
- [x] evidence, insight, draft 삭제 시 참조 관계를 정리한다.
- [x] PostgreSQL 실환경 E2E에서 bootstrap, graph asset persistence, cascade cleanup, interrupted run recovery가 통과한다.
- [x] Search/Queue에서 paper 후보를 저장하고 Reader로 넘긴다.
- [x] PDF URL 또는 업로드 PDF로 Reading session을 만들 수 있다.
- [x] backend가 PDF를 캐시하고 `/api/reading-sessions/:id/pdf`로 서빙한다.
- [x] PDF.js canvas와 text layer를 렌더링한다.
- [x] PDF text selection으로 note/highlight를 만들 수 있다.
- [x] citation, note, outline, asset source page가 PDF page jump로 연결된다.
- [x] PDF 위에 note/highlight annotation marker와 selection source box가 표시된다.
- [x] Reader summary, chat, notes, assets가 durable session state에 저장된다.
- [x] Reader chat은 citation을 저장하고, agent에는 사용자 질문, 선택한 PDF 텍스트, PDF 위치만 전달한다.
- [x] asset thumbnail/data file을 source-backed route로 열 수 있다.
- [x] Reading Home preview의 inert bookmark류 버튼을 실제 메뉴 액션으로 교체했다.
- [x] Reading context menu에서 open source, copy citation, export notes, re-parse를 제공한다.
- [x] Reading -> Lab handoff가 note/asset/section/sourceRefs를 보존한다.
- [x] Lab에서 handoff context를 볼 수 있다.
- [x] Lab manual run result를 수정하면 experiment run과 result dossier에 반영된다.
- [x] 서버 부팅 시 이전 프로세스의 `queue/running` agent run을 `error`로 정리하고 retry 가능한 중단 상태를 남긴다.
- [x] Agent run 취소 요청을 저장소에 지속화한다.
  - abort action은 `cancelRequestedAt`, `cancelReason`, `canceled` 상태를 저장한다.
  - 부팅 복구는 이미 취소된 run을 interrupted error로 덮어쓰지 않는다.
  - 늦게 도착한 search 결과는 취소된 run을 `done`으로 바꾸거나 paper queue를 추가하지 않는다.
- [x] Agent runtime 취소를 child process tree 종료 계약까지 확장한다.
  - Codex runtime은 `detached` process group으로 실행된다.
  - abort와 timeout은 process group pid에 `SIGTERM`을 보내고, 불가능하면 direct child kill로 fallback한다.
  - 회귀 테스트가 취소 시 `-pid` 대상 process group signal을 검증한다.
- [x] Insight card를 선택, 수정, 삭제할 수 있다.
- [x] Writing draft section을 선택, 수정, 삭제할 수 있다.
- [x] 모바일 bottom nav와 safe-area viewport 처리가 있다.
- [x] `npm run lint`와 `npm test`가 통과한다.

## 미완성 체크리스트

### P0. 운영 차단 리스크

- [x] session/project 단위 destructive action 정책을 확정한다.
  - 현재 project 또는 reading session 전체 삭제 API는 노출하지 않는다.
  - generic asset delete는 `confirmDelete=true`, 삭제 사유, audit payload를 요구한다.
  - session/project/대량 asset 삭제가 추가될 경우 cascade preview, 명시적 확인, audit text를 먼저 요구한다고 `docs/specification.md`에 명시했다.

### P1. Reader 품질

- [x] Reader chat을 agent 기반 단순 계약으로 정리한다.
  - backend는 사용자 질문, 선택한 PDF 텍스트, PDF 위치만 agent prompt에 포함한다.
  - assistant message에는 answer/citations와 runtime provenance만 저장한다.
  - `evidenceCoverage` report는 chunk/section/asset/source-bounded asset count와 cited chat count만 저장한다.

- [x] runtime provenance를 summary와 chat 전체에 일관되게 노출한다.
  - Summary TL;DR, section summary, assistant chat bubble, exported notes markdown에 생성 출처를 남긴다.
  - runtime 실패나 JSON 계약 위반은 생성물을 저장하지 않고 오류 사유로 남긴다.

- [x] OCR이 필요한 PDF의 recovery path를 확정한다.
  - 현재 v1은 text layer 없는 PDF에서 PDF page를 PNG로 렌더링하고 `tesseract.js` 기반 내장 OCR을 시도한다.
  - 내장 OCR 세션은 `sourceProvider: built-in-ocr`, `summaryGeneratedBy: built-in-ocr`, `ocrProvenance`를 저장한다.
  - PDF URL이 없거나 내장 OCR 결과가 부족한 세션은 External OCR 텍스트를 붙여넣어 `external-ocr` 세션으로 복구할 수 있다.
  - OCR 기반 세션은 sections, chunks, notes, summary cards, Reader chat citation 경로를 저장한다.
  - OCR source label, tool, generatedAt, importedAt, textLength를 `ocrProvenance`로 저장하고 notes export에 포함한다.

- [x] PDF reader 고급 navigation을 추가한다.
  - PDF dock에서 본문 검색, 목차, page thumbnail grid, zoom in/out/reset을 제공한다.
  - 검색 결과와 thumbnail은 기존 PDF page jump로 연결된다.
  - Playwright smoke가 desktop과 390px mobile viewport에서 검색, page thumbnail, zoom controls를 조작한다.

- [x] PDF annotation layer를 추가한다.
  - 세션의 note/highlight를 PDF annotation layer로 정규화한다.
  - PDF selection으로 만든 note는 호환용 union `sourceBounds`와 줄별 `sourceBounds.rects`를 `page-ratio`로 저장하고 PDF canvas 위 annotation box로 표시한다.
  - parse seed highlight는 selection method와 confidence를 저장해 generated candidate의 근거 수준을 추적한다.
  - Notes는 사용자 작성 산출물로만 유지하며, legacy seed note는 Reading model 정규화에서 제외한다.
  - 좌표가 없는 기존 note/highlight는 page-level marker로 fallback한다.
  - 남은 리스크: 브라우저 `Selection.getClientRects()` 기반 rect라 glyph-level polygon이나 cross-page selection 정밀도는 별도 검증이 필요하다.

### P2. Asset 품질

- [x] figure/table asset source bounds를 PDF detail overlay 좌표계와 연결한다.
  - asset은 `sourceBounds`를 `page-ratio` 좌표로 저장하고 `sourceText`를 보존한다.
  - asset detail은 source region mini map, region 값, source snippet을 표시한다.
  - note/asset page jump와 같은 page coordinate를 공유한다.

- [x] 실제 figure crop extraction을 PDF 렌더 좌표와 연결한다.
  - PDF cache와 source bounds가 있으면 PDF.js 렌더 결과를 PNG로 crop해 figure `thumbPath`에 저장한다.
  - crop이 불가능한 경로는 synthetic SVG preview로 fallback한다.
  - asset source page jump는 PDF canvas 위 source highlight overlay를 표시한다.

- [x] table extraction의 기본 회귀 샘플을 검증한다.
  - `pdf-parse.getTable()`, whitespace inference, pipe/tabular text inference를 지원한다.
  - caption 없는 pipe table을 asset rows/dataPath/sourceBounds/sourceText로 저장하는 회귀 테스트가 있다.
  - asset은 `quality.status`, `quality.score`, `quality.checks`를 저장하고 UI는 source-backed 품질 badge를 표시한다.
  - 실제 공개 PDF 샘플 `Mixture-of-RAG: Integrating Text and Tables with Large Language Models` (`arXiv:2504.09554`)로 검증했다.
  - `node scripts/validate-reading-sample.mjs --min-assets 7 --min-tables 7 --min-source-bounded-assets 7` 실행 결과 12페이지, section 136개, table asset 7개, source-bounded asset 7개를 확인했다.
  - `scripts/reading-validation-samples.json`와 `--samples-file` 옵션으로 여러 PDF 샘플을 독립 temp store에서 검증하고 aggregate JSON report를 만들 수 있다.
  - 기본 샘플 세트는 MixRAG와 PubTables-v2 arXiv 논문을 포함한다.
  - `node scripts/validate-reading-sample.mjs --samples-file scripts/reading-validation-samples.json` 실행 결과 2개 샘플 모두 통과했고, 합계 table asset 12개와 source-bounded/source-backed asset 12개를 확인했다.
  - 남은 리스크: 다양한 출판사 PDF와 긴 multi-page table 샘플 세트의 실제 통과 기준을 운영 데이터로 더 넓혀야 한다.

- [x] asset detail에서 원본 위치, data preview, citation export를 한 흐름으로 묶는다.
  - detail 안에서 source page jump, data file open, citation copy, linked evidence 생성을 제공한다.
  - Playwright smoke가 asset detail 진입과 linked evidence 생성까지 검증한다.

### P3. Lab 실행성

- [x] 실제 experiment runner 또는 외부 run import 계약을 정한다.
  - Lab은 명령을 직접 실행하지 않고, 외부 실행 로그를 `external-import` run으로 들여온다.
  - import form은 command, run log, artifact URL, paper baseline, unit을 받고 metric parser로 result dossier를 만든다.
  - 실패 로그는 Lab run과 result dossier에 남고, Insight 후보는 사용자가 명시적으로 만들 때만 생성한다.

- [x] result comparison을 paper metric과 run metric 사이의 typed contract로 만든다.
  - Lab result form은 paper baseline, observed value, unit을 받는다.
  - result dossier comparison은 metric, unit, paperValue, reproducedValue, delta, deltaValue, status를 저장한다.

- [x] failed run 분석은 Lab에 남기고 Insight 자동 생성을 차단한다.
  - Lab result를 `error` 상태로 저장해도 Insight 후보를 자동 생성하지 않는다.
  - 기존 Insight card에 failure cause와 follow-up이 있으면 카드 본문에 표시한다.

### P4. Insight/Write 품질

- [x] Insight card 품질 평가 기준을 저장한다.
  - Insight card는 confidence/type/status와 함께 evidence coverage, contradiction flag, follow-up run id를 저장한다.
  - 카드 본문과 편집 폼에서 세 기준을 확인하고 수정할 수 있다.

- [x] Insight claim clustering과 기본 품질 평가를 자동화한다.
  - Insight card는 `claimCluster`를 저장하고, Insight surface는 현재 claim들을 cluster summary로 묶어 표시한다.
  - 새 card 생성/저장 시 evidence coverage, contradiction flag, follow-up run id의 기본 평가값을 자동 계산한다.
  - 남은 리스크: 실제 운영 품질 리포트, reviewer assignment, contradiction evidence trace까지 이어지는 평가 루프는 아직 없다.

- [x] Writing export를 실제 사용자 산출물 기준으로 검증한다.
  - Markdown export가 draft section 본문과 evidence citation marker를 함께 복사한다.
  - export 하단에 source appendix와 broken-source warning을 포함한다.

- [x] Draft에 삽입한 evidence의 원문 추적을 문서 끝까지 유지한다.
  - draft section의 `evidenceLinkIds`를 footnote marker로 렌더링한다.
  - 누락된 evidence link는 export의 broken-source warning에 표시한다.

### P5. QA와 문서

- [x] Playwright interaction smoke를 프로젝트 의존성에 넣는다.
  - 현재 `npm run test:e2e`가 앱 로드, 4탭 이동, Read Library 진입, console error, failed request 수집을 검증한다.
  - web server는 `.runtime/e2e` data root를 사용해 기본 `data/runtime` 상태와 분리한다.

- [x] Playwright interaction smoke를 PDF/Reader/Lab 주요 플로우까지 확장한다.
  - `tests/e2e/workspace-smoke.spec.mjs`가 API로 demo PDF Reading session을 만들고 parse한 뒤 Reader detail에서 PDF page jump, PDF text selection note, Reading -> Lab handoff를 검증한다.

- [x] Playwright interaction smoke를 모바일 주요 플로우까지 확장한다.
  - 390px mobile viewport에서 bottom nav 탭 이동, Read Library 진입, Reader PDF 검색, zoom, page thumbnail, text selection dock 표시, bottom nav와 dock 겹침 방지를 검증한다.

- [x] Console error와 failed request 수집을 자동화한다.
  - `tests/e2e/workspace-smoke.spec.mjs`가 browser console error, page error, request failure를 수집한다.
  - 정상 종료 시 abort되는 SSE `/events` 요청은 expected abort로 제외한다.

- [x] `docs/reading-implementation-checklist.md`를 현재 구현 상태에 맞춰 갱신했다.
  - PDF selection, citation jump, Lab handoff, context menu, source-backed assets, generation provenance 상태를 현재 코드 기준으로 반영했다.

## 다음 작업 순서

1. 다양한 출판사 PDF와 multi-page table 샘플 세트의 실제 통과 기준을 `scripts/reading-validation-samples.json`에 추가한다.
2. Reader agent prompt가 선택 텍스트와 PDF 위치만으로 충분히 답변하는지 실제 PDF 샘플로 주기 검증한다.
3. OCR 품질 샘플을 확장하고 `ARES_OCR_MAX_PAGES` 운영 기준을 조정한다.
4. 실제 논문별 figure/table 위치 정확도를 샘플 세트로 검증한다.
