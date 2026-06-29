# ARES 4탭 워크스페이스 재편 설계안

작성일: 2026-05-17

> **⚠️ SUPERSEDED (2026-06-29)** — 이 문서가 제안한 4탭 그룹핑(`Search+Reading / Research+Result / Insight / Writing`)은 **확정 디자인에서 채택되지 않았다.** 실현된 상위 4탭은 **Reading / Lab / Wiki / Agent**다. 아래 본문은 초기 탐색 기록으로 보존하되, **현행 기준은 [`design/DESIGN.md`](../design/DESIGN.md)** (canonical 디자인: `design/ARES Papers Workspace.html`)를 따른다.

## 0. 현행 구조 (2026-06-29 기준)

상위 4탭은 산출물·작업 모드 기준으로 다음과 같이 확정됐다. 자세한 내용·스크린샷은 `design/DESIGN.md` 참조.

- **Reading** (라이브러리 ⇄ 리더) — 논문을 읽을 수 있는 연구 자산으로. 라이브러리에서 추가·정리·목록·리더 진입, 리더에서 PDF/Summary ↔ Chat/Notes/Assets.
- **Lab** (프로젝트 → 보드 → 워크스페이스) — 가설→설계→에이전트 실행→리포트의 실험 라이프사이클. 프로젝트가 상위 단위(할당 자산 + 독립 칸반), 그 아래 다중 실험.
- **Wiki** (탐색기 ⇄ 뷰어) — 읽은 논문들의 지식 지도. 폴더 구조를 반영한 Graph/List/Grid + Notion급 문서 뷰어.
- **Agent** (대화 ⇄ 근거 원장) — 근거 기반 리딩 파트너. 교차 문서 추론 + 모든 답변에 재확인 가능한 근거 + 저장 가능한 산출물.

기존 6단계(`Search/Reading/Research/Result/Insight/Writing`)는 폐기되지 않고 각 탭 내부의 상태·모드로 보존한다(원안 2.1과 동일 원칙). "가짜 완성도 배제" 원칙도 유지된다(원안 2.4).

---

## 1. 목적 *(원안 — 초기 탐색)*

현재 ARES의 제품 흐름은 `Search -> Reading -> Research -> Result -> Insight -> Writing`의 6단계로 정의되어 있다. 이 구조는 연구 워크플로우를 세밀하게 설명하기에는 좋지만, 모바일 하단 네비게이션과 반복 사용 관점에서는 탭 수가 많고 단계 간 이동 비용이 크다.

이 설계안은 기존 6단계를 폐기하지 않고, 사용자의 실제 작업 모드에 맞춰 4개의 상위 탭으로 묶는다.

1. `Search + Reading`
2. `Research + Result`
3. `Insight`
4. `Writing`

핵심 목표는 모바일에서 "지금 해야 할 일"을 더 빨리 찾게 만드는 것이다. 데스크톱에서는 연구 자산과 패널을 넓게 다루고, 모바일에서는 이어 읽기, 결과 확인, 짧은 메모, 초안 검토 같은 짧은 세션을 우선한다.

## 2. 설계 원칙

### 2.1 6단계는 하위 모드로 보존한다

기존 명세의 `Search`, `Reading`, `Research`, `Result`, `Insight`, `Writing`은 데이터 상태, 에이전트 역할, 기존 deep link 호환성에 필요하다. 따라서 상위 네비게이션만 4탭으로 줄이고, 기존 6단계는 각 탭 안의 하위 모드 또는 상태로 유지한다.

### 2.2 탭은 화면 묶음이 아니라 산출물 묶음이다

각 탭은 "무엇을 보고 있는가"보다 "무엇을 만들어 다음 단계로 넘기는가"를 기준으로 나눈다.

