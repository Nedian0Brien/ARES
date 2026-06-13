# ARES

**Agentic Research Experimentation System**

연구 아이디어를 논문 탐색에서 끝내지 않고, 재현, 실험, 인사이트, 문서화까지 이어지게 만드는 에이전트 기반 연구 실행 워크스페이스

![ARES prototype preview](design/screenshots/current.png)

## Overview

ARES는 AI/ML 연구자가 다음 흐름을 하나의 연속된 작업 공간에서 수행할 수 있도록 설계된 제품이다.

`Search -> Reading -> Research -> Result -> Insight -> Writing`

기존 도구들이 논문 탐색, 북마크, 요약에 머무르는 경우가 많다면, ARES는 그 다음 단계인 재현 준비, 실험 비교, 인사이트 축적, 후속 연구 가설 정리까지 연결하는 데 초점을 둔다.

핵심 목표는 다음과 같다.

- 논문을 "읽는 대상"에서 "실험 가능한 지식"으로 전환
- 재현 실패와 성능 편차를 후속 연구의 단서로 자산화
- 반복적인 연구 워크플로우를 에이전트 협업 구조로 정리

## Product Direction

ARES는 현재 4개 상위 surface와 기존 6단계 하위 모드를 함께 유지한다.

상위 surface:

- `Read`: Search + Reading
- `Lab`: Research + Result
- `Insight`: Evidence Board
- `Write`: Draft Studio

기존 6단계 `Search -> Reading -> Research -> Result -> Insight -> Writing`은 route alias와 하위 모드로 보존된다.

### 1. Read

논문을 탐색하고 라이브러리에 저장한 뒤, PDF/노트/하이라이트를 `ReadingPacket`과 `EvidenceLink`로 구조화한다.

### 2. Lab

Reader에서 넘어온 근거를 `ReproductionPlan`, `ExperimentRun`, `ResultDossier`로 연결한다.

### 3. Insight

`EvidenceLink`와 result delta를 바탕으로 `InsightCard`를 만든다.

### 4. Write

`InsightCard`를 `Draft`와 `DraftSection`으로 조립하고 source evidence를 추적한다.

## Agent Model

ARES는 역할 기반 에이전트 구조를 전제로 설계되어 있다.

- `Scout Agent`: 논문 탐색과 큐 구성
- `Reader Agent`: 구조화 리딩과 재현 정보 추출
- `Reproduction Agent`: 코드/환경/체크리스트 분석
- `Experiment Agent`: 실험안 생성과 실험 큐 관리
- `Analyst Agent`: 결과 차이 해석과 인사이트 도출
- `Proposal / Writing Assistant`: 후속 가설과 문서 초안 생성

## Current Status

2026년 5월 29일 기준으로, ARES는 **asset graph 기반의 실행 가능한 연구 워크스페이스 골격**을 갖춘 상태다.

현재 포함된 내용:

- 인터랙션이 반영된 HTML 프로토타입
- 와이어프레임
- 제품 비전 문서
- asset graph 기준 목표 구조와 구현 체크리스트
- 로컬 Node backend 서비스
- 프로젝트별 논문 검색 / 필터링 / 스크랩 저장 / reading queue API
- `Paper`, `ResearchQuestion`, `ReadingPacket`, `EvidenceLink`, `ReproductionPlan`, `ExperimentRun`, `ResultDossier`, `InsightCard`, `Draft`, `DraftSection` 저장 API
- Reader -> Lab -> Insight -> Write로 이어지는 최소 저장 흐름
- 파일 기반 fallback과 PostgreSQL backend를 모두 지원하는 런타임 저장소
- 실제 API 사용이 불가능할 때도 화면이 유지되도록 하는 seed fallback 데이터

아직 포함되지 않은 내용:

- 사용자 인증
- 별도 worker 프로세스 기반 agent run lease/복구
- 실제 재현 실험 실행 파이프라인

즉, 현재 단계의 목적은 **프로토타입을 asset graph 중심 제품으로 재구성하고, 각 surface가 저장 가능한 연구 자산을 만들도록 연결하는 것**이다.

## Repository Structure

```text
ARES/
├── data/
│   ├── store.seed.json
│   └── runtime/
├── design/
│   ├── ARES Prototype.html
│   ├── ARES Wireframes.html
│   └── screenshots/
├── docs/
│   ├── product vision.md
│   ├── specification.md
│   ├── ares-rebuild-target-architecture.md
│   ├── ares-rebuild-implementation-checklist.md
│   └── backend-runtime-overview.md
├── services/
│   └── backend/
│       ├── index.mjs
│       ├── lib/
│       └── tests/
├── web/
│   ├── app/
│   │   ├── features/
│   │   └── lib/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── package.json
└── README.md
```

