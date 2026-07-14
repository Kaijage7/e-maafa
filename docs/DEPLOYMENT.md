# e-MAAFA / DMIS — Deployment guide

**Audience:** PMO ICT / operators who need to stand the platform up  
**Scope:** Docker-based deploy (recommended path)  
**Date:** 2026-07-14

---

## Honesty (read once)

| Claim | Truth |
|-------|--------|
| Docker packages the full stack | **Yes** — database, API, SPA, PDF engine |
| Compose alone certifies national go-live | **No** — see `docs/go-live/04-ACCEPTANCE.md` |
| NIDA / NBS / LATRA live from this guide | **No** — planned adapters only |
| This guide is AI product documentation | **No** — deterministic platform only |

Compose is **packaging**. Signed acceptance, strong secrets, real DNS/TLS (for public edge), and residual-flag sign-off are separate.

---

## What you get

| Service | Role | Default access (laptop) |
|---------|------|-------------------------|
| `db` | PostgreSQL 16 | Host port **5440** (staging only) |
| `backend` | Spring Boot API (`prod` profile) | **8080** → `/api` |
| `frontend` | Angular SPA + nginx | **8081** → UI, proxies `/api` and `/ew-api` |
| `ew-pdf` | Bulletin PDF generator | Internal only (via `/ew-api`) |
| `edge` | Caddy TLS (optional overlays) | **443** / **8443** depending on mode |

Uploads and bulletin files persist on Docker volume **`dmis_storage`**.

---

## Prerequisites

| Requirement | Notes |
|-------------|--------|
| Linux host (or Docker Desktop) | Production: Linux server |
| Docker Engine 24+ and Docker Compose v2 | `docker compose version` |
| Disk | **≥ 20 GB** free (PDF image with LibreOffice is large) |
| RAM | **≥ 8 GB** recommended for full stack; 16 GB safer for PDF + DB + API |
| Ports free | Laptop: 8081, 8080, 5440; TLS local: 8443; prod: **80, 443** |
| Git clone of this repo | Work from **`dmis-platform/`** directory |

```bash
docker --version
docker compose version
# both must succeed
```

---

## Choose a deploy path

| Path | When to use | Command summary |
|------|-------------|-----------------|
| **A — Laptop / demo** | Training, ICT lab, first look | `docker compose up --build` → http://localhost:8081 |
| **B — Staging HTTPS (no public DNS)** | Internal review with HTTPS | + `docker-compose.tls-local.yml` → https://localhost:8443 |
| **C — Production** | Public hostname + real TLS | Image tags + `docker-compose.prod.yml` + ACME |

**Rule:** Do not put Path A or B on a public internet hostname without Path C controls (strong secrets, closed ports, real cert).

---

## Path A — Easy laptop deploy (about 15–40 minutes first build)

### A1. Get the code

```bash
git clone https://github.com/Kaijage7/e-maafa.git
cd e-maafa/dmis-platform
# or: cd /path/to/dmis-platform
```

### A2. Create `.env`

```bash
cp .env.example .env
```

Edit `.env` and set at least:

```bash
# Required under Docker (app uses prod profile)
DMIS_AUTH_JWT_SECRET=$(openssl rand -base64 48)

# Staging lab only — change before any shared/public host
DB_PASSWORD=dmis_pass

# Must match how you open the UI in the browser
DMIS_SECURITY_CORS_ALLOWED_ORIGINS=http://localhost:8081
```

Optional hygiene (warns on lab defaults; does not block laptop):

```bash
./scripts/check-deploy-secrets.sh
```

Or use the helper (creates `.env`, generates JWT, starts Path A):

```bash
./scripts/deploy-quickstart.sh
```

### A3. Build and start

```bash
docker compose up --build -d
```

First build pulls base images and compiles backend + frontend + PDF (LibreOffice). This can take a long time on a slow link. Later starts are much faster.

### A4. Wait until healthy

```bash
# Database
docker compose ps

# API (may take 1–3 minutes on first Flyway run)
curl -fsS http://localhost:8080/api/actuator/health

# UI
curl -fsS -o /dev/null -w "%{http_code}\n" http://localhost:8081/

# PDF via frontend proxy
curl -fsS http://localhost:8081/ew-api/health
```

### A5. Open the system

| URL | Use |
|-----|-----|
| **http://localhost:8081/** | Primary UI (recommended) |
| http://localhost:8080/api/actuator/health | API health (direct) |