- `Search + Reading`: 논문 후보를 읽을 수 있는 연구 자산으로 만든다.
- `Research + Result`: 재현 계획과 실험 결과를 비교 가능한 실행 자산으로 만든다.
- `Insight`: 읽기와 실험 결과를 주장, 가설, 결정으로 승격한다.
- `Writing`: 검증된 주장과 근거를 문서 초안으로 조립한다.

### 2.3 모바일은 Companion Mode로 본다

모바일은 전체 연구 작업을 완수하는 장소라기보다, 이동 중 확인, 선별, 이어 읽기, 짧은 질문, 메모, 승인에 강한 환경이다. 모바일 UI는 넓은 패널을 그대로 접는 대신, 현재 작업 하나를 전면화하고 나머지는 bottom sheet 또는 하위 세그먼트로 이동시킨다.

### 2.4 가짜 완성도를 만들지 않는다

실제 백엔드 연결이 없는 액션은 사용자가 실행 가능한 기능처럼 오해하지 않게 해야 한다. 특히 `Research + Result`, `Insight`, `Writing`은 실제 저장, 실행, 생성 흐름이 연결되기 전까지 상태와 범위를 분명히 표시한다.

## 3. 최종 정보 구조

| 상위 탭 | 기존 단계 | 작업 모드 | 핵심 산출물 |
| --- | --- | --- | --- |
| Search + Reading | Search, Reading | 논문 수집과 이해 | Reading Packet |
| Research + Result | Research, Result | 재현 설계와 결과 비교 | Result Dossier |
| Insight | Insight | 해석, 가설, 결정 | Insight Card |
| Writing | Writing | 문서 조립과 초안화 | Draft Section |

### 3.1 탭 라벨

데스크톱에서는 사용자가 명시적으로 이해할 수 있도록 전체 라벨을 사용한다.

- `Search + Reading`
- `Research + Result`
- `Insight`
- `Writing`

모바일 하단 네비게이션에서는 공간을 줄이기 위해 짧은 라벨을 쓴다.

- `Read`
- `Lab`
- `Insight`
- `Write`

단, 접근성 라벨과 툴팁에는 전체 라벨을 유지한다.

## 4. 탭별 설계

### 4.1 Search + Reading

역할: 논문을 찾고, 저장하고, 읽고, 재현에 필요한 정보를 추출하는 통합 진입점.

하위 모드:

- `Discover`: 검색어 입력, 필터, 결과 리스트, 논문 preview
- `Library`: 저장된 논문, 최근 읽은 논문, 대기 중인 논문
- `Reader`: PDF 또는 본문 리더, 요약, 하이라이트, Reader agent

주요 객체:

- `Paper`
- `Reading Session`
- `Highlight`
- `Reader Summary`
- `Reproduction Parameter`

주요 액션:

- `Search papers`
- `Save`
- `Read`
- `Ask Reader`
- `Send to Lab`

모바일 구조:

- 첫 화면은 검색창이 아니라 `Continue Reading`과 최근 논문을 우선한다.
- 검색은 상단 command bar 또는 `Discover` 세그먼트로 진입한다.
- Reader에서는 `PDF`, `Summary`, `Chat`, `Notes`를 세그먼트로 전환한다.
- `Send to Lab`은 항상 현재 paper context를 포함한다.

데스크톱 구조:

- Search 모드에서는 필터, 결과 리스트, preview를 3영역으로 유지한다.
- Reader 모드에서는 문서, 구조화 요약, agent panel을 넓게 배치한다.
- 같은 탭 안에서 검색 결과와 열린 논문 사이를 빠르게 왕복할 수 있어야 한다.

탭 산출물:

`Reading Packet`

- paper metadata
- abstract and key points
- selected highlights
- extracted method parameters
- known limitations
- user notes

### 4.2 Research + Result

역할: 논문 리딩에서 넘어온 정보를 재현 계획, 실험 큐, 결과 비교로 연결하는 실행 탭.

하위 모드:

