#!/usr/bin/env bash
# Smoke the authenticated GraphQL WebSocket upgrade (graphql-transport-ws).
# Usage:
#   API_BASE=http://127.0.0.1:8080/api EMAIL=admin@example.com PASSWORD='Password@2026' \
#     ./scripts/smoke-graphql-ws.sh
set -euo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:8080/api}"
EMAIL="${EMAIL:-admin@example.com}"
PASSWORD="${PASSWORD:-Password@2026}"

login=$(curl -sS -X POST "${API_BASE}/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")
token=$(python3 -c "import json,sys; print(json.load(sys.stdin)['token'])" <<<"$login")
if [[ -z "$token" ]]; then
  echo "FAIL: could not obtain login token" >&2
  exit 1
fi

# HTTP upgrade probe — expects 101 Switching Protocols from Spring GraphQL websocket transport.
# Full graphql-transport-ws handshake still needs a client (Apollo/native); this proves the path
# accepts Upgrade + bearer through the app (or edge proxy when API_BASE points at it).
code=$(curl -sS -o /tmp/dmis-gql-ws.headers -w '%{http_code}' \
  -H "Authorization: Bearer ${token}" \
  -H 'Connection: Upgrade' \
  -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' \
  -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  -H 'Sec-WebSocket-Protocol: graphql-transport-ws' \
  "${API_BASE}/graphql" || true)

echo "WebSocket upgrade HTTP status: ${code}"
if [[ "$code" != "101" ]]; then
  echo "---- response headers ----" >&2
  cat /tmp/dmis-gql-ws.headers >&2 || true
  echo "FAIL: expected 101 Switching Protocols for /graphql websocket upgrade" >&2
  exit 1
fi

echo "PASS: GraphQL WebSocket upgrade accepted (graphql-transport-ws protocol header present)."
exit 0
