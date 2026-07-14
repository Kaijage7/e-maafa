# e-MAAFA / DMIS platform

National disaster management information system (Tanzania PMO-DMD): Spring Boot API + Angular SPA + PostgreSQL.

## Honesty

- **Self-issued JWT** is the authentication source of truth (Keycloak realm files are not live SSO unless separately engineered).
- **National systems** (NIDA, LATRA, NAPA, live IFMIS) are **planned** adapters — not claimed live.
- **No AI product** in this stack; impact-support uses deterministic INFORM joins.
- Deploy with **`prod`** profile only on the public edge. Never expose `local`.

## Quick start (local process)

```bash
# Postgres on :5440 (docker compose db service or start-all.sh)
# Backend
cd backend && mvn -DskipTests package
java -jar target/dmis-platform-0.1.0.jar --spring.profiles.active=local

# Frontend
cd frontend && npm install && npm start
```

## Docker

Compose is packaging, not a go-live certificate. Guide: **`docs/go-live/DOCKER-DEPLOY.md`**.

```bash
cp .env.example .env   # set DMIS_AUTH_JWT_SECRET (and strong DB_PASSWORD for anything beyond laptop)
docker compose up --build
# UI http://localhost:8081  (API via /api, PDF via /ew-api)
```

Production-style (image tags + TLS edge):

```bash
./scripts/docker-release.sh 2026.07.14
# on server: set image env + secrets, then
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Production cutover

Start with the go-live document set (SRS, SDD, plan, acceptance, honesty, Docker):

**`docs/go-live/00-INDEX.md`**

Then:

1. Copy `docs/env.prod.example` to the secret store (JWT, CORS, DB, optional M-Gov/SMTP).
2. Follow `docs/GO-LIVE-RUNBOOK.md` for env detail.
3. Smoke: `./scripts/go-live-smoke.sh`.

## Key ops APIs

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/ops/go-live-readiness` | Honesty board + integrity snapshot |
| `GET /api/v1/ops/integrity-summary` | Residual integrity counts |
| `GET /api/v1/ops/integration-registry` | Planned/configured/live endpoints |

## Stack

- Java 21 · Spring Boot 3.3 · Flyway (baseline @ V122, forward migrations)
- Angular 18 · PostgreSQL 16+

## Licence / ownership

Government of Tanzania — PMO Disaster Management Department (implementation vehicle: e-MAAFA / DMIS).