- `Plan`: 재현 가능성, 환경, 체크리스트, setup command
- `Runs`: baseline, ablation, manual experiments, run status
- `Compare`: 논문 수치와 재현 수치 비교, delta 분석, Analyst report

주요 객체:

- `Research Plan`
- `Reproduction Checklist Item`
- `Experiment`
- `Result Comparison`
- `Analyst Report`

주요 액션:

- `Create reproduction plan`
- `Add experiment`
- `Attach result`
- `Compare with paper`
- `Extract insight`

모바일 구조:

- 첫 화면은 실험 테이블이 아니라 현재 run 상태 카드 목록이다.
- 각 run 카드는 status, metric, ours, delta만 먼저 보여준다.
- 상세 비교표와 Analyst report는 sheet 또는 detail view로 연다.
- 장문의 setup command는 복사 가능한 코드 블록으로 접어둔다.

데스크톱 구조:

- 좌측은 reproduction checklist, 중앙은 experiments, 우측은 analyst summary로 구성한다.
- `Plan`, `Runs`, `Compare`는 상단 segmented control로 전환한다.
- Result는 독립 탭이 아니라 `Compare` 모드로 흡수한다.

탭 산출물:

`Result Dossier`

- reproduction checklist status
- experiment runs
- metric comparison
- delta explanation
- failure notes
- candidate insights

### 4.3 Insight

역할: 읽기와 실험에서 나온 사실을 연구 판단 단위로 승격하는 탭.

하위 모드:

- `Evidence`: Reading Packet과 Result Dossier에서 넘어온 근거
- `Claims`: 검증된 주장과 관찰
- `Hypotheses`: 후속 실험 가설과 연구 질문
- `Decisions`: 채택, 보류, 폐기한 판단

주요 객체:

- `Insight Card`
- `Hypothesis`
- `Evidence Link`
- `Decision`
- `Research Note`

주요 액션:

- `Promote evidence`
- `Create hypothesis`
- `Send to Writing`
- `Create follow-up experiment`

모바일 구조:

- 카드는 한 화면에 하나씩 검토할 수 있게 한다.
- 각 카드에는 근거 출처가 작게 붙어야 한다. 예: paper highlight, result delta, user note.
- `Use in draft`, `New experiment`, `Archive` 같은 짧은 결정 액션을 카드 하단에 둔다.

데스크톱 구조:

- 좌측은 evidence stream, 중앙은 insight board, 우측은 selected card detail로 구성한다.
- Insight는 단순 메모장이 아니라 `근거 -> 주장 -> 다음 행동`의 변환 공간이어야 한다.

탭 산출물:

`Insight Card`

- claim
- linked evidence
- confidence
- implication
- next action

### 4.4 Writing

역할: 검증된 인사이트와 결과를 보고서, 논문, 제안서 초안으로 연결하는 탭.

하위 모드:

- `Outline`: 문서 구조, 섹션 상태, 필요한 근거
- `Draft`: 섹션별 작성, AI draft, inline suggestion
- `Sources`: 사용된 paper, result, insight, citation 상태

주요 객체:

- `Draft`
- `Writing Section`
- `Citation`
- `Evidence Bundle`
- `AI Suggestion`

주요 액션:

- `Generate section`
- `Insert evidence`
- `Accept suggestion`
- `Export`

모바일 구조:

- 모바일은 장문 작성보다 검토와 승인에 초점을 둔다.
- 섹션별 preview, suggestion accept, evidence check를 우선한다.
- 본문 편집은 full-screen editor로 전환한다.

데스크톱 구조:

- 좌측은 outline, 중앙은 editor, 우측은 sources/evidence panel이다.
- Writing은 `Insight`의 선택된 카드와 연결되어야 하며, 출처 없는 문장 생성을 줄여야 한다.

탭 산출물:

`Draft Section`

- section body
- inserted insights
- linked citations
- unresolved evidence gaps

## 5. 크로스 탭 핸드오프

### 5.1 Search + Reading -> Research + Result

