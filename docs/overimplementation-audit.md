# ARES Over-Implementation Audit

작성일: 2026-06-16

## 감사 범위

이번 조사는 사용자가 명시적으로 만들지 않은 산출물이 제품 데이터처럼 저장되거나 표시되는 경로를 대상으로 했다. 단순한 코드 기본값이나 에러 처리용 변수명은 제외했고, `seed`, `fallback`, `preview`, `auto`, `suggestion` 계열 중 사용자-facing asset, note, draft, insight, run 상태에 영향을 주는 부분만 분류했다.

## 결론

가장 큰 문제는 자동 생성물이 "후보"나 "근거"로 멈추지 않고 실제 사용자 산출물 컬렉션에 들어가는 구조였다. Reading Notes의 seed note는 그 대표 사례였고, AgentRun fallback은 더 넓은 같은 문제였다. 2026-06-16 정리에서 P0/P1 사용자 산출물 자동 생성 경로는 제거했다.

## Findings

| Severity | Area | Behavior | 왜 문제인가 | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| P0 | Reading Notes | parse highlight를 `note-seed-*` note로 자동 생성했다. | Notes는 사용자가 직접 적은 메모여야 한다. 자동 추출 근거가 같은 컬렉션에 들어가면 사용자가 만들지 않은 노트가 생긴다. | `services/backend/lib/reading-service.mjs`, `services/backend/lib/reading-model.mjs`, `services/backend/tests/reading-service.test.mjs` | 해결: seed note 생성 제거, legacy seed note 정규화 필터 추가 |
| P0 | AgentRun fallback persistence | search 외 stage 실패 시 fallback output을 persist하고 run을 `done`으로 만들었다. | 런타임 실패가 실제 Reading session, repro checklist, result comparison, insight note, writing draft 생성으로 이어졌다. | `services/backend/lib/agent-runs.mjs`, `services/backend/tests/agent-runs.test.mjs` | 해결: 실패 시 `error`, outputRef/createdAssetIds 비움, `agent-run-fallbacks.mjs` 삭제 |
| P0 | Reading agent fallback | Reader fallback이 `readingSessions`와 note를 만들었다. | Reader 실패가 Reading session과 note로 남았다. | `services/backend/lib/agent-runs.mjs`, 삭제된 `services/backend/lib/agent-run-fallbacks.mjs` | 해결: fallback builder 삭제, runtime 실패는 completed session으로 승격하지 않음 |
| P1 | Lab failed run to Insight | failed Lab run 저장 또는 import 시 Insight candidate를 자동 생성했다. | Insight는 사용자가 선택해 승격해야 하는 분석 단위다. | `web/app.js`, `services/backend/tests/lab-tab-contract.test.mjs` | 해결: 자동 POST 제거, 실패 run은 Lab에만 남김 |
| P1 | Preview Reading sessions | preview session 안에 highlights와 notes를 합성하는 미사용 builder가 남아 있었다. | 다시 연결되면 실제 노트와 preview가 섞인다. | `web/app.js` | 해결: preview reading session/paper/section builder 제거 |
| P1 | Insight auto quality and clusters | Insight card 저장 시 자동 cluster/quality를 payload에 섞었다. | 자동 평가는 derived 표시여야 하고 사용자가 저장한 품질 기준과 섞이면 안 된다. | `web/app.js`, `services/backend/tests/insight-tab-contract.test.mjs` | 해결: 저장 payload에서 derived enrich 제거, 렌더링 계산으로만 유지 |
| P2 | Writing draft section from accepted insight | draft가 없으면 자동으로 draft를 만든 뒤 section을 추가했다. | "섹션 만들기" 액션이 암묵적으로 "초안 만들기"까지 수행했다. | `web/app.js`, `services/backend/tests/writing-tab-contract.test.mjs` | 해결: 기존 draft가 없으면 명시 오류 표시 |
| P2 | Insight evidence fallback text | 연결 근거가 없을 때 프로젝트 focus/placeholder를 evidence 배열로 렌더했다. | 화면에서 근거가 있는 것처럼 보일 수 있다. | `web/app.js` | 해결: evidence 배열에는 실제 graph/reading 근거만 넣음 |

