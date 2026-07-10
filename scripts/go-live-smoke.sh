#!/usr/bin/env bash
# space02 GO-LIVE-RUNBOOK §3 smoke pack (local or prod).
#
# Usage:
#   # Local persona (never on public edge):
#   ./scripts/go-live-smoke.sh
#
#   # Real JWT (preferred for cutover):
#   AUTH_HEADER="Authorization: Bearer $TOKEN" ./scripts/go-live-smoke.sh
#
#   # Login then smoke (uses email/password once):
#   LOGIN_EMAIL=admin@example.com LOGIN_PASSWORD=admin ./scripts/go-live-smoke.sh
#
# Env:
#   BASE_URL          default http://127.0.0.1:8080/api
#   AUTH_HEADER       default X-Local-Roles: Super Admin
#   WAIT_HEALTH_SECS  default 60 — wait for actuator UP before checks
#   LOGIN_EMAIL / LOGIN_PASSWORD — optional; mints Bearer and overrides AUTH_HEADER
set -euo pipefail

BASE="${BASE_URL:-http://127.0.0.1:8080/api}"
AUTH="${AUTH_HEADER:-X-Local-Roles: Super Admin}"
WAIT_HEALTH_SECS="${WAIT_HEALTH_SECS:-60}"
fail=0
pass=0

wait_health() {
  local i code
  for i in $(seq 1 "$WAIT_HEALTH_SECS"); do
    code=$(curl -s -o /tmp/gl-health -w '%{http_code}' "${BASE}/actuator/health" || echo 000)
    if [[ "$code" == "200" ]] && grep -q '"status":"UP"' /tmp/gl-health 2>/dev/null; then
      echo "health UP after ${i}s"
      return 0
    fi
    sleep 1
  done
  echo "WARN: health not UP within ${WAIT_HEALTH_SECS}s (last code=${code:-?}) — continuing"
  return 0
}

maybe_login() {
  if [[ -z "${LOGIN_EMAIL:-}" || -z "${LOGIN_PASSWORD:-}" ]]; then
    return 0
  fi
  local body code
  code=$(curl -s -o /tmp/gl-login -w '%{http_code}' -X POST "${BASE}/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${LOGIN_EMAIL}\",\"password\":\"${LOGIN_PASSWORD}\"}")
  if [[ "$code" != "200" ]]; then
    echo "FAIL login HTTP $code $(head -c 160 /tmp/gl-login)"
    exit 1
  fi
  local status token
  status=$(python3 -c "import json;print(json.load(open('/tmp/gl-login')).get('status',''))" 2>/dev/null || true)
  token=$(python3 -c "import json;print(json.load(open('/tmp/gl-login')).get('token') or '')" 2>/dev/null || true)
  if [[ "$status" != "OK" || -z "$token" ]]; then
    echo "FAIL login status=$status (need full OK session; MFA/password-change not handled by smoke)"
    head -c 240 /tmp/gl-login; echo
    exit 1
  fi
  AUTH="Authorization: Bearer ${token}"
  echo "login OK as ${LOGIN_EMAIL} (JWT smoke mode)"
}

check() {
  local expect="$1" path="$2" auth="${3:-1}"
  local code
  if [[ "$auth" == "0" ]]; then
    code=$(curl -s -o /tmp/gl-smoke-body -w '%{http_code}' "${BASE}${path}" || echo 000)
  else
    code=$(curl -s -o /tmp/gl-smoke-body -w '%{http_code}' -H "$AUTH" "${BASE}${path}" || echo 000)
  fi
  if [[ "$code" == "$expect" ]]; then
    echo "PASS $code $path"
    pass=$((pass + 1))
  else
    echo "FAIL got=$code expect=$expect $path"
    fail=$((fail + 1))
  fi
}

echo "=== GO-LIVE smoke against $BASE ==="
wait_health
maybe_login

check 200 "/actuator/health" 0
check 200 "/v1/response/incidents"
check 200 "/v1/response/allocations"
check 200 "/v1/warehouses"
check 200 "/v1/ew/dmd/consolidated"
check 200 "/v1/ew/dmd/impact-support?day=1"
check 200 "/v1/finance/economics"
check 200 "/v1/monitoring-evaluation/dashboard"
check 200 "/v1/settings/roles"
check 200 "/v1/ops/go-live-readiness"
check 200 "/v1/ops/integrity-summary"
check 401 "/v1/settings/users" 0

echo "=== results pass=$pass fail=$fail ==="
[[ "$fail" -eq 0 ]]