액션: `Send to Lab`

전달 패킷: `Reading Packet`

포함 항목:

- paper id
- selected text or highlights
- method parameters
- extracted dataset and model details
- user question
- reproduction risk notes

도착 위치:

- `Research + Result` 탭의 `Plan` 모드
- 이미 plan이 있으면 해당 plan detail로 이동

### 5.2 Research + Result -> Insight

액션: `Extract insight`

전달 패킷: `Result Dossier`

포함 항목:

- experiment id
- metric deltas
- analyst explanation
- failure causes
- user notes
- suggested hypothesis candidates

도착 위치:

- `Insight` 탭의 `Evidence` 또는 `Claims` 모드

### 5.3 Insight -> Writing

액션: `Send to Writing`

전달 패킷: `Insight Card`

포함 항목:

- claim
- linked evidence
- confidence
- citation candidates
- preferred writing section

도착 위치:

- `Writing` 탭의 `Outline` 또는 target section

### 5.4 Writing -> Insight 또는 Research + Result

Writing 중 근거가 부족한 문장은 역방향 작업을 생성할 수 있어야 한다.

- 근거 부족: `Insight`에 evidence gap 생성
- 추가 검증 필요: `Research + Result`에 follow-up experiment 생성

## 6. 라우팅 및 상태 모델

상위 네비게이션은 새 `tab` 단위를 가진다.

```text
papers   -> Search + Reading
lab      -> Research + Result
insight  -> Insight
writing  -> Writing
```

기존 stage는 하위 모드 또는 alias로 유지한다.

```text
search   -> papers/discover
reading  -> papers/reader
research -> lab/plan
result   -> lab/compare
results  -> lab/compare
insight  -> insight/claims
insights -> insight/claims
writing  -> writing/draft
```

권장 상태 구조:

```text
activeTab
activeMode
activeProjectId
activePaperId
activeReadingSessionId
activeResearchPlanId
activeExperimentId
activeInsightId
activeDraftId
```

이 구조를 쓰면 기존 6단계 deep link를 깨지 않고 4탭 네비게이션으로 전환할 수 있다.

## 7. 모바일 네비게이션 설계

하단 네비게이션은 4개 항목만 둔다.

1. `Read`
2. `Lab`
3. `Insight`
4. `Write`

모바일 규칙:

- 각 탭은 최소 44px 이상의 터치 영역을 가진다.
- safe area inset을 포함해 하단 여백을 확보한다.
- 현재 작업 중인 paper, run, draft가 있으면 탭 진입 시 해당 context를 우선 복원한다.
- 하위 모드는 탭 안의 segmented control 또는 상단 context switcher로 둔다.
- 2개 이상의 패널을 동시에 보여주지 않는다. 필요한 상세는 sheet, drawer, full-screen detail 중 하나로 연다.

## 8. 데스크톱 네비게이션 설계

데스크톱 좌측 네비게이션도 4탭으로 줄인다.

권장 구성:

- Workspace switcher
- Global search
- Project list
- 4 workflow tabs
- Account and settings

각 탭 안에서는 상단에 하위 모드를 둔다.

- `Search + Reading`: Discover, Library, Reader
- `Research + Result`: Plan, Runs, Compare
- `Insight`: Evidence, Claims, Hypotheses, Decisions
- `Writing`: Outline, Draft, Sources

단축키는 기존 1~6에서 1~4 중심으로 재편한다.

- `Cmd/Ctrl + 1`: Search + Reading
- `Cmd/Ctrl + 2`: Research + Result
- `Cmd/Ctrl + 3`: Insight
- `Cmd/Ctrl + 4`: Writing

기존 1~6 단축키는 한동안 alias로 유지하거나, 하위 모드 이동으로 재정의한다.

## 9. 구현 계획

### Sprint 1. 네비게이션 모델 전환

목표: 4탭 상위 구조를 도입하되 기존 6단계 라우팅을 깨지 않는다.

