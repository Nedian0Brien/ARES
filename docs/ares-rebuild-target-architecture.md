# ARES Rebuild Target Architecture

작성일: 2026-05-29

> **참고 (2026-06-29)** — 상위 4탭 UI 기준은 [`design/DESIGN.md`](../design/DESIGN.md) (canonical: `design/ARES Papers Workspace.html`, 탭 = Reading/Lab/Wiki/Agent)로 확정됐다. 이 문서의 자산 그래프 중심 아키텍처는 그 위에서 동작하는 백엔드/데이터 구조를 다룬다.

## 1. 목적

이 문서는 ARES를 기존 탭 중심 앱에서 완전히 해체하고, 연구 자산 그래프를 중심으로 재구성하기 위한 목표 구조를 정의한다.

기존 구현은 `Search -> Reading -> Research -> Result -> Insight -> Writing` 흐름을 화면과 단계 중심으로 표현했다. 이 구조는 제품 흐름을 설명하기에는 유용하지만, 실제 구현에서는 각 단계가 독립 화면으로 굳어지고, 논문에서 나온 근거가 실험, 주장, 초안으로 어떻게 이어지는지 추적하기 어렵다.

새 목표 구조는 다음 명제를 기준으로 한다.

> ARES는 화면 많은 논문 앱이 아니라, 연구 자산이 생성, 검증, 조립되는 Research OS다.

## 2. 핵심 전환

### 2.1 Stage app에서 Asset graph로

기존 6단계는 폐기하지 않는다. 다만 화면 구조의 최상위 개념에서 내려보내고, 연구 자산이 성숙해지는 상태 흐름으로 재정의한다.

```text
Paper
-> Reading Packet
-> Reproduction Plan
-> Experiment Run
-> Result Dossier
-> Insight Card
-> Draft Section
```

이 흐름에서 중요한 것은 "어떤 화면에 있는가"가 아니라 "어떤 자산이 생성되었고, 다음 자산으로 어떻게 변환되는가"다.

### 2.2 화면은 자산을 다루는 작업대다

새 화면 구조는 탭 수를 줄이는 문제가 아니다. 각 화면은 특정 자산 타입을 만들거나 검증하는 작업대가 되어야 한다.

- `Queue`: 수집된 후보, agent 결과, handoff 대기 항목을 정리한다.
- `Reader`: `Paper`를 `Reading Packet`으로 변환한다.
- `Lab`: `Reading Packet`을 `Reproduction Plan`, `Experiment Run`, `Result Dossier`로 변환한다.
- `Evidence`: 읽기와 실험 결과를 `Insight Card`로 승격한다.
- `Draft`: 검증된 insight를 `Draft Section`으로 조립한다.

### 2.3 Agent는 버튼이 아니라 변환 주체다

Agent 실행 결과는 일회성 UI 상태가 아니라 저장 가능한 연구 객체로 남아야 한다.

| Agent | 입력 | 출력 |
| --- | --- | --- |
| Scout | research question, scope | paper candidates |
| Reader | paper, PDF, user selection | reading packet, evidence links |
| Reproducer | reading packet, code/repo context | reproduction plan |
| Analyst | experiment runs, paper claims | result dossier, insight candidates |
| Writer | insight cards, evidence bundle | draft sections |

## 3. Target Information Architecture

```text
ARES
├─ Workspace
│  ├─ Projects
│  ├─ Research Questions
│  ├─ Papers
│  ├─ Experiments
│  ├─ Claims
│  └─ Drafts
│
├─ Asset Graph
│  ├─ Paper
│  ├─ Reading Packet
│  ├─ Reproduction Plan
│  ├─ Experiment Run
│  ├─ Result Dossier
│  ├─ Insight Card
│  └─ Draft Section
│
├─ Agent Runtime
│  ├─ Scout
│  ├─ Reader
│  ├─ Reproducer
│  ├─ Analyst
│  └─ Writer
│
└─ Surfaces
   ├─ Queue
   ├─ Reader
   ├─ Lab
   ├─ Evidence
   └─ Draft
```

## 4. Core Asset Model

### 4.1 Project

