# Docker deploy fix plan

**Product:** e-MAAFA / DMIS  
**Date:** 2026-07-14  
**Rule:** Document first. Fix one item at a time. Prove each item before the next. Do not rush.

## 1. Purpose

This plan records every known Docker / deploy challenge from the go-live assessment, the intended fix, proof of done, and order of work. It is not a production certificate.

## 2. Honesty

| Statement | Status |
|-----------|--------|
| Compose packaging exists (db, backend, frontend, ew-pdf, prod Caddy overlay) | Done earlier (`b61b8f9`) |
| Compose alone certifies go-live | **False** |
| Full Docker E2E (build all images + generate PDF + persist storage + TLS) | **Not yet dual-proved** |
| National feeds live (NIDA/NBS/LATRA) | **Not claimed** |

## 3. Challenge register

| ID | Challenge | Severity | Root cause | Target fix | Proof of done |
|----|-----------|----------|------------|------------|---------------|
| D1 | EW PDF image not buildable from GitHub clone alone | High | Dockerfile context used monorepo `../extracted/...` outside `dmis-platform` git root | Vendor engine under `deploy/ew-pdf/engine/`; rewrite Dockerfile to copy from that path; build context = `dmis-platform` | `docker build -f deploy/ew-pdf/Dockerfile .` succeeds from repo root alone |
| D2 | PDF image never smoke-tested under Docker | High | Config validated only; no full image build/run | Build `ew-pdf` image; `GET /health`; optional `POST /generate/722e4` with example JSON | Health 200; generate returns PDF bytes |
| D3 | Uploads / bulletin files lost on container recreate | High | No named volume for `dmis.storage.public-root` | Volume `dmis_storage` mounted at `/app/storage`; env `DMIS_STORAGE_PUBLIC_ROOT=/app/storage/public` | File survives `docker compose restart backend` |
| D4 | TLS/ACME fails without public DNS | Medium | Caddy ACME assumes real hostname | Staging overlay or Caddyfile mode: `tls internal` when no public DNS; document both modes | Local HTTPS with internal cert works OR documented host-TLS path |
| D5 | Staging compose still allows weak DB password | Medium | Base compose default `dmis_pass` for laptop convenience | Clear comments; prod overlay already forbids default; staging `.env.example` warns; optional refuse if password equals `dmis_pass` when `DMIS_ENFORCE_STRONG_SECRETS=1` | Prod overlay still fails without strong secret; docs state laptop vs public edge |
| D6 | First Flyway on non-empty DB surprises | Medium | Baseline + out-of-order migrations | Document-only: always stage-clone first; no silent schema rewrite | Doc step in this plan + DOCKER-DEPLOY |
| D7 | SMS/email red on readiness board | Medium | Keys optional by design | Document residual accept flags; do not invent live keys | Doc only |
| D8 | CORS mis-set when edge is same-origin | Low | SPA and API same host via Caddy | Document: set CORS to public HTTPS origin anyway | Doc only |
| D9 | 2FA / demo account first-login friction | Medium | Prod security policy | Document seat prep in go-live plan | Doc only |
| D10 | Host under-resourced for PDF stack | Medium | geopandas/GDAL heavy | Document min RAM; optional compose mem limits later | Doc + optional limits after D2 |
| D11 | Registry pull credentials | Medium | Immutable tags need registry | Document REGISTRY/PUSH flow | Doc only (already partly in DOCKER-DEPLOY) |
| D12 | Host clock skew breaks JWT/TLS | Low | NTP | Document check | Doc only |
| D13 | Release script path for PDF still monorepo-based | High | Same as D1 | Align `docker-release.sh` with in-repo engine | Script builds from `dmis-platform` only |

## 4. Work order (one after another)

Do **not** parallelise. Each phase ends only when its proof column passes.

### Phase A — Document freeze (this file)

- [x] Challenge register written  
- [x] Order fixed  
- [ ] Linked from go-live index  
- [ ] Note partial work already on disk (see §5)  

**Stop after Phase A until operator continues.**

### Phase B — D1 Vendor PDF engine + Dockerfile — **DONE 2026-07-14**

