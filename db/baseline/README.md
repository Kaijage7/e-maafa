# Fresh-install database baseline — Spring Boot only (no Laravel)

DMIS is **Angular + Spring Boot + PostgreSQL**. Its Flyway migrations were originally written on top
of a `public` schema created by the **legacy Laravel app**, so they **cannot replay onto a brand-new
empty database** from V1 — an early migration (`V25`) references `public.agencies`, a table a later
migration only creates with `IF NOT EXISTS`. On the existing database that table already exists, so
it works; on an empty one it fails.

`baseline.sql` removes that last Laravel dependency. It is a snapshot of the **complete schema +
reference/seed data + the Flyway history** at version 122. A fresh database loads it once; then
Spring's Flyway sees the history already at V122, validates it, and continues from there. **Laravel
is never involved.**

## Fresh install
- **Docker:** `docker compose up`. PostgreSQL auto-runs `baseline.sql` (mounted into
  `/docker-entrypoint-initdb.d`) the first time the data volume is created, then the backend starts.
- **Manual:** `createdb dmis && psql -d dmis -f baseline.sql`, then start the backend.

New migrations (V123, V124, …) apply normally on top via Flyway — **the baseline does not need to be
regenerated for them.** Regenerate only to re-baseline (squash old history): `./generate-baseline.sh`.

## Contents / caveats
- The snapshot carries the **current data**, including demo content and the **dev login
  password-hashes** (the same accounts the local seeders already define — no new secret). For a clean
  production install, regenerate from a clean database (see `generate-baseline.sh`).
- **Verified:** an empty DB + this baseline + the backend boots in ~12s, Flyway runs **no** migrations
  ("Successfully validated 107 migrations … No migration necessary"), and the app serves
  login / portal / incidents (all HTTP 200).
