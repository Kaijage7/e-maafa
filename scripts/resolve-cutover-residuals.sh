#!/usr/bin/env bash
# Careful residual resolution check for e-MAAFA / DMIS cutover.
# Does NOT invent national API keys or mark NIDA/LATRA live.
# Usage (from dmis-platform/):
#   ./scripts/resolve-cutover-residuals.sh
#   BASE_URL=http://127.0.0.1:8080/api LOGIN_EMAIL=… LOGIN_PASSWORD=… ./scripts/resolve-cutover-residuals.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${BASE_URL:-http://127.0.0.1:8080/api}"

echo "=== Residual resolve check against $BASE ==="

if [[ -n "${AUTH_HEADER:-}" ]]; then
  AUTH=("-H" "$AUTH_HEADER")
elif [[ -n "${LOGIN_EMAIL:-}" && -n "${LOGIN_PASSWORD:-}" ]]; then
  TOKEN=$(curl -s -X POST "$BASE/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$LOGIN_EMAIL\",\"password\":\"$LOGIN_PASSWORD\"}" \
    | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("accessToken")or d.get("token")or"")')
  if [[ -z "$TOKEN" ]]; then
    echo "FAIL login"
    exit 1
  fi
  AUTH=("-H" "Authorization: Bearer $TOKEN")
else
  AUTH=("-H" "X-Local-Roles: Super Admin")
fi

curl -s "${AUTH[@]}" "$BASE/v1/ops/go-live-readiness" -o /tmp/residual-board.json

python3 <<'PY'
import json, sys
d = json.load(open("/tmp/residual-board.json"))
print("honestCertificate:", d.get("honestCertificate"))
print("meaning:", d.get("honestCertificateMeaning"))
print("profiles:", d.get("activeProfiles"))
print("blockers:", d.get("blockersOrAccept"))
print("residualAccept:", d.get("residualAccept"))
print("gl02:", d.get("gl02_mgov"))
print("gl03:", d.get("gl03_smtp"))
print("gl04:", d.get("gl04_database"))
print("integrity poly/unbridged:", {
  k: (d.get("integrity") or {}).get(k)
  for k in ("poly_link_orphans", "past_disasters_unbridged", "incident_status_dual_flags",
            "geo_aliases_with_inform", "demoHygieneOk")
})
reg = d.get("space02IssueRegister") or []
pending = [r for r in reg if str(r.get("status")) in (
  "OPEN", "OPEN_AT_CUTOVER", "ACCEPT_OR_CONFIGURE", "ACCEPT"
)]
print("pending_count:", len(pending))
for r in pending:
    print(f"  - {r.get('id')}: {r.get('status')} — {r.get('detail')}")
if reg:
    print("SUMMARY:", reg[0].get("status"), reg[0].get("detail"))
# Exit 0 always for report; cutover scripts decide policy
print("OK residual report written /tmp/residual-board.json")
PY

echo
echo "To accept channel residuals on a cutover host (after written sign-off):"
echo "  export DMIS_GO_LIVE_ACCEPT_SMS_DEFERRED=true"
echo "  export DMIS_GO_LIVE_ACCEPT_EMAIL_DEFERRED=true"
echo "  export DMIS_GO_LIVE_ACCEPT_SPARSE_PHONES=true"
echo "  export DMIS_GO_LIVE_ACCEPT_PDF_SIDECAR=true"
echo "  export DMIS_GO_LIVE_ACCEPT_STORAGE_PARTIAL=true"
echo "Then restart API with SPRING_PROFILES_ACTIVE=prod and real JWT/CORS secrets."
echo "See docs/GO-LIVE-RUNBOOK.md residual acceptance table."
