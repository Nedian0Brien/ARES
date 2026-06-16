# Reading 탭 구현 현황 체크리스트

작성일: 2026-06-12
기준: 현재 체크아웃 코드, Reading 관련 계약 테스트, Playwright smoke, 전체 완성도 감사 문서 기준.

## 판정 기준

- `실구현`: API, 저장소, 프론트 핸들러, 렌더링이 연결되어 있고 상태가 유지되는 기능.
- `부분 구현`: 실제 코드 경로는 있으나 품질, 범위, 자동화, UX 연결이 제한적인 기능.
- `목업/미구현`: 화면상 표현, 장식, preview fallback, 단순 stage 이동에 머무르는 기능.

## 핵심 결론

Reading 탭은 더 이상 전체가 목업인 상태가 아니다. 현재 구현은 `pdfUrl`이 있는 실제 PDF 세션을 만들고, PDF를 캐시/렌더링하고, parse/summarize/chat/notes/assets 결과를 `readingSessions` 상태로 저장하는 v1 파이프라인까지 들어와 있다.

다만 Reading 상세 UI가 곧바로 운영 품질을 보장하지는 않는다. 여러 실제 PDF 샘플에 대한 table/figure 위치 품질 검증은 계속 넓혀야 한다. OCR이 필요한 세션은 내장 OCR을 먼저 시도하고, 부족하면 외부 OCR 텍스트 import로 복구할 수 있다.

## 소스 기준점

- `web/app/features/reading.js`: Reading Home/Detail 렌더링, Summary/PDF/Assets/Chat/Notes 패널.
- `web/app/lib/pdf-viewer.js`: PDF.js 기반 실제 PDF canvas 렌더링.
- `web/app.js`: Reading 상태, API 호출 핸들러, 세션 열기, parse/summarize/assets/chat/notes 액션 연결.
- `web/styles.css`: Reading Home/Detail 레이아웃, 반응형, 모션, PDF/Assets/Chat/Notes 스타일.
- `services/backend/index.mjs`: Reading API 라우트와 PDF.js vendor asset 서빙.
- `services/backend/lib/reading-model.mjs`: Reading session 정규화 모델.
- `services/backend/lib/reading-service.mjs`: PDF 캐시, parse, summarize, chat, note CRUD, asset extraction 서비스.
- `services/backend/lib/file-store.mjs`: 파일 저장소의 `readingSessions` 저장/조회.
- `services/backend/lib/postgres-store.mjs`: Postgres 저장소의 `ares_reading_sessions` 저장/조회.
- `services/backend/tests/reading-service.test.mjs`: Reading service 단위 테스트.
- `services/backend/tests/reading-routes.test.mjs`: Reading route 통합 테스트.
- `services/backend/tests/search-reading-tab-contract.test.mjs`: Reading UI 계약 테스트.
- `tests/e2e/workspace-smoke.spec.mjs`: Reader PDF 검색/썸네일/줌, PDF text selection note, Reading -> Lab handoff, 모바일 bottom nav smoke.

## 실구현 체크리스트

- [x] Reading Home이 프로젝트별 세션 목록을 로드한다.
  - `GET /api/projects/:projectId/reading-sessions`가 backend에 있고, frontend가 `state.readingSessions`로 받아 정렬한다.

- [x] Search/Library의 paper에서 Reading session을 생성하거나 기존 세션을 재사용한다.
  - `POST /api/projects/:projectId/reading-sessions`가 paper 또는 paperId를 받아 세션을 만들고 `queuePaper`까지 갱신한다.

- [x] Reading session은 durable store에 저장된다.
  - file-store는 `readingSessions` 컬렉션에 저장한다.
  - postgres-store는 `ares_reading_sessions` 테이블 payload로 저장한다.

- [x] PDF, 업로드 PDF, metadata source의 기본 처리 경로가 코드에 반영되어 있다.
  - `pdfUrl`이 있으면 PDF를 다운로드해 cache/parse한다.
  - 업로드 PDF는 binary cache를 먼저 저장하고 같은 parse pipeline을 사용한다.
  - `pdfUrl`이 없으면 title/abstract/summary/keyPoints/keywords를 metadata artifact로 변환해 Reader 기본 기능을 제공한다.