작업:

- `WORKFLOW_STAGES`를 직접 네비게이션에 쓰는 구조를 `WORKFLOW_TABS`와 `STAGE_ALIAS`로 분리한다.
- 기존 stage id를 새 tab/mode로 매핑한다.
- 모바일 하단 네비게이션을 4개 항목으로 줄인다.
- 데스크톱 사이드바도 4개 항목으로 줄인다.
- `Cmd/Ctrl + 1~4`를 새 탭 기준으로 연결한다.
- 기존 deep link와 stage 기반 상태는 alias로 호환한다.

검증:

- 기존 `Search`, `Reading`, `Research`, `Result`, `Insight`, `Writing` 경로가 모두 대응 탭으로 열린다.
- 모바일 하단 네비게이션에 4개 항목만 보인다.
- 탭 전환 시 현재 project context가 유지된다.

### Sprint 2. Search + Reading 통합

목표: 현재 가장 실사용에 가까운 수집과 리딩 흐름을 하나의 탭으로 묶는다.

작업:

- Search 화면을 `Discover` 모드로 이동한다.
- Reading Home과 PDF Reader를 `Library`, `Reader` 모드로 정리한다.
- 열린 paper context가 Discover, Library, Reader 사이에서 유지되게 한다.
- `Read` CTA와 `Send to Lab` CTA의 위치를 일관화한다.
- 모바일에서는 `Continue Reading`을 첫 화면 우선순위로 둔다.

검증:

- 검색 결과에서 `Read`를 누르면 같은 탭의 Reader 모드로 이동한다.
- Reader에서 `Send to Lab`을 누르면 `Research + Result`의 Plan 모드로 이동한다.
- 모바일에서 Search 결과, Reader, Chat이 각각 한 화면 작업으로 보인다.

### Sprint 3. Research + Result 통합

목표: 재현 준비와 결과 비교를 하나의 실행 탭으로 연결한다.

작업:

- Research 화면을 `Plan`, `Runs` 모드로 정리한다.
- Result 화면을 `Compare` 모드로 흡수한다.
- Reading에서 넘어온 payload를 Research Plan context로 표시한다.
- 실험 결과가 없을 때는 빈 테이블보다 다음 액션 중심 empty state를 보여준다.
- 모바일에서는 table 대신 run status card를 우선한다.

검증:

- `Send to Lab`으로 들어온 paper가 Plan 모드에서 명확히 보인다.
- Result 비교는 `Research + Result` 탭 안에서 열린다.
- 실제 연결이 없는 액션은 비활성 또는 명시적 준비 상태로 표시된다.

### Sprint 4. Insight 산출물화

목표: Insight를 메모 화면이 아니라 근거 기반 판단 보드로 만든다.

작업:

- Reading Packet과 Result Dossier에서 evidence를 받을 수 있는 구조를 만든다.
- Insight Card에 claim, evidence, confidence, next action을 표시한다.
- `Send to Writing`과 `Create follow-up experiment` 액션을 분리한다.
- 모바일 카드는 한 번에 하나씩 검토하는 구조로 설계한다.

검증:

- Result의 analyst 설명을 Insight evidence로 승격할 수 있다.
- Insight Card에서 출처를 역추적할 수 있다.
- Insight에서 Writing으로 보낼 때 target section을 선택할 수 있다.

### Sprint 5. Writing 연결

목표: Writing을 고립된 에디터가 아니라 Insight와 evidence를 사용하는 작성 공간으로 만든다.

작업:

- Outline, Draft, Sources 모드를 도입한다.
- Insight Card를 Draft Section에 삽입할 수 있게 한다.
- 출처 없는 AI draft가 생기지 않도록 evidence panel을 항상 연결한다.
- 모바일은 초안 검토와 suggestion accept 중심으로 정리한다.

검증:

