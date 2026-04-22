#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ECOSYSTEM_FILE="${SCRIPT_DIR}/ecosystem.config.cjs"

RUNTIME_ROOT="${RUNTIME_ROOT:-${ROOT_DIR}/.runtime/dev-web}"
CURRENT_LINK="${CURRENT_LINK:-${RUNTIME_ROOT}/current}"
WEB_PORT="${WEB_PORT:-3100}"
APP_HOST="${APP_HOST:-0.0.0.0}"
PM2_NAME="${PM2_NAME:-ares-web-dev}"
PM2_SAVE="${PM2_SAVE:-1}"
NODE_ENV="${NODE_ENV:-development}"
ARES_LIVE_RELOAD="${ARES_LIVE_RELOAD:-0}"
EXPECTED_CWD="${CURRENT_LINK}"
EXPECTED_EXEC_PATH="${CURRENT_LINK}/services/backend/index.mjs"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "✗ pm2 명령을 찾을 수 없습니다" >&2
  exit 1
fi

if [[ ! -d "$CURRENT_LINK" ]]; then
  echo "✗ current 런타임 디렉터리를 찾을 수 없습니다: $CURRENT_LINK" >&2
  exit 1
fi

echo "▶ PM2 적용"
echo "  name: $PM2_NAME"
echo "  cwd: $CURRENT_LINK"
echo "  host: $APP_HOST"
echo "  port: $WEB_PORT"
echo "  node env: $NODE_ENV"
echo "  live reload: $ARES_LIVE_RELOAD"

run_pm2() {
  PM2_NAME="$PM2_NAME" \
  ARES_RUNTIME_ROOT="$CURRENT_LINK" \
  WEB_PORT="$WEB_PORT" \
  APP_HOST="$APP_HOST" \
  NODE_ENV="$NODE_ENV" \
  ARES_LIVE_RELOAD="$ARES_LIVE_RELOAD" \
  OPENALEX_API_KEY="${OPENALEX_API_KEY:-}" \
  OPENALEX_MAILTO="${OPENALEX_MAILTO:-}" \
  pm2 "$@"
}

pm2_snapshot() {
  pm2 jlist | TARGET_PM2_NAME="$PM2_NAME" node -e '
const fs = require("fs");

const targetName = process.env.TARGET_PM2_NAME;
const apps = JSON.parse(fs.readFileSync(0, "utf8"));
const app = apps.find((entry) => entry && entry.name === targetName);

if (!app) {
  process.exit(1);
}

const env = app.pm2_env || {};
const runtimeEnv = env.env || {};
const values = [
  env.pm_exec_path || "",
  env.pm_cwd || "",
  env.status || "",
  String(runtimeEnv.PORT ?? env.PORT ?? ""),
  String(runtimeEnv.NODE_ENV ?? env.NODE_ENV ?? ""),
];

process.stdout.write(values.join("\n"));
'
}

pm2_needs_recreate() {
  local snapshot
  local current_exec_path
  local current_cwd
  local current_status
  local current_port
  local current_node_env
  local reasons=()

  if ! snapshot="$(pm2_snapshot 2>/dev/null)"; then
    reasons+=("기존 프로세스 메타데이터를 읽지 못함")
  else
    mapfile -t snapshot_lines <<<"$snapshot"
    current_exec_path="${snapshot_lines[0]:-}"
    current_cwd="${snapshot_lines[1]:-}"
    current_status="${snapshot_lines[2]:-}"
    current_port="${snapshot_lines[3]:-}"
    current_node_env="${snapshot_lines[4]:-}"

    if [[ "$current_exec_path" != "$EXPECTED_EXEC_PATH" ]]; then
      reasons+=("exec path 드리프트 (${current_exec_path:-unset} != $EXPECTED_EXEC_PATH)")
    fi

    if [[ "$current_cwd" != "$EXPECTED_CWD" ]]; then
      reasons+=("cwd 드리프트 (${current_cwd:-unset} != $EXPECTED_CWD)")
    fi

    if [[ "$current_status" == "errored" ]]; then
      reasons+=("pm2 status=errored")
    fi

    if [[ -n "$current_port" && "$current_port" != "$WEB_PORT" ]]; then
      reasons+=("port 드리프트 (${current_port} != $WEB_PORT)")
    fi

    if [[ -n "$current_node_env" && "$current_node_env" != "$NODE_ENV" ]]; then
      reasons+=("NODE_ENV 드리프트 (${current_node_env} != $NODE_ENV)")
    fi
  fi

  if (( ${#reasons[@]} == 0 )); then
    return 1
  fi

  printf '▶ 기존 PM2 프로세스를 재생성합니다: %s\n' "${reasons[*]}"
  return 0
}

if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  if pm2_needs_recreate; then
    pm2 delete "$PM2_NAME"
    run_pm2 start "$ECOSYSTEM_FILE" --only "$PM2_NAME" --update-env
  else
    run_pm2 restart "$ECOSYSTEM_FILE" --only "$PM2_NAME" --update-env
  fi
else
  run_pm2 start "$ECOSYSTEM_FILE" --only "$PM2_NAME" --update-env
fi

if [[ "$PM2_SAVE" == "1" ]]; then
  pm2 save
fi

echo "✓ PM2 반영 완료"
