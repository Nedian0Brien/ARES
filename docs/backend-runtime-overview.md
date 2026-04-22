# ARES Backend Runtime Overview

기준 시점: 2026-04-22

## Summary

현재 ARES 백엔드는 [services/backend](/home/ubuntu/project/ARES/services/backend)에 모여 있으며, 단일 Node 프로세스 기반의 HTTP 서비스로 동작한다. 백엔드의 핵심 역할은 아래 4가지다.

- Search, Library, Reading, AgentRun 관련 HTTP API 제공
- `codex exec --json` 기반 공통 에이전트 런타임 실행
- 연구 자산 중심 store 관리
- 개발 배포와 PM2 실행 경로 제공

이 구조는 예전 `server/` 폴더 기반 구성을 `services/backend/`로 재배치한 상태이며, 프론트엔드 [web](/home/ubuntu/project/ARES/web)와 같은 저장소 안에서 함께 운영된다.

## Directory Layout

현재 백엔드 관련 핵심 경로는 아래와 같다.

- 엔트리포인트: [services/backend/index.mjs](/home/ubuntu/project/ARES/services/backend/index.mjs:1)
- 런타임 오케스트레이션: [services/backend/lib/agent-runs.mjs](/home/ubuntu/project/ARES/services/backend/lib/agent-runs.mjs:1)
- Codex CLI 어댑터: [services/backend/lib/agent-runtime.mjs](/home/ubuntu/project/ARES/services/backend/lib/agent-runtime.mjs:1)
- store 선택 레이어: [services/backend/lib/store.mjs](/home/ubuntu/project/ARES/services/backend/lib/store.mjs:1)
- 파일 기반 store: [services/backend/lib/file-store.mjs](/home/ubuntu/project/ARES/services/backend/lib/file-store.mjs:1)
- PostgreSQL store: [services/backend/lib/postgres-store.mjs](/home/ubuntu/project/ARES/services/backend/lib/postgres-store.mjs:1)
- Scout 검색 서비스: [services/backend/lib/scout-search.mjs](/home/ubuntu/project/ARES/services/backend/lib/scout-search.mjs:1)
- OpenAlex helper CLI: [services/backend/bin/openalex-helper.mjs](/home/ubuntu/project/ARES/services/backend/bin/openalex-helper.mjs:1)
- 테스트: [services/backend/tests](/home/ubuntu/project/ARES/services/backend/tests)

## Runtime Model

### 1. HTTP Server

[services/backend/index.mjs](/home/ubuntu/project/ARES/services/backend/index.mjs:1)는 Node 내장 `http` 모듈 기반 서버다. Express 같은 프레임워크를 쓰지 않고, request path를 직접 분기해 API와 정적 파일 서빙을 처리한다.

주요 책임:

- `.env` 로드
- store 초기화
- agent runtime service 초기화
- Scout search service 초기화
- `/api/*` 라우팅
- `web/` 정적 파일 서빙
- 개발용 live reload SSE 제공

### 2. Agent Runtime

공통 에이전트 실행은 [services/backend/lib/agent-runtime.mjs](/home/ubuntu/project/ARES/services/backend/lib/agent-runtime.mjs:1)가 맡는다.

현재 설계:

- 실제 실행: `codex exec --json --ephemeral --skip-git-repo-check`
- 파싱 대상 이벤트:
  - `thread.started`
  - `item.completed.agent_message`
  - `item.completed.command_execution`
- 결과 해석:
  - 최종 agent message에서 JSON 추출
  - 실패 또는 timeout 시 stage별 fallback 사용

이 레이어는 "CLI 실행/JSONL 파싱"만 담당하고, stage 의미는 상위 `agent-runs` 서비스가 가진다.

### 3. AgentRun Orchestration

[services/backend/lib/agent-runs.mjs](/home/ubuntu/project/ARES/services/backend/lib/agent-runs.mjs:858)는 공통 `AgentRun` 오케스트레이터다.

현재 capability profile:

- `scout`
- `reader`
- `research`
- `analyst`
- `writing`

현재 stage/task contract:

- `reading -> create-reading-session`
- `research -> create-repro-plan`
- `result -> create-result-comparison`
- `insight -> create-insight-note`
- `writing -> create-writing-draft`

현재 동작 방식:

- run 생성 시 store에 `queue` 상태 저장
- 백그라운드 실행 시작
- 실행 중 `running`
- 성공 또는 fallback 완료 후 `done`
- 실행 중 subprocess abort 핸들은 프로세스 메모리 `Map`에만 존재

즉, `AgentRun` 메타는 영속화되지만 실제 실행 핸들은 아직 단일 프로세스 메모리에 묶여 있다.

## Storage Model

### 1. Store Selection

[services/backend/lib/store.mjs](/home/ubuntu/project/ARES/services/backend/lib/store.mjs:1)는 store backend를 선택하는 팩토리다.

선택 규칙:

- `ARES_STORE_BACKEND=postgres|postgresql|pg` 이면 PostgreSQL
- `ARES_STORE_BACKEND=file|json` 이면 파일 store
- 강제 지정이 없고 `ARES_DATABASE_URL` 또는 `DATABASE_URL`이 있으면 PostgreSQL
- 둘 다 없으면 파일 store

### 2. File Store

[services/backend/lib/file-store.mjs](/home/ubuntu/project/ARES/services/backend/lib/file-store.mjs:1)는 메모리 state + JSON 파일 영속화 모델이다.

