# 모바일 논문 리딩 UX 감사 체크리스트

작성일: 2026-06-22  
대상: ARES Reading detail의 모바일 논문 리딩 경험  
기준: 현재 체크아웃 코드, `design/ARES Design System.html`, Reading 관련 문서, 모바일 Playwright 관찰 결과

## 요약

모바일 Reading detail은 기능 자체는 많이 연결되어 있다. PDF 렌더링, 본문 검색, 목차, 페이지 그리드, 줌, 선택 기반 메모, Chat/Notes workbench가 모두 실제 코드 경로를 갖고 있다.

문제는 모바일에서 이 기능들이 독서 흐름보다 앞에 나온다는 점이다. 좁은 화면에서 PDF가 화면 폭에 맞지 않고, 상단 chrome과 도크가 본문을 밀거나 덮는다. 그 결과 사용자는 논문을 읽기 전에 여러 UI 층을 지나야 하고, 읽는 중에도 패널과 도구 막대에 시야가 자주 끊긴다.

처음에는 PDF page surface가 783px 폭으로 렌더되어 화면 밖으로 잘렸다. 다만 후속 확인 결과, A4 한 페이지를 모바일 pane 안에 그대로 맞추는 기준도 독서에는 맞지 않았다. 모바일에서는 페이지 전체 미리보기보다 본문을 읽을 수 있는 기본 배율과 왼쪽 시작 위치가 더 중요하다.

추가 확인에서 `pane-body`를 작은 `dvh` 값으로 고정하면 PDF 아래쪽이 화면 중간에서 잘려 보이고, 반대로 높이 제한만 제거하면 Reader stage가 PDF 전체 높이까지 커져 dock가 화면 밖으로 밀리는 문제가 확인됐다. 모바일 Reader detail은 stage를 viewport 높이로 고정하고, PDF pane 내부만 스크롤해야 한다. 도크는 pane 아래 flex 영역으로 두지 않고 PDF pane 위에 떠 있어야 중간 클리핑 경계가 보이지 않는다.

## 조사 기준

- 디자인 기준: `design/ARES Design System.html`
- Reading 렌더링: `web/app/features/reading.js`
- PDF 렌더링: `web/app/lib/pdf-viewer.js`
- 모바일/Reading CSS: `web/styles/reading.css`, `web/styles/base.css`
- 모바일 smoke: `tests/e2e/workspace-smoke.spec.mjs`
- 임시 검증 서버: `ARES_ENABLE_DEMO_PDF=true ARES_DATA_ROOT_DIR=/tmp/ares-mobile-reading-audit PORT=4917 npm start`
- 관찰 뷰포트: 390x844, 375x667, 320x568

## 주요 관찰값

| 항목 | 390x844 | 375x667 | 320x568 |
| --- | ---: | ---: | ---: |
| PDF pane body width | 366px | 351px | 296px |
| PDF page surface width | 783px | 783px | 783px |
| PDF dock client width | 356px | 341px | 286px |
| PDF dock scroll width | 495px | 495px | 495px |
| 첫 화면에서 보이는 PDF page 높이 비율 | 약 51% | 약 34% | 약 22% |
| Reader 본문 시작 전 상단 UI 높이 | 약 254px | 약 254px | 약 276px |

## P0 체크리스트

- [x] PDF page surface를 모바일에서 읽을 수 있는 기본 배율로 시작한다.

  - 문제: 320-390px 화면에서 PDF가 너무 크게 잘리거나, 반대로 A4 전체가 pane 폭에 맞춰져 본문 글자가 지나치게 작아진다.
  - UX 영향: 사용자가 논문 본문을 바로 읽지 못한다. 전체 페이지 미리보기처럼 보이거나, 확대된 상태에서 왼쪽이 잘려 시작 위치를 다시 잡아야 한다.
  - 원인 후보: `web/app/lib/pdf-viewer.js`의 `PDF_BASE_SCALE = 1.28`이 최소 scale로 강제된다. `resolvePdfViewport()`가 `fitScale`보다 큰 기본 scale을 우선한다.
  - 해결 방안: desktop 확대 품질은 유지하되, 모바일에서는 `fitScale`에 읽기 배율을 곱해 시작한다. 확대된 PDF는 왼쪽부터 시작하게 정렬한다.
  - 검증 기준: 320px, 375px, 390px에서 `.reading-pdf-page-surface`가 `.reading-doc-pane .pane-body`보다 충분히 넓고, 왼쪽 가장자리는 pane 안에서 시작한다.