- [x] PDF 원본 캐시와 PDF API가 구현되어 있다.
  - backend가 PDF를 다운로드하거나 demo host PDF를 생성해 `data/runtime/reading/:sessionId/source.pdf`로 캐시한다.
  - `GET /api/reading-sessions/:id/pdf`가 `application/pdf`로 binary PDF를 반환한다.

- [x] PDF.js 기반 실제 렌더링이 구현되어 있다.
  - frontend가 `GET /api/reading-sessions/:id/pdf`를 fetch하고, `pdfjs-dist`를 vendor endpoint에서 import해 page별 canvas를 렌더링한다.

- [x] Parse paper 액션이 backend pipeline에 연결되어 있다.
  - frontend의 `reading-parse-session` 액션이 `POST /api/reading-sessions/:id/parse`를 호출한다.
  - backend는 `pdf-parse`로 text/info/table/image extraction을 시도한다.

- [x] Parse 결과가 세션에 저장된다.
  - `parseStatus`, `pageCount`, `sections`, `highlights`, `notes`, `reproParams`, `assets`, `parsedArtifactPath`, `pdfCachePath`가 session에 반영된다.

- [x] 내장 OCR 기반 scanned PDF 처리 경로가 구현되어 있다.
  - text layer가 없으면 PDF page를 PNG로 렌더링하고 `tesseract.js` OCR을 시도한다.
  - OCR 결과는 `sourceProvider: built-in-ocr`, `summaryGeneratedBy: built-in-ocr`, `ocrProvenance`로 저장된다.
  - `ARES_OCR_MAX_PAGES=12`로 기본 OCR page cap을 둔다.

- [x] OCR/text import recovery path가 구현되어 있다.
  - 내장 OCR 결과가 부족하거나 더 강한 source text가 필요한 경우 External OCR 텍스트를 붙여넣어 import할 수 있다.
  - backend는 `POST /api/reading-sessions/:id/import-text`로 sections, chunks, notes, summary cards, parsed artifact를 저장한다.
  - import 결과는 `sourceProvider: external-ocr`, `summaryGeneratedBy: external-ocr`, `ocrProvenance`를 남긴다.
  - OCR source label, tool, generatedAt, importedAt, textLength가 세션과 parsed artifact에 저장되고 notes export에 포함된다.

- [x] Summarize 액션이 backend pipeline에 연결되어 있다.
  - frontend의 `reading-summarize-session` 액션이 `POST /api/reading-sessions/:id/summarize`를 호출한다.
  - parse가 완료되지 않으면 backend가 prerequisite error를 반환한다.

- [x] Summary 결과가 저장된다.
  - `summaryStatus`, `summaryCards`, `keyPoints`, `summary`가 session에 저장된다.
  - UI는 TL;DR, Key Points, Method, Result, Limit, Section summaries를 표시한다.

- [x] Reader chat이 backend와 연결되어 있다.
  - chat form submit과 note 기반 Ask AI가 `POST /api/reading-sessions/:id/chat`를 호출한다.
  - backend는 parsed artifact chunks에서 hybrid retrieval을 수행하고 user/assistant turn을 `chatMessages`에 저장한다.

- [x] Chat citation 구조가 저장된다.
  - assistant message에 `citations`가 붙고 UI에서는 section/page chip으로 표시된다.

- [x] Chat retrieval telemetry와 low-confidence threshold가 저장된다.
  - assistant message는 retrieval mode, scorer, top score, confidence, lowConfidence, query terms, top chunk score breakdown을 저장한다.
  - lexical score, semantic/reranker scorer adapter, section/title/page boost를 합산한다.
  - 낮은 점수의 억지 매칭은 `no matching reading evidence` fallback으로 내려간다.
  - UI는 hybrid retrieval confidence와 low confidence 상태를 chat bubble에 표시한다.

- [x] Evidence coverage report가 저장되고 Summary에 표시된다.
  - parse/import/extract 시점에 chunk, section, asset, source-bounded asset, figure/table count를 `evidenceCoverage`에 저장한다.
  - Reader chat 이후 last retrieval confidence/top score, cited chat count, low-confidence chat count를 같은 report에 갱신한다.
  - Summary 화면은 retrieval readiness와 source-bounded asset 수를 compact grid로 표시한다.

