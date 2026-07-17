# Go-live decision: must-close vs accepted deferred

**Product:** e-MAAFA / DMIS  
**Audience:** PMO ICT, operations, architecture review  
**Baseline code:** `main` / `clean2` @ `c73bb2f` (2026-07-17)  
**Purpose:** One page that separates **blockers for careful cutover** from **honest roadmap gaps** that must **not** be sold as done.

> This is **not** a signed production certificate. It is a decision aid.  
> Authoritative finding text: `DMIS-AUDIT-FIX-LOG.md`. Hybrid contract: `docs/MOBILE-WEB-HYBRID-API.md`.

---

## 0. How to use this page

1. Walk **Section A (must-close)** on the **target host** before public edge goes live.  
2. Walk **Section B (configure or formally defer)** and tick either **configured** or **signed deferred**.  
3. Walk **Section C (accepted deferred product)** and confirm no brochure/UI claim contradicts it.  
4. Sign the **decision block** at the end.

Truth hierarchy: **running system on target host > this checklist > trackers**.

---

## A. Must-close before public go-live (ops / edge)

These are **not** F105/F114/F116. They are cutover hygiene. Leaving any open on a **public** edge is a real risk.

| ID | Requirement | How to prove | Status |
|----|-------------|--------------|--------|
| **GL-01** | Spring profile **`prod`** (or non-`local`) on the public API | Env shows no `local`; tokenless protected APIs return **401** | ☐ |
| **GL-01b** | `DMIS_AUTH_JWT_SECRET` ≥ 32 random bytes; not a dev default | Startup succeeds; secret not in git | ☐ |
| **GL-01c** | `DMIS_SECURITY_CORS_ALLOWED_ORIGINS` = real SPA origins only | Browser SPA works; foreign origin blocked | ☐ |
| **GL-01d** | TLS at edge (Caddy/nginx/LB); no plain HTTP for operator login on public net | HTTPS only; HSTS as designed | ☐ |
| **GL-01e** | Demo / seed passwords **rotated or disabled** on prod DB | No open `must_change_password=false` demo emails | ☐ |
| **GL-01f** | Flyway applied through **V214** on prod DB (baseline path, not empty V1 fantasy) | `platform.flyway_schema_history` max version ≥ 214, success | ☐ |
| **GL-01g** | Backend health **UP**; unauth sample protected path **401** | `GET /api/actuator/health`; `GET /api/v1/settings/users` | ☐ |
| **GL-01h** | EW PDF sidecar reachable if EOCC/DMD bulletins are in scope | Sidecar health OK; one controlled generate | ☐ |
| **GL-01i** | Persona / jurisdiction smoke on **prod-like JWT** (not only local headers) | Own-area OK; foreign-area 404; fail=0 | ☐ |

**If any row in A is open:** do **not** call the host “live.” Fix or keep it private.

---

## B. Configure or formally defer (channels / optional edge)

These work in code when secrets exist. At cutover, either **configure and dual-prove** or **sign “deferred — not live”**.

| ID | Capability | Live only if | Deferred wording (use this if not configured) | Status |
|----|------------|--------------|-----------------------------------------------|--------|
| **GL-02** | SMS (M-Gov) | Keys, sender ID, **DLR** callback + secret | “SMS gateway not enabled; in-app notifications only.” | ☐ configured · ☐ deferred |
| **GL-03** | Email (SMTP) | Host + credentials | “Email not enabled at cutover.” | ☐ configured · ☐ deferred |
| **GL-08** | Sparse coordinator phones / seats | Data fill or accept incomplete SMS reach | “Phone coverage incomplete; do not rely on SMS for all seats.” | ☐ filled · ☐ accepted |
| **GL-INT** | NIDA / LATRA / NAPA / live IFMIS | MoU + dual-proved round trip; registry `live` only then | “Adapters/export packages only — not live national APIs.” | ☐ dual-proved · ☐ deferred |
| **GL-SSO** | Keycloak live SSO | Engineered and dual-proved | “Self-issued JWT is system of record; Keycloak not live SSO.” | ☐ live SSO · ☐ deferred |

---

## C. Accepted deferred product (roadmap — do not mark FIXED)

These **remain open** in the F-ledger. Go-live of the **operator web platform** can proceed **without** closing them **only if** claims stay honest.

### C1. F105 — AI / ML readiness · **OPEN · GAP**