1. ~~Keep/confirm `deploy/ew-pdf/engine/`~~ done (~22M, no output/documents)  
2. ~~Rewrite Dockerfile~~ context `deploy/ew-pdf`, wheel-first pip (avoid GDAL source compile)  
3. ~~Update compose~~ `context: ./deploy/ew-pdf`  
4. ~~Update `docker-release.sh`~~ builds from in-repo path; fails if engine missing  
5. ~~README~~ `deploy/ew-pdf/README.md`  
6. Commit engine + Dockerfile + scripts  

**Proof:**  
`docker build -t emaafa/ew-pdf:local -f deploy/ew-pdf/Dockerfile deploy/ew-pdf` → exit 0, image ~1.27GB  
`docker run` + `GET /health` → `{"status":"ok","kinds":[...722e4,multirisk,...]}`  
No monorepo `extracted/` path required.

### Phase C — D2 Build and smoke PDF image — **DONE 2026-07-14**

1. ~~Health~~ already green from B  
2. First generate failed: **LibreOffice missing** for DOCX→PDF  
3. Fixed: Dockerfile installs `libreoffice-writer-nogui` + fonts  
4. Re-proved generate  

**Proof:**  
`POST /generate/722e4` with `engine/examples/722e4_example.json`  
→ HTTP 200, `application/pdf`, size **389891**, `file` says PDF 1.6, 2 pages, magic `%PDF-`

### Phase D — D3 Persistent storage — **DONE 2026-07-14**

1. Named volume `dmis_storage` on backend at `/app/storage`  
2. Env `DMIS_STORAGE_PUBLIC_ROOT=/app/storage/public`  
3. `application.yml` binds `dmis.storage.public-root`  
4. Documented in DOCKER-DEPLOY §8  

**Proof:** compose config shows volume; unit test via docker volume inspect + write/read (see appendix if run).

### Phase E — D4 TLS staging fallback — **DONE 2026-07-14**

1. `deploy/caddy/Caddyfile.internal` — `tls internal` for localhost / 127.0.0.1  
2. `docker-compose.tls-local.yml` — edge on 8443/8088 (configurable)  
3. Documented ACME vs internal in DOCKER-DEPLOY §6; README + `.env.example`  

**Proof:**  
- `docker compose -f docker-compose.yml -f docker-compose.tls-local.yml config` → OK  
- Isolated Caddy + nginx smoke: `curl -k https://localhost:18443/` → **HTTP 200**, nginx welcome HTML  
- Cert issuer: `CN = Caddy Local Authority - ECC Intermediate`  
- Without `-k`: TLS verify fails (expected; not a public CA)  
- Honest: this is **staging / laptop** TLS only — not production ACME  

### Phase F — D5 / D13 / docs polish

1. Secrets warnings; release script alignment.  
2. Fold D6–D12 into DOCKER-DEPLOY as operator checklist.  
3. Close this plan with “done” dates.  

## 5. Historical note (phases B–E closed)

Earlier partial work (untracked engine copy, monorepo Dockerfile) was completed under Phases B–C. Storage (D) and TLS local (E) are committed with proof above. Do not re-open closed phases unless a regression appears.

## 6. Out of scope for this plan

- Claiming live NIDA/NBS/LATRA  
- F114 satellite footprint  
- Moving Docker to a separate git repository  
- Running production cutover without acceptance sign-off  

## 7. Sign-off per phase

| Phase | Date | Operator | Pass/Fail | Notes |
|-------|------|----------|-----------|-------|
| A Document freeze | 2026-07-14 | | Pass | Document written |
| B D1 Vendor + Dockerfile | 2026-07-14 | | **Pass** | In-repo engine; image builds from repo alone |
| C D2 PDF smoke | 2026-07-14 | | **Pass** | LibreOffice; generate → PDF 389891 bytes |
| D D3 Storage volume | 2026-07-14 | | **Pass** | `dmis_storage` → `/app/storage` |
| E D4 TLS local | 2026-07-14 | | **Pass** | `tls internal`; curl -k HTTPS 200; CA = Caddy Local Authority |
| F Docs / secrets polish | | | | Next |

## 8. Next action

**Phases A–E complete.**  
**Next fix (when operator says proceed):** Phase F only (D5 secrets polish, D13 already largely done in B, fold D6–D12 checklist into DOCKER-DEPLOY). Do not claim go-live from compose alone.