## Fallback Inventory

| Area | Current status | Decision |
| --- | --- | --- |
| AgentRun stage fallback assets | 제거됨 | 실패/timeout/JSON 계약 위반은 `error`; 사용자 asset 컬렉션에 persist하지 않음 |
| Reading parse seed notes | 제거됨 | parse 후보는 `highlights`; `notes`는 사용자 CRUD 전용 |
| Legacy seed notes in runtime store | 차단됨 | `reading-model` 정규화에서 `origin: highlight`, `seedMethod`, `note-seed-*`를 필터링 |
| Lab failed run insight candidate | 제거됨 | 실패 로그는 Lab run/result dossier에 남기고 Insight는 명시 액션으로만 생성 |
| Preview reading session synthesis | 제거됨 | empty state는 비저장 UI로만 표시 |
| Insight quality/cluster enrich | 저장 경로에서 제거됨 | cluster/quality 자동 계산은 렌더링 derived state로만 유지 |
| Writing draft creation fallback | 제거됨 | draft section 추가는 기존 draft가 있을 때만 수행 |
| Search service failure | 유지 | Scout/search 실패는 `error`; fallback result를 queue하지 않음 |
| Reader summary/chat fallback prose | 조건부 유지 | `ARES_REQUIRE_AGENT_RUNTIME=true`에서 저장 차단 가능; unsupported answer는 insufficient evidence로 제한 |
| Retrieval scorer fallback | 유지 | HTTP scorer 장애 시 semantic score를 비우고 lexical retrieval로 제한; low-confidence telemetry 표시 |
| File store vs PostgreSQL seed fallback | 유지하되 운영 경계 필요 | dev/demo bootstrap 성격. 운영에서는 seed data 노출 경계를 별도 배포 설정으로 관리해야 함 |
| PDF asset synthetic thumbnail fallback | 유지 | asset quality가 `synthetic`/`partial`로 표시되는 후보 상태이며 사용자 note/insight/draft로 승격하지 않음 |
| UI placeholder/empty copy | 유지 | 저장되지 않는 화면 상태만 허용 |

## Not Classified As Product Over-Implementation

| Area | 판단 |
| --- | --- |
| Summary/Chat fallback provenance | 현재는 `ARES_REQUIRE_AGENT_RUNTIME=true`로 차단 가능한 계약이 있고, fallback provenance를 표시한다. 다만 운영 기본값을 더 엄격하게 둘지는 별도 제품 결정이 필요하다. |
| Search fallback | search stage는 실패 시 fallback asset을 만들지 않고 `error`로 끝난다. 이 방향이 다른 stage에도 맞다. |
| Seed store/demo data | `data/store.seed.json`과 README의 seed fallback은 dev/demo fixture 성격이다. 제품 화면에 실제 데이터처럼 노출되는 경로가 있으면 별도 차단이 필요하지만, 이번 Notes 문제와 같은 사용자 산출물 자동 생성은 아니다. |
| PDF crop synthetic thumbnail fallback | asset 품질 상태가 `synthetic`/`partial`로 구분되는 후보 표시다. 실제 figure 원본이라고 확정 저장하지 않는 한 P0는 아니다. |

## Verification

- `node --test services/backend/tests/reading-service.test.mjs`
- `node --test services/backend/tests/agent-runs.test.mjs`
- `node --test services/backend/tests/lab-tab-contract.test.mjs services/backend/tests/insight-tab-contract.test.mjs services/backend/tests/writing-tab-contract.test.mjs`

## Product Rule To Adopt

사용자 산출물 컬렉션(`notes`, `insightCards`, `writingDrafts`, `reproChecklistItems`, `experimentRuns`, `resultComparisons`)에는 사용자의 명시적 생성/저장/승인 액션 또는 성공한 실제 runtime 결과만 들어갈 수 있다. 실패 fallback, demo preview, 자동 추출 후보는 같은 컬렉션에 저장하지 않고, 별도 derived state나 명시적 preview로만 표시한다.