- [x] 모바일 Reader 첫 화면에서 PDF 본문을 우선 노출한다.

  - 문제: Reader 진입 후 topbar, workflow mode nav, metabar, Reading rail이 연속으로 쌓인다.
  - UX 영향: 320px 화면에서는 PDF pane이 y=276px 아래에서 시작한다. 독서 화면이라기보다 설정과 탐색 UI를 먼저 통과하는 화면처럼 느껴진다.
  - 원인 후보: 모바일에서도 desktop workbench 구조를 거의 그대로 세로 배치한다. `reading-shell-main`, `reading-icon-rail`, `reading-split`만 방향을 바꾸고 Reader 전용 집중 모드는 없다.
  - 해결 방안: Reading detail의 PDF 탭에서는 workflow mode nav 또는 rail을 접고, metabar는 한 줄 compact header로 줄인다. 논문 제목은 ellipsis로 유지하되 분석 버튼과 context menu는 overflow 메뉴로 묶는다.
  - 검증 기준: 320px 첫 화면에서 PDF pane의 상단이 viewport 높이의 35% 이내에 나타난다. 가능하면 첫 화면 절반 이상을 PDF 본문이 차지한다.

- [x] PDF 도크가 본문을 가리지 않게 재배치한다.

  - 문제: PDF 도크가 fixed layer로 올라와 본문 중앙을 덮는다.
  - UX 영향: 사용자가 읽는 줄 위에 도구 막대가 떠 있고, 작은 화면에서는 도크가 본문보다 더 눈에 띈다.
  - 원인 후보: 모바일 CSS에서 `.reading-pdf-dock-layer`가 `position: fixed`와 `bottom: calc(var(--mobile-bottom-nav-height) + 4px)`를 사용한다.
  - 해결 방안: 기본 상태는 작은 floating 버튼 또는 접힌 toolbar로 두고, 조작할 때만 bottom sheet를 연다. 읽기 중에는 자동 숨김 또는 semi-collapsed 상태를 둔다.
  - 검증 기준: PDF 도크가 닫힌 상태에서 본문을 덮지 않는다. 열린 상태에서도 선택한 패널의 높이와 위치가 bottom nav 위로 안전하게 clamp된다.

- [x] Reader detail의 세로 스크롤 경계를 viewport 안에 고정한다.

  - 문제: 모바일에서 `pane-body`를 `52dvh`로 제한하면 PDF 아래쪽이 중간에서 잘리고, 제한을 완전히 풀면 dock가 PDF 전체 문서 아래로 밀린다.
  - UX 영향: 사용자는 화면 아래가 잘린 것처럼 느끼거나, 도구 막대를 찾을 수 없다. iOS Safari에서는 내부 스크롤과 문서 스크롤이 섞여 더 불안정하게 보인다.
  - 원인 후보: 모바일 공통 CSS가 `.reading-stage`의 `min-height`를 `auto`로 풀고, Reader detail 전용 height boundary가 없었다.
  - 해결 방안: Reader detail에서 stage와 split은 viewport 높이로 고정한다. `.pane-body`는 viewport 아래까지 이어지는 내부 스크롤 영역으로 두고, dock layer는 그 위에 absolute overlay로 띄운다.
  - 검증 기준: `pane-body`의 bottom은 viewport bottom과 맞고, dock layer는 viewport 안쪽에서 끝난다. PDF가 도크 위에서 별도 경계로 잘려 보이면 실패다.

