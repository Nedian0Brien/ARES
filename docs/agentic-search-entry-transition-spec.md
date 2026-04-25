# Agentic Search 진입 전환 — 구현 스펙

**대상:** 검색 홈(Search Dashboard)에서 Agent 모드로 검색 버튼을 눌렀을 때
실행 화면으로 자연스럽게 진입하는 전환 동선의 구현자.

**참조 prototype:** `design/agentic-search-cb-v3-enter.html`
**최종 도착 화면:** `design/agentic-search-cb-v3.html`
**시작 화면:** `design/ARES Search Dashboard refined.html`

---

## 0. 한 줄 요약

> home stage 와 run stage 가 같은 자리에 stacked, **opacity 만 교차**. pill 의
> 형태 변형(reshape) 은 사용하지 않는다. 사이에 **140ms 호흡 간격**을 두어
> 두 layer 가 동시에 보이는 구간이 없도록 한다.

---

## 1. 디자인 결정 사항 (구현자가 임의로 바꾸면 안 되는 항목)

| 항목 | 값 | 이유 |
|---|---|---|
| 모션 종류 | **fade only** (opacity + 6~8px translateY) | reshape 모핑은 변형 중인 면이 일그러져 보여 인지 부담을 준다. fade 는 정보 layer 가 바뀌는 느낌이라 자연스럽다. |
| pill 형태 | 끝까지 그대로 유지, 형태 변형 없음 | 형태 변형 시 border-radius 가 사각형이 되는 잔상이 보인다. |
| stage 사이 호흡 간격 | **140ms** | 두 layer 가 동시에 보이면 swap 처럼 느껴진다. |
| translateY 방향 | home: 위로 -8px / run: 아래에서 +6px | 두 stage 의 이동 방향이 일관되어야 시각 부담이 적다. |
| phase area 등장 시점 | run 의 q-block 이 등장한 뒤 stagger | pill 모핑이 정착하기 전에 다른 요소가 들어오면 시선이 분산된다. |
| 총 길이 | **~1.0s** | 너무 길면 답답하고, 너무 짧으면 마법처럼 느껴진다. |

---

## 2. 시간 토큰 (CSS variable)

```css
:root {
  --t-out:  280ms;     /* home fade-out duration */
  --t-in:   360ms;     /* run fade-in  duration */
  --gap:    140ms;     /* 두 stage 사이 호흡 */
  --eaze:   cubic-bezier(.32,.72,.0,1.0);
}
```

**slow-motion 디버그 모드** (선택):
`body.slow-mo { --t-out: 1120ms; --t-in: 1440ms; --gap: 560ms }` 로 모든 토큰을 4배 늘려 모션 검토에 사용.

---

## 3. 마스터 타임라인

| t (ms) | 이벤트 | 대상 element | 변화 |
|---:|---|---|---|
| 0 | click | `.sbtn[data-mode="scout"]` (Agent) | `body.is-pressed` 추가, ring-out 펄스 1회 (700ms) |
| 0 → 280 | home fade-out | `.stage-home` | `opacity: 1→0`, `transform: translateY(0→-8px)` |
| 30 | run 클래스 진입 | `body` | `is-run` 추가 (한 프레임 떨어뜨려서) |
| 280 → 420 | **호흡 간격** | — | 둘 다 0 인 비어있는 구간 |
| 420 → 780 | run fade-in | `.stage-run` | `opacity: 0→1`, `transform: translateY(6px→0)` |
| 600 → 960 | phase divider | `.stage-run .phase-divider` | stagger 180ms (q-block 대비) |
| 740 → 1100 | phase card | `.stage-run .phase-card` | stagger 320ms (q-block 대비) |
| 420 → 780 | topbar crumb swap | `.crumb-start` → `.crumb-running` | 동시에 fade |
| 620 → 980 | run-badge 등장 | `.run-badge` | "Live · 1/32 · 1s" fade-up |

> 모든 stagger 는 transition-delay 로 처리, `setTimeout` 기반 시퀀싱 금지
> (브라우저 이탈/다시 진입 시 동기화 깨짐).

---

## 4. DOM 구조 명세