| | |
|--|--|
| **Missing** | Model registry, model runs, prediction events, feature snapshots, human disposition, governed inference substrate |
| **What is real today** | Deterministic INFORM scoring, keyword scanner, deterministic economics analytics |
| **Allowed claim** | “Risk indices and scanners use transparent deterministic rules.” |
| **Forbidden claim** | “AI predictions,” “ML models in production,” “intelligent forecasting product” |
| **Post go-live work** | Design AI contract + tables + RBAC before any AI UI |

### C2. F114 — Satellite / exposure impact SoR · **OPEN · GAP**

| | |
|--|--|
| **Missing** | Satellite scene SoR, exposure datasets, server footprint ∩ population/assets, full INFORM overlay inside DMD impact as product SoR |
| **What is real today** | Operator/agency synthesis, district polygons, multi-risk bulletin generation, INFORM elsewhere in mitigation |
| **Allowed claim** | “Impact picture is built from agency submissions and operator judgment.” |
| **Forbidden claim** | “Satellite-derived people under water as authoritative casualty counts,” “live EO impact engine complete” |
| **Post go-live work** | Governed `gis-impact` layer catalogue + exposure + audited snapshots |

### C3. F116 — Linkage / capacity / multi-domain offline · **OPEN · PARTIAL**

| | |
|--|--|
| **Delivered (partial, real)** | GraphQL composite reads (`mobileHome`, `incidentWorkspace`, `mobileReference`); REST commands; incident sync cursor + SSE; notification insert cursor; device **registry** for future push; idempotent mobile incident create; **V214 shared JWT denylist** |
| **Still missing** | Native app; FCM/APNs delivery; offline mutation queue beyond incident create; cross-domain delta/conflict; full outbox/broker; multi-node **rate-limit** shared store; load/SLO proof; finance/stock/dispatch full mobile adapters |
| **Allowed claim** | “Web operators use REST. Mobile foundation supports incident-oriented hybrid reads/sync; native push not live.” |
| **Forbidden claim** | “Full offline national mobile platform,” “all modules real-time multi-device complete,” “push notifications live” |
| **Post go-live work** | Product prioritise: push vs offline queue vs capacity tests |

### C4. Related non-F residuals (document, do not hide)

| Residual | Honesty line |
|----------|----------------|
| Angular initial bundle > 500 kB warning | Performance polish, not a security stop |
| Rate limits largely per-node | Size multi-node carefully; denylist is shared (V214) |
| JWT in localStorage | XSS → session risk; CSP helps; full cookie session redesign is later |
| Historical F-items closed with older smokes | Re-smoke high-risk paths on the **target** host before sign-off |

---

## D. What *is* in scope for careful go-live (when A is green)

When **Section A** is complete and **Section B** is configured or signed deferred:

- Operator login (JWT), RBAC, module guards  
- Incident ladder and response flows under permissions  
- Early warning agency bus + PDF bulletins (if sidecar in A)  
- Warehouses / stock / finance guards as implemented  
- Public portal (public-safe surfaces only)  
- INFORM structural risk (deterministic)  
- In-app notifications  
- Integration **packages/registry** (not fake live national feeds)  
- Hybrid **API foundation** for future mobile (not native app ship)

---

## E. Decision block (sign for this cutover)

**Target host / environment:** _______________________  
**Code SHA deployed:** `c73bb2f` or later _______________________  
**Date:** _______________  

| Decision | Tick one |
|----------|----------|
| **A. Must-close** | ☐ All green on target host |
| **B. Channels / integrations** | ☐ All configured and dual-proved · ☐ Deferred items listed below |
| **C. Product gaps F105 / F114 / F116** | ☐ Accepted as deferred with **no overselling** |

**Explicitly deferred at this cutover (list IDs):**  
_______________________________________________________________  

**PMO ICT:** _________________ **Ops:** _________________ **Date:** _________  

---

## F. Related files

| File | Role |
|------|------|
| `docs/GO-LIVE-RUNBOOK.md` | Env vars, residual flags, cutover steps |
| `docs/go-live/05-OPS-AND-HONESTY.md` | Live vs planned vs deferred one-pager |
| `docs/go-live/04-ACCEPTANCE.md` | Pass/fail acceptance |
| `docs/env.prod.example` | Prod env template |
| `scripts/go-live-smoke.sh` | Automated smoke |
| `scripts/go-live-persona-jwt.sh` | Jurisdiction dual-proof |
| `DMIS-AUDIT-FIX-LOG.md` | F105 / F114 / F116 evidence |
| `docs/MOBILE-WEB-HYBRID-API.md` | Hybrid transport boundary |
