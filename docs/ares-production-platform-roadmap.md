# ARES 프로덕션 SaaS 및 자동 연구 실행 플랫폼 개발 로드맵

작성일: 2026-06-14

## 기준

이 문서는 현재 ARES 구현 상태를 기준으로, 제품을 다음 두 목표까지 끌어올리기 위해 필요한 개발 항목을 정리한다.

- 프로덕션 SaaS: 여러 사용자와 팀이 안정적으로 사용할 수 있는 운영 제품
- 자동 연구 실행 플랫폼: 논문 읽기 이후 재현 계획, 실험 실행, 결과 해석, 문서화를 가능한 한 자동화하는 연구 실행 시스템

확인한 기준 문서:

- `docs/ares-implementation-completeness-audit.md`
- `docs/reading-implementation-checklist.md`
- `docs/backend-runtime-overview.md`
- `docs/ares-rebuild-target-architecture.md`
- `docs/specification.md`
- `README.md`

## 현재 출발점

ARES는 현재 목업이 아니다. `Read`, `Lab`, `Insight`, `Write` 4개 surface, asset graph, PDF Reader, Reading session, Lab/Insight/Write CRUD, agent run, file/PostgreSQL store, Playwright smoke를 갖춘 동작 가능한 v1 연구 워크스페이스다.

다음 단계의 핵심은 화면을 더 늘리는 일이 아니다. 프로덕션에서는 데이터 소유권, 실행 복구, 보안, 배포, 관측, 품질 평가가 필요하다. 자동 연구 실행 플랫폼에서는 Lab 이후 흐름을 수동 기록이 아니라 실제 실행과 검증으로 바꿔야 한다.

## 목표 상태

### 프로덕션 SaaS

- 사용자는 계정으로 로그인하고 개인, 팀, 프로젝트 단위로 데이터를 분리한다.
- 프로젝트, 논문, PDF, 노트, 실험 결과, 초안은 소유자와 권한을 가진다.
- 장애가 나도 agent run, PDF 처리, 실험 실행 상태를 복구할 수 있다.
- 운영자는 배포, 마이그레이션, 백업, 로그, 비용, 보안 이벤트를 추적한다.
- 사용자는 신뢰할 수 있는 검색, Reader, citation, export 품질을 기대할 수 있다.

### 자동 연구 실행 플랫폼

- ARES는 논문에서 재현 계획과 실행 명령 후보를 뽑고, 격리된 환경에서 실행한다.
- 실험 runner는 로그, metric, artifact, 실패 원인을 구조화해 `ExperimentRun`과 `ResultDossier`로 저장한다.
- Analyst는 원 논문 주장, 재현 수치, 실패 로그, 추가 실험을 비교해 `InsightCard` 후보를 만든다.
- Writer는 evidence link를 유지한 채 report, proposal, lab note, paper draft로 export한다.
- 모든 자동 산출물은 source, confidence, reviewer status, 재실행 가능성을 가진다.

## 개발 축

### 1. Auth, Tenancy, Permission

현재 상태:

- 프로젝트와 자산은 앱 내부 모델로 존재하지만, 사용자 계정과 팀 권한이 없다.
- 로컬 또는 단일 운영 환경을 전제로 한 워크스페이스에 가깝다.

개발해야 할 것:

- 사용자 계정 모델
  - `User`, `Organization`, `Membership`, `ProjectAccess` 모델 추가
  - email/password 또는 OAuth 기반 로그인
  - session cookie, CSRF, logout, password reset 정책
- 프로젝트 소유권
  - 모든 project-scoped API에 owner 또는 org scope 적용
  - asset graph, reading session, agent run, file route에 access check 추가
- 권한 체계
  - 최소 역할: owner, editor, viewer
  - destructive action은 owner 또는 명시 권한 사용자만 허용
  - export, PDF download, asset file access 권한 분리
- 감사 로그
  - project 생성, asset 삭제, run 취소, export, permission 변경 기록
  - audit event 검색 API와 관리자 화면

완료 기준:

- 다른 사용자의 project, PDF, asset file, agent run을 URL 직접 호출로 읽을 수 없다.
- 권한 없는 destructive action은 403을 반환한다.
- Playwright 또는 API 테스트가 owner/editor/viewer 경계를 검증한다.

### 2. Production Storage, Migration, Backup

현재 상태:

- file store와 PostgreSQL store가 있다.
- PostgreSQL schema는 앱 기동 시 자동 생성된다.
- 운영 DB provisioning, migration, backup, restore 절차가 부족하다.