- [x] PDF 도크의 가로 스크롤을 없앤다.

  - 문제: 도크의 scrollWidth는 495px인데 320px 화면의 clientWidth는 286px이다.
  - UX 영향: 핵심 도구가 화면 밖으로 밀린다. 사용자는 도구 막대 안에서 또 가로 스크롤해야 한다.
  - 원인 후보: 목차, 축소, 줌 값, 확대, 맞춤, 검색, 페이지 그리드, 선택 액션을 한 줄 toolbar에 모두 넣는다.
  - 해결 방안: 모바일 toolbar를 1차/2차 액션으로 나눈다. 1차는 `검색`, `페이지`, `맞춤`, `더보기`만 남기고 줌 +/-와 선택 액션은 sheet 내부나 selection 전용 bar로 이동한다.
  - 검증 기준: 320px에서 `.pdf-dock.scrollWidth <= .pdf-dock.clientWidth + 1`을 만족한다.

- [x] 모바일 터치 타깃을 44px 이상으로 맞춘다.

  - 문제: 여러 조작 요소가 모바일 권장 크기보다 작다.
  - UX 영향: Reader에서 자주 쓰는 버튼일수록 오탭 가능성이 높다. 특히 줌, orientation, context, selection dismiss는 손가락으로 누르기 어렵다.
  - 원인 후보: desktop 밀도 기준의 버튼 크기가 모바일에서도 유지된다.
  - 해결 방안: 모바일 media query에서 `reading-rail-btn`, `reading-orient-btn`, `pane-icon-btn`, `.dock-btn`, `.sel-chip-dismiss`, 검색 input의 min-height를 44px로 맞춘다. 시각 크기와 hit area를 분리해도 된다.
  - 검증 기준: 모바일에서 보이는 `button`, `input`, `[role="button"]`의 bounding box가 44x44 이상이다. 예외가 필요하면 부모 hit area로 보완한다.

## P1 체크리스트

- [x] Chat/Notes workbench를 모바일 기본 화면에서 분리한다.

  - 문제: 모바일에서도 문서 pane과 workbench pane이 세로로 함께 렌더된다.
  - UX 영향: PDF 아래에 Notes/Chat이 긴 패널로 붙어 있어 화면 전체가 독서 도구가 아니라 복합 대시보드처럼 보인다.
  - 원인 후보: `reading-split`은 모바일에서 column이 되지만, workbench 자체는 계속 본문 흐름에 남는다.
  - 해결 방안: 모바일에서는 workbench를 기본 collapsed로 두고, `Chat`, `Notes`를 bottom sheet 또는 side drawer로 연다. 선택 텍스트가 있을 때만 관련 액션을 짧게 띄운다.
  - 검증 기준: Reader PDF 진입 직후 viewport에는 PDF pane만 보이고, Notes/Chat은 명시적 버튼을 눌렀을 때 열린다.

- [x] 목차, 검색, 페이지 그리드를 모바일 sheet 패턴으로 통일한다.

  - 문제: 현재 popup panel은 PDF pane 기준 absolute와 모바일 fixed dock이 섞여 있다.
  - UX 영향: 320px에서 검색 패널 bottom이 viewport를 넘는다. 도크와 패널이 서로 겹쳐 보인다.
  - 원인 후보: `.reading-doc-pane > .popup-panel`의 `bottom: 76px`, `max-height: min(420px, calc(100% - 112px))`가 fixed 도크 및 bottom nav와 별도로 계산된다.
  - 해결 방안: 모바일에서는 popup을 모두 sheet 컴포넌트로 바꾸고, `max-height: calc(100dvh - top chrome - bottom nav - margin)`처럼 viewport 기준으로 잡는다.
  - 검증 기준: 320px에서 `.popup-panel.visible`의 bottom이 viewport height를 넘지 않고, 닫기/결과 선택/입력 필드가 모두 보인다.