연구 작업의 최상위 컨테이너다. 기존 seed project는 유지할 수 있지만, 이후 모든 자산은 project 아래에서 연구 질문과 연결되어야 한다.

필수 필드:

- `id`
- `name`
- `description`
- `defaultQuestionId`
- `createdAt`
- `updatedAt`

### 4.2 ResearchQuestion

Search query보다 상위 개념이다. 사용자가 검증하려는 연구 방향, 문제, 가설을 표현한다.

필수 필드:

- `id`
- `projectId`
- `title`
- `prompt`
- `status`
- `scope`
- `createdAt`
- `updatedAt`

### 4.3 Paper

외부 논문 metadata와 내부 연구 상태를 함께 가진다.

필수 필드:

- `id`
- `projectId`
- `questionIds`
- `source`
- `externalId`
- `title`
- `authors`
- `venue`
- `year`
- `abstract`
- `pdfUrl`
- `url`
- `status`
- `createdAt`
- `updatedAt`

### 4.4 ReadingPacket

Paper를 재사용 가능한 연구 재료로 바꾼 결과다. 기존 `Reading Session`은 이 모델로 흡수하거나 이 모델의 runtime representation으로 격하한다.

필수 필드:

- `id`
- `projectId`
- `paperId`
- `questionId`
- `status`
- `summary`
- `sections`
- `keyPoints`
- `methodParameters`
- `limitations`
- `notes`
- `evidenceLinks`
- `agentRunIds`
- `createdAt`
- `updatedAt`

### 4.5 EvidenceLink

ARES의 핵심 추적 단위다. 모든 claim, experiment, draft section은 가능하면 evidence link를 통해 source를 가진다.

필수 필드:

- `id`
- `projectId`
- `sourceType`
- `sourceId`
- `paperId`
- `page`
- `sectionId`
- `quote`
- `locator`
- `createdBy`
- `createdAt`

### 4.6 ReproductionPlan

Reading Packet에서 도출된 재현 계획이다.

필수 필드:

- `id`
- `projectId`
- `questionId`
- `readingPacketId`
- `status`
- `environment`
- `checklist`
- `datasets`
- `metrics`
- `baseline`
- `commands`
- `evidenceLinkIds`
- `agentRunIds`
- `createdAt`
- `updatedAt`

### 4.7 ExperimentRun

실험 실행 또는 수동 입력 결과를 표현한다. 자동 실행은 나중에 붙일 수 있지만, 수동 결과도 같은 모델에 저장한다.

필수 필드:

- `id`
- `projectId`
- `reproductionPlanId`
- `status`
- `kind`
- `config`
- `metrics`
- `artifacts`
- `notes`
- `startedAt`
- `completedAt`
- `createdAt`
- `updatedAt`

### 4.8 ResultDossier

원 논문 결과와 재현 결과를 비교 가능한 묶음으로 만든다.

필수 필드:

- `id`
- `projectId`
- `questionId`
- `paperId`
- `experimentRunIds`
- `comparisons`
- `deltaSummary`
- `failureNotes`
- `evidenceLinkIds`
- `agentRunIds`
- `createdAt`
- `updatedAt`

### 4.9 InsightCard

Evidence에서 주장, 가설, 결정으로 승격된 연구 판단 단위다.

필수 필드:

- `id`
- `projectId`
- `questionId`
- `type`
- `claim`
- `evidenceLinkIds`
- `confidence`
- `implication`
- `nextAction`
- `status`
- `createdBy`
- `createdAt`
- `updatedAt`

### 4.10 DraftSection

Insight Card를 문서 조각으로 조립한 결과다.

필수 필드:

- `id`
- `projectId`
- `draftId`
- `sectionType`
- `title`
- `body`
- `insightCardIds`
- `evidenceLinkIds`
- `status`
- `createdAt`
- `updatedAt`

## 5. Surface Responsibilities

### 5.1 Queue

역할:

- research question별 paper candidate 관리
- Scout 결과 검토
- 읽기, 실험, 작성으로 넘어갈 pending item 정리

반드시 남는 산출물:

- `Paper`
- `ResearchQuestion`
- `AgentRun`

### 5.2 Reader

역할:

