# e-MAAFA / DMIS — Production Go-Live Runbook

> **Source of truth for go-live ops:** `space02.md` §3, §7.2 (GL-01…GL-10), §8.  
> **Honesty:** This runbook configures and proves a careful production cutover. It does **not** claim NIDA/LATRA/NAPA/IFMIS live integration, AI productisation, or empty-DB-from-V1 installs.

**Assessment baseline:** 2026-07-10 space02 pre-deploy (local dual-proof: smoke **12/12**; persona JWT fail=0; Flyway through **V195**; integrity residuals 0 including poly links; geo↔INFORM 156/156; `space02IssueRegister` on readiness board; **openCode=0**).

---

## 0. Non-negotiables

| Rule | Why |
|------|-----|
| Use **`prod` (or non-`local`) Spring profile** | Local god-mode / persona headers must not exist on the public edge |
| Database = **baseline @ V122 + Flyway forward**, or certified migrate | Fresh V1 on empty schema is **unsafe** |
| **No baseline demo users/passwords** in prod | Baseline dump may contain demo hashes |
| Expand-only migrations during freeze | No mid-go-live baseline rewrite |
| Self-issued HS256 JWT is SoR | Keycloak realm JSON is **not** live SSO unless separately engineered |
| EW multi-agency = **one bus** (`ew_agency_submissions`) | No parallel theatre channels |
| External systems = **adapter + integration tables** | Never dual-write into core tables without validation |

---

## 1. Pre-cutover checklist (GL-01…GL-06)

### GL-01 — Secrets & profile

