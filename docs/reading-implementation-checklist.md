# Reading 탭 구현 현황 체크리스트

작성일: 2026-04-25
기준: 현재 체크아웃 정적 코드 분석 기준. 이번 문서 작성 중 런타임 스모크, lint, build는 실행하지 않았다.

## 판정 기준

- `실구현`: API, 저장소, 프론트 핸들러, 렌더링이 연결되어 있고 상태가 유지되는 기능.
- `부분 구현`: 실제 코드 경로는 있으나 품질, 범위, 자동화, UX 연결이 제한적인 기능.
- `목업/미구현`: 화면상 표현, 장식, preview fallback, 단순 stage 이동에 머무르는 기능.

## 핵심 결론

Reading 탭은 더 이상 전체가 목업인 상태가 아니다. 현재 구현은 `pdfUrl`이 있는 실제 PDF 세션을 만들고, PDF를 캐시/렌더링하고, parse/summarize/chat/notes/assets 결과를 `readingSessions` 상태로 저장하는 v1 파이프라인까지 들어와 있다.

다만 Reading 상세 UI의 일부는 여전히 “그럴듯한 리더 워크벤치” 형태의 시각화다. 특히 figure 썸네일, 홈 메트릭 차트, 일부 메뉴 버튼, Research handoff, PDF text-layer 기반 상호작용은 아직 완전한 제품 기능이라기보다 부분 구현 또는 목업에 가깝다.

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

## 실구현 체크리스트

- [x] Reading Home이 프로젝트별 세션 목록을 로드한다.
  - `GET /api/projects/:projectId/reading-sessions`가 backend에 있고, frontend가 `state.readingSessions`로 받아 정렬한다.

- [x] Search/Library의 paper에서 Reading session을 생성하거나 기존 세션을 재사용한다.
  - `POST /api/projects/:projectId/reading-sessions`가 paper 또는 paperId를 받아 세션을 만들고 `queuePaper`까지 갱신한다.

- [x] Reading session은 durable store에 저장된다.
  - file-store는 `readingSessions` 컬렉션에 저장한다.
  - postgres-store는 `ares_reading_sessions` 테이블 payload로 저장한다.

- [x] `pdfUrl` 기반 실제 PDF v1 제약이 코드에 반영되어 있다.
  - `pdfUrl`이 없으면 parse가 error 상태가 되고, UI도 metadata-only 안내를 보여준다.

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

- [x] OCR 미지원 정책이 명시적으로 구현되어 있다.
  - text layer가 없으면 `This PDF does not expose a usable text layer. OCR is not supported in v1.` 오류로 parse가 실패한다.

- [x] Summarize 액션이 backend pipeline에 연결되어 있다.
  - frontend의 `reading-summarize-session` 액션이 `POST /api/reading-sessions/:id/summarize`를 호출한다.
  - parse가 완료되지 않으면 backend가 prerequisite error를 반환한다.

- [x] Summary 결과가 저장된다.
  - `summaryStatus`, `summaryCards`, `keyPoints`, `summary`가 session에 저장된다.
  - UI는 TL;DR, Key Points, Method, Result, Limit, Section summaries를 표시한다.

- [x] Reader chat이 backend와 연결되어 있다.
  - chat form submit과 note 기반 Ask AI가 `POST /api/reading-sessions/:id/chat`를 호출한다.
  - backend는 parsed artifact chunks에서 lexical retrieval을 수행하고 user/assistant turn을 `chatMessages`에 저장한다.

- [x] Chat citation 구조가 저장된다.
  - assistant message에 `citations`가 붙고 UI에서는 section/page chip으로 표시된다.

- [x] Notes CRUD가 backend와 연결되어 있다.
  - `POST /notes`, `PATCH /notes/:noteId`, `DELETE /notes/:noteId` 라우트가 있다.
  - frontend의 New note, Save, Delete가 각각 API를 호출한다.

- [x] Assets 추출 액션이 backend와 연결되어 있다.
  - `POST /api/reading-sessions/:id/extract-assets`가 parsed artifact를 기준으로 assets를 재계산하고 저장한다.

- [x] Reading 상세 화면의 핵심 패널 구조가 구현되어 있다.
  - 좌측 icon rail, float panel, 중앙 Summary/PDF/Assets, 우측 Chat/Notes workbench, split resize, orientation toggle, workbench collapse가 구현되어 있다.