## Key Documents

- [Prototype](design/ARES%20Prototype.html)
  - 현재 UI/UX의 가장 구체적인 기준안
- [Wireframes](design/ARES%20Wireframes.html)
  - 초기 구조와 화면 흐름 참고용
- [Specification](docs/specification.md)
  - 프로토타입 기준으로 정렬된 기능 명세 문서
- [Product Vision](docs/product%20vision.md)
  - 제품의 문제 정의, 비전, 사용자 가치
- [iOS Safari Viewport Handling](docs/ios-safari-viewport.md)
  - iOS Safari 하단 브라우저 UI와 fixed bottom UI 클리핑 방지 규칙

## Run The Search MVP

ARES 서비스는 Node 환경에서 실행되며, 의존성 설치 후 바로 실행할 수 있다.

1. `npm install --package-lock=false`
2. `.env.example`을 참고해 필요하면 `.env`를 만든다.
3. `npm start` 또는 개발 중에는 `npm run dev`를 실행한다.
4. 브라우저에서 `http://127.0.0.1:3100`을 연다.

저장소 백엔드:

- 기본값은 파일 기반 store이며 `data/runtime/store.json`에 영속화된다.
- `ARES_DATABASE_URL` 또는 `DATABASE_URL`이 설정되면 store backend는 자동으로 PostgreSQL로 전환된다.
- 강제로 지정하려면 `ARES_STORE_BACKEND=file` 또는 `ARES_STORE_BACKEND=postgres`를 사용한다.
- PostgreSQL backend는 첫 기동 시 DB가 비어 있으면 `data/runtime/store.json`을 우선 가져오고, 없으면 `data/store.seed.json`으로 초기 데이터를 채운다.
- TLS가 필요한 환경이면 `ARES_DATABASE_SSL=1`을 사용한다. 더 엄격한 검증이 필요하면 `ARES_DATABASE_SSL=strict`를 사용할 수 있다.

개발 모드 자동 리로드:

- `npm run dev`는 `node --watch`로 백엔드 코드를 감시하므로 `services/backend/` 변경 시 프로세스가 자동 재시작된다.
- 같은 모드에서 `web/` 아래 HTML/CSS/JS가 바뀌면 브라우저가 자동 새로고침된다.
- 이는 현재 구조에 맞춘 live reload이며, 상태를 유지한 채 일부 모듈만 바꾸는 Vite-style HMR은 아니다.

기본 동작:

- 좌측에서 프로젝트를 바꾸면 프로젝트별 기본 검색 맥락이 바뀐다.
- 중앙에서 논문을 검색하고 정렬/필터링할 수 있다.
- 우측 preview에서 `Save to library`, `Read next` 액션을 수행할 수 있다.

React Grab 로컬 개발 지원:

- `http://127.0.0.1:3100`, `http://localhost:3100`, 또는 code-server/preview의 `https://code.lawdigest.kr/proxy/<port>/` 경로에서 실행하면 `react-grab`이 개발용으로 자동 로드된다.
- 기본적으로 저장소에 vendoring된 `react-grab` 번들을 먼저 로드하고, 로컬 파일을 찾지 못할 때만 CDN fallback을 시도한다.
- 상단 topbar에 `Grab enabled` 힌트가 보이면 준비된 상태다.
- 화면 요소에 포인터를 올리고 `Cmd/Ctrl + C`를 누르면 기본 grab 컨텍스트 앞에 현재 ARES `stage / project / surface` 정보가 함께 복사된다.
- 모바일 폭(≤ 900px)에서는 하단 workflow nav를 가리지 않도록 기본 비활성화된다. 필요하면 URL에 `?grab=1`을 붙여 강제로 켤 수 있고, 데스크톱에서는 `?grab=0`으로 끌 수 있다.

포트 메모:

- 이 개발 환경에서는 code-server의 Embedded Live Preview가 `3000`/`3005`를 점유할 수 있어서, ARES 기본 포트는 `3100`으로 맞춘다.
- 브라우저 프록시 주소를 사용할 때는 `https://<host>/proxy/3100/` 형태로 접속하면 된다.

OpenAlex 연동:

- OpenAlex는 2026년 2월 13일부터 실제 사용량 기준 API key가 필요하다.
- `.env`에 `OPENALEX_API_KEY`를 넣으면 live 검색을 시도한다.
- 키가 없거나 네트워크가 막힌 환경에서는 seed fallback 결과가 표시된다.