개발해야 할 것:

- 명시적 migration 시스템
  - versioned SQL migration 도입
  - 앱 기동 중 암묵적 schema 변경 제거
  - migration dry-run과 rollback 문서화
- JSONB 중심 payload의 경계 정리
  - 자주 조회하는 필드는 column으로 승격
  - asset graph 관계, owner, status, updatedAt에 index 추가
  - 대용량 parsed artifact와 PDF metadata 저장 위치 분리
- 파일 저장소 운영화
  - PDF, thumbnail, table data, export file을 object storage로 분리
  - signed URL 또는 authenticated file proxy 적용
  - file lifecycle와 retention 정책 정의
- 백업과 복구
  - DB backup schedule
  - object storage backup 또는 versioning
  - restore rehearsal script
  - seed/runtime 데이터와 운영 데이터 경계 분리

완료 기준:

- 신규 환경에서 migration만으로 빈 DB를 준비할 수 있다.
- backup에서 staging 환경으로 project와 file artifact를 복구할 수 있다.
- store contract 테스트가 file store, Postgres, object storage 경로를 분리해 검증한다.

### 3. Agent Run Worker Platform

현재 상태:

- agent run metadata는 저장된다.
- 실행 핸들은 단일 Node 프로세스 메모리에 묶여 있다.
- 부팅 시 interrupted run 정리는 있지만, worker lease 기반 복구는 없다.

개발해야 할 것:

- worker 프로세스 분리
  - HTTP process는 run 생성, 조회, SSE fan-out만 담당
  - worker process는 queue run을 lease로 잡아 실행
  - worker heartbeat, lease owner, expiresAt 저장
- durable cancellation
  - abort 요청을 status patch 또는 action record로 저장
  - worker가 heartbeat 루프에서 취소 요청을 확인
  - Codex subprocess, PDF parse, OCR, scorer 호출, experiment runner에 cancel propagation 적용
- idempotency
  - stage별 idempotency key 도입
  - 동일 run 재시도 시 중복 asset 생성을 방지
  - createdAssetIds, candidateAssetIds, sourceAssetIds를 복구 인덱스로 사용
- progress event replay
  - SSE 재연결 시 store의 progressEvents 재생
  - final output과 error state를 클라이언트가 재동기화
- multi-worker 준비
  - 첫 단계는 단일 worker
  - 다음 단계에서 PostgreSQL advisory lock 또는 atomic lease update 적용

완료 기준:

- API 서버를 재시작해도 worker가 stale running run을 회수하거나 실패 처리한다.
- run cancel 이후 늦게 도착한 결과가 자산을 생성하지 않는다.
- worker process 중단과 재시작을 포함한 통합 테스트가 있다.

### 4. Search And Ingestion Quality

현재 상태:

- OpenAlex/seed 검색과 queue 저장은 동작한다.
- 고급 필터, ranking, deduplication, 운영 검색 품질 검증은 부족하다.

개발해야 할 것:

- 검색 provider 계층
  - OpenAlex, arXiv, Semantic Scholar, Crossref 같은 provider adapter 분리
  - provider별 rate limit, retry, attribution 저장
  - externalId normalization과 deduplication
- 연구 질문 중심 검색
  - project의 research question을 검색 scope로 사용
  - inclusion/exclusion criteria 저장
  - 검색 query history와 decision log 저장
- ranking 품질
  - relevance, recency, citation count, venue, availability, user feedback을 조합
  - Scout agent 결과와 deterministic rank를 분리해 비교 가능하게 저장
- ingestion pipeline
  - PDF URL discovery
  - metadata enrichment
  - duplicate paper merge
  - failed ingestion retry queue

완료 기준:

- 동일 논문이 provider를 바꿔 들어와도 하나의 Paper로 병합된다.
- 사용자가 왜 해당 논문이 추천됐는지 rank explanation을 볼 수 있다.
- provider 장애 시 부분 결과와 실패 이유가 저장된다.

### 5. Reader Quality And Evidence Grounding

현재 상태:

- PDF cache, PDF.js 렌더링, parse, OCR, summary, chat, notes, assets, citation jump가 동작한다.
- 다양한 실제 PDF, multi-page table, figure 위치 정확도, OCR 품질 검증은 더 넓혀야 한다.

개발해야 할 것:

- PDF validation corpus
  - arXiv, ACM, IEEE, Springer, Nature, scanned PDF, supplementary PDF 샘플 추가
  - text layer, OCR, table, figure, citation, reference section 케이스 분류
  - `scripts/reading-validation-samples.json`를 운영 품질 게이트로 확장
