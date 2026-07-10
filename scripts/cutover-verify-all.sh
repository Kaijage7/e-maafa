#!/usr/bin/env bash
# Master local cutover verification pack (platform-side).
# Does NOT claim national integrations or production certificate.
#
# Usage (from dmis-platform/):
#   ./scripts/cutover-verify-all.sh
#   BASE_URL=http://127.0.0.1:8080/api ./scripts/cutover-verify-all.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${BASE_URL:-http://127.0.0.1:8080/api}"
export BASE_URL="$BASE"
fail=0

section() { echo; echo "======== $* ========"; }

section "1) Health"
code=$(curl -s -o /tmp/cv-health -w '%{http_code}' "$BASE/actuator/health" || echo 000)
if [[ "$code" == "200" ]] && grep -q '"status":"UP"' /tmp/cv-health; then
  echo "PASS health UP"
else
  echo "FAIL health code=$code body=$(head -c 120 /tmp/cv-health)"
  fail=$((fail + 1))
fi

section "2) Smoke (persona Super Admin)"
if AUTH_HEADER='X-Local-Roles: Super Admin' WAIT_HEALTH_SECS=10 "$ROOT/scripts/go-live-smoke.sh"; then
  echo "PASS smoke 12/12"
else
  echo "FAIL smoke"
  fail=$((fail + 1))
fi

section "3) Integrity summary"
if curl -s -H 'X-Local-Roles: Super Admin' "$BASE/v1/ops/integrity-summary" -o /tmp/cv-integrity.json \
  && python3 - <<'PY'
import json,sys
d=json.load(open("/tmp/cv-integrity.json"))
s=d.get("summary") or d
print("orphans", s.get("orphan_allocations"), s.get("orphan_stock_movements"))
print("missing_area", s.get("incidents_missing_area"))
print("warehouses_unscoped", s.get("warehouses_national_or_unscoped"))
print("geo_inform", s.get("geo_aliases_with_inform"), "/", s.get("geo_aliases"))
print("dual_flags", s.get("incident_status_dual_flags"))
print("unbridged_past", s.get("past_disasters_unbridged"))
ok = (
  s.get("orphan_allocations") == 0
  and s.get("orphan_stock_movements") == 0
  and s.get("warehouses_national_or_unscoped") == 0
  and s.get("incident_status_dual_flags") == 0
  and s.get("geo_aliases_with_inform") == s.get("geo_aliases")
)
print("PASS integrity core zeros" if ok else "FAIL integrity unexpected counts")
sys.exit(0 if ok else 1)
PY
then
  :
else
  echo "FAIL integrity"
  fail=$((fail + 1))
fi

section "4) Cutover snapshot"
if AUTH_HEADER='X-Local-Roles: Super Admin' "$ROOT/scripts/cutover-snapshot.sh"; then
  echo "PASS snapshot written"
else
  echo "FAIL snapshot"
  fail=$((fail + 1))
fi

section "5) Frontend dist present"
if [[ -d "$ROOT/frontend/dist/dmis-web" ]] || [[ -d "$ROOT/frontend/dist/dmis-web/browser" ]]; then
  echo "PASS frontend dist exists"
else
  echo "WARN frontend dist missing — run: cd frontend && npm run build -- --configuration production"
fi

section "6) Env template present"
if [[ -f "$ROOT/docs/env.prod.example" ]]; then
  echo "PASS env.prod.example"
else
  echo "FAIL env.prod.example missing"
  fail=$((fail + 1))
fi

echo
echo "======== SUMMARY fail=$fail ========"
echo "honestCertificate remains false until prod edge + secrets + residual sign-off."
echo "Optional (rate-limited): LOGIN_EMAIL=… LOGIN_PASSWORD=… ./scripts/go-live-smoke.sh"
echo "Optional: ./scripts/go-live-persona-jwt.sh"
[[ "$fail" -eq 0 ]]
