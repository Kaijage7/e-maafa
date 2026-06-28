#!/usr/bin/env bash
# Regenerate the fresh-install baseline from a running DMIS database.
#
# A brand-new EMPTY database loaded with the output boots on Spring Boot alone — no Laravel.
# The Flyway migrations cannot replay onto an empty database from V1: the schema started life under
# the old Laravel app, so an early migration (V25) references public.agencies, which a later migration
# only creates with IF NOT EXISTS. On an existing database that table already exists; on an empty one
# it fails. This snapshot captures the complete schema + reference/seed data + the Flyway history at
# the current version, so a fresh database starts already at that version and Flyway just continues.
#
# Usage:  ./generate-baseline.sh [source_db]        (default source_db: dmis)
# Env:    PG_CONTAINER (default dmis-pg), PG_USER (default dmis_app)
#
# PRODUCTION NOTE: this writes the CURRENT data, including demo content and the dev login
# password-hashes (the same accounts the local seeders define). For a clean production baseline,
# run against a clean database, or append --exclude-table-data=public.<table> for the operational
# tables (incidents, *_logs, scanner_*, oh_event*, stock_*, ndmf_*, alerts, resource_notifications…).
set -euo pipefail
DB="${1:-dmis}"
PG_CONTAINER="${PG_CONTAINER:-dmis-pg}"
PG_USER="${PG_USER:-dmis_app}"
OUT="$(cd "$(dirname "$0")" && pwd)/baseline.sql"

docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -d "$DB" --no-owner --no-privileges \
  -n public -n platform -n registry -n incident -n ew -n dissemination -n notification \
  | sed -E 's/^CREATE SCHEMA /CREATE SCHEMA IF NOT EXISTS /' > "$OUT"

echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"