**Login note:** Docker uses the **`prod`** Spring profile. The local-only password seeder (`Password@2026`) does **not** run. Use accounts prepared for your environment, or follow seat-prep in `docs/go-live/03-GO-LIVE-PLAN.md` and `docs/LOCAL-TEST-PASSWORD.md` (revoke rules for production).

### A6. Stop / restart

```bash
docker compose stop          # stop containers, keep data
docker compose start         # start again
docker compose down          # remove containers; **keeps** DB + storage volumes
docker compose down -v       # DANGER: deletes database and uploaded files
```

---

## Path B — Staging HTTPS without public DNS

Use when reviewers need HTTPS but you have no public DNS or Let's Encrypt yet.

```bash
# Same .env as Path A (CORS can stay http://localhost:8081 for direct ports,
# or use https://localhost:8443 if you only open the edge)
cp .env.example .env   # if not already done
# set DMIS_AUTH_JWT_SECRET as in Path A

docker compose -f docker-compose.yml -f docker-compose.tls-local.yml up --build -d
```

| URL | Notes |
|-----|--------|
| **https://localhost:8443/** | Caddy with **internal** certificate |
| http://localhost:8088/ | HTTP helper port |

```bash
curl -k https://localhost:8443/
curl -k https://localhost:8443/api/actuator/health
curl -k https://localhost:8443/ew-api/health
```

- Browser will **warn** about the certificate — expected (`tls internal`).  
- **Not** for a public production hostname.  
- Detail: `docs/go-live/DOCKER-DEPLOY.md` §6.

---

## Path C — Production (public host)

### C1. Host preparation

1. Linux server with Docker + Compose  
2. DNS **A/AAAA** for your hostname (e.g. `emaafa.pmo.go.tz`) → server  
3. Firewall: open **80** and **443** only for the app edge; do not publish DB or backend  
4. Strong secrets only (never `dmis_pass`, never empty JWT)

### C2. Build immutable images (on CI or a build host — not required on the public edge)

```bash
cd dmis-platform
./scripts/docker-release.sh 2026.07.14

# Optional push to your registry:
REGISTRY=registry.your.gov PUSH=1 ./scripts/docker-release.sh 2026.07.14
```

This builds three images: backend, frontend, ew-pdf.

### C3. Configure the production server

```bash
cd dmis-platform
cp docs/env.prod.example .env
chmod 600 .env
# edit .env — fill every required field
```

Minimum production `.env` values:

```bash
DB_PASSWORD=          # strong, unique — never dmis_pass
DMIS_AUTH_JWT_SECRET= # openssl rand -base64 48
DMIS_SECURITY_CORS_ALLOWED_ORIGINS=https://emaafa.pmo.go.tz
DMIS_PUBLIC_HOST=emaafa.pmo.go.tz
CADDY_EMAIL=ops@pmo.go.tz

DMIS_IMAGE_BACKEND=registry.your.gov/emaafa/dmis-backend:2026.07.14
DMIS_IMAGE_FRONTEND=registry.your.gov/emaafa/dmis-frontend:2026.07.14
DMIS_IMAGE_EW_PDF=registry.your.gov/emaafa/ew-pdf:2026.07.14
```

Refuse lab secrets before start:

```bash
DMIS_ENFORCE_STRONG_SECRETS=1 ./scripts/check-deploy-secrets.sh --enforce
```

Full pre-cutover operator table (Flyway, CORS, seats, RAM, NTP, registry): **`docs/go-live/DOCKER-DEPLOY.md` §10**.

SMS / email may stay blank only if residual accepts are **written and signed**:

```bash
DMIS_GO_LIVE_ACCEPT_SMS_DEFERRED=true
DMIS_GO_LIVE_ACCEPT_EMAIL_DEFERRED=true
```

### C4. Pull and start

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

- Caddy obtains a **public** certificate via ACME when DNS and ports are correct.  
- App and database ports are **not** published on the host; only Caddy on 80/443.  
- Prefer **pull of tagged images** over `docker compose build` on the public edge.

### C5. Production smoke

```bash
export HOST=emaafa.pmo.go.tz   # your DMIS_PUBLIC_HOST

curl -fsS "https://$HOST/api/actuator/health"
curl -fsS "https://$HOST/ew-api/health"
curl -fsS -o /dev/null -w "%{http_code}\n" "https://$HOST/"

# With a real admin JWT (after seat prep):
# curl -fsS -H "Authorization: Bearer $TOKEN" "https://$HOST/api/v1/ops/go-live-readiness"
```

Optional script (point at public API):

```bash
BASE_URL="https://$HOST/api" ./scripts/go-live-smoke.sh
```

### C6. Go-live is not “compose up”

Before calling production live:

