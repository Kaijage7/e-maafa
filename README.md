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

## Deploy (recommended)

**Full step-by-step guide:** [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)

| Path | Use | How |
|------|-----|-----|
| **A — Laptop** | Lab / first look | `./scripts/deploy-quickstart.sh` → http://localhost:8081 |
| **B — Staging HTTPS** | No public DNS | `./scripts/deploy-quickstart.sh --tls-local` → https://localhost:8443 |
| **C — Production** | Real hostname + TLS | Image tags + `docker-compose.prod.yml` (see guide) |

Compose is **packaging**, not a go-live certificate. Technical Docker notes + operator checklist: `docs/go-live/DOCKER-DEPLOY.md`.  
Secret check (refuse lab defaults on shared hosts): `./scripts/check-deploy-secrets.sh --enforce`

```bash
# Path A — easiest
cd dmis-platform
./scripts/deploy-quickstart.sh
# UI → http://localhost:8081

# Path B — internal HTTPS (browser cert warning expected)
./scripts/deploy-quickstart.sh --tls-local
curl -k https://localhost:8443/

# Path C — production (build host)
./scripts/docker-release.sh 2026.07.14
# on server: .env from docs/env.prod.example, then
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Production cutover

Deploy the stack with **`docs/DEPLOYMENT.md`** (Path C), then complete acceptance:

**`docs/go-live/00-INDEX.md`**

1. Copy `docs/env.prod.example` to the secret store (JWT, CORS, DB, optional M-Gov/SMTP).
2. Follow `docs/GO-LIVE-RUNBOOK.md` for env detail.
3. Smoke: `./scripts/go-live-smoke.sh`.
4. Sign `docs/go-live/04-ACCEPTANCE.md` before claiming go-live.

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
