# ARES 프로덕션/자동 연구 실행 구현 체크리스트

작성일: 2026-06-14
기준 문서: `docs/ares-production-platform-roadmap.md`

## 사용 규칙

- 체크박스는 실제 코드, 테스트, 문서, 운영 스크립트가 현재 저장소에 반영되고 검증됐을 때만 완료 처리한다.
- 단순 설계 문서만으로 런타임 기능 항목을 완료 처리하지 않는다.
- 각 항목의 완료 근거는 커밋, 테스트, 스크립트, 문서 경로 중 하나로 남긴다.
- destructive action, runner command, credential, 외부 storage 변경은 사용자 승인과 안전 게이트를 먼저 둔다.

## 전체 상태

- [ ] P0. Auth, tenancy, access check
- [ ] P0. Migration, backup, file storage
- [ ] P0. Worker lease/recovery
- [ ] P0. Runner sandbox safety
- [ ] P1. Reader validation corpus
- [ ] P1. Retrieval scorer 운영화
- [ ] P1. Lab runner v1
- [ ] P1. Observability and release gates
- [ ] P2. Insight review workflow
- [ ] P2. Citation/export pipeline
- [ ] P2. Collaboration and project operations

## Sprint 1. 운영 기반 고정

목표: 단일 사용자 v1을 운영 가능한 SaaS 기반으로 바꾼다.

### 1. Auth, Tenancy, Permission

- [x] 사용자 계정 모델을 추가한다.
  - 산출물: `User`, `Organization`, `Membership`, `ProjectAccess` store contract
  - 검증: `services/backend/lib/identity-model.mjs`, `services/backend/tests/asset-store.test.mjs`
- [x] 개발/운영 auth mode를 분리한다.
  - 산출물: local dev user fallback, production auth-required mode
  - 검증: `services/backend/lib/auth.mjs`, `services/backend/tests/auth-access.test.mjs`
- [x] session cookie 기반 로그인 흐름을 추가한다.
  - 산출물: login/logout/me API, secure cookie policy, CSRF policy
  - 검증: `services/backend/tests/auth-access.test.mjs`
- [x] project ownership을 모든 project-scoped API에 적용한다.
  - 산출물: access guard, project resolver, 403 response contract
  - 검증: `services/backend/index.mjs`, `services/backend/tests/auth-access.test.mjs`
- [x] asset graph, reading session, agent run, file route에 access check를 적용한다.
  - 산출물: route guard coverage map
  - 검증: `services/backend/routes/asset-routes.mjs`, `services/backend/routes/reading-routes.mjs`, `services/backend/tests/auth-access.test.mjs`
- [x] role 권한을 적용한다.
  - 산출물: owner/editor/viewer permission matrix
  - 검증: viewer write 차단, editor write 허용, editor destructive 제한 test in `services/backend/tests/auth-access.test.mjs`
- [ ] destructive action audit log를 추가한다.
  - 산출물: audit event model/API
  - 검증: asset delete, run cancel, permission change audit test

### 2. Production Storage, Migration, Backup

- [ ] versioned SQL migration 시스템을 도입한다.
  - 산출물: `migrations/`, migration runner, migration table
  - 검증: fresh DB migration test
- [ ] 앱 기동 중 암묵적 운영 schema 변경을 제거하거나 dev-only로 제한한다.
  - 산출물: production migration-required guard
  - 검증: production mode without migration fails with clear error
- [ ] 자주 조회하는 JSONB 필드를 column/index로 승격한다.
  - 산출물: owner, org, status, updatedAt, projectId indexes
  - 검증: schema snapshot/migration test
- [ ] file artifact 저장소 경계를 분리한다.
  - 산출물: artifact store adapter, local file adapter
  - 검증: PDF/thumbnail/table/export file route test
- [ ] object storage adapter를 추가한다.
  - 산출물: S3-compatible adapter 또는 provider 결정 문서
  - 검증: signed URL/proxy test with mock adapter
- [ ] backup/restore runbook과 rehearsal script를 추가한다.
  - 산출물: DB backup, object backup, restore script
  - 검증: staging 또는 temp DB restore dry-run

### 3. Observability Foundation

- [x] request id를 모든 API 응답과 log에 추가한다.
  - 산출물: request context helper
  - 검증: `x-request-id` route test in `services/backend/tests/auth-access.test.mjs`
- [x] structured log format을 고정한다.
  - 산출물: logger helper, error logging contract
  - 검증: `services/backend/lib/logger.mjs`, `services/backend/tests/logger.test.mjs`
- [ ] user id, project id, run id correlation을 log context에 포함한다.
  - 산출물: request/run scoped logger
  - 검증: API/agent run log test

## Sprint 2. Worker 기반 agent run

목표: agent run을 서버 메모리에서 떼어내고 복구 가능한 작업 단위로 만든다.

- [ ] worker process entrypoint를 추가한다.
  - 산출물: `services/backend/bin/agent-worker.mjs`
  - 검증: worker boot smoke
- [ ] AgentRun lease schema를 추가한다.
  - 산출물: leaseOwner, leaseExpiresAt, heartbeatAt fields
  - 검증: store contract test
- [ ] queue run claim/release API를 store에 추가한다.
  - 산출물: atomic claim in Postgres, safe fallback in file store
  - 검증: competing worker claim test
- [ ] durable cancel action을 worker loop와 연결한다.
  - 산출물: cancel request polling, subprocess termination
  - 검증: run cancel race test
- [ ] progress event replay를 추가한다.
  - 산출물: stored progressEvents, SSE replay
  - 검증: SSE reconnect test