- [x] Reading Home의 기본 worklist UX가 구현되어 있다.
  - Saved papers 목록, filter chip, PDF 여부, progress, status, selected preview, empty/loading state가 구현되어 있다.

- [x] 반응형 레이아웃이 들어와 있다.
  - desktop preview resize, tablet drawer, mobile modal/list 변환, detail rail 세로 배치, resize handle 숨김 등이 CSS와 상태 동기화로 처리된다.

- [x] 테스트 코드가 존재한다.
  - service test는 parse, missing PDF error, summarize prerequisite, chat citation persistence, note CRUD, asset rerun을 다룬다.
  - route test는 GET sessions normalization, PDF binary delivery, summarize prerequisite, parse success를 다룬다.

## 부분 구현 체크리스트

- [ ] Summary/Chat의 AI 품질은 runtime availability에 따라 달라진다.
  - `createAgentRuntime`이 사용 가능하면 JSON task를 실행하지만, 실패하거나 unavailable이면 deterministic fallback으로 저장된다.
  - 따라서 “AI 요약/답변” UI는 실제 저장 기능은 있으나, 항상 LLM 기반이라고 보기는 어렵다.

- [ ] Chat retrieval은 semantic RAG가 아니라 lexical chunk scoring이다.
  - query token과 chunk term의 단순 점수로 top chunks를 고른다.
  - citation은 저장되지만 embedding 검색, reranker, section-aware reader agent 수준은 아니다.

- [ ] Assets는 “추출 후보 저장” 수준이다.
  - table은 `pdf-parse.getTable()` 또는 whitespace 기반 row inference로 만들 수 있다.
  - figure는 caption line, `getImage()`, 또는 synthetic SVG preview에 의존한다.
  - 실제 논문 figure crop, bounding box, 이미지 위치 동기화까지 완성된 상태는 아니다.

- [ ] Assets UI 썸네일은 실제 figure 이미지 표시가 아니라 preview 렌더에 가깝다.
  - frontend `renderReadingAssetThumb()`는 figure를 bar-chart 모양 placeholder로 그리고 table은 rows preview를 그린다.
  - backend가 `thumbPath`를 만들더라도 현재 UI는 해당 파일을 직접 이미지로 렌더링하지 않는다.

- [ ] PDF viewer는 실제 렌더링은 되지만 reader-grade interaction은 제한적이다.
  - page별 canvas 렌더링은 구현되어 있다.
  - text layer, PDF 검색, highlight overlay, note-to-page jump, citation-to-page jump는 확인되지 않는다.

- [ ] Notes seed는 parse 기반이지만 하이라이트 자체는 휴리스틱이다.
  - sections/chunks에서 claim/method/result/limit 후보를 골라 seed note를 만든다.
  - 사용자가 직접 작성/수정한 note CRUD는 실제 구현이다.

- [ ] Research stage와의 연결은 약하다.
  - Notes 패널의 `Send to Research`는 현재 `select-stage`로 Research 탭 이동만 한다.
  - Reading note/asset을 명시적으로 Research run input으로 넘기는 UI 액션은 Reading 화면 안에서 확인되지 않는다.
  - backend agent-runs 쪽은 readingSession을 context로 사용할 수 있으므로, 런타임 레벨 기반은 있으나 Reading UI handoff는 아직 제품화 전이다.

- [ ] `example.org` PDF는 demo/test convenience다.
  - `example.org` host일 때 backend가 로컬 demo PDF를 생성한다.
  - 실제 외부 PDF flow와 테스트/데모 flow가 의도적으로 공존한다.

- [ ] Context menu UX는 일부만 살아 있다.
  - Reading detail metabar의 `...` 버튼은 시각적으로 존재하지만 별도 `data-action` 기반 메뉴 동작은 확인되지 않는다.
  - Reading Home preview의 bookmark/more icon도 현재 분석 범위에서는 durable action으로 연결된 흔적이 없다.

- [ ] Home metric mini chart는 데이터 기반 차트라기보다 상태 숫자 + 장식 그래픽이다.
  - Saved/Ready/In progress/Completed count는 실제 items 기반이다.
  - 카드 내부 sparkline/bars/dots는 고정 SVG/DOM 장식이다.

## 목업/미구현 체크리스트