- Insight에서 보낸 card가 Writing의 target section에 나타난다.
- Draft 문장과 evidence link가 함께 표시된다.
- Export 전 unresolved evidence gap을 확인할 수 있다.

### Sprint 6. 접근성, 반응형, 회귀 검증

목표: 네비게이션 재편이 기존 UX와 품질 기준을 깨지 않게 한다.

작업:

- 4탭 하단 네비게이션의 터치 영역, focus ring, safe area를 검증한다.
- 기존 stage alias에 대한 단위 테스트를 추가한다.
- 주요 플로우별 smoke test를 만든다.
- 문서의 6단계 명세를 4탭 구조에 맞게 갱신한다.

검증:

- lint, unit test, build가 통과한다.
- 모바일 폭에서 텍스트 겹침과 horizontal overflow가 없다.
- 기존 URL 또는 stage 이동이 모두 새 탭으로 안정적으로 연결된다.

## 10. 수용 기준

- 상위 네비게이션은 데스크톱과 모바일 모두 4탭으로 보인다.
- 기존 6단계는 하위 모드, alias, 데이터 상태로 보존된다.
- Search와 Reading의 기존 기능은 손실 없이 같은 탭 안에서 왕복 가능하다.
- Reading에서 Research로 넘기는 payload는 `Research + Result` 탭의 Plan 모드로 연결된다.
- Result는 별도 상위 탭이 아니라 `Research + Result`의 Compare 모드로 작동한다.
- Insight는 출처가 있는 주장과 가설을 관리한다.
- Writing은 Insight와 evidence를 받아 초안을 구성한다.
- 모바일 하단 네비게이션은 4개 항목, 44px 이상 터치 영역, safe area 대응을 만족한다.
- 실제로 작동하지 않는 버튼은 실행 가능한 것처럼 보이지 않는다.

## 11. 리스크와 대응

### 리스크 1. Search 진입성이 약해질 수 있다

대응:

- `Search + Reading` 탭 안의 상단 command bar는 항상 검색 진입점으로 유지한다.
- 모바일 첫 화면은 Continue Reading을 우선하되, 검색 입력은 한 탭 안에서 즉시 접근 가능해야 한다.

### 리스크 2. Research와 Result가 합쳐지며 의미가 흐려질 수 있다

대응:

- 탭 이름은 합치되 하위 모드 `Plan`, `Runs`, `Compare`를 명확히 분리한다.
- 사용자에게는 "실험실"이라는 작업 은유를 유지한다.

### 리스크 3. 기존 route와 단축키가 깨질 수 있다

대응:

- `STAGE_ALIAS`를 만들어 기존 stage id를 모두 보존한다.
- 기존 1~6 단축키는 일정 기간 compatibility layer로 유지한다.

### 리스크 4. 미구현 기능이 완성된 것처럼 보일 수 있다

대응:

- placeholder UI는 명시적으로 disabled, draft, setup required 상태를 표시한다.
- 실제 저장이나 agent run이 없는 CTA는 primary button으로 두지 않는다.

## 12. 권장 착수 순서

가장 먼저 할 일은 전체 화면을 한꺼번에 재디자인하는 것이 아니라 네비게이션 모델을 분리하는 것이다.

권장 순서:

1. `WORKFLOW_TABS`와 `STAGE_ALIAS`를 추가한다.
2. 모바일/데스크톱 네비게이션을 4탭으로 바꾼다.
3. 기존 Search와 Reading을 `Search + Reading` 탭 안에서 묶는다.
4. Reading의 `Send to Research`를 `Send to Lab` 흐름으로 정리한다.
5. 그 다음 `Research + Result`의 empty state와 result compare를 정리한다.

이 순서가 좋은 이유는 현재 실사용 가치가 가장 높은 수집과 리딩 흐름을 먼저 안정화하면서, 아직 덜 연결된 후반 단계가 과장되어 보이는 문제를 줄일 수 있기 때문이다.