- [x] Notes CRUD가 backend와 연결되어 있다.
  - `POST /notes`, `PATCH /notes/:noteId`, `DELETE /notes/:noteId` 라우트가 있다.
  - frontend의 New note, Save, Delete가 각각 API를 호출한다.

- [x] Assets 추출 액션이 backend와 연결되어 있다.
  - `POST /api/reading-sessions/:id/extract-assets`가 parsed artifact를 기준으로 assets를 재계산하고 저장한다.

- [x] Table extraction 기본 회귀 샘플이 있다.
  - `pdf-parse.getTable()`, whitespace inference, pipe/tabular text inference를 지원한다.
  - caption 없는 pipe table을 rows/dataPath/sourceBounds/sourceText로 저장하는 service test가 있다.
  - 실제 공개 PDF `Mixture-of-RAG: Integrating Text and Tables with Large Language Models` (`arXiv:2504.09554`) 검증 스크립트가 있다.
  - `node scripts/validate-reading-sample.mjs --min-assets 7 --min-tables 7 --min-source-bounded-assets 7`는 12페이지, section 136개, table asset 7개, source-bounded asset 7개를 확인한다.
  - `node scripts/validate-reading-sample.mjs --samples-file scripts/reading-validation-samples.json`는 여러 PDF 샘플을 독립 temp store에서 검증하고 aggregate JSON report를 출력한다.
  - 현재 샘플 세트는 MixRAG와 PubTables-v2 arXiv PDF 2개를 통과하며, 합계 table asset 12개와 source-bounded asset 12개를 확인했다.

- [x] Reading 상세 화면의 핵심 패널 구조가 구현되어 있다.
  - 좌측 icon rail, float panel, 중앙 Summary/PDF/Assets, 우측 Chat/Notes workbench, split resize, orientation toggle, workbench collapse가 구현되어 있다.

- [x] Reading Home의 기본 worklist UX가 구현되어 있다.
  - Saved papers 목록, filter chip, PDF 여부, progress, status, selected preview, empty/loading state가 구현되어 있다.

- [x] Reading Home preview의 이전 bookmark류 버튼은 실제 액션으로 교체됐다.
  - Open source, Copy link, Open Reader가 `data-action` 기반 handler로 연결된다.

- [x] Reading detail context menu가 실제 액션으로 연결된다.
  - Open source, Copy citation, Export notes, Re-parse paper가 동작한다.
  - Export notes는 summary/chat generation provenance를 markdown에 포함한다.

- [x] PDF text selection 기반 note 생성이 구현되어 있다.
  - PDF selection dock에서 선택한 quote/page/source bounds를 note로 저장하고 Reader chat context로 보낼 수 있다.

- [x] PDF annotation layer가 구현되어 있다.
  - PDF selection으로 만든 note는 호환용 union `sourceBounds`와 줄별 `sourceBounds.rects`를 `page-ratio`로 저장하고 annotation box로 표시한다.
  - 좌표가 없는 기존 note/highlight는 page-level annotation marker로 정규화해 PDF canvas 위에 표시한다.
  - marker는 PDF text selection과 asset source highlight overlay를 방해하지 않는 별도 layer로 렌더링된다.
  - 남은 리스크는 브라우저 selection rect 기반 표시라 glyph-level polygon이나 cross-page selection 정밀도는 별도 검증이 필요하다는 점이다.

- [x] Citation, note, section, asset page jump가 PDF viewer navigation과 연결된다.
  - page metadata가 있는 UI 요소는 `jump-reading-page`로 PDF tab과 target page를 동기화한다.

- [x] PDF viewer 고급 navigation이 구현되어 있다.
  - PDF dock은 본문 검색, 목차, page thumbnail grid, zoom in/out/reset을 제공한다.
  - 검색 결과와 page thumbnail은 기존 PDF page jump로 연결된다.
  - Playwright smoke는 desktop과 390px mobile viewport에서 검색, page thumbnail, zoom controls를 조작한다.

