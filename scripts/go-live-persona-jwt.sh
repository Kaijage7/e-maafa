#!/usr/bin/env bash
# GL-05 area-scope dual-proof using real JWT logins (local test password only).
# Never use these credentials on a public edge. Rate-limited: keep attempts low.
#
# Uses seeded position accounts (seeded_officer) that LocalTestPasswordSeeder
# sets to Password@2026 under spring.profiles.active=local:
#   DAS  das.<id>@positions.dmis.local
#   RAS  ras.<id>@positions.dmis.local
#
# Usage:
#   ./scripts/go-live-persona-jwt.sh
#   BASE_URL=http://127.0.0.1:8080/api ./scripts/go-live-persona-jwt.sh
set -euo pipefail
BASE="${BASE_URL:-http://127.0.0.1:8080/api}"
# Local-only constant — see LocalTestCredentials / docs/LOCAL-TEST-PASSWORD.md
LOCAL_PW="${LOCAL_TEST_PASSWORD:-Password@2026}"
# Dodoma region seeded seats (stable fixture emails from position seeder)
DAS_EMAIL="${DAS_EMAIL:-das.71923@positions.dmis.local}"   # DAS Dodoma City Council
RAS_EMAIL="${RAS_EMAIL:-ras.70889@positions.dmis.local}"   # RAS Dodoma
SA_EMAIL="${SA_EMAIL:-admin@example.com}"
fail=0

login() {
  local email="$1" pass="$2"
  local code
  sleep 1
  code=$(curl -s -o /tmp/gl-p-login -w '%{http_code}' -X POST "${BASE}/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${email}\",\"password\":\"${pass}\"}")
  if [[ "$code" != "200" ]]; then
    echo "FAIL login $email HTTP $code $(head -c 160 /tmp/gl-p-login)"
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

DAS=$(login "$DAS_EMAIL" "$LOCAL_PW") || true
RAS=$(login "$RAS_EMAIL" "$LOCAL_PW") || true
SA=$(login "$SA_EMAIL" "$LOCAL_PW") || true

# Discover in-scope / out-of-scope IDs from live data (no hard-coded fixture IDs).
python3 - <<PY
import json, os, urllib.request, urllib.error, sys

BASE = "${BASE}"
tokens = {
    "DAS": """${DAS:-}""".strip(),
    "RAS": """${RAS:-}""".strip(),
    "SA": """${SA:-}""".strip(),
}

def get(path, token):
    req = urllib.request.Request(BASE + path, headers={"Authorization": "Bearer " + token, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, None

def first_id(rows, *keys):
    for row in rows or []:
        for k in keys:
            if isinstance(row, dict) and row.get(k) is not None:
                return row[k]
    return None

sa = tokens.get("SA") or ""
ras = tokens.get("RAS") or ""
das = tokens.get("DAS") or ""
if not sa:
    print("SKIP discovery: no Super Admin token", file=sys.stderr)
    sys.exit(0)

# Admin national list → pick an Ilala (or non-Dodoma) incident as foreign
st, body = get("/v1/response/incidents", sa)
rows = (body or {}).get("data") or (body or {}).get("incidents") or []
foreign_inc = None
for r in rows:
    dist = (r.get("district_name") or "")
    reg = (r.get("region_name") or "")
    if reg and reg != "Dodoma":
        foreign_inc = r.get("id")
        break
    if dist and dist not in ("Dodoma", "Dodoma Urban", "Bahi", "Chamwino", "Chemba", "Kondoa", "Kongwa", "Mpwapwa"):
        foreign_inc = r.get("id")
        break
if foreign_inc is None and rows:
    foreign_inc = rows[-1].get("id")

# RAS list → own incident + warehouses
own_inc = None
own_wh = None
foreign_wh = None
if ras:
    st, body = get("/v1/response/incidents", ras)
    rows = (body or {}).get("data") or []
    own_inc = first_id(rows, "id")
    st, body = get("/v1/warehouses", ras)
    whs = (body or {}).get("warehouses") or (body or {}).get("data") or []
    own_wh = first_id(whs, "id")
    # foreign warehouse: admin list pick outside RAS set
    st, body = get("/v1/warehouses", sa)
    all_wh = (body or {}).get("warehouses") or []
    ras_ids = {w.get("id") for w in whs}
    for w in all_wh:
        if w.get("id") not in ras_ids:
            foreign_wh = w.get("id")
            break

# DAS may have zero warehouses; still must not see foreign incident
open("/tmp/gl-p-ids.env", "w").write(
    f"OWN_INC={own_inc or ''}\nFOREIGN_INC={foreign_inc or ''}\nOWN_WH={own_wh or ''}\nFOREIGN_WH={foreign_wh or ''}\n"
)
print(f"discovered OWN_INC={own_inc} FOREIGN_INC={foreign_inc} OWN_WH={own_wh} FOREIGN_WH={foreign_wh}")
PY

# shell-load discovered ids
# shellcheck disable=SC1091
source /tmp/gl-p-ids.env 2>/dev/null || true

if [[ -n "${DAS:-}" && -n "${FOREIGN_INC:-}" ]]; then
  expect_code DAS-foreign "$DAS" "/v1/response/incidents/${FOREIGN_INC}" 404
fi
if [[ -n "${DAS:-}" && -n "${OWN_INC:-}" ]]; then
  # DAS district seat may still 404 RAS-region incidents outside its district — accept 200 or 404;
  # hard requirement is foreign isolation above. Soft-check: list endpoint returns 200.
  expect_code DAS-list "$DAS" /v1/response/incidents 200
fi
if [[ -n "${RAS:-}" && -n "${OWN_INC:-}" ]]; then
  expect_code RAS-own-inc "$RAS" "/v1/response/incidents/${OWN_INC}" 200
fi
if [[ -n "${RAS:-}" && -n "${FOREIGN_INC:-}" ]]; then
  expect_code RAS-foreign-inc "$RAS" "/v1/response/incidents/${FOREIGN_INC}" 404
fi
if [[ -n "${RAS:-}" && -n "${OWN_WH:-}" ]]; then
  expect_code RAS-own-wh "$RAS" "/v1/warehouses/${OWN_WH}" 200
fi
if [[ -n "${RAS:-}" && -n "${FOREIGN_WH:-}" ]]; then
  expect_code RAS-foreign-wh "$RAS" "/v1/warehouses/${FOREIGN_WH}" 404
fi
if [[ -n "${SA:-}" ]]; then
  expect_code SA-inc "$SA" /v1/response/incidents 200
  if [[ -n "${FOREIGN_INC:-}" ]]; then
    expect_code SA-foreign-ok "$SA" "/v1/response/incidents/${FOREIGN_INC}" 200
  fi
fi

echo "=== results fail=$fail ==="
[[ "$fail" -eq 0 ]]
