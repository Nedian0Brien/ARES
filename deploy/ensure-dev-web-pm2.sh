#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

RUNTIME_ROOT="${RUNTIME_ROOT:-${ROOT_DIR}/.runtime/dev-web}"
CURRENT_LINK="${CURRENT_LINK:-${RUNTIME_ROOT}/current}"
WEB_PORT="${WEB_PORT:-3100}"
APP_HOST="${APP_HOST:-0.0.0.0}"
PM2_NAME="${PM2_NAME:-ares-web-dev}"
PM2_SAVE="${PM2_SAVE:-1}"
NODE_ENV="${NODE_ENV:-development}"
ARES_LIVE_RELOAD="${ARES_LIVE_RELOAD:-0}"

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

if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  PM2_NAME="$PM2_NAME" \
  ARES_RUNTIME_ROOT="$CURRENT_LINK" \
  WEB_PORT="$WEB_PORT" \
  APP_HOST="$APP_HOST" \
  NODE_ENV="$NODE_ENV" \
  ARES_LIVE_RELOAD="$ARES_LIVE_RELOAD" \
  OPENALEX_API_KEY="${OPENALEX_API_KEY:-}" \
  OPENALEX_MAILTO="${OPENALEX_MAILTO:-}" \
  pm2 restart "${SCRIPT_DIR}/ecosystem.config.cjs" --only "$PM2_NAME" --update-env
else
  PM2_NAME="$PM2_NAME" \
  ARES_RUNTIME_ROOT="$CURRENT_LINK" \
  WEB_PORT="$WEB_PORT" \
  APP_HOST="$APP_HOST" \
  NODE_ENV="$NODE_ENV" \
  ARES_LIVE_RELOAD="$ARES_LIVE_RELOAD" \
  OPENALEX_API_KEY="${OPENALEX_API_KEY:-}" \
  OPENALEX_MAILTO="${OPENALEX_MAILTO:-}" \
  pm2 start "${SCRIPT_DIR}/ecosystem.config.cjs" --only "$PM2_NAME" --update-env
fi

if [[ "$PM2_SAVE" == "1" ]]; then
  pm2 save
fi

echo "✓ PM2 반영 완료"
