# e-MAAFA / DMIS platform

National disaster management information system (Tanzania PMO-DMD): Spring Boot API + Angular SPA + PostgreSQL.

## Honesty

- **Self-issued JWT** is the authentication source of truth (Keycloak realm files are not live SSO unless separately engineered).
- **National systems** (NIDA, LATRA, NAPA, live IFMIS) are **planned** adapters — not claimed live.
- **No AI product** in this stack; impact-support uses deterministic INFORM joins.
- Deploy with **`prod`** profile only on the public edge. Never expose `local`.

## Quick start (local)

```bash
# Postgres on :5440 (see docker-compose.yml)
# Backend
cd backend && mvn -DskipTests package
java -jar target/dmis-platform-0.1.0.jar --spring.profiles.active=local

# Frontend
cd frontend && npm install && npm start
```

## Production cutover

1. Copy `docs/env.prod.example` → secret store (JWT, CORS, DB, optional M-Gov/SMTP).
2. Follow **`docs/GO-LIVE-RUNBOOK.md`**.
3. Assessment: **`docs/space02-go-live-assessment.md`**.
4. Smoke: `./scripts/go-live-smoke.sh` · residual board: `./scripts/resolve-cutover-residuals.sh`.

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
