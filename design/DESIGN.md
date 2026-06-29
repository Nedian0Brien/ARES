# ARES Papers — v1 Design Baseline

상태: **확정 (v1 design baseline)** · 기준 확정일 2026-06-29

이 문서는 ARES Papers 제품의 **단일 디자인 진실 소스(single source of truth)**다.
다른 모든 디자인·문서는 이 기준에 맞춰 정렬한다.

## 기준 파일 (canonical reference)

- **`design/ARES Papers Workspace.html`** — 확정된 기준 디자인 (React + Babel CDN, 단일 자립형 HTML)
- 작업본: `web/brainstorm/papers-final-4tab.html` (기준 파일과 동일 내용을 유지)
- 토큰 명세: `design/ARES Design System.html`

보기: 브라우저로 위 HTML을 직접 열거나, 로컬 정적 서버로 서빙해 확인한다.

## 셸 (Shell) — B안: VS Code 액티비티 레일

- **56px 좌측 제품 레일** = 4개 상위 탭(Reading / Lab / Wiki / Agent). 활성 탭은 자체 accent + 좌측 인디케이터, 하단 워크스페이스 아바타.
- **메타바(58px)** = 현재 위치 crumb · 타이틀/byline · 우측 액션. 다단 내비게이션의 토글/브레드크럼이 여기 위치.
- **플로팅 패널(288px)** = 섹션 내부 내비게이션(슬라이드인).
- **중앙 = 리사이즈 가능한 분할** = 좌/우 pane(수평·수직 방향 토글, 접기 가능).

이 셸 언어를 4탭 전부가 공유한다. 레이아웃은 ARES 디자인 시스템의 L-셸을 따르지 않고 **bespoke(넓은 메인)**로 작업했다 — 토큰/타이포/컴포넌트/하이라이트는 디자인 시스템을 준수, 레이아웃만 별도.

## 탭 → accent (기존 DS stage 토큰 재사용)

| 탭 | accent | token |
|---|---|---|
| Reading | `#5e6ad2` | read |
| Lab | `#8957c9` | research |
| Wiki | `#5e9c6f` | search |
| Agent | `#3aa3a3` | writing |

## 탭별 구조

### Reading — 라이브러리 ⇄ 리더
- **라이브러리(기본 랜딩)**: 정리 패널(서가 전체/읽는 중/안 읽음/완독/중요 표시 · 컬렉션 · 태그) + 툴바(검색·정렬·목록/격자) + 논문 목록(상태 링·메타·태그·메모수). `논문 추가` primary. 논문 클릭 → 리더.
- **리더**: 플로팅 패널(Overview/Library/Outline/Notes) + Document(PDF/Summary) ↔ Workbench(Chat/Notes/Assets) 리사이즈 분할 + Analyze. Chat은 ChatGPT급 대화 언어.
- 스크린샷: `screenshots/ref-reading-library.png`, `screenshots/ref-reading-reader.png`

### Lab — 프로젝트 → 보드 → 워크스페이스
실험 라이프사이클(**가설 수립 → 실험 설계 → 에이전트 기반 실험 수행 → 결과 보고**)을 다중 실험·다중 프로젝트로 관리.
- **프로젝트(랜딩)**: 프로젝트 카드(자산 칩 docs/실험/아티팩트 + 실험 상태 분포 바). 프로젝트는 상위 단위로 할당 자산과 독립 보드를 가진다.
- **보드(프로젝트별 칸반)**: 좌측 자산 패널(Docs/Artifacts/Data) + 에이전트 작업 상태별 칸반(설계 중·실행 중·분석 중·완료, 카드에 진행바·에이전트 작업 펄스·판정 pill).
- **워크스페이스(단일 실험)**: 스테퍼(가설/설계/실행/보고) + 에이전트 콘솔(중앙: 대화·실행 타임라인·리포트 아티팩트 카드) ↔ 리포트 아티팩트(우측: 차트·결과표·분석·생성 provenance).
- 스크린샷: `screenshots/ref-lab-projects.png`, `screenshots/ref-lab-board.png`, `screenshots/ref-lab-workspace.png`

### Wiki — 탐색기 ⇄ 뷰어
- **탐색기**: 폴더 구조를 반영한 Graph(Obsidian식 force-directed) / List(폴더 트리) / Grid(폴더 드릴다운 + masonry waterfall) 토글.
- **뷰어**: Notion급 문서(타이틀 → 속성 → 본문 callout/equation → 링크·백링크). 모바일은 페이지 전환 오버레이.
- 스크린샷: `screenshots/ref-wiki.png`

### Agent — 대화 ⇄ 근거 원장
- **대화(중앙)**: ChatGPT급 — 추론 트레이스 + 근거 붙은 답변 + 번호 인용(논문/위키/노트 교차) + 답변→Note/Idea/Lab 산출물.
- **근거 원장(우측)**: 인용과 양방향 하이라이트되는 Evidence 카드 + Artifacts 탭.
- 스크린샷: `screenshots/ref-agent.png`

## 원칙

- **가짜 완성도 배제**: 백엔드 미연결 액션은 상태/범위를 분명히 표시(예: 실행 중 진행바, 미실행 상태). Lab은 에이전트가 실제로 실험을 수행해 결과·리포트를 산출하는 흐름으로 설계.
- **production-grade craft**: 믿을 만한 콘텐츠(실제 같은 논문 PDF·진짜 SVG 차트), 1.75 stroke Lucide 아이콘, 의도적 elevation/hierarchy, 타이트한 타입 스케일. 1440 @2x 스크린샷으로 검증 후 확정.
- **일관된 다단 내비게이션**: Reading(라이브러리⇄리더) · Lab(프로젝트→보드→워크스페이스) · Wiki(탐색기⇄뷰어) · Agent(대화⇄근거) — 메타바 토글/브레드크럼으로 통일.

## 스크린샷 (1440 @2x)

`design/screenshots/ref-*.png` — 각 탭의 기준 상태.

## 구현

이 디자인을 실제 앱으로 구현하기 위한 마스터 체크리스트: [`docs/ares-v1-4tab-implementation-checklist.md`](../docs/ares-v1-4tab-implementation-checklist.md).
**전략(2026-06-29 확정): 이 목업(`ARES Papers Workspace.html`)을 실제 React 빌드(Vite)로 승격해 프론트엔드를 전면 재작성하고, 백엔드·데이터 모델·에이전트 런타임·reading 서비스는 보존·와이어링한다.** 옛 바닐라 JS 프론트는 폐기. 탭별 컷오버(Wiki·Agent 먼저, Reading 리더 마지막).