- [x] Reader header의 정보 밀도를 줄인다.

  - 문제: 320px에서 metabar 높이가 112px까지 늘어난다.
  - UX 영향: 논문 제목, 작성자, venue, parse 상태, 분석 버튼이 한 화면 위쪽을 많이 차지한다.
  - 원인 후보: 제목/메타/상태/분석 CTA가 같은 header 안에 남아 있고, 버튼도 큰 폭을 요구한다.
  - 해결 방안: 모바일에서는 제목 한 줄, 보조 메타 한 줄만 남긴다. 분석 상태와 source/citation/export는 overflow menu로 보낸다.
  - 검증 기준: 모바일 metabar 높이가 56px 안팎으로 유지된다. 긴 제목도 header 높이를 2줄 이상 밀지 않는다.

- [x] PDF 검색 입력과 결과 목록을 모바일 읽기 흐름에 맞춘다.

  - 문제: 검색 input 높이가 32px이고 결과 패널이 본문과 도크 사이에 겹친다.
  - UX 영향: 검색을 켜면 읽기 화면이 좁아지고, 입력 필드도 터치하기 작다.
  - 원인 후보: desktop popup 안의 compact input을 그대로 사용한다.
  - 해결 방안: 검색은 full-width sheet로 열고 input을 44px 이상으로 키운다. 결과를 누르면 sheet를 접고 해당 page로 이동한다.
  - 검증 기준: 320px에서 검색 input 높이 44px 이상, 결과 row 높이 44px 이상, 결과 클릭 후 PDF target page가 보인다.

- [x] 모바일 orientation toggle을 숨기거나 의미를 바꾼다.

  - 문제: Side by side/Stacked 버튼이 모바일에도 보이지만, 모바일 layout은 사실상 stacked만 자연스럽다.
  - UX 영향: 사용자가 누를 수 있는 선택지처럼 보이지만 화면 개선 효과가 작다.
  - 원인 후보: desktop split orientation control이 pane header에 그대로 남아 있다.
  - 해결 방안: 모바일에서는 orientation toggle을 숨긴다. 대신 `PDF`, `Chat`, `Notes` 모드 전환을 더 잘 보이게 둔다.
  - 검증 기준: 900px 이하에서 orientation toggle이 보이지 않거나, 실제 모바일 layout에 맞는 모드 전환으로 대체된다.

## P2 체크리스트

- [x] PDF 선택 액션을 선택 후에만 충분히 크게 보여준다.

  - 문제: 선택 해제 버튼은 약 20px이고 선택 액션이 도크 안에 섞인다.
  - UX 영향: 텍스트 선택 후 메모를 만들려는 순간 어떤 버튼을 눌러야 하는지 분명하지 않다.
  - 원인 후보: selection chip과 toolbar가 같은 dock layer에 있다.
  - 해결 방안: 선택이 생기면 `메모`, `하이라이트`, `질문에 첨부`, `닫기`만 담은 selection action sheet를 띄운다.
  - 검증 기준: 선택 후 320px에서 액션 버튼 4개 이하, 각 44px 이상, 선택 해제 가능.

- [x] page thumbnail grid를 모바일에 맞게 재구성한다.

  - 문제: page grid는 4열 고정이다.
  - UX 영향: 320px에서 thumb가 작고, 결과적으로 페이지 이동 UI가 촘촘해진다.
  - 원인 후보: `.page-grid { grid-template-columns: repeat(4, 1fr); }`가 모바일에도 유지된다.
  - 해결 방안: 320-390px에서는 3열 또는 큰 row list로 바꾼다. 현재 page와 근처 page를 우선 노출한다.
  - 검증 기준: 각 page item의 hit area가 44px 이상이고, 현재 page가 명확히 표시된다.