- [x] Reading -> Lab handoff가 실제 graph asset context를 보존한다.
  - handoff payload는 readingSessionId, noteIds, assetIds, sectionIds, sourceRefs를 Lab surface로 넘긴다.

- [x] Asset detail은 source-backed file route를 사용한다.
  - `thumbPath`가 있으면 실제 thumbnail route를 렌더하고, table `dataPath`는 data file open action으로 연결된다.
  - Detail에서 source page jump, citation copy, linked evidence 생성을 제공한다.

- [x] Asset detail은 원본 source bounds를 표시한다.
  - asset은 `sourceBounds`를 `page-ratio` 좌표로 저장하고 `sourceText`를 보존한다.
  - Detail은 source region mini map, region 값, source snippet을 표시한다.

- [x] Figure asset은 PDF 렌더 crop 기반 thumbnail을 저장한다.
  - PDF buffer와 `sourceBounds`가 있으면 PDF.js 렌더 결과를 PNG로 crop해 `thumbPath`에 저장한다.
  - PDF buffer가 없거나 crop이 실패하면 기존 synthetic SVG preview로 fallback한다.
  - service test는 figure thumbnail route가 PNG binary를 반환하는지 검증한다.

- [x] Summary와 Chat은 generation provenance를 화면과 export에 남긴다.
  - Summary TL;DR, section summaries, assistant chat bubble, exported notes markdown이 agent/fallback 출처를 표시한다.

- [x] 반응형 레이아웃이 들어와 있다.
  - desktop preview resize, tablet drawer, mobile modal/list 변환, detail rail 세로 배치, resize handle 숨김 등이 CSS와 상태 동기화로 처리된다.

- [x] 테스트 코드가 존재한다.
  - service test는 parse, missing PDF error, summarize prerequisite, chat citation persistence, note CRUD, asset rerun을 다룬다.
  - route test는 GET sessions normalization, PDF binary delivery, summarize prerequisite, parse success를 다룬다.
  - Playwright smoke는 Reader PDF search, page thumbnail, zoom, page jump, text selection note, Lab handoff, mobile PDF dock을 검증한다.

## 부분 구현 체크리스트

- [x] Summary/Chat의 runtime fallback은 운영에서 명시적으로 차단할 수 있다.
  - 기본 개발 경로는 runtime 실패 시 deterministic fallback을 저장하되 provenance와 fallback reason을 화면/export에 표시한다.
  - `ARES_REQUIRE_AGENT_RUNTIME=true`이면 summary는 fallback prose를 저장하지 않고 error 상태가 되며, chat은 fallback 답변을 저장하지 않고 명시적 오류를 반환한다.
  - 근거가 없는 chat 질문은 runtime 호출 여부와 별개로 `Insufficient evidence` fallback으로 처리해 unsupported answer를 만들지 않는다.

- [x] 운영 retrieval scorer adapter가 구현되어 있다.
  - retrieval pipeline은 `retrievalScorer.scoreChunks` adapter, HTTP scorer env adapter, score telemetry, low-confidence threshold를 갖췄다.
  - 기본 scorer는 deterministic semantic alias fallback이다.
  - `ARES_RETRIEVAL_SCORER_URL`, `ARES_RETRIEVAL_SCORER_API_KEY`, `ARES_RETRIEVAL_SCORER_PROVIDER`, `ARES_RETRIEVAL_SCORER_TIMEOUT_MS`로 HTTP scorer를 주입할 수 있다.
  - scorer 장애나 timeout은 chat 전체 실패로 전파하지 않고 semantic score 0으로 제한한다.
  - `node scripts/validate-retrieval-scorer.mjs`로 운영 scorer endpoint가 expected top chunk와 min score를 만족하는지 JSON report로 확인할 수 있다.

- [x] 운영 embedding/reranker provider 계약과 품질 기준이 정리되어 있다.
  - 운영 기본 계약은 `ARES_RETRIEVAL_SCORER_PROVIDER=local-cross-encoder`와 HTTP scorer endpoint다.
  - `.env.example`은 `ARES_RETRIEVAL_SCORER_URL`, `ARES_RETRIEVAL_SCORER_API_KEY`, `ARES_RETRIEVAL_SCORER_TIMEOUT_MS=2500`을 포함한다.
  - `node scripts/validate-retrieval-scorer.mjs --min-top-score 0.8`로 expected top chunk와 score threshold를 검증한다.
  - credential 값 자체와 endpoint URL은 배포 환경의 `.env`/secret store에서 주입한다.