```html
<body class="">  <!-- is-pressed, is-run, slow-mo 가 토글됨 -->

  <header class="topbar">
    <span class="crumb crumb-start">…홈 breadcrumb…</span>
    <span class="crumb crumb-running">…Run #N breadcrumb…</span>
    <div class="run-badge">Live · 1/32 · 1s</div>
  </header>

  <div class="scroll">
    <!-- 두 stage 가 같은 영역에 stacked (position: absolute; inset: 0) -->
    <div class="stage-home">…Dashboard refined 그대로…</div>
    <div class="stage-run">
      <div class="run-inner">
        <div class="q-block">…</div>
        <div class="phase-divider">…</div>
        <div class="phase-card">…</div>
      </div>
    </div>
  </div>

</body>
```

### 주요 CSS 규칙 (그대로 복제할 것)

```css
.stage-home, .stage-run {
  position: absolute; inset: 0;
  overflow-y: auto; overflow-x: hidden;
}
.stage-home {
  opacity: 1;
  transition: opacity var(--t-out) ease,
              transform var(--t-out) var(--eaze);
}
.stage-run {
  opacity: 0; pointer-events: none;
  transform: translateY(8px);
  transition: opacity var(--t-in) ease,
              transform var(--t-in) var(--eaze);
}
body.is-run .stage-home {
  opacity: 0; pointer-events: none;
  transform: translateY(-8px);
}
body.is-run .stage-run {
  opacity: 1; pointer-events: auto;
  transform: translateY(0);
  transition-delay: calc(var(--t-out) + var(--gap));
}
```

### Stagger 규칙

```css
.stage-run .q-block,
.stage-run .phase-divider,
.stage-run .phase-card {
  opacity: 0; transform: translateY(6px);
  transition: opacity var(--t-in) ease,
              transform var(--t-in) var(--eaze);
}
body.is-run .stage-run .q-block       { opacity: 1; transform: translateY(0); transition-delay: calc(var(--t-out) + var(--gap)) }
body.is-run .stage-run .phase-divider { opacity: 1; transform: translateY(0); transition-delay: calc(var(--t-out) + var(--gap) + 180ms) }
body.is-run .stage-run .phase-card    { opacity: 1; transform: translateY(0); transition-delay: calc(var(--t-out) + var(--gap) + 320ms) }
```

### 클래스 규칙

| 클래스 | 부착 위치 | 의미 |
|---|---|---|
| `is-pressed` | `body` | Agent 버튼 클릭 직후 (ring-out 트리거용) |
| `is-run` | `body` | run stage 활성. is-pressed 와 한 프레임(약 30ms) 차이로 추가 |
| `slow-mo` | `body` | 디버그 모드 (production 빌드에선 dev tool 만 노출) |

---

## 5. JS 트리거 명세

```js
function startTransition() {
  document.body.classList.remove('is-run');
  document.body.classList.add('is-pressed');
  // 한 프레임 떨어뜨려야 transition 이 발화한다
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.add('is-run');
    });
  });
}

function resetTransition() {
  document.body.classList.remove('is-pressed', 'is-run');
}
```

**진입 트리거 (production):**
- Agent 모드의 검색 버튼 클릭
- 검색 input 에서 Enter (Agent 모드일 때만)
- 단축키 ⌘+Enter / Ctrl+Enter (Agent 모드 강제 진입)

**진입 시 동시에 일어나야 할 사이드이펙트:**
1. 현재 query / scope 값을 새 Run 객체로 직렬화 (`POST /api/agent-runs`)
2. URL 변경 — `pushState` 로 `/search/agent/run-{id}` 진입 (back 버튼 호환)
3. 첫 phase(`READER`) 의 SSE / WebSocket 연결 시작
4. run-badge 의 카운터(`1/32 · 1s`) 는 실제 진행 데이터와 바인딩

---

## 6. 엣지 케이스 / 접근성

### 6.1 `prefers-reduced-motion`
사용자가 모션 감소를 요청하면 transition 을 모두 0 으로 만들어 즉시 swap.

```css
@media (prefers-reduced-motion: reduce) {
  :root { --t-out: 0ms; --t-in: 0ms; --gap: 0ms; }
  .sbtn.active[data-mode="scout"] { animation: none !important; }
}
```

### 6.2 키보드 navigation
- 진입 직후 포커스를 **q-text 컨테이너**로 옮길 것 (스크린리더가 새 컨텍스트를 읽도록).
- 진입 도중(280~420ms) tab 키로 home stage 의 사라지는 element 가 포커스되지 않게 — `pointer-events: none` 만으론 부족, `inert` 속성도 함께 부착.

