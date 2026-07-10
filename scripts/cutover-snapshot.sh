#!/usr/bin/env bash
# Capture a go-live readiness + integrity snapshot for cutover records.
# Usage:
#   AUTH_HEADER='X-Local-Roles: Super Admin' ./scripts/cutover-snapshot.sh
#   LOGIN_EMAIL=admin@example.com LOGIN_PASSWORD=… ./scripts/cutover-snapshot.sh
#   AUTH_HEADER="Authorization: Bearer $TOKEN" ./scripts/cutover-snapshot.sh
set -euo pipefail
BASE="${BASE_URL:-http://127.0.0.1:8080/api}"
AUTH="${AUTH_HEADER:-X-Local-Roles: Super Admin}"
OUT_DIR="${OUT_DIR:-/tmp/dmis-cutover-snapshots}"
TS=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$OUT_DIR"
OUT="${OUT_DIR}/snapshot-${TS}.json"

if [[ -n "${LOGIN_EMAIL:-}" && -n "${LOGIN_PASSWORD:-}" ]]; then
  code=$(curl -s -o /tmp/cut-login -w '%{http_code}' -X POST "${BASE}/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${LOGIN_EMAIL}\",\"password\":\"${LOGIN_PASSWORD}\"}")
  [[ "$code" == "200" ]] || { echo "login failed HTTP $code"; exit 1; }
  token=$(python3 -c "import json;d=json.load(open('/tmp/cut-login'));assert d.get('status')=='OK';print(d['token'])")
  AUTH="Authorization: Bearer ${token}"
fi

python3 - <<PY
import json, urllib.request, datetime
base = "${BASE}"
auth = "${AUTH}"
out = "${OUT}"

def get(path):
    req = urllib.request.Request(base + path, headers={"Authorization": auth.split(" ",1)[1] if auth.startswith("Authorization: ") else "",
                                                        "X-Local-Roles": auth.split(": ",1)[1] if auth.startswith("X-Local-Roles") else ""})
    # rebuild headers cleanly
    headers = {}
    if auth.startswith("Authorization: "):
        headers["Authorization"] = auth[len("Authorization: "):]
    elif auth.startswith("X-Local-Roles:"):
        headers["X-Local-Roles"] = auth.split(":",1)[1].strip()
    req = urllib.request.Request(base + path, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)

def get_public(path):
    with urllib.request.urlopen(base + path, timeout=30) as r:
        return json.load(r)

snap = {
    "capturedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "baseUrl": base,
    "health": get_public("/actuator/health"),
    "readiness": get("/v1/ops/go-live-readiness"),
    "integrity": get("/v1/ops/integrity-summary"),
}
# strip any accidental token-ish fields if present (none expected)
with open(out, "w") as f:
    json.dump(snap, f, indent=2, default=str)
print(out)
# brief console summary
r = snap["readiness"]
print("honestCertificate:", r.get("honestCertificate"))
print("blockers:", r.get("blockersOrAccept"))
print("flyway:", (r.get("gl04_database") or {}).get("flywayMaxVersion"))
print("gl06:", r.get("gl06_staffingSeats"))
print("integrity:", (snap.get("integrity") or {}).get("summary") or snap.get("integrity"))
PY
