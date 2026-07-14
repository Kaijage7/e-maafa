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

### Phase B — D1 Vendor PDF engine + Dockerfile

1. Keep/confirm `deploy/ew-pdf/engine/` (runtime only: src, assets, examples, pdf_service, requirements; no output/documents bulk).  
2. Rewrite `deploy/ew-pdf/Dockerfile` to `COPY engine/` from `dmis-platform` context.  
3. Update `docker-compose.yml` ew-pdf build context to `./deploy/ew-pdf` (or `.` with dockerfile path).  
4. Update `scripts/docker-release.sh` accordingly.  
5. Add short `deploy/ew-pdf/README.md` (sync note if source tree still exists outside git).  
6. Commit engine + Dockerfile only.  

**Proof:** build from clean context without `../extracted`.

### Phase C — D2 Build and smoke PDF image

1. `docker build` ew-pdf.  
2. Run container; `curl /health`.  
3. Optional: generate 722e4 from `engine/examples`.  
4. Record size and time in this plan appendix.  

**Proof:** health 200; generate PDF if example works.

### Phase D — D3 Persistent storage

1. Add volume `dmis_storage` to compose.  
2. Mount on backend; set `DMIS_STORAGE_PUBLIC_ROOT`.  
3. Document in DOCKER-DEPLOY.  
4. Smoke: write file, restart backend, file still there.  

**Proof:** persistence test script or manual steps recorded.

### Phase E — D4 TLS staging fallback

1. Add `docker-compose.tls-local.yml` or Caddy env `DMIS_TLS_MODE=internal`.  
2. Document public ACME vs internal.  
3. Optional smoke with curl -k https://localhost.  

**Proof:** edge serves HTTPS without public DNS (internal) or doc-only ACME path.

### Phase F — D5 / D13 / docs polish

1. Secrets warnings; release script alignment.  
2. Fold D6–D12 into DOCKER-DEPLOY as operator checklist.  
3. Close this plan with “done” dates.  

## 5. Partial work already on disk (not finished)

| Item | State | Action in plan |
|------|--------|----------------|
| `deploy/ew-pdf/engine/` (~22M, untracked) | Copied earlier during rushed pass; **not committed**, Dockerfile **still** monorepo context | Complete under **Phase B** carefully (review contents, .gitignore, Dockerfile rewrite) |
| Compose PDF service + Caddy prod overlay | Committed earlier | Keep; only adjust build context in Phase B |
| Full image build of ew-pdf | Not done | Phase C |

Do **not** treat the untracked engine copy as “fixed” until Phase B proof passes and it is intentionally committed.

## 6. Out of scope for this plan

- Claiming live NIDA/NBS/LATRA  
- F114 satellite footprint  
- Moving Docker to a separate git repository  
- Running production cutover without acceptance sign-off  

## 7. Sign-off per phase

| Phase | Date | Operator | Pass/Fail | Notes |
|-------|------|----------|-----------|-------|
| A Document freeze | 2026-07-14 | | Pass (document written) | Wait before B |
| B D1 Vendor + Dockerfile | | | | |
| C D2 PDF smoke | | | | |
| D D3 Storage volume | | | | |
| E D4 TLS fallback | | | | |
| F Docs / secrets polish | | | | |

## 8. Next action

**Phase A complete when this file is linked and the team agrees to proceed.**  
**Next fix:** Phase B only (D1). No storage, no TLS, no release push until B proof is green.