- [ ] Metadata-only 논문을 Reading v1에서 완전 처리하는 기능.
  - 현재 v1은 `pdfUrl`이 있는 논문만 완전 지원한다.
  - PDF가 없으면 session은 만들 수 있지만 parse/chat/summarize/assets의 본문 기반 기능은 막힌다.

- [ ] OCR 기반 scanned PDF 처리.
  - 명시적으로 v1 scope 밖이다.

- [ ] 실제 PDF 텍스트 선택 기반 highlight 생성.
  - canvas 렌더링은 있으나 사용자가 PDF 위에서 영역을 선택해 note/highlight로 저장하는 흐름은 구현되어 있지 않다.

- [ ] Citation chip 클릭으로 PDF page/section으로 이동.
  - citation page metadata는 표시되지만 viewer navigation과 연결된 동작은 확인되지 않는다.

- [ ] Figure/table 원본 미리보기 상세 뷰.
  - asset card는 표시되지만 실제 crop 이미지, table detail modal, 원본 위치 이동은 구현으로 확인되지 않는다.

- [ ] Reading detail `...` context menu.
  - 버튼은 있으나 메뉴 내용/동작은 현재 코드상 목업에 가깝다.

- [ ] Reading에서 Research로 명시적 asset/note handoff.
  - UI 버튼은 stage 이동만 수행한다.
  - “이 note를 Research 입력으로 보낸다” 수준의 API/상태 연결은 아직 없다.

- [ ] Reading Home preview의 bookmark/more actions.
  - 버튼은 화면 요소로 존재하지만 저장 상태 변경이나 메뉴 액션은 확인되지 않는다.

- [ ] PDF 주석/annotation layer.
  - note CRUD는 별도 workbench에 존재하지만 PDF 위 annotation layer는 없다.

- [ ] 고급 문서 navigation.
  - page thumbnails, outline click to PDF page, intra-PDF search, zoom controls는 구현으로 확인되지 않는다.

## 기능별 현재 상태 표

| 영역 | 현재 상태 | 판정 |
| --- | --- | --- |
| Reading 세션 목록 | 프로젝트별 API/저장소 연동 | 실구현 |
| 세션 생성 | paper/paperId 기반 생성, queue 갱신 | 실구현 |
| PDF 원본 | download/cache/serve | 실구현 |
| PDF 렌더링 | PDF.js canvas 렌더링 | 실구현 |
| Parse | pdf-parse 기반 text/table/image extraction | 실구현 |
| OCR | text layer 없는 PDF reject | 미구현 |
| Summary | parse 후 summaryCards 저장 | 실구현 |
| AI summary 품질 | runtime 실패 시 fallback | 부분 구현 |
| Chat | parsed chunks 기반 Q&A 저장 | 실구현 |
| Retrieval | lexical term scoring | 부분 구현 |
| Notes | create/update/delete 저장 | 실구현 |
| Highlight seed | chunks 기반 휴리스틱 | 부분 구현 |
| Assets | figure/table 후보 저장 | 부분 구현 |
| Asset thumbnails | synthetic preview 중심 | 부분 구현 |
| Research handoff | stage 이동 중심 | 목업/미구현 |
| Context menu | 일부 버튼만 존재 | 목업/미구현 |
| 반응형 | desktop/tablet/mobile CSS/상태 처리 | 실구현 |
| Tests | service/route 테스트 존재 | 실구현, 미실행 |

## 다음 구현 우선순위 제안

1. `Research handoff`를 실제 기능으로 만든다.
   - Reading note/asset/session을 선택해 Research run input으로 넘기는 명시적 액션이 필요하다.

2. `PDF interaction`을 reader-grade로 끌어올린다.
   - citation click to page, note click to page, text selection highlight, page search가 핵심이다.

3. `Assets`를 실제 원본 기반으로 개선한다.
   - `thumbPath` 렌더링, figure crop/bounding box, table detail view, source page jump가 필요하다.

4. `AI 품질 경계`를 UI에 드러낸다.
   - runtime-generated인지 fallback-generated인지 session에 표시하면 “진짜 AI 결과인지” 혼동을 줄일 수 있다.

5. `Reading context menu`를 실제 메뉴로 연결한다.
   - export notes, re-run parse, delete session, copy citation, open source 같은 기능 후보가 있다.