```js
document.querySelector('.stage-home').inert = true;
```

### 6.3 스크린리더
- run stage 가 활성되는 시점에 `aria-live="polite"` 영역에서
  `"Run #2451 시작. Reader 단계 진행 중"` 안내.
- run-badge 의 진행 카운터는 `aria-live="off"` (너무 자주 갱신, 노이즈).

### 6.4 빠른 다중 클릭
- 진입 transition 중(0~780ms) 검색 버튼 비활성화.
- 진입 도중 reset 이 호출되면 `is-pressed`, `is-run` 모두 제거 후
  다음 frame 에 다시 시작 (현재 prototype 의 `playBtn` 패턴 참조).

### 6.5 브라우저 back/forward
- `popstate` 시 stage 토글 클래스만 제거하고 home 으로 복귀.
- run 데이터는 보존 (사용자가 forward 로 다시 들어갈 수 있음).

### 6.6 잘못된 query
- query 가 비어있을 때 Agent 버튼 클릭 → ring-out 만 보여주고 transition 진입 X.
  대신 input 에 focus + shake 애니메이션 1회.

---

## 7. 시각적 검증 체크리스트

구현이 완료되면 아래를 모두 확인:

- [ ] 1× 속도에서 fade out → 호흡 → fade in 의 3단 흐름이 자연스럽게 인지된다.
- [ ] 0.25× slow-motion 으로 봐도 두 stage 가 동시에 보이는 구간이 없다.
- [ ] pill 의 border / box-shadow / radius 가 transition 도중 사각형으로 일그러지지 않는다 (= reshape 잔상 없음).
- [ ] phase divider 와 card 가 q-block 보다 늦게 등장한다 (시선 분산 방지).
- [ ] topbar crumb 가 fade-swap 으로 바뀐다 (위치 점프 없음).
- [ ] run-badge 가 phase content 보다 약간 늦게 들어온다 (200ms 간격).
- [ ] `prefers-reduced-motion: reduce` 에서 transition 이 즉시 swap 으로 바뀐다.
- [ ] tab 키로 사라지는 home stage 의 element 가 포커스되지 않는다.
- [ ] 진입 도중 다시 검색 버튼을 눌러도 깨지지 않는다.

---

## 8. 비-목표 (이 spec 의 범위가 아닌 것)

- run stage 안의 chat 스트리밍 / graph 뷰 동작 — 별도 spec 참조 (`agentic-search-cb-v3.html` 의 동작 명세).
- Keyword Search 의 진입 동선 — 본 spec 은 Agent 모드 한정.
- run 종료 후 home 으로 돌아가는 reverse transition — 동일 토큰 재사용 가능하지만 별도 검증 필요.
- 모바일 반응형 — 본 spec 은 데스크톱 768px 이상 기준.

---

## 9. 참조 파일 (구현자가 펼쳐 두고 작업해야 할 것)

### 9.1 디자인 prototype (시각적 정답지)

| 파일 | 역할 | 무엇을 보아야 하나 |
|---|---|---|
| [design/ARES Search Dashboard refined.html](../design/ARES%20Search%20Dashboard%20refined.html) | **시작 화면** | hero pill, scope chips, KPI/charts/funnel 의 최종 레이아웃과 토큰. 본 전환의 t=0 상태. |
| [design/agentic-search-cb-v3-enter.html](../design/agentic-search-cb-v3-enter.html) | **전환 prototype (정답지)** | fade out → 호흡 → fade in 의 실제 모션. 좌하단 0.25× slow-mo 로 한 프레임씩 검토 가능. |
| [design/agentic-search-cb-v3.html](../design/agentic-search-cb-v3.html) | **도착 화면** | run stage 의 Q-block, phase divider, phase card, run-badge 의 final 형태. 본 전환의 t=종료 상태. |

미리보기 서버는 `localhost:3215` (또는 `https://lawdigest.cloud/proxy/3215/<file>`).

### 9.2 프론트엔드 — 수정이 필요한 코드

