# LIVE-ISSUE-TRACKER

> **Updated:** 2026-07-12 18:18 · Backend **UP** (Flyway **V200**) · space02 **openCode=0**

## Scoreboard (honest)

| Bucket | Count | Notes |
|--------|------:|-------|
| **F01–F116 ledger** | 116 | Official product findings |
| **space02 board (live API)** | **37 items** | `GET /api/v1/ops/go-live-readiness` → `space02IssueRegister` |
| **Code OPEN** | **0** | SUMMARY = `PLATFORM_READY_OPS_GATES` |
| **Ops gates (local edge)** | **1** | GL-01 local profile — expected on this machine |
| **Deferred product** | **3** | F105 AI · F114 full EO SoR · F116 contracts |
| **Planned integrations** | NIDA/LATRA/NAPA/live IFMIS | Registry + IFMIS export only |

**Detail:** `space02.md` §11–§12 · `docs/GO-LIVE-RUNBOOK.md` · `ISSUE-SPACE-RECONCILIATION-2026-07-10.md`

---

## Live proof 2026-07-12 (pre-deploy)

| Check | Result |
|-------|--------|
| Health | **UP** |
| go-live-smoke.sh | **12/12 PASS** |
| Unauth protected sample | **401** |
| Integrity residuals | **all 0** (orphans / dual / poly / unbridged / missing area) |
| Geo ↔ INFORM | **156/156** |
| Module list APIs (Super Admin) | **97/97 200** |
| Jurisdiction (NAT/RAS/DAS) | **dual-proved** |
| Area EW alerts | **dual-proved** |
| Prevention EO two-panel | **LIVE** (exposure, not weather) |

---

## Residual focus (only real “open for cutover”)

| ID | Why open | Next work |
|----|----------|-----------|
| **GL-01** | Must deploy `prod` + JWT + CORS | `docs/env.prod.example` |
| **GL-02/03** | DLR secret / live SMTP optional | Configure or accept deferred env flags |
| **GL-08** | Sparse DAS phones | Fill data or accept |
| **F105 / F114 full / F116** | Roadmap | Post go-live |
| **NIDA/LATRA/NAPA** | No live clients | MoU + adapters |

---

## Production deploy (reminder)

`prod` · real JWT ≥32 bytes · force-2FA · CORS origins · no `local` · **rotate demo passwords**.

**Not a production hosting certificate** until edge TLS + secrets verified on target host.