- [ ] stale running recovery를 구현한다.
  - 산출물: stale heartbeat detector, retry/error policy
  - 검증: worker kill/restart integration test
- [ ] stage별 idempotency key를 적용한다.
  - 산출물: duplicate asset prevention
  - 검증: retry creates no duplicate asset test

## Sprint 3. Reader 품질 게이트

목표: Reader를 검증 가능한 논문 처리 파이프라인으로 만든다.

- [ ] PDF validation corpus를 20개 이상으로 확장한다.
  - 산출물: `scripts/reading-validation-samples.json`
  - 검증: validator aggregate pass
- [ ] corpus를 category별로 분류한다.
  - 산출물: text layer, OCR, table, figure, citation, supplementary metadata
  - 검증: sample schema test
- [ ] table/figure quality report를 추가한다.
  - 산출물: source-backed/partial/synthetic 비율 report
  - 검증: report snapshot test
- [ ] multi-page table 처리 기준을 추가한다.
  - 산출물: extraction rule 또는 known limitation marker
  - 검증: multi-page table sample test
- [ ] retrieval scorer health validation을 배포 smoke에 연결한다.
  - 산출물: scorer validation command in deploy/check script
  - 검증: validation success/failure test
- [ ] unsupported answer policy를 강화한다.
  - 산출물: confidence threshold contract, UI warning
  - 검증: no-evidence chat test
- [ ] OCR cost/latency metric을 추가한다.
  - 산출물: OCR timing and page count telemetry
  - 검증: OCR fixture test

## Sprint 4. Lab runner v1

목표: Lab을 수동 기록에서 실제 실행 가능한 연구 run으로 확장한다.

- [ ] reproduction command typed contract를 추가한다.
  - 산출물: command/environment/dataset/metric schema
  - 검증: parser/model test
- [ ] runner sandbox threat model을 문서화한다.
  - 산출물: `docs/lab-runner-sandbox-threat-model.md`
  - 검증: destructive/network/secret policy checklist
- [ ] sandboxed runner adapter를 추가한다.
  - 산출물: local safe runner, Docker 또는 VM adapter boundary
  - 검증: fixture command success/failure test
- [ ] human approval gate를 추가한다.
  - 산출물: command preview, risk score, approval state
  - 검증: unapproved run blocked test
- [ ] log/artifact/metric capture를 구현한다.
  - 산출물: run log, artifact files, parsed metrics
  - 검증: fixture repo run test
- [ ] typed failure result를 저장한다.
  - 산출물: timeout, non-zero exit, dependency missing, OOM categories
  - 검증: failure fixture tests
- [ ] ResultDossier 자동 생성을 연결한다.
  - 산출물: paper metric vs observed metric comparison
  - 검증: successful run creates dossier test

## Sprint 5. Insight review loop

목표: 자동 분석 결과를 사람이 검토 가능한 연구 판단으로 만든다.

- [ ] InsightCard review status를 확장한다.
  - 산출물: candidate, needs-review, accepted, rejected, archived
  - 검증: model/store test
- [ ] reviewer assignment를 추가한다.
  - 산출물: reviewer, due date, review note
  - 검증: update route test
- [ ] contradiction trace를 저장한다.
  - 산출물: source quote/run log pointer, dismiss reason
  - 검증: contradiction candidate test
- [ ] insight quality report를 추가한다.
  - 산출물: evidence coverage, source diversity, unresolved contradiction count
  - 검증: report calculation test
- [ ] accepted insight gate를 Write에 적용한다.
  - 산출물: accepted insight만 기본 draft 후보로 노출
  - 검증: Write candidate filter test
- [ ] follow-up experiment handoff를 추가한다.
  - 산출물: Insight -> Lab run candidate
  - 검증: handoff E2E

## Sprint 6. Production export and collaboration

목표: 팀이 결과물을 검토하고 외부 산출물로 내보낼 수 있게 한다.

- [ ] citation model을 분리한다.
  - 산출물: bibliography item, citation key, locator, style metadata
  - 검증: citation normalization test
- [ ] citation formatter를 추가한다.
  - 산출물: CSL 또는 최소 IEEE/APA formatter
  - 검증: formatter snapshot test
- [ ] export format을 확장한다.
  - 산출물: Markdown, HTML, DOCX 또는 PDF, BibTeX/CSL JSON
  - 검증: export snapshot test
- [ ] broken source blocker/warning을 export에 적용한다.
  - 산출물: pre-export validation
  - 검증: missing evidence export test
- [ ] draft version history를 추가한다.
  - 산출물: draft revision model
  - 검증: revision diff test
- [ ] comment/review request를 추가한다.
  - 산출물: comment thread, mention placeholder, resolve/reopen
  - 검증: comment API/UI test
- [ ] activity feed를 추가한다.
  - 산출물: paper added, run completed, insight accepted, draft exported events
  - 검증: activity event test
- [ ] notification foundation을 추가한다.
  - 산출물: in-app notification, email adapter boundary
  - 검증: notification creation test

## Completion Gate

모든 체크리스트 완료 전에는 목표를 완료로 보지 않는다.

- [ ] `npm run lint` 통과
- [ ] `npm test` 통과
- [ ] `npm run test:e2e` 통과
- [ ] PostgreSQL migration/e2e 검증 통과
- [ ] worker recovery smoke 통과
- [ ] Reader PDF corpus validation 통과
- [ ] Lab runner fixture 통과
- [ ] export snapshot 검증 통과
- [ ] 배포 smoke 또는 staging rehearsal 통과