- [x] Reading Library rail을 Reader 안에서 보조 탐색으로 낮춘다.

  - 문제: Overview, Library, Outline, Notes rail이 PDF 위에 한 줄로 남는다.
  - UX 영향: PDF 탭 자체의 header와 기능이 겹쳐 보인다. 특히 Outline/Notes는 PDF dock의 목차/선택 메모와 역할이 겹친다.
  - 원인 후보: desktop의 좌측 rail을 모바일에서 상단 horizontal rail로 바꿨지만 정보 구조를 줄이지 않았다.
  - 해결 방안: PDF Reader에서는 rail을 숨기고, 논문 목록으로 돌아가기와 목차/노트 진입만 남긴다.
  - 검증 기준: PDF Reader 첫 화면에서 상단 rail이 보이지 않거나 44px 이하의 단일 compact row로 축소된다.

## 테스트 보강 체크리스트

- [x] 모바일 e2e에 PDF 읽기 배율과 좌측 클립 방지 assertion을 추가한다.
  - 예: `pageSurface.width >= paneBody.width * 1.25`, `pageSurface.x >= paneBody.x - 1`

- [x] 모바일 e2e에 Reader detail 세로 클리핑 assertion을 추가한다.
  - 예: pane body가 viewport bottom까지 이어지고, dock layer가 pane body 안쪽에 떠 있다.

- [x] 모바일 e2e에 도크 가로 스크롤 방지 assertion을 추가한다.
  - 예: `.pdf-dock.scrollWidth <= .pdf-dock.clientWidth + 1`

- [x] 모바일 e2e에 popup viewport clamp assertion을 추가한다.
  - 예: `.pdf-search-panel.visible.boundingBox().y >= 0` 및 `bottom <= viewport.height`

- [x] 모바일 e2e에 touch target audit helper를 추가한다.
  - 대상: visible `button`, `input`, `textarea`, `[role="button"]`
  - 기준: 44x44 이상 또는 명시적 예외 목록

- [x] 모바일 e2e를 390px 하나로 끝내지 않는다.
  - 최소 기준: 390x844, 375x667, 320x568
  - 320px는 작은 안드로이드/SE급 폭에서 레이아웃 파손을 잡는 하한선으로 둔다.

## 권장 실행 순서

1. PDF fit scale 수정
   - 가장 먼저 읽을 수 있는 상태를 만든다.
   - 예상 수정 위치: `web/app/lib/pdf-viewer.js`
   - 검증: 320/375/390px PDF page width 측정

2. 모바일 Reader chrome 축소
   - topbar/workflow/metabar/rail의 누적 높이를 줄인다.
   - 예상 수정 위치: `web/styles/reading.css`, `web/app/features/reading.js`
   - 검증: 첫 화면 PDF 점유율 측정

3. PDF 도크 모바일 재설계
   - 한 줄 overflow toolbar를 접힌 toolbar + sheet 구조로 바꾼다.
   - 예상 수정 위치: `web/app/features/reading.js`, `web/styles/reading.css`
   - 검증: 도크 가로 스크롤 없음, popup viewport clamp

4. Workbench 모바일 분리
   - Chat/Notes를 기본 본문 흐름에서 빼고 sheet/drawer로 연다.
   - 예상 수정 위치: `web/app/features/reading.js`, `web/styles/reading.css`, `web/app.js`
   - 검증: Reader 진입 직후 PDF만 주 화면에 보임

5. 모바일 Playwright 품질 테스트 추가
   - 현재 smoke가 놓치는 폭, 패널, 터치 타깃을 고정한다.
   - 예상 수정 위치: `tests/e2e/workspace-smoke.spec.mjs`
   - 검증: `npm run test:e2e`

## 완료 기준

- 320px 화면에서 PDF 본문이 읽을 수 있는 배율로 시작하고, 왼쪽이 잘리지 않는다.
- Reader 진입 첫 화면에서 PDF가 주 시각 요소로 보인다.
- Reader detail은 viewport 안에서 닫히고, PDF pane 내부만 스크롤된다.
- PDF 도크는 가로 스크롤 없이 핵심 액션을 제공하며, 본문과 하단 nav를 덮지 않는다.
- 검색/목차/페이지 패널이 viewport와 bottom nav를 침범하지 않는다.
- 주요 모바일 조작 요소는 44x44 이상이다.
- 320x568, 375x667, 390x844 Playwright 검증이 통과한다.
