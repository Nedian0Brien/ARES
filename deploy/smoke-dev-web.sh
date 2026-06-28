#!/usr/bin/env bash
set -euo pipefail

WEB_PORT="${WEB_PORT:-3100}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${WEB_PORT}}"
PROXY_URL="${PROXY_URL:-${BASE_URL}/proxy/${WEB_PORT}}"
SMOKE_RETRIES="${SMOKE_RETRIES:-30}"
SMOKE_SLEEP_SECONDS="${SMOKE_SLEEP_SECONDS:-1}"
EXPECTED_DEPLOY_COMMIT="${EXPECTED_DEPLOY_COMMIT:-}"

check_url() {
  local label="$1"
  local url="$2"
  local attempt

  echo "▶ ${label}: ${url}"
  for ((attempt = 1; attempt <= SMOKE_RETRIES; attempt++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$SMOKE_SLEEP_SECONDS"
  done

  echo "✗ smoke check failed: ${label}" >&2
  return 1
}

check_health_commit() {
  local attempt

  if [[ -z "$EXPECTED_DEPLOY_COMMIT" ]]; then
    return 0
  fi

  echo "▶ deploy commit: ${EXPECTED_DEPLOY_COMMIT}"
  for ((attempt = 1; attempt <= SMOKE_RETRIES; attempt++)); do
    if curl -fsS "${BASE_URL}/api/health" \
      | EXPECTED_DEPLOY_COMMIT="$EXPECTED_DEPLOY_COMMIT" node -e '
const fs = require("fs");

const expected = process.env.EXPECTED_DEPLOY_COMMIT;
const payload = JSON.parse(fs.readFileSync(0, "utf8"));

if (payload && payload.deploy && payload.deploy.commit === expected) {
  process.exit(0);
}

process.exit(1);
' >/dev/null 2>&1; then
      return 0
    fi
    sleep "$SMOKE_SLEEP_SECONDS"
  done

  echo "✗ smoke check failed: deploy commit mismatch" >&2
  return 1
}

check_react_frontend() {
  local attempt
  local root_html
  local js_path
  local css_path

  echo "▶ React frontend: ${PROXY_URL}/"
  for ((attempt = 1; attempt <= SMOKE_RETRIES; attempt++)); do
    root_html="$(curl -fsS "${PROXY_URL}/" 2>/dev/null || true)"
    if [[ "$root_html" == *"data-ares-react-app"* ]]; then
      js_path="$(printf '%s' "$root_html" | sed -nE 's/.*src="([^"]*\/assets\/index-[^"]+\.js)".*/\1/p' | head -n 1)"
      css_path="$(printf '%s' "$root_html" | sed -nE 's/.*href="([^"]*\/assets\/index-[^"]+\.css)".*/\1/p' | head -n 1)"
      if [[ -n "$js_path" && -n "$css_path" ]]; then
        check_url "react app asset" "${PROXY_URL}${js_path}"
        check_url "react styles asset" "${PROXY_URL}${css_path}"
        return 0
      fi
    fi
    sleep "$SMOKE_SLEEP_SECONDS"
  done

  echo "✗ smoke check failed: React frontend assets" >&2
  return 1
}

check_url "health" "${BASE_URL}/api/health"
check_health_commit
check_url "root" "${BASE_URL}/"
check_url "proxy root" "${PROXY_URL}/"
check_url "projects api" "${PROXY_URL}/api/projects"
check_react_frontend

echo "✓ 스모크 테스트 통과"