| Variable | Required | Notes |
|----------|----------|--------|
| `SPRING_PROFILES_ACTIVE` | **Yes** | `prod` (never `local` on public edge) |
| `DMIS_AUTH_JWT_SECRET` | **Yes** | ≥ 32 random bytes; **fail-fast** if missing/dev-default in non-local |
| `DMIS_SECURITY_CORS_ALLOWED_ORIGINS` | **Yes** | Comma-separated SPA origins; **fail-fast** if empty in non-local |
| `DMIS_AUTH_JWT_TTL_MINUTES` | Recommended | Default 30 |
| `DMIS_AUTH_FORCE_2FA_ROLES` | Recommended | Prod defaults Super Admin, Director, Asst. Director, Secretary, EOCC, ICT Admin → login returns `MFA_ENROLL_REQUIRED` until TOTP enrolled |
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USERNAME` `DB_PASSWORD` | **Yes** | App user **not** superuser |
| `DB_POOL_MAX` / `DB_POOL_MIN` | Recommended | Defaults 20 / 5 |
| CORS / reverse proxy | **Yes** | TLS terminate at nginx/LB; strip client `X-Forwarded-*` then set `X-Forwarded-Proto` |

**Env template:** `docs/env.prod.example`

**Verify after deploy:**

```bash
curl -sS https://<host>/api/actuator/health   # expect {"status":"UP"} or UP
curl -sS -o /dev/null -w "%{http_code}\n" https://<host>/api/v1/settings/users
# expect 401 without Authorization
```

### GL-02 — SMS (M-Gov)

| Variable | Notes |
|----------|--------|
| `MGOV_SMS_URL` | National gateway URL |
| `MGOV_API_KEY` `MGOV_SYSTEM_ID` `MGOV_MOBILE_SERVICE_ID` | Live credentials |
| `MGOV_SENDER_ID` | Registered sender (default 15200 may need re-registration) |
| `DMIS_MGOV_DLR_SECRET` | **Required in prod** for DLR webhook; blank → DLR disabled (503) |
| DLR URL registered with carrier | Ops residual — platform ready |

### GL-03 — SMTP

| Variable | Notes |
|----------|--------|
| `SPRING_MAIL_*` / host/username/password | Real SMTP |
| `MAIL_FROM_NAME` | Default e-MAAFA DMIS |

### GL-04 — Clean production database

1. Provision PostgreSQL 16.  
2. Restore **certified baseline** (V122) **or** empty schema + load `db/baseline/baseline.sql` then Flyway.  
3. Run app so Flyway advances to current jar max version.  
4. **Delete / rotate** any demo users from baseline dumps.  
5. Create real Super Admin / ICT Admin with forced password change + 2FA.  
6. Confirm: `select max(version) from flyway_schema_history;` matches release notes.

### GL-05 — Role walkthrough (minimum)

| Persona | Must prove |
|---------|------------|
| National Super Admin / Director | Full modules; roles matrix; user create |
| RAS / Regional | Area-scoped incidents & warehouses only |
| DAS / District | Own district; cannot bind out-of-area incident allocation |
| TMA / MoW agency user | Agency bus submit + cross-read; no other agency write |
| Partner stakeholder | Portal / donations only; no staff allocation queues |
| Unauthenticated public | Portal + health; **no** `/v1/settings/**` |

### GL-06 — Workflow staffing seats

- Ensure DED / RDMC / EOCC / DAS seats exist where approval ladders require them.  
- Officer phones for SMS notify (sparse phones = weak SMS — data residual GL-08).

---

## 2. Deploy sequence (recommended)

```text
1. Freeze schema (expand-only migrations only)
2. Backup existing (if any) → PITR policy live
3. Provision app + DB network isolation
4. Set secrets; start API with prod profile
5. Confirm Flyway max version + health UP
6. Deploy Angular static assets behind same origin or CORS allowlist
7. Smoke pack (§3)
8. Role walkthrough (§1 GL-05)
9. Enable M-Gov/SMTP only after controlled test send
10. Sign go-live acceptance (below)
```

**PDF sidecar (`:8600` / `/ew-api`):** optional for generation; national warnings SoR is Spring `warnings` + products. Plan HA for sidecar (GL-09 residual).

---

## 3. Production smoke pack (minimum)

**Script (repeatable):** from `dmis-platform/`:

```bash
# Local persona (never on public edge):
./scripts/go-live-smoke.sh

# Login once then smoke with real JWT (preferred; respects login rate-limit):
LOGIN_EMAIL=admin@example.com LOGIN_PASSWORD='…' ./scripts/go-live-smoke.sh

# Prod (Bearer already minted):
BASE_URL=https://<host>/api AUTH_HEADER="Authorization: Bearer $TOKEN" ./scripts/go-live-smoke.sh

# GL-05 area-scope with JWT (local demo accounts only):
./scripts/go-live-persona-jwt.sh
```

Authenticated as Super Admin (real login JWT in prod, not local persona):

| # | Check | Expect |
|---|-------|--------|
| 1 | `GET /api/actuator/health` | UP (mail probe **off** by default — set `MANAGEMENT_HEALTH_MAIL_ENABLED=true` only with live SMTP) |
| 2 | `GET /api/v1/response/incidents` | 200 |
| 3 | `GET /api/v1/response/allocations` | 200 |
| 4 | `GET /api/v1/warehouses` | 200 |
| 5 | `GET /api/v1/ew/dmd/consolidated` | 200 |
| 6 | `GET /api/v1/ew/dmd/impact-support?day=1` | 200 |
| 7 | `GET /api/v1/finance/economics` | 200 |
| 8 | `GET /api/v1/monitoring-evaluation/dashboard` | 200 |
| 9 | `GET /api/v1/settings/roles` | 200 |
| 10 | `GET /api/v1/ops/go-live-readiness` | 200 + honest flags + integrity snapshot |
| 11 | Unauth protected API | **401** |
| 12 | Public portal root / health | 200 |

**Local dual-proof 2026-07-10:**

| Proof | Result |
|-------|--------|
| Smoke (persona header) | **12/12** |
| Smoke (real JWT Super Admin) | **12/12** |
| DAS JWT area | own incident **200** / foreign **404** |
| RAS JWT area | own warehouse **200** / foreign warehouse+incident **404** |
| Partners (header) | staff settings/warehouses/allocations **403** |
| IFMIS export | `success=true` + `integration_messages` audit (not live post) |
| Geo + INFORM | Ilala → `TZ0702` |
| GL-06 seats | **0** districts without DAS; **0** regions without RAS (phones sparse = GL-08) |
| Login rate-limit | **429** after burst (working as designed) |
| Frontend prod build | `npm run build -- --configuration production` → `frontend/dist/dmis-web` **OK** |
| Prod profile **without** JWT secret | **refuse start** (`IllegalStateException` DMIS_AUTH_JWT_SECRET) |
| Prod profile **without** CORS origins | **refuse start** (`IllegalStateException` allowed-origins) |
| Prod profile **with** JWT+CORS | health **UP**; unauth **401**; `X-Local-Roles` **401** (no local god-mode); Super Admin login → `MFA_ENROLL_REQUIRED` (force-2FA) |
| Prod RAS JWT area | own warehouse **200** / foreign **404** (full session; not force-2FA) |
| Cutover snapshot | `./scripts/cutover-snapshot.sh` → `/tmp/dmis-cutover-snapshots/snapshot-*.json` |
| Master verify | `./scripts/cutover-verify-all.sh` (health + smoke + integrity + snapshot) |
| Force-2FA enroll | `MFA_ENROLL_REQUIRED` → limited token → `/2fa/setup` → `/2fa/enable` → full JWT **200** |
| Force-2FA login | `MFA_REQUIRED` + challenge → `/2fa/verify` → full JWT **200** (fixed: verify was missing from public allowlist) |
| Frontend static | `frontend/dist/dmis-web` index **200** via simple static server |

Optional: one controlled SMS + email to known internal address, then confirm `sms_logs` / email logs.

### Bug fixed during cutover dual-proof (2026-07-10)

| Issue | Fix |
|-------|-----|
| `POST /v1/auth/2fa/verify` required JWT but `MFA_REQUIRED` login issues **no** token (only `challengeToken`) → permanent 401 after TOTP enroll | Added path to `SecurityPaths.PUBLIC_PATHS`; rate-limited with login attempts |

> **Demo passwords** (`admin` / `password`) exist only for local dual-proof. **Delete/rotate before public edge.**

---

## 4. What is production-ready vs not

| Ready (platform) | Not ready / not claimed |
|------------------|-------------------------|
| Incident → allocate → dispatch → stock | Live NIDA identity verify |
| EW multi-agency bus + PMO consolidate + Action Guide | Live LATRA/NAPA/IFMIS APIs |
| INFORM + impact-support (deterministic) | Satellite / AI product (F114/F105) |
| Budget / NDMF / Economics formulas | Fresh empty DB from V1 only |
| JWT, RBAC, ModuleGuard, god-mode off | Full Keycloak SSO without extra work |
| SMS/email **code** | Carrier DLR registration & live keys |

---

## 5. Post go-live (space02 §8 parallel tracks)

1. **DBA-1** geo aliases population (EW/GADM/INFORM name dictionary).  
2. **DBA-2** nightly orphan reports from integrity views.  
3. **INT-*** first adapter only after MoU — use `integration_*` tables (V187+).  
4. F114 exposure / F105 AI only after factual snapshots.

---

## 6. Go-live acceptance (sign-off)

| Sign-off | Name / date | Notes |
|----------|-------------|--------|
| Platform owner (PMO-DMD) | | |
| ICT / ops | | Secrets, TLS, backups |
| Security | | 401 unauth, 2FA privileged roles |
| Functional lead | | Role walkthrough complete |
| Residual accepted | | List GL-07…GL-10 / DEFERRED F105 F114 |

### Residual acceptance checklist (print / attach)

| ID | Residual | Accept? (Y/N) | Sign |
|----|----------|---------------|------|
| GL-01 | Deployed with **prod** profile; JWT secret ≥32; no local persona headers on edge | | |
| GL-02 | M-Gov SMS keys + DLR **or** SMS deferred | | |
| GL-03 | SMTP fully configured **or** email deferred | | |
| GL-07 | Demo users/passwords removed from production DB | | |
| GL-08 | Sparse officer phones (SMS notify weak where blank) | | |
| GL-09 | PDF sidecar HA optional | | |
| GL-10 | Clean DB / baseline path certified | | |
| DEF-1 | F105 AI/ML deferred | | |
| DEF-2 | F114 satellite/full exposure deferred | | |
| DEF-3 | NIDA / LATRA / NAPA / live IFMIS not claimed | | |
| DATA-1 | Unscoped free-text drafts — soft-sim or leave unscoped; do not invent areas | | |
| DATA-2 | Past disasters — genuine history bridged (unbridged=0); UI test excluded | | |
| POLY-01 | Soft event links — integrity views + orphan cleanup (V194–V195) | | |
| DEF-INT | NIDA/LATRA/NAPA/live IFMIS not claimed | | |

**Certificate language:** “Careful production cutover completed against space02 scorecard; external national systems not integrated unless separately dual-proved.”

---

## 7. Related APIs added for integrity (platform)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/ops/go-live-readiness` | Authenticated honesty board (profile, flyway, secret presence flags, integration registry counts) |
| `GET /api/v1/ops/integration-registry` | List registered external endpoints (admin) |
| `GET /api/v1/ops/integrity-summary` | Counts from DBA integrity views |
| `POST /api/v1/ops/integrations/ifmis/export-commitments` | INT-FIN-01 commitment export payload + message log (not live IFMIS) |
| `GET /api/v1/ops/geo/resolve?name=` | Resolve district alias → ids / INFORM code |

These **never** invent green lights for missing NIDA/LATRA keys.

---

*End of GO-LIVE-RUNBOOK.md*