Reader retrieval scorer:

- 운영 기본 계약은 `ARES_RETRIEVAL_SCORER_PROVIDER=local-cross-encoder`와 HTTP scorer endpoint다.
- `.env`에 `ARES_RETRIEVAL_SCORER_URL`, 필요 시 `ARES_RETRIEVAL_SCORER_API_KEY`, `ARES_RETRIEVAL_SCORER_TIMEOUT_MS=2500`을 설정한다.
- endpoint는 `{ chunks, query, queryTerms, selection, session }` JSON을 받아 `scores` 또는 `results` 배열을 반환해야 한다.
- 배포 전 `npm run smoke:retrieval-scorer`로 expected top chunk와 score threshold를 확인한다.
- 해당 smoke script는 `scripts/validate-retrieval-scorer.mjs --min-top-score 0.8`을 실행한다.
- 배포 smoke는 `npm run smoke:deploy`에서 retrieval scorer health validation을 포함한다.
- scorer가 없거나 실패하면 Reader chat은 lexical/semantic fallback과 low-confidence telemetry를 사용한다.

Reader OCR:

- text layer가 없는 PDF는 `tesseract.js` 기반 내장 OCR을 시도한다.
- 기본 OCR 범위는 `ARES_OCR_MAX_PAGES=12`이며, 더 큰 scanned PDF는 운영 성능을 보고 조정한다.
- 내장 OCR 결과가 부족하면 Reader 화면에서 External OCR 텍스트를 import할 수 있다.

검증:

- `npm test`
- `node --check services/backend/index.mjs`
- `node --check web/app.js`

## Dev Deploy

개발 서버를 공유 환경에 안정적으로 올릴 때는 수동 `npm run dev` 대신 배포 스크립트를 사용하는 편이 안전하다.

```bash
bash deploy/deploy-dev-web.sh main
```

스크립트가 수행하는 일:

- 지정한 ref로 `.worktrees/dev-web-live` worktree를 준비
- `npm install --package-lock=false`
- `node --check services/backend/index.mjs`
- `node --check web/app.js`
- `npm test`
- `.runtime/dev-web/current` 심링크 전환
- PM2 프로세스 `ares-web-dev`를 `HOST=0.0.0.0`, `PORT=3100`으로 재기동
- `/api/health`, `/proxy/3100/`, 주요 정적 자산까지 스모크 테스트
- 실패 시 이전 runtime 심링크로 자동 롤백

자주 쓰는 환경 변수:

- `WEB_PORT`: 기본 `3100`
- `APP_HOST`: 기본 `0.0.0.0`
- `PM2_NAME`: 기본 `ares-web-dev`
- `ARES_LIVE_RELOAD`: 기본 `0`
- `SKIP_GIT_FETCH=1`: 원격 fetch 생략
- `SKIP_VALIDATION=1`: 테스트 및 `node --check` 생략

배포 후 상태만 다시 확인하고 싶다면:

```bash
bash deploy/smoke-dev-web.sh
```

프로토타입 자체만 빠르게 보고 싶다면 기존처럼 `design/ARES Prototype.html`을 브라우저에서 직접 열어도 된다.

## Design Principles

ARES는 다음 원칙을 중심으로 설계한다.

- 연구 흐름이 끊기지 않아야 한다.
- 각 단계는 다음 행동으로 자연스럽게 이어져야 한다.
- 실패와 편차는 버릴 데이터가 아니라 연구 자산이어야 한다.
- 에이전트는 숨겨진 자동화가 아니라 사용자와 협업하는 주체로 보여야 한다.
- UI는 논문 관리 도구가 아니라 연구 실행 워크스페이스처럼 느껴져야 한다.

## Next Step

현재 우선순위는 다음과 같다.

1. Search 탭의 OpenAlex live 검색 품질과 저장 모델을 안정화한다.
2. Reading 탭에서 스크랩된 논문을 실제 읽기 객체로 연결한다.
3. 프로젝트/논문 단위 영속 저장소를 JSON 파일에서 DB로 옮긴다.
4. 에이전트 요약/추천 파이프라인을 Search와 Reading 사이에 연결한다.
5. 이후 Research 단계의 재현 체크리스트 데이터 모델을 붙인다.

## Notes

- 프로토타입과 문서가 충돌할 경우, 당분간은 프로토타입 구현을 우선 기준으로 본다.
- 기존 비전 문서와 현재 기능 명세 문서는 분리해 유지한다.
- 이 저장소는 "아이디어 메모"가 아니라 실제 제품 설계 자산을 축적하는 공간으로 운영한다.