- [x] Assets는 source-backed 후보와 품질 상태를 함께 제공한다.
  - table은 `pdf-parse.getTable()`, whitespace, pipe/tabular row inference로 만들 수 있다.
  - figure는 caption line, `getImage()`, source bounds 기반 PDF crop, 또는 synthetic SVG preview에 의존한다.
  - asset마다 `quality.status`, `quality.score`, `quality.checks`를 저장해 source-backed/partial/synthetic 상태를 구분한다.
  - asset card와 detail은 품질 badge를 표시해 사용자가 후보 asset의 신뢰 수준을 확인할 수 있다.
  - MixRAG arXiv 샘플에서는 table asset 7개와 source bounds 7개를 확인했다.
  - 샘플 세트 검증 계약은 `scripts/reading-validation-samples.json`로 고정했고, validator는 source-backed asset 수와 평균 asset quality를 report에 포함한다.
  - 남은 리스크는 실제 논문별 figure 위치 정확도와 여러 출판사 PDF/multi-page table 샘플의 통과 기준 확장이지만, v1 UI는 이를 무근거 확정값이 아니라 품질 표시가 붙은 source-backed 후보로 제공한다.

- [x] Assets UI는 source-backed route와 source bounds preview를 쓴다.
  - `thumbPath`가 있으면 실제 asset file route를 렌더한다.
  - `sourceBounds`가 있으면 source region mini map과 source snippet을 표시한다.

- [x] Notes는 사용자 작성/수정 산출물로만 유지한다.
  - parse 기반 후보는 `highlights`에만 남기고 `notes`로 승격하지 않는다.
  - 기존 runtime store에 남아 있던 `note-seed-*`, `origin: highlight`, `seedMethod` note는 Reading model 정규화에서 사용자 노트로 취급하지 않는다.
  - 사용자가 직접 작성/수정한 note CRUD는 실제 구현이다.

- [x] `example.org` PDF는 명시적 demo/test fixture로 분리되어 있다.
  - backend는 기본값으로 `example.org` 로컬 demo PDF를 생성하지 않는다.
  - fixture가 필요한 테스트와 E2E 서버만 `ARES_ENABLE_DEMO_PDF=true`로 데모 PDF를 켠다.
  - 운영 기본 경로는 실제 PDF 다운로드 또는 업로드 PDF cache를 사용한다.

- [x] Home metric mini chart는 현재 library 상태 카운트 기반으로 렌더링된다.
  - Saved/Ready/In progress/Completed count는 실제 items 기반이다.
  - 카드 내부 sparkline/bars/dots도 `readingHomeCounts`에서 계산한 값으로 그린다.

## 목업/미구현 체크리스트

- [x] Metadata-only 논문도 Reading v1에서 기본 Reader 기능을 사용할 수 있다.
  - `pdfUrl`이 없더라도 title, abstract, summary, keyPoints, keywords를 `metadata` source artifact로 변환한다.
  - metadata artifact는 sections, chunks, highlights, evidence coverage, Reader chat citation 경로를 생성한다.
  - PDF 본문 품질이 필요한 경우에는 업로드 PDF 또는 External OCR 텍스트 import로 더 강한 source를 연결할 수 있다.

- [x] 내장 OCR 기반 scanned PDF 처리.
  - text layer가 없는 PDF는 `tesseract.js` 기반 내장 OCR을 시도한다.
  - OCR 산출물은 sections, chunks, highlights, summary cards, Reader chat citation 경로를 만든다.
  - 내장 OCR이 충분하지 않으면 외부 OCR 텍스트 import recovery path를 사용할 수 있다.

- [x] Figure/table 원본 위치 preview.
  - asset detail, thumbnail/data route, source page jump, citation copy, linked evidence 생성은 있다.
  - source bounds 기반 mini map과 source snippet을 표시한다.

