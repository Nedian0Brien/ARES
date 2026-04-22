#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

REF_INPUT="${1:-main}"
DEV_WORKTREE_PATH="${DEV_WORKTREE_PATH:-${ROOT_DIR}/.worktrees/dev-web-live}"
RUNTIME_ROOT="${RUNTIME_ROOT:-${ROOT_DIR}/.runtime/dev-web}"
CURRENT_LINK="${RUNTIME_ROOT}/current"
TMP_LINK="${RUNTIME_ROOT}/.current.tmp"
WEB_PORT="${WEB_PORT:-3100}"
APP_HOST="${APP_HOST:-0.0.0.0}"
PM2_NAME="${PM2_NAME:-ares-web-dev}"
PM2_SAVE="${PM2_SAVE:-1}"
NODE_ENV="${NODE_ENV:-development}"
ARES_LIVE_RELOAD="${ARES_LIVE_RELOAD:-0}"
SKIP_GIT_FETCH="${SKIP_GIT_FETCH:-0}"
SKIP_VALIDATION="${SKIP_VALIDATION:-0}"
DEPLOY_HEALTH_TIMEOUT_SECONDS="${DEPLOY_HEALTH_TIMEOUT_SECONDS:-30}"

load_ref() {
  local ref="$1"

  if git -C "$ROOT_DIR" rev-parse --verify "$ref" >/dev/null 2>&1; then
    printf '%s' "$ref"
    return 0
  fi

  if git -C "$ROOT_DIR" rev-parse --verify "origin/$ref" >/dev/null 2>&1; then
    printf '%s' "origin/$ref"
    return 0
  fi

  return 1
}

switch_current_link() {
  local target="$1"

  ln -sfn "$target" "$TMP_LINK"
  mv -Tf "$TMP_LINK" "$CURRENT_LINK"
}

run_validation() {
  if [[ "$SKIP_VALIDATION" == "1" ]]; then
    echo "▶ 검증 생략"
    return 0
  fi

  echo "▶ 코드 검증"
  (
    cd "$DEV_WORKTREE_PATH"
    node --check services/backend/index.mjs
    node --check web/app.js
    npm test
  )
}

install_dependencies() {
  if [[ ! -f "$DEV_WORKTREE_PATH/package.json" ]]; then
    echo "✗ package.json을 찾을 수 없습니다: $DEV_WORKTREE_PATH" >&2
    exit 1
  fi

  echo "▶ 의존성 확인"
  (
    cd "$DEV_WORKTREE_PATH"
    npm install --no-fund --no-audit --package-lock=false
  )
}

wait_for_http_ready() {
  local url="$1"
  local timeout_seconds="$2"
  local i

  for ((i = 1; i <= timeout_seconds; i++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "✗ readiness timeout: $url" >&2
  return 1
}

rollback_runtime() {
  local previous_target="$1"

  if [[ -z "$previous_target" || ! -e "$previous_target" ]]; then
    echo "▶ 롤백 대상이 없어 현재 심링크를 유지합니다"
    return 0
  fi

  echo "▶ 이전 런타임으로 롤백"
  switch_current_link "$previous_target"
  RUNTIME_ROOT="$RUNTIME_ROOT" \
  CURRENT_LINK="$CURRENT_LINK" \
  WEB_PORT="$WEB_PORT" \
  APP_HOST="$APP_HOST" \
  PM2_NAME="$PM2_NAME" \
  PM2_SAVE="$PM2_SAVE" \
  NODE_ENV="$NODE_ENV" \
  ARES_LIVE_RELOAD="$ARES_LIVE_RELOAD" \
  OPENALEX_API_KEY="${OPENALEX_API_KEY:-}" \
  OPENALEX_MAILTO="${OPENALEX_MAILTO:-}" \
  "${SCRIPT_DIR}/ensure-dev-web-pm2.sh"
}

echo "▶ ARES 개발 배포 시작"
echo "  repo: $ROOT_DIR"
echo "  ref input: $REF_INPUT"
echo "  worktree: $DEV_WORKTREE_PATH"
echo "  runtime: $CURRENT_LINK"
echo "  port: $WEB_PORT"
echo "  pm2: $PM2_NAME"
echo "  live reload: $ARES_LIVE_RELOAD"

if [[ "$SKIP_GIT_FETCH" != "1" ]]; then
  echo "▶ git fetch"
  git -C "$ROOT_DIR" fetch origin --prune
fi

RESOLVED_REF="$(load_ref "$REF_INPUT")" || {
  echo "✗ git ref를 찾을 수 없습니다: $REF_INPUT" >&2
  exit 1
}

if [[ ! -d "$DEV_WORKTREE_PATH/.git" && ! -f "$DEV_WORKTREE_PATH/.git" ]]; then
  echo "▶ worktree 생성"
  git -C "$ROOT_DIR" worktree add --detach "$DEV_WORKTREE_PATH" "$RESOLVED_REF"
else
  echo "▶ worktree 업데이트"
  if [[ "$SKIP_GIT_FETCH" != "1" ]]; then
    git -C "$DEV_WORKTREE_PATH" fetch origin --prune
  fi
  git -C "$DEV_WORKTREE_PATH" checkout --detach "$RESOLVED_REF"
fi

mkdir -p "$RUNTIME_ROOT"
PREVIOUS_TARGET="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"

install_dependencies
run_validation

echo "▶ current 심링크 전환"
switch_current_link "$DEV_WORKTREE_PATH"

echo "▶ PM2 개발 서버 반영"
if ! RUNTIME_ROOT="$RUNTIME_ROOT" \
  CURRENT_LINK="$CURRENT_LINK" \
  WEB_PORT="$WEB_PORT" \
  APP_HOST="$APP_HOST" \
  PM2_NAME="$PM2_NAME" \
  PM2_SAVE="$PM2_SAVE" \
  NODE_ENV="$NODE_ENV" \
  ARES_LIVE_RELOAD="$ARES_LIVE_RELOAD" \
  OPENALEX_API_KEY="${OPENALEX_API_KEY:-}" \
  OPENALEX_MAILTO="${OPENALEX_MAILTO:-}" \
  "${SCRIPT_DIR}/ensure-dev-web-pm2.sh"; then
  rollback_runtime "$PREVIOUS_TARGET"
  exit 1
fi

echo "▶ 서버 준비 대기"
if ! wait_for_http_ready "http://127.0.0.1:${WEB_PORT}/api/health" "$DEPLOY_HEALTH_TIMEOUT_SECONDS"; then
  rollback_runtime "$PREVIOUS_TARGET"
  exit 1
fi

echo "▶ 스모크 테스트"
if ! WEB_PORT="$WEB_PORT" "${SCRIPT_DIR}/smoke-dev-web.sh"; then
  rollback_runtime "$PREVIOUS_TARGET"
  exit 1
fi

echo "✓ 개발 배포 완료"
echo "  ref: $RESOLVED_REF"
echo "  commit: $(git -C "$DEV_WORKTREE_PATH" rev-parse --short HEAD)"
echo "  runtime: $CURRENT_LINK"
echo "  url: http://127.0.0.1:${WEB_PORT}"