- table/figure extraction 고도화
  - multi-page table 처리
  - caption과 본문 reference 연결
  - figure/table source bounds 정확도 평가
  - crop 실패 사유와 synthetic fallback 비율 추적
- retrieval scorer 운영화
  - `ARES_RETRIEVAL_SCORER_URL` secret 주입
  - scorer health check와 latency budget
  - expected top chunk validation을 CI 또는 배포 smoke에 연결
- evidence policy
  - unsupported answer 차단 기준 강화
  - confidence threshold와 low-confidence UX 정리
  - generated summary와 source quote 사이 traceability 테스트
- OCR 운영 기준
  - `ARES_OCR_MAX_PAGES` 기본값 재검토
  - OCR 비용과 latency 추적
  - 외부 OCR import provenance와 reviewer 확인 상태 저장

완료 기준:

- validation corpus가 최소 20개 이상의 실제 PDF 패턴을 포함한다.
- Reader chat의 citation은 source quote와 page jump로 재현 가능하다.
- figure/table asset은 source-backed, partial, synthetic 비율을 report로 낸다.

### 6. Lab Execution Platform

현재 상태:

- Reading에서 Lab으로 handoff하고, reproduction plan, manual run result, result dossier를 저장할 수 있다.
- 실제 실험 runner는 없다.

개발해야 할 것:

- reproduction plan 실행 모델
  - environment spec, dataset spec, command spec, metric spec를 typed contract로 분리
  - command는 직접 실행 전 위험도와 resource estimate를 가진다.
  - 사용자가 승인한 plan만 실행 queue에 넣는다.
- sandboxed runner
  - Docker 또는 Firecracker 기반 격리 실행
  - CPU, memory, disk, network, timeout 제한
  - secret mount 금지 또는 명시 allowlist
  - artifact output directory와 log capture
- dataset and code ingestion
  - GitHub repo clone, commit pinning, license note 저장
  - dataset download contract와 checksum
  - large file cache와 cleanup policy
- metric extraction
  - stdout, JSON, CSV, tensorboard, wandb export 등 입력 adapter
  - paper metric과 observed metric의 unit normalization
  - failed run도 구조화된 `ExperimentRun`으로 저장
- human approval gates
  - destructive command 차단
  - network access, GPU 사용, long-running job은 사용자 승인 필요
  - 실행 전 command preview와 diff 제공

완료 기준:

- 안전한 fixture repo를 clone하고 command를 실행해 metric과 artifact를 저장한다.
- timeout, non-zero exit, missing dependency, OOM 같은 실패가 typed failure로 남는다.
- Lab UI에서 run log, artifact, metric comparison, rerun action을 확인할 수 있다.

### 7. Analyst And Insight Quality Loop

현재 상태:

- Insight card CRUD, claim clustering, 기본 품질 평가가 있다.
- reviewer assignment, contradiction trace, operational quality report는 부족하다.

개발해야 할 것:

- contradiction detection
  - 원 논문 claim, 재현 metric, 실패 로그, 다른 논문 evidence 사이 충돌 후보 생성
  - contradiction evidence trace 저장
  - false positive dismiss 이유 저장
- reviewer workflow
  - InsightCard status: candidate, needs-review, accepted, rejected, archived
  - reviewer, due date, review note, decision log
  - accepted insight만 Write 기본 후보로 사용
- quality report
  - evidence coverage
  - source diversity
  - unresolved contradiction count
  - follow-up experiment count
  - stale insight detection
- follow-up experiment loop
  - insight에서 추가 실험 후보 생성
  - Lab run으로 다시 보내는 handoff
  - 결과가 insight quality score에 반영

완료 기준:

- 사용자는 insight마다 근거, 반례, 검토 상태, 다음 실험을 볼 수 있다.
- accepted insight만 export와 draft generation의 기본 입력이 된다.
- contradiction trace가 최소 source quote 또는 run log pointer를 포함한다.

### 8. Write, Export, And Citation Pipeline

현재 상태:

- Draft section CRUD와 evidence-backed writing surface가 있다.
- Markdown export와 source appendix는 있지만 citation formatting과 완성 문서 품질은 더 검증해야 한다.

개발해야 할 것:

- citation model
  - bibliography item, citation key, locator, style metadata 분리
  - APA, MLA, Chicago, IEEE 또는 CSL 기반 formatter 검토
  - broken source warning을 export 전 blocker 또는 warning으로 표시