특징:

- seed: [data/store.seed.json](/home/ubuntu/project/ARES/data/store.seed.json:1)
- runtime snapshot: [data/runtime/store.json](/home/ubuntu/project/ARES/data/runtime/store.json:1)
- 부팅 시 JSON 파일을 메모리로 로드
- 수정 시 전체 snapshot을 다시 파일로 기록

현재 장점:

- 개발이 단순함
- seed 기반 bootstrap이 쉬움

현재 한계:

- 다중 프로세스 동시성에 약함
- 전체 snapshot rewrite 방식이라 확장성이 낮음

### 3. PostgreSQL Store

[services/backend/lib/postgres-store.mjs](/home/ubuntu/project/ARES/services/backend/lib/postgres-store.mjs:1)는 `pg` 기반 영속 store다.

현재 구현 특징:

- `Pool` 기반 연결
- 첫 기동 시 schema 자동 생성
- DB가 비어 있으면 runtime JSON 또는 seed JSON에서 bootstrap
- 내부 payload 다수는 `JSONB` 중심 저장

주요 테이블:

- `ares_projects`
- `ares_library`
- `ares_reading_queue`
- `ares_reading_sessions`
- `ares_agent_runs`
- `ares_project_assets`

현재 상태에서 PostgreSQL store는 이미 구현돼 있지만, 실제 운영은 환경 변수에 따라 켜진다.

## Asset Model

현재 store가 다루는 주요 컬렉션은 아래와 같다.

- `projects`
- `library`
- `readingQueue`
- `agentRuns`
- `readingSessions`
- `reproChecklistItems`
- `experimentRuns`
- `resultComparisons`
- `insightNotes`
- `writingDrafts`

핵심 방향은 "채팅 세션"이 아니라 "연구 자산과 단계 간 handoff" 중심이다.

## Public API Snapshot

현재 주요 API는 [services/backend/index.mjs](/home/ubuntu/project/ARES/services/backend/index.mjs:472)에 정의돼 있다.

공통 상태:

- `GET /api/health`
  - `codexAvailable`
  - `providerConfigured`
  - `profiles`
  - `profileDetails`
  - `storage`

검색/프로젝트:

- `GET /api/projects`
- `GET /api/search`
- `POST /api/search`
- `GET /api/library`

AgentRun:

- `POST /api/agent-runs`
- `GET /api/agent-runs`
- `GET /api/agent-runs/:runId`
- `POST /api/agent-runs/:runId/actions`

프로젝트 자산:

- `GET /api/projects/:projectId/reading-sessions`
- `POST /api/projects/:projectId/reading-sessions`
- `GET /api/projects/:projectId/repro-checklist`
- `GET /api/projects/:projectId/experiment-runs`
- `GET /api/projects/:projectId/result-comparisons`
- `GET /api/projects/:projectId/insight-notes`
- `GET /api/projects/:projectId/writing-drafts`
- `POST /api/projects/:projectId/library`
- `DELETE /api/projects/:projectId/library/:paperId`

## Configuration

현재 주요 환경 변수는 [.env.example](/home/ubuntu/project/ARES/.env.example:1)에 정리돼 있다.

- `HOST`
- `PORT`
- `OPENALEX_API_KEY`
- `OPENALEX_MAILTO`
- `ARES_STORE_BACKEND`
- `ARES_DATABASE_URL`
- `ARES_DATABASE_SSL`
- `SCOUT_AGENT_RUNTIME`
- `ARES_AGENT_RUNTIME`
- `SCOUT_AGENT_TIMEOUT_MS`
- `ARES_LIVE_RELOAD`

실행 스크립트는 [package.json](/home/ubuntu/project/ARES/package.json:1)에 있다.

- `npm start`
- `npm run dev`
- `npm test`

## Deploy And Dev Runtime

현재 개발 배포는 [deploy/deploy-dev-web.sh](/home/ubuntu/project/ARES/deploy/deploy-dev-web.sh:1)와 [deploy/ecosystem.config.cjs](/home/ubuntu/project/ARES/deploy/ecosystem.config.cjs:1)를 기준으로 운영된다.

현재 흐름:

- worktree 준비
- `npm install`
- `node --check services/backend/index.mjs`
- `node --check web/app.js`
- `npm test`
- current symlink 전환
- PM2로 `services/backend/index.mjs` 실행
- `/api/health`와 주요 페이지 smoke test

## Current Limitations

현재 백엔드 구성을 볼 때 아직 남아 있는 제약은 아래와 같다.

- HTTP 서버가 단일 프로세스 구조다.
- Agent 실행 핸들은 메모리 `Map`에만 있어서 worker 분리 전까지는 강한 내구성이 없다.
- PostgreSQL store는 구현됐지만 로컬/배포 환경에 DB provisioning이 아직 자동화되어 있지 않다.
- 인증/사용자 단위 멀티테넌시는 아직 없다.
- Reading 이후 stage는 store contract는 있으나 전체 제품 플로우는 아직 부분 구현 상태다.

## Recommended Next Step

현재 기준 다음 우선순위는 아래 순서가 가장 자연스럽다.

1. PostgreSQL 운영 환경과 migration 전략 고정
2. AgentRun 실행을 별도 worker 프로세스로 분리
3. stage별 자산 생성 API와 UI 연결 확대
4. 인증 및 사용자/프로젝트 권한 모델 추가
