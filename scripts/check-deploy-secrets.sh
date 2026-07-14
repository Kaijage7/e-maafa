#!/usr/bin/env bash
# Pre-deploy secret hygiene for e-MAAFA / DMIS (Phase F / D5).
#
# Usage (from dmis-platform/):
#   ./scripts/check-deploy-secrets.sh              # warn on weak defaults; exit 0
#   ./scripts/check-deploy-secrets.sh --enforce    # fail on weak DB password / JWT
#   DMIS_ENFORCE_STRONG_SECRETS=1 ./scripts/check-deploy-secrets.sh
#
# Load values from .env if present (does not export secrets to the parent shell).
# Does NOT claim go-live. Prod overlay still independently requires strong secrets.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENFORCE=0
ENV_FILE="${ENV_FILE:-.env}"

for arg in "$@"; do
  case "$arg" in
    --enforce) ENFORCE=1 ;;
    --env=*) ENV_FILE="${arg#--env=}" ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

if [[ "${DMIS_ENFORCE_STRONG_SECRETS:-0}" == "1" || "${DMIS_ENFORCE_STRONG_SECRETS:-}" == "true" ]]; then
  ENFORCE=1
fi

# shellcheck disable=SC1090
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # Only load simple KEY=VALUE lines (no command substitution).
  # shellcheck disable=SC1091
  source <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$ENV_FILE" | sed 's/\r$//')
  set +a
fi

warns=0
fails=0

note() { echo "  - $*" >&2; }
warn() { echo "WARN: $*" >&2; warns=$((warns + 1)); }
fail() { echo "FAIL: $*" >&2; fails=$((fails + 1)); }

JWT="${DMIS_AUTH_JWT_SECRET:-}"
DBP="${DB_PASSWORD:-}"

# JWT
if [[ -z "$JWT" ]]; then
  fail "DMIS_AUTH_JWT_SECRET is empty (required under Docker prod profile)"
elif [[ "$JWT" == replace-with* || "$JWT" == change-me* || "$JWT" == secret || "$JWT" == dev ]]; then
  fail "DMIS_AUTH_JWT_SECRET looks like a placeholder"
elif [[ ${#JWT} -lt 32 ]]; then
  fail "DMIS_AUTH_JWT_SECRET length ${#JWT} < 32 (use: openssl rand -base64 48)"
else
  note "DMIS_AUTH_JWT_SECRET: set (length ${#JWT})"
fi

# DB password
WEAK_DB=(dmis_pass password pass postgres admin dmis)
db_weak=0
for w in "${WEAK_DB[@]}"; do
  if [[ "$DBP" == "$w" ]]; then
    db_weak=1
    break
  fi
done

if [[ -z "$DBP" ]]; then
  fail "DB_PASSWORD is empty"
elif [[ "$db_weak" -eq 1 ]]; then
  msg="DB_PASSWORD is a known weak lab default ('$DBP') — laptop only; forbidden on public edge"
  if [[ "$ENFORCE" -eq 1 ]]; then
    fail "$msg"
  else
    warn "$msg (set DMIS_ENFORCE_STRONG_SECRETS=1 or --enforce to refuse)"
  fi
elif [[ ${#DBP} -lt 12 ]]; then
  msg="DB_PASSWORD length ${#DBP} < 12 — weak for any shared/public host"
  if [[ "$ENFORCE" -eq 1 ]]; then
    fail "$msg"
  else
    warn "$msg"
  fi
else
  note "DB_PASSWORD: set (not a listed lab default)"
fi

# CORS hint
CORS="${DMIS_SECURITY_CORS_ALLOWED_ORIGINS:-}"
if [[ -z "$CORS" ]]; then
  warn "DMIS_SECURITY_CORS_ALLOWED_ORIGINS is empty (prod overlay will refuse)"
else
  note "CORS: $CORS"
fi

# Public host (prod)
if [[ -n "${DMIS_PUBLIC_HOST:-}" ]]; then
  note "DMIS_PUBLIC_HOST=${DMIS_PUBLIC_HOST}"
  if [[ "$DBP" == "dmis_pass" || "$db_weak" -eq 1 ]]; then
    fail "DMIS_PUBLIC_HOST is set but DB_PASSWORD is still a lab default — do not ship"
  fi
fi

echo
if [[ "$fails" -gt 0 ]]; then
  echo "check-deploy-secrets: $fails failure(s), $warns warning(s) — fix before public edge." >&2
  exit 1
fi

if [[ "$ENFORCE" -eq 1 ]]; then
  echo "check-deploy-secrets: OK (enforce mode, $warns warning(s))"
else
  echo "check-deploy-secrets: OK (warn mode, $warns warning(s))"
  if [[ "$warns" -gt 0 ]]; then
    echo "  Tip: DMIS_ENFORCE_STRONG_SECRETS=1 ./scripts/check-deploy-secrets.sh before shared hosts."
  fi
fi
exit 0