- PDF 및 metadata 기반 읽기
- 선택한 텍스트, note, citation을 evidence로 저장
- Reader agent 결과를 Reading Packet으로 고정

반드시 남는 산출물:

- `ReadingPacket`
- `EvidenceLink`
- `Note`

### 5.3 Lab

역할:

- reproduction plan 작성
- 실험 run 생성 또는 수동 결과 입력
- 원 논문과 재현 결과 비교

반드시 남는 산출물:

- `ReproductionPlan`
- `ExperimentRun`
- `ResultDossier`

### 5.4 Evidence

역할:

- reading, result, user note를 claim 후보로 모으기
- 주장, 가설, 결정, 후속 실험을 분리하기
- 근거 없는 claim을 방지하기

반드시 남는 산출물:

- `InsightCard`
- `EvidenceLink`

### 5.5 Draft

역할:

- insight card를 section 단위 초안으로 조립
- 문단과 근거의 출처를 유지하기
- export 가능한 draft를 만들기

반드시 남는 산출물:

- `Draft`
- `DraftSection`

## 6. API Boundary

새 API는 stage action보다 자산 중심이어야 한다.

권장 route family:

```text
GET    /api/projects/:projectId/graph
GET    /api/projects/:projectId/questions
POST   /api/projects/:projectId/questions

GET    /api/projects/:projectId/papers
POST   /api/projects/:projectId/papers

GET    /api/projects/:projectId/reading-packets
POST   /api/projects/:projectId/reading-packets
GET    /api/reading-packets/:packetId
PATCH  /api/reading-packets/:packetId

POST   /api/evidence-links
GET    /api/projects/:projectId/evidence-links

GET    /api/projects/:projectId/reproduction-plans
POST   /api/projects/:projectId/reproduction-plans

GET    /api/projects/:projectId/experiment-runs
POST   /api/projects/:projectId/experiment-runs

GET    /api/projects/:projectId/result-dossiers
POST   /api/projects/:projectId/result-dossiers

GET    /api/projects/:projectId/insight-cards
POST   /api/projects/:projectId/insight-cards
PATCH  /api/insight-cards/:cardId

GET    /api/projects/:projectId/drafts
POST   /api/projects/:projectId/drafts
POST   /api/drafts/:draftId/sections
```

기존 route는 한 번에 제거하지 않는다. 새 asset route가 안정화될 때까지 compatibility layer로 둔다.

## 7. Migration Policy

### 7.1 보존할 구현 자산

- OpenAlex/Scout 검색 경로
- Reading PDF cache/serve/parse/summarize/chat/note/assets pipeline
- AgentRun progress/event model
- file/postgres store abstraction
- dev deploy and smoke scripts
- ARES design system tone

### 7.2 해체할 구조

- stage/tab 중심 전역 상태
- 화면에 먼저 맞춘 API 계약
- placeholder stage surface
- durable output이 없는 action button
- agent result가 자산과 느슨하게 연결되는 흐름
- Search/Reading 내부의 ad hoc state 누적

### 7.3 호환성 원칙

- 기존 dev URL과 seed data는 가능한 한 유지한다.
- 기존 Reading v1은 새 `ReadingPacket` 모델 아래로 이동한다.
- 기존 `AgentRun`은 새 asset output을 기록하도록 확장한다.
- 기존 4탭 문서는 archive하지 않고, 모바일 단순화와 stage grouping 참고 자료로 유지한다.

## 8. 성공 기준

재구성이 성공했다고 판단하려면 다음 조건이 충족되어야 한다.

- 사용자가 paper를 읽으면 `ReadingPacket`과 `EvidenceLink`가 저장된다.
- Reader에서 만든 evidence가 Lab, Evidence, Draft에서 같은 ID로 추적된다.
- Agent run 결과가 단순 message가 아니라 asset mutation 또는 asset candidate로 남는다.
- Lab은 placeholder가 아니라 최소한 `ReproductionPlan`, `ExperimentRun`, `ResultDossier`를 저장하고 보여준다.
- Draft 문단은 어떤 Insight와 Evidence에서 왔는지 추적된다.
- 기존 Search/Reading 기능은 새 구조 안에서 동작한다.
- `npm run lint`, `npm test`, dev smoke가 통과한다.