1. `docs/go-live/03-GO-LIVE-PLAN.md`  
2. `docs/go-live/04-ACCEPTANCE.md` (sign)  
3. `docs/go-live/05-OPS-AND-HONESTY.md`  
4. Seat prep: real Super Admin, 2FA, revoke demo passwords (`docs/LOCAL-TEST-PASSWORD.md`)

---

## Day-2 operations

### Logs

```bash
docker compose logs -f backend
docker compose logs -f frontend ew-pdf edge   # edge only if overlay used
```

### Update to a new image tag (production)

1. Build/push new tag with `docker-release.sh`  
2. Update `DMIS_IMAGE_*` in `.env`  
3. `docker compose -f docker-compose.yml -f docker-compose.prod.yml pull`  
4. `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`  
5. Smoke health endpoints again  

Named volumes **`dmis_pgdata`** and **`dmis_storage`** keep data across image replaces.

### Backup (minimum)

| Asset | How |
|-------|-----|
| Database | `docker compose exec db pg_dump -U dmis_app dmis > dmis-$(date +%F).sql` |
| Files | Backup Docker volume `dmis_storage` (or copy from a temporary container mount) |
| Secrets | Offline copy of `.env` (never in git) |

Restore and DR belong in ICT runbooks; test restore before relying on it.

### Resource tips

- PDF service image is large (LibreOffice). Prefer a dedicated host or enough disk.  
- Do not run `local` Spring profile on a public edge.  
- Keep host clock synced (NTP) — JWT and TLS both depend on time.

---

## Troubleshooting

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| `ERR_CONNECTION_REFUSED` on UI | Stack not up or wrong port | `docker compose ps`; open **8081** (or **8443** for TLS local) |
| API health 000 / timeout | Backend still migrating or crashed | `docker compose logs backend` — wait for Flyway; fix DB password |
| `DMIS_AUTH_JWT_SECRET must be set` | Empty JWT in prod overlay | Set secret in `.env`, recreate backend |
| `DB_PASSWORD must be set` | Prod overlay forbids weak default | Set strong `DB_PASSWORD` |
| PDF generate fails / health down | `ew-pdf` not healthy or still building | `docker compose logs ew-pdf`; rebuild `deploy/ew-pdf` |
| ACME / cert failure (prod) | No public DNS or ports 80/443 blocked | Fix DNS; open ports; check `docker compose logs edge` |
| Browser cert warning (Path B) | Expected for `tls internal` | Use `curl -k` or accept temporary warning in lab only |
| CORS errors in browser | Origin mismatch | Set `DMIS_SECURITY_CORS_ALLOWED_ORIGINS` to exact UI origin |
| Login fails with `Password@2026` under Docker | Seeder is **local** profile only | Use prepared prod seats; do not expect local test password in compose |

More deploy detail: `docs/go-live/DOCKER-DEPLOY.md`  
Known Docker gaps (ordered fixes): `docs/go-live/DOCKER-FIX-PLAN.md`

---

## Quick reference — one screen

```bash
cd dmis-platform

# Path A — laptop
cp .env.example .env
# set DMIS_AUTH_JWT_SECRET=...
docker compose up --build -d
# → http://localhost:8081

# Path B — internal HTTPS
docker compose -f docker-compose.yml -f docker-compose.tls-local.yml up -d
# → https://localhost:8443   (curl -k)

# Path C — production
# build: ./scripts/docker-release.sh <tag>
# .env from docs/env.prod.example with image tags + strong secrets
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
# → https://$DMIS_PUBLIC_HOST
```

---

## Related documents

| Document | Use |
|----------|-----|
| **This file** (`docs/DEPLOYMENT.md`) | Easy deploy paths A/B/C |
| `docs/go-live/DOCKER-DEPLOY.md` | Docker detail + **operator checklist D5–D12** |
| `docs/env.prod.example` | Full production env template |
| `.env.example` | Compose env starter |
| `scripts/deploy-quickstart.sh` | Path A/B helper |
| `scripts/check-deploy-secrets.sh` | Secret hygiene (D5) |
| `scripts/docker-release.sh` | Immutable image build/push |
| `scripts/go-live-smoke.sh` | Post-deploy smoke pack |
| `docs/go-live/00-INDEX.md` | Full go-live document set |
| `docs/GO-LIVE-RUNBOOK.md` | Residual flags and cutover env detail |

---

## Out of scope for this guide

- Live national registry wiring (NIDA, LATRA, etc.)  
- F114 satellite footprint claims  
- Signing production acceptance without ICT review  
- Non-Docker multi-host Kubernetes (not shipped in this pack)