- document assembly
  - report, research memo, proposal, paper draft template
  - section ordering, outline, figure/table reference 자동 삽입
  - accepted insight와 evidence bundle만 기본 포함
- export formats
  - Markdown
  - HTML
  - DOCX 또는 PDF
  - BibTeX 또는 CSL JSON
- revision workflow
  - draft version history
  - reviewer comments
  - source-linked edit diff

완료 기준:

- export된 문서의 모든 citation marker가 appendix 또는 bibliography로 연결된다.
- missing evidence가 있는 section은 export 전 명확한 경고를 낸다.
- 동일 draft를 재export해도 citation key와 source order가 흔들리지 않는다.

### 9. Collaboration And Project Operations

현재 상태:

- 개인 또는 단일 팀이 쓰는 로컬 워크스페이스에 가깝다.
- 실시간 협업, 공유, 알림, 프로젝트 운영 기능은 없다.

개발해야 할 것:

- 공유와 초대
  - org/project invite
  - role 변경
  - read-only share link는 별도 정책 결정 필요
- 코멘트와 리뷰
  - note, insight, draft section에 comment thread
  - mention, resolve, reopen
  - review request
- activity feed
  - paper added
  - run completed
  - insight accepted
  - draft exported
- notification
  - in-app notification
  - email notification
  - long-running job completion alert
- project operation
  - project archive
  - retention policy
  - cascade delete preview
  - export all project data

완료 기준:

- 팀원이 프로젝트에 초대되고 권한에 따라 자산을 읽거나 수정할 수 있다.
- 중요한 run과 review event가 activity feed에 남는다.
- project archive와 export가 audit log를 남긴다.

### 10. Security, Safety, Compliance

현재 상태:

- 파괴적 API에는 일부 confirm/audit 정책이 있다.
- 사용자 데이터 보호, 실험 실행 sandbox, secret handling 정책은 프로덕션 기준으로 부족하다.

개발해야 할 것:

- web security
  - secure cookie, CSRF, CORS, CSP
  - upload MIME/type/size 검증
  - PDF parser sandbox 또는 process isolation 검토
- experiment safety
  - command allowlist 또는 risk classifier
  - network egress policy
  - secret exposure prevention
  - artifact path traversal 방지
- data protection
  - encryption at rest 정책
  - object storage signed URL expiry
  - PII and sensitive research data handling
  - data deletion and retention policy
- abuse and cost controls
  - per-user run quota
  - OCR/scorer/agent runtime cost tracking
  - rate limit
  - large upload limits

완료 기준:

- 업로드, PDF 처리, file route, experiment command에 대한 보안 테스트가 있다.
- runner는 기본적으로 network와 secret에 접근하지 못한다.
- 운영자는 사용자별 비용과 장시간 job을 확인할 수 있다.

### 11. Observability, QA, And Release

현재 상태:

- lint, unit/integration tests, Playwright smoke가 있다.
- 운영 관측, 배포 품질 게이트, 브라우저/기기 매트릭스는 부족하다.

개발해야 할 것:

- observability
  - structured logs
  - request id, user id, project id, run id correlation
  - metrics: latency, error rate, queue depth, worker heartbeat, OCR/scorer latency
  - tracing for agent run and experiment runner
- quality gates
  - API contract tests
  - migration tests
  - worker recovery tests
  - PDF corpus validation
  - export snapshot tests
  - Playwright desktop/mobile matrix
- release process
  - staging environment
  - smoke after deploy
  - rollback procedure
  - feature flag policy
  - incident runbook
- performance
  - large library pagination
  - PDF render memory limits
  - asset graph query index
  - long-running job backpressure

완료 기준:

- 배포 전 migration, tests, PDF corpus validation, worker recovery smoke가 자동 실행된다.
- 장애 발생 시 run id 또는 request id로 로그와 상태를 추적할 수 있다.
- staging rollback rehearsal을 문서화하고 검증한다.

## 권장 개발 순서

### Sprint 1. 운영 기반 고정

목표: 단일 사용자 v1을 운영 가능한 서비스 뼈대로 바꾼다.

작업:

- Auth와 project ownership 최소 구현
- PostgreSQL migration 시스템 도입
- file artifact 저장소 경계 정리
- API access check 테스트 추가
- structured log와 request id 추가

검증:

- owner/editor/viewer API 테스트
- migration fresh DB test
- file route 권한 테스트
- `npm test`, `npm run lint`, `npm run test:e2e`

### Sprint 2. Worker 기반 agent run

