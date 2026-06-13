# Lab Runner Sandbox Threat Model

작성일: 2026-06-14

## 범위

Lab runner는 논문 재현 명령을 실행해 log, metric, artifact를 수집하는 경계다. 기본 정책은 안전한 fixture 실행을 먼저 허용하고, destructive command, workspace escape, secret exposure, network egress는 자동 실행하지 않는다.

## 위협 모델

### Command

- 허용 명령: `python`, `python3`, `node`, `npm`, `uv`, `bash`
- 차단 명령: `rm`, `dd`, `mkfs`, `shred` 등 파괴적 명령
- 위험 인자: `-rf`, `--no-preserve-root`
- 기본 정책: 위험 명령은 `allowedToRun=false`, `requiresApproval=true`

### File

- `cwd`와 명령 인자는 승인된 workspace 상대 경로 안에 있어야 한다.
- 절대 경로, `..`, `../`, 내부 `../` 경로는 workspace escape로 분류한다.
- artifact path는 이후 runner adapter에서 같은 경로 정책을 사용해야 한다.

### Network

- runner command의 기본 network 정책은 `disabled`다.
- `network=enabled`는 medium risk로 분류하고 human approval 없이는 실행하지 않는다.
- 운영 runner는 container 또는 VM egress rule로 이 정책을 강제해야 한다.

### Secret

- `token`, `secret`, `password`, `credential`, `apiKey`, `auth` 계열 env key는 command contract에서 제거한다.
- secret-like env가 입력되면 risk category `secret`으로 기록하고 자동 실행을 차단한다.
- runner subprocess에는 기본 앱 환경 변수를 그대로 전달하지 않는다.

### Timeout And Cost

- 기본 timeout은 300초다.
- 600초를 넘는 timeout은 risk category `timeout`으로 분류하고 approval을 요구한다.
- 장기 실행 job과 비용 추적은 observability/release gate 작업에서 별도 metric으로 연결한다.

## 현재 구현 경계

- command contract: `services/backend/lib/lab-runner-safety.mjs`
- 검증: `services/backend/tests/lab-runner-safety.test.mjs`
- 현재 단계는 실행 adapter 전 안전 계약이다. 실제 subprocess/container 실행은 이 계약을 통과한 명령만 받아야 한다.

## 완료 기준

- low risk fixture command는 approval 없이 실행 가능해야 한다.
- destructive, path traversal, secret exposure는 자동 실행 차단이어야 한다.
- network와 long timeout은 approval-required 상태여야 한다.
- sandboxed runner adapter는 이 risk result를 우회하지 않아야 한다.
