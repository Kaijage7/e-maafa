#!/usr/bin/env bash
# Path A — laptop / lab quickstart for e-MAAFA / DMIS.
#
# Usage (from dmis-platform/):
#   ./scripts/deploy-quickstart.sh
#   ./scripts/deploy-quickstart.sh --no-build   # use existing images
#   ./scripts/deploy-quickstart.sh --tls-local  # Path B: internal HTTPS on :8443
#
# Does NOT claim go-live. Does NOT set production secrets for a public edge.
# See docs/DEPLOYMENT.md

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NO_BUILD=0
TLS_LOCAL=0
for arg in "$@"; do
  case "$arg" in
    --no-build) NO_BUILD=1 ;;
    --tls-local) TLS_LOCAL=1 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (try --help)" >&2
      exit 1
      ;;
  esac
done

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Install Docker Engine + Compose v2." >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required (docker compose)." >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

# Ensure JWT secret is not the placeholder (prod profile refuses weak/empty secrets in real ops)
if grep -qE '^DMIS_AUTH_JWT_SECRET=(replace-with|)$' .env 2>/dev/null \
   || ! grep -qE '^DMIS_AUTH_JWT_SECRET=.+' .env 2>/dev/null; then
  SECRET="$(openssl rand -base64 48 2>/dev/null || head -c 48 /dev/urandom | base64 | tr -d '\n')"
  if grep -qE '^DMIS_AUTH_JWT_SECRET=' .env; then
    # portable in-place replace of the JWT line only
    tmp="$(mktemp)"
    awk -v s="$SECRET" '
      BEGIN { done=0 }
      /^DMIS_AUTH_JWT_SECRET=/ && !done { print "DMIS_AUTH_JWT_SECRET=" s; done=1; next }
      { print }
      END { if (!done) print "DMIS_AUTH_JWT_SECRET=" s }
    ' .env > "$tmp"
    mv "$tmp" .env
  else
    echo "DMIS_AUTH_JWT_SECRET=$SECRET" >> .env
  fi
  echo "Generated DMIS_AUTH_JWT_SECRET in .env"
fi

# CORS default for Path A if still empty
if grep -qE '^DMIS_SECURITY_CORS_ALLOWED_ORIGINS=$' .env 2>/dev/null; then
  if [[ "$TLS_LOCAL" -eq 1 ]]; then
    sed -i 's|^DMIS_SECURITY_CORS_ALLOWED_ORIGINS=$|DMIS_SECURITY_CORS_ALLOWED_ORIGINS=https://localhost:8443|' .env
  else
    sed -i 's|^DMIS_SECURITY_CORS_ALLOWED_ORIGINS=$|DMIS_SECURITY_CORS_ALLOWED_ORIGINS=http://localhost:8081|' .env
  fi
fi

# Phase F / D5 — secret hygiene (warn by default; --enforce or DMIS_ENFORCE_STRONG_SECRETS=1 refuses)
if [[ -x ./scripts/check-deploy-secrets.sh ]]; then
  if [[ "${DMIS_ENFORCE_STRONG_SECRETS:-0}" == "1" || "${DMIS_ENFORCE_STRONG_SECRETS:-}" == "true" ]]; then
    ./scripts/check-deploy-secrets.sh --enforce
  else
    ./scripts/check-deploy-secrets.sh || true
  fi
fi

COMPOSE=(docker compose -f docker-compose.yml)
if [[ "$TLS_LOCAL" -eq 1 ]]; then
  COMPOSE+=(-f docker-compose.tls-local.yml)
fi

echo "Starting e-MAAFA stack (Path $([ "$TLS_LOCAL" -eq 1 ] && echo B || echo A))..."
if [[ "$NO_BUILD" -eq 1 ]]; then
  "${COMPOSE[@]}" up -d
else
  "${COMPOSE[@]}" up --build -d
fi

echo
echo "Waiting for API health (up to ~3 minutes on first Flyway run)..."
ok=0
for i in $(seq 1 90); do
  if curl -fsS http://127.0.0.1:8080/api/actuator/health >/dev/null 2>&1; then
    ok=1
    echo "API health OK after ${i}s"
    break
  fi
  # tls-local still publishes backend on 8080 in base compose unless overridden
  sleep 2
done

if [[ "$ok" -ne 1 ]]; then
  echo "API not healthy yet. Check: docker compose logs backend" >&2
  echo "Continue waiting or open logs; first start can exceed 3 minutes." >&2
fi

echo
if [[ "$TLS_LOCAL" -eq 1 ]]; then
  echo "UI (internal TLS):  https://localhost:8443/   (browser will warn — expected)"
  echo "Smoke:              curl -k https://localhost:8443/api/actuator/health"
else
  echo "UI:                 http://localhost:8081/"
  echo "API health:         http://localhost:8080/api/actuator/health"
  echo "PDF (via UI proxy): http://localhost:8081/ew-api/health"
fi
echo
echo "Guide: docs/DEPLOYMENT.md"
echo "Honesty: this is packaging, not a production go-live certificate."