| 파일 | 역할 | 핵심 라인 |
|---|---|---|
| [web/app/features/search.js](../web/app/features/search.js) | 검색 홈 / hero pill 의 현재 구현 | L144–210 (`hero-submit` 모드 토글 = Agent/Keyword), L380–409 (dashboard hero), L736–772 (hero-wrap), L825 (`scout` 분기) |
| [web/app.js](../web/app.js) | 메인 라우팅 / 글로벌 state | route 정의, `searchMode` state 보관소 |
| [web/styles.css](../web/styles.css) | 디자인 토큰 / 공유 스타일 | `--bg`, `--search`, `--t3` 등 — §2 의 transition token 을 여기에 추가 |

### 9.3 백엔드 — 진입 시 호출 / SSE 채널

| 파일 | 역할 | 핵심 라인 |
|---|---|---|
| [services/backend/index.mjs](../services/backend/index.mjs) | HTTP routing | L562 (`POST /api/agent-runs` ─ 진입 시 호출), L585 (`GET /:id`), L597 (`POST /:id/actions` ─ 끼어들기), L635 (`GET /api/agent-runs` 목록) |
| [services/backend/lib/agent-runs.mjs](../services/backend/lib/agent-runs.mjs) | run lifecycle 모델 + 서비스 | run 생성·진행·완료·취소 |
| [services/backend/lib/agent-runtime.mjs](../services/backend/lib/agent-runtime.mjs) | phase 실행 엔진 | Reader → Reproduction → Experiment → Analyst 시퀀스 |
| [services/backend/lib/scout-search.mjs](../services/backend/lib/scout-search.mjs) | Agent (scout) 모드 검색 | semantic search 핵심 |
| [services/backend/lib/search-contract.mjs](../services/backend/lib/search-contract.mjs) | search API 계약 | request/response 스키마 |

### 9.4 본 spec 문서

- [docs/agentic-search-entry-transition-spec.md](./agentic-search-entry-transition-spec.md) — 본 문서. 모든 결정과 이유.
- [docs/reading-implementation-checklist.md](./reading-implementation-checklist.md) — Reading 기능 구현 체크리스트. 유사한 진입 동선 사례.

### 9.5 작업 순서 권장안

1. **prototype 분석 (30분)** — `agentic-search-cb-v3-enter.html` 을 0.25× 로 5회 이상 재생, 의도 라벨 펴고 타임라인 암기.
2. **CSS 토큰 이식 (1h)** — §2 의 변수와 §4 의 핵심 CSS 규칙을 `web/styles.css` 로 옮김. 기존 토큰과 이름 충돌 없는지 확인.
3. **DOM 구조 추가 (2h)** — `search.js` 에 `.stage-home` / `.stage-run` 두 레이어 추가. 기존 hero pill 은 `.stage-home` 안으로.
4. **JS 트리거 (1h)** — §5 의 `startTransition` / `resetTransition` 추가. Agent 모드의 submit 핸들러에 연결.
5. **백엔드 연동 (3h)** — `POST /api/agent-runs` 호출, `pushState`, SSE 채널 오픈.
6. **엣지 케이스 (2h)** — §6 의 `prefers-reduced-motion`, `inert`, ARIA, 빠른 다중 클릭 처리.
7. **검증 (1h)** — §7 의 9개 체크리스트 모두 통과.

**총 예상 공수:** 약 10시간 (한 명 기준, prototype 분석 포함).

### 9.6 의존성 / 사전 조건

- `services/backend/lib/agent-runs.mjs` 가 이미 존재 — 본 전환 작업은 이 위에 UI 만 얹는 것.
- 기존 검색 홈의 hero pill, scope chips, dashboard 콘텐츠는 **수정 없이 보존**.
- 본 작업으로 실시간 streaming UI(phase divider, phase card 의 실제 데이터 바인딩)를 함께 만들 필요는 없음 — placeholder 로 두고 후속 ticket 으로 분리 가능.

---

## 10. 변경 이력

| 날짜 | 결정 | 이유 |
|---|---|---|
| 2026-04-25 | reshape 모핑 → fade 로 변경 | reshape 시 형태 변형 잔상이 자연스럽지 않음 |
| 2026-04-25 | stage 사이 140ms 호흡 간격 도입 | 두 layer 동시 노출 시 swap 느낌 발생 |
| 2026-04-25 | phase area 의 stagger 도입 | pill 모핑 정착 전 등장 시 시선 분산 |