목표: agent run을 서버 메모리에서 떼어내고 복구 가능한 작업 단위로 만든다.

작업:

- worker process 추가
- lease/heartbeat schema 추가
- cancel action durable 처리
- progress event replay
- stale running recovery test

검증:

- worker kill/restart 통합 테스트
- run cancel race test
- SSE reconnect smoke

### Sprint 3. Reader 품질 게이트

목표: Reader를 데모 기능이 아니라 검증 가능한 논문 처리 파이프라인으로 만든다.

작업:

- PDF validation corpus 확장
- scorer endpoint 운영 설정과 validation 연결
- table/figure quality report 추가
- OCR 품질과 비용 metric 추가
- unsupported answer policy 테스트

검증:

- 20개 이상 PDF sample validation
- scorer health validation
- citation source jump snapshot
- table/figure quality report 확인

### Sprint 4. Lab runner v1

목표: 수동 Lab 기록을 실제 실행 가능한 연구 run으로 확장한다.

작업:

- reproduction command typed contract
- sandboxed runner
- fixture repo execution
- log/artifact/metric capture
- failure typed result 저장
- approval gate UI

검증:

- fixture repo 성공 run
- timeout/failure run
- artifact download
- ResultDossier 자동 생성

### Sprint 5. Insight review loop

목표: 자동 분석 결과를 사람이 검토 가능한 연구 판단으로 만든다.

작업:

- contradiction trace
- reviewer workflow
- insight quality report
- accepted insight gate
- follow-up experiment handoff

검증:

- contradiction candidate 생성
- reviewer accept/reject flow
- accepted insight만 Write 후보로 표시

### Sprint 6. Production export and collaboration

목표: 팀이 결과물을 공유하고 외부 산출물로 내보낼 수 있게 한다.

작업:

- citation formatter
- report/proposal/paper draft template
- HTML/DOCX/PDF export
- comments/review request
- activity feed and notification

검증:

- citation key stability test
- broken source warning test
- team comment/review E2E
- export snapshot test

## 우선순위 요약

| 우선순위 | 개발 항목 | 이유 |
| --- | --- | --- |
| P0 | Auth, tenancy, access check | SaaS 전환의 전제 조건 |
| P0 | Migration, backup, file storage | 운영 데이터 손실 방지 |
| P0 | Worker lease/recovery | 장시간 agent run과 실험 실행의 기반 |
| P0 | Runner sandbox safety | 자동 연구 실행의 보안 경계 |
| P1 | Reader validation corpus | Reader 신뢰도 확보 |
| P1 | Retrieval scorer 운영화 | evidence grounding 품질 확보 |
| P1 | Lab runner v1 | 자동 연구 실행 플랫폼의 핵심 |
| P1 | Observability and release gates | 장애 대응과 배포 안정성 |
| P2 | Insight review workflow | 자동 산출물의 검토 가능성 확보 |
| P2 | Citation/export pipeline | 실제 사용자 산출물 품질 확보 |
| P2 | Collaboration | 팀 제품화 |

## 명시적 비목표

초기 프로덕션 전환에서 아래 항목은 뒤로 둔다.

- 모든 학문 분야를 포괄하는 범용 연구 자동화
- 완전 자동 논문 작성과 투고
- GPU cluster scheduler 전체 구현
- 실시간 Google Docs 수준의 공동 편집
- 대규모 엔터프라이즈 권한 체계

## 남은 결정 사항

- 첫 auth provider를 직접 구현할지, managed provider를 쓸지 결정해야 한다.
- experiment runner의 기본 격리 기술을 Docker로 시작할지, 더 강한 VM sandbox로 시작할지 결정해야 한다.
- object storage provider와 signed URL 정책을 정해야 한다.
- 운영 retrieval scorer를 어떤 모델과 배포 방식으로 제공할지 정해야 한다.
- 첫 유료 SaaS 범위가 개인 연구자, 소규모 랩, 기업 R&D 중 어디인지 정해야 한다.

## 다음 문서화 작업

1. `Auth/Tenancy 상세 설계`를 API, schema, UI 변경 단위로 작성한다.
2. `Worker lease/recovery 상세 설계`를 상태 전이와 race condition 중심으로 작성한다.
3. `Lab runner sandbox threat model`을 command, file, network, secret 관점으로 작성한다.
4. `Reader validation corpus 기준`을 PDF 샘플, 기대 asset, 실패 허용치로 작성한다.
5. `Production deployment runbook`을 migration, smoke, rollback, backup restore 순서로 작성한다.
