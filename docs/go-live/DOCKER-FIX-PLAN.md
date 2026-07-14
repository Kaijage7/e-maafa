# Docker deploy fix plan

**Product:** e-MAAFA / DMIS  
**Date:** 2026-07-14  
**Rule:** Document first. Fix one item at a time. Prove each item before the next. Do not rush.  
**Status:** Phases **A–F closed** (2026-07-14)

## 1. Purpose

This plan records every known Docker / deploy challenge from the go-live assessment, the intended fix, proof of done, and order of work. It is not a production certificate.

## 2. Honesty

| Statement | Status |
|-----------|--------|
| Compose packaging exists (db, backend, frontend, ew-pdf, prod Caddy overlay) | Done |
| Compose alone certifies go-live | **False** |
| Challenge register D1–D13 addressed (code or docs) | **Done** (Phase F) |
| Full dual-proved national cutover on a named host | **Ops / acceptance** — not this plan |
| National feeds live (NIDA/NBS/LATRA) | **Not claimed** |

## 3. Challenge register

| ID | Challenge | Severity | Resolution |
|----|-----------|----------|------------|
| D1 | EW PDF not buildable from GitHub alone | High | **Phase B** — vendored `deploy/ew-pdf/engine/` |
| D2 | PDF never smoke-tested under Docker | High | **Phase C** — LibreOffice; generate 722e4 PDF |
| D3 | Uploads lost on container recreate | High | **Phase D** — volume `dmis_storage` |
| D4 | TLS/ACME fails without public DNS | Medium | **Phase E** — `docker-compose.tls-local.yml` + `tls internal` |
| D5 | Staging allows weak DB password | Medium | **Phase F** — docs + `check-deploy-secrets.sh` + optional enforce; prod overlay still forbids |
| D6 | First Flyway on non-empty DB | Medium | **Phase F** — operator checklist DOCKER-DEPLOY §10 |
| D7 | SMS/email red on readiness | Medium | **Phase F** — checklist + residual accepts documented |
| D8 | CORS mis-set with same-origin edge | Low | **Phase F** — checklist: set exact public HTTPS origin |
| D9 | 2FA / demo first-login friction | Medium | **Phase F** — checklist + LOCAL-TEST-PASSWORD |
| D10 | Host under-resourced for PDF | Medium | **Phase F** — checklist min RAM/disk |
| D11 | Registry pull credentials | Medium | **Phase F** — checklist + docker-release REGISTRY/PUSH |
| D12 | Host clock skew | Low | **Phase F** — checklist NTP |
| D13 | Release script monorepo PDF path | High | **Phase B** — confirmed **Phase F**; in-repo only |

## 4. Work order (closed)

### Phase A — Document freeze — **DONE**

Challenge register written; linked from go-live index.

### Phase B — D1 Vendor PDF engine — **DONE 2026-07-14**

In-repo engine; image builds from `dmis-platform` alone.

### Phase C — D2 PDF smoke — **DONE 2026-07-14**

LibreOffice in image; `POST /generate/722e4` → PDF 389891 bytes.

### Phase D — D3 Storage — **DONE 2026-07-14**

`dmis_storage` → `/app/storage`; `DMIS_STORAGE_PUBLIC_ROOT`.

### Phase E — D4 TLS local — **DONE 2026-07-14**

`Caddyfile.internal` + `docker-compose.tls-local.yml`; curl -k HTTPS 200.

### Phase F — D5 / D13 / docs polish — **DONE 2026-07-14**

1. `.env.example` laptop vs public edge wording  
2. `scripts/check-deploy-secrets.sh` — warn mode + `--enforce` / `DMIS_ENFORCE_STRONG_SECRETS=1`  
3. `deploy-quickstart.sh` runs the check (enforce when env set)  
4. DOCKER-DEPLOY §3 secrets + **§10 operator checklist** (D5–D13)  
5. DEPLOYMENT.md Path A/C pointers  
6. D13 re-confirmed: `docker-release.sh` uses `deploy/ew-pdf` only  

**Proof:**

```text
# Lab default DB password → warn, exit 0
ENV with DB_PASSWORD=dmis_pass + real JWT → check-deploy-secrets.sh → WARN, exit 0

# Enforce → refuse
same ENV + --enforce → FAIL, exit 1

# Strong secrets → OK
DB_PASSWORD=long-random… + JWT ≥32 → --enforce → OK
```

Prod overlay still: `${DB_PASSWORD:?…}` / `${DMIS_AUTH_JWT_SECRET:?…}` with no weak default.

## 5. Historical note

Earlier partial work (untracked engine, monorepo Dockerfile) was completed under B–C. Do not re-open closed phases unless a regression appears.

## 6. Out of scope for this plan

- Claiming live NIDA/NBS/LATRA  
- F114 satellite footprint  
- Moving Docker to a separate git repository  
- Running production cutover without acceptance sign-off  
- Full dual-proof on a government production hostname (ops)

## 7. Sign-off per phase

| Phase | Date | Pass/Fail | Notes |
|-------|------|-----------|-------|
| A Document freeze | 2026-07-14 | **Pass** | Register + order |
| B D1 Vendor + Dockerfile | 2026-07-14 | **Pass** | In-repo engine |
| C D2 PDF smoke | 2026-07-14 | **Pass** | Generate PDF 389891 bytes |
| D D3 Storage volume | 2026-07-14 | **Pass** | `dmis_storage` |
| E D4 TLS local | 2026-07-14 | **Pass** | Caddy Local Authority |
| F D5 + checklist D6–D12 + D13 | 2026-07-14 | **Pass** | `check-deploy-secrets.sh`; DOCKER-DEPLOY §10 |

## 8. Next action

**Docker fix plan complete (A–F).**  

Operators: use **`docs/DEPLOYMENT.md`** + **`docs/go-live/DOCKER-DEPLOY.md` §10**.  
Go-live: **`docs/go-live/04-ACCEPTANCE.md`** — not reopened by this plan.

No further phases in this file unless a **new** deploy challenge is registered.