- [x] 실제 PDF crop image 생성.
  - source bounds와 PDF cache가 있으면 figure thumbnail을 PNG crop으로 저장한다.
  - source bounds가 없거나 PDF cache가 없는 경로는 fallback preview를 유지한다.

- [x] PDF source highlight overlay.
  - asset detail의 source page jump는 PDF 탭으로 이동하면서 `sourceBounds`를 canvas 위 highlight layer로 표시한다.
  - 검색 결과나 일반 page jump는 stale highlight를 제거한다.

- [x] PDF 주석/annotation layer.
  - note/highlight page-level marker와 selection source bounds annotation box를 PDF 위에 표시한다.
  - selection note의 `sourceBounds`는 evidence locator에도 보존된다.
  - multi-line selection은 `sourceBounds.rects`의 줄별 box로 표시하고, union `sourceBounds`는 호환용으로 유지한다.

## 기능별 현재 상태 표

| 영역 | 현재 상태 | 판정 |
| --- | --- | --- |
| Reading 세션 목록 | 프로젝트별 API/저장소 연동 | 실구현 |
| 세션 생성 | paper/paperId 기반 생성, queue 갱신 | 실구현 |
| PDF 원본 | download/cache/serve | 실구현 |
| PDF 렌더링 | PDF.js canvas 렌더링 | 실구현 |
| PDF navigation | search, outline, page thumbnails, zoom, page jump | 실구현 |
| PDF annotation | note/highlight marker, selection source bounds box, E2E visibility check | 실구현 |
| Parse | pdf-parse 기반 text/table/image extraction | 실구현 |
| OCR recovery | 내장 OCR + External OCR text import | 실구현 |
| OCR provenance | source label, tool, generated/import time, text length 저장 및 export | 실구현 |
| 내장 OCR | tesseract.js 기반 PDF page OCR, provenance 저장, citation 경로 생성 | 실구현 |
| Summary | parse 후 summaryCards 저장 | 실구현 |
| AI summary 품질 | runtime/fallback provenance 표시, runtime 실패 시 fallback | 부분 구현 |
| Chat | parsed chunks 기반 Q&A 저장 | 실구현 |
| Retrieval | lexical + semantic/reranker adapter + HTTP scorer env adapter + telemetry + confidence threshold | 실구현 |
| Notes | create/update/delete 저장, selection source bounds 보존, PDF annotation 표시 | 실구현 |
| Highlight seed | chunks 기반 휴리스틱 | 부분 구현 |
| Assets | figure/table 후보, source bounds, source text, figure crop thumbnail 저장 | 부분 구현 |
| Table extraction | pdf-parse, whitespace, pipe/tabular inference + captionless pipe test + MixRAG arXiv sample validator | 부분 구현 |
| Asset thumbnails | PDF crop PNG 우선, source-backed thumb route, fallback preview, source bounds mini map, PDF overlay | 부분 구현 |
| Lab handoff | note/asset/session context 전달 | 실구현 |
| Context menu | source/citation/export/re-parse 연결 | 실구현 |
| 반응형 | desktop/tablet/mobile CSS/상태 처리 | 실구현 |
| Tests | service/route/contract/Playwright smoke 통과 | 실구현 |

## 다음 구현 우선순위 제안

1. `scripts/reading-validation-samples.json`에 다양한 출판사 PDF와 multi-page table 샘플을 추가하고 통과 기준을 확장한다.
   - 다양한 출판사 PDF와 multi-page table을 기준으로 품질 리포트를 만든다.

2. `운영 embedding/reranker provider`를 선택하고 HTTP scorer 검증을 배포 루틴에 연결한다.
   - scorer endpoint, credential, timeout, fallback 정책과 정기 검증 기준을 정한다.

3. OCR 품질 샘플을 확장한다.
   - scanned PDF 샘플별 OCR 정확도와 OCR page cap 기준을 운영 데이터로 조정한다.

4. `실제 논문별 figure/table 위치 정확도`를 샘플 세트로 검증한다.
   - multi-column layout에서 source bounds와 crop이 실제 영역을 가리키는지 확인한다.

5. `AI summary/chat provider 운영 설정`을 정리한다.
   - `ARES_REQUIRE_AGENT_RUNTIME=true` 운영 모드에서 provider health check와 알림 기준을 정한다.
