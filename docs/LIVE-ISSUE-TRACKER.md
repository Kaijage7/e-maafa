# LIVE-ISSUE-TRACKER

> **Updated:** 2026-07-17 · Source tip `clean2` (local may be ahead of `origin/clean2`) · Flyway through **V214** in tree  
> **Honesty:** This scoreboard is for operators and agents. It is **not** a signed production certificate.

## Scoreboard (honest)

| Bucket | Count | Notes |
|--------|------:|-------|
| **F01–F116 ledger** | 116 | Official product findings in `DMIS-AUDIT-FIX-LOG.md` |
| **Documented resolved** | **113** | Fix-log FIXED/CLOSED |
| **Official open F-items** | **3** | **F105** AI · **F114** EO/exposure SoR · **F116** linkage/capacity (incident hybrid is partial only) |
| **Ops gates** | Edge | GL-01 prod profile + JWT + CORS · GL-02/03 SMS/SMTP · host TLS |
| **Planned integrations** | NIDA/LATRA/NAPA/live IFMIS | Adapters/registry only until dual-proved |

**Authoritative product status:** `DMIS-AUDIT-FIX-LOG.md` (not this file).  
**Hybrid contract:** `docs/MOBILE-WEB-HYBRID-API.md`.

---

## Integrity pass 2026-07-17 (this branch)

| Change | Integrity intent |
|--------|------------------|
| ModuleGuard maps for `/v1/response/dashboard`, `/eocc`, ops exposure/hazard/go-live paths | Close filter gaps if method security is ever missing; **do not** over-map `/v1/mobile/devices` or `/v1/ops/geo/resolve` (caller-owned / any-auth by design) |
| Response settings GETs gain matching `@PreAuthorize` | Dual-layer with ModuleGuard |
| Notification controller class-level authenticated | Explicit self-scoped surface |
| **V214** `platform.jwt_denylist` + DB-backed `TokenDenylist` | Multi-node logout/revocation (was node-local memory only) |
| Tests: `ModuleGuardFilterTest`, `TokenDenylistTest` | Lock the above |

**Still intentionally open / not faked closed:** F105, F114, F116 · native FCM/APNs · cluster rate-limit shared store · AI/satellite product claims.

---

## Residual focus (cutover)

| ID | Why open | Next work |
|----|----------|-----------|
| **GL-01** | Must deploy `prod` + JWT + CORS | `docs/env.prod.example` |
| **GL-02/03** | DLR secret / live SMTP optional | Configure or accept deferred |
| **F105 / F114 / F116** | Roadmap | Post go-live architecture |
| **NIDA/LATRA/NAPA** | No live clients | MoU + dual-proof |
| **Git publish** | Unpushed `clean2` work may still sit local | Push after suite + live smoke |

---

## Production deploy (reminder)

`prod` · real JWT ≥32 bytes · force-2FA · CORS origins · no `local` · **rotate demo passwords** · Flyway through **V214**.

**Not a production hosting certificate** until edge TLS + secrets verified on the target host.
