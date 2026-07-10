#!/usr/bin/env bash
# GL-05 area-scope dual-proof using real JWT logins (local demo passwords only).
# Never use demo passwords on a public edge. Rate-limited: keep attempts low.
#
# Usage:
#   ./scripts/go-live-persona-jwt.sh
#   BASE_URL=http://127.0.0.1:8080/api ./scripts/go-live-persona-jwt.sh
set -euo pipefail
BASE="${BASE_URL:-http://127.0.0.1:8080/api}"
fail=0

login() {
  local email="$1" pass="$2"
  local code
  code=$(curl -s -o /tmp/gl-p-login -w '%{http_code}' -X POST "${BASE}/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${email}\",\"password\":\"${pass}\"}")
  if [[ "$code" != "200" ]]; then
    echo "FAIL login $email HTTP $code $(head -c 120 /tmp/gl-p-login)"
    fail=$((fail + 1))
    echo ""
    return 1
  fi
  python3 -c "import json;d=json.load(open('/tmp/gl-p-login'));assert d.get('status')=='OK' and d.get('token');print(d['token'])"
}

expect_code() {
  local label="$1" token="$2" path="$3" want="$4"
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer ${token}" "${BASE}${path}")
  if [[ "$code" == "$want" ]]; then
    echo "PASS $label $code $path"
  else
    echo "FAIL $label got=$code want=$want $path"
    fail=$((fail + 1))
  fi
}

echo "=== GL-05 persona JWT against $BASE ==="
sleep 1
DAS=$(login das@pmo.go.tz password) || true
sleep 1
RAS=$(login ras@pmo.go.tz password) || true
sleep 1
SA=$(login admin@example.com admin) || true

if [[ -n "${DAS:-}" ]]; then
  expect_code DAS-own "$DAS" /v1/response/incidents/3 200
  expect_code DAS-foreign "$DAS" /v1/response/incidents/2 404
fi
if [[ -n "${RAS:-}" ]]; then
  expect_code RAS-own-wh "$RAS" /v1/warehouses/1 200
  expect_code RAS-foreign-wh "$RAS" /v1/warehouses/4 404
  expect_code RAS-foreign-inc "$RAS" /v1/response/incidents/2 404
fi
if [[ -n "${SA:-}" ]]; then
  expect_code SA-inc "$SA" /v1/response/incidents 200
  expect_code SA-foreign-ok "$SA" /v1/response/incidents/2 200
fi

echo "=== results fail=$fail ==="
[[ "$fail" -eq 0 ]]
