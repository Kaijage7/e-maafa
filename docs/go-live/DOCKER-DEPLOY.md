# Docker deployment guide

**Product:** e-MAAFA / DMIS  
**Audience:** PMO ICT / deploy operators

## 1. Honesty first

`docker compose up` is a **packaging and process tool**. It is **not**:

- a production go-live certificate  
- proof that SMS, email, or national registry feeds are live  
- a substitute for TLS, strong secrets, or signed acceptance  

Use `docs/go-live/04-ACCEPTANCE.md` for go/no-go. Use `docs/go-live/05-OPS-AND-HONESTY.md` for live vs planned.

## 2. What the stack runs

| Service | Role |
|---------|------|
| `db` | PostgreSQL 16 + baseline + Flyway on backend boot |
| `backend` | Spring Boot API (`prod` profile in compose) |
| `frontend` | Angular static files + nginx (`/api`, `/ew-api`) |
| `ew-pdf` | Bulletin PDF generator (localhost-style, internal only) |
| `edge` (prod overlay) | Caddy TLS terminator on 80/443 |

## 3. Secrets (public edge)

Never deploy with empty JWT or default database password on a public host.

| Variable | Rule |
|----------|------|
| `DMIS_AUTH_JWT_SECRET` | Required, random, >= 32 bytes (`openssl rand -base64 48`) |
| `DB_PASSWORD` | Required strong password on prod overlay (no `dmis_pass`) |
| `DMIS_SECURITY_CORS_ALLOWED_ORIGINS` | Required on prod (e.g. `https://emaafa.pmo.go.tz`) |
| `DMIS_PUBLIC_HOST` | Required for Caddy TLS (DNS must point to the host) |

Templates:

- Compose / server: `.env.example` → `.env` (git-ignored)  
- Full prod list: `docs/env.prod.example`

SMS and email may stay blank only if residual accepts are signed:

- `DMIS_GO_LIVE_ACCEPT_SMS_DEFERRED=true`  
- `DMIS_GO_LIVE_ACCEPT_EMAIL_DEFERRED=true`  

## 4. Staging (build from source)

From `dmis-platform/`:

```bash
cp .env.example .env
# edit .env: set DMIS_AUTH_JWT_SECRET at minimum

docker compose up --build
```

- UI (no TLS): http://localhost:8081  
- API direct: http://localhost:8080/api (prefer UI proxy)  
- PDF: internal only; UI uses `/ew-api/...`  

## 5. Production (immutable image tags — preferred)

### 5.1 Build on CI or a build host (not on public edge)

```bash
./scripts/docker-release.sh 2026.07.14
# optional push:
REGISTRY=registry.your.gov PUSH=1 ./scripts/docker-release.sh 2026.07.14
```

### 5.2 Server only pulls tags

On the production host, `.env` example fragment:

```bash
DMIS_IMAGE_BACKEND=registry.your.gov/emaafa/dmis-backend:2026.07.14
DMIS_IMAGE_FRONTEND=registry.your.gov/emaafa/dmis-frontend:2026.07.14
DMIS_IMAGE_EW_PDF=registry.your.gov/emaafa/ew-pdf:2026.07.14
DB_PASSWORD=...strong...
DMIS_AUTH_JWT_SECRET=...>=32 bytes...
DMIS_SECURITY_CORS_ALLOWED_ORIGINS=https://emaafa.pmo.go.tz
DMIS_PUBLIC_HOST=emaafa.pmo.go.tz
CADDY_EMAIL=ops@pmo.go.tz
```

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Do **not** run `docker compose build` on the public edge if ICT wants immutable releases.

## 6. TLS

### 6.1 Production (public DNS + ACME)

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

- Caddyfile: `deploy/caddy/Caddyfile`  
- Requires `DMIS_PUBLIC_HOST` with DNS A/AAAA to the host and ports 80/443 open  
- Automatic HTTPS (Let's Encrypt)  

### 6.2 Staging / laptop without public DNS (internal cert)

```bash
docker compose -f docker-compose.yml -f docker-compose.tls-local.yml up -d
```

- Caddyfile: `deploy/caddy/Caddyfile.internal` (`tls internal`)  
- HTTPS: `https://localhost:8443` (HTTP redirect helper on `:8088`)  
- Browsers show a certificate warning — expected  
- Smoke: `curl -k https://localhost:8443/`  

Do **not** use internal TLS on a public production hostname.

### 6.3 Behaviour notes

- Frontend nginx still proxies `/api` and `/ew-api` on the internal network.  
- Backend uses `forward-headers-strategy` so `X-Forwarded-Proto` is honoured.  
- Alternative: omit `edge` and put host nginx/Caddy in front of port 8081 only.

## 7. EW PDF

- Service name: `ew-pdf`  
- Path from browser: `/ew-api/generate/{kind}` and `/ew-api/health`  
- Not published on the host network in the default prod layout  
- Backend health URL: `http://ew-pdf:8600/health`  

## 8. Persistent storage (Phase D)

Backend mounts named volume **`dmis_storage`** at `/app/storage`.

| Path in container | Role |
|-------------------|------|
| `/app/storage/public` | Public files served under `/api/storage/**` (bulletins, publications, portal media) |

Env: `DMIS_STORAGE_PUBLIC_ROOT=/app/storage/public` (default in compose).

This volume is **not** deleted by `docker compose down` (only `down -v` removes it). Back it up with the database.

## 9. Quick checks after deploy

```bash
curl -fsS https://$DMIS_PUBLIC_HOST/api/actuator/health
curl -fsS https://$DMIS_PUBLIC_HOST/ew-api/health
curl -fsS -o /dev/null -w "%{http_code}\n" https://$DMIS_PUBLIC_HOST/
# admin JWT required:
# curl -H "Authorization: Bearer …" https://$DMIS_PUBLIC_HOST/api/v1/ops/go-live-readiness
```

## 10. Related documents

| Doc | Use |
|-----|-----|
| `docs/go-live/00-INDEX.md` | Full cutover pack index |
| `docs/go-live/03-GO-LIVE-PLAN.md` | Steps and roles |
| `docs/go-live/04-ACCEPTANCE.md` | Sign-off |
| `docs/go-live/DOCKER-FIX-PLAN.md` | Known challenges and fix order (do not rush) |
| `docs/GO-LIVE-RUNBOOK.md` | Residual flags detail |

## 11. Known open deploy gaps (summary)

See **DOCKER-FIX-PLAN.md**. Remaining after B/C/D:

1. ~~PDF engine in git (D1)~~ done  
2. ~~PDF generate smoke (D2)~~ done  
3. ~~Storage volume (D3)~~ done  
4. ~~TLS without public DNS (D4)~~ done (`docker-compose.tls-local.yml`)  
5. Secrets polish (D5 / Phase F) — next  

Do not claim full Docker dual-proof until the fix plan’s remaining phases pass.
