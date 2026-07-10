# space02.md — e-MAAFA / DMIS Go-Live System Assessment

> **Generated:** 2026-07-10  
> **Honesty contract:** This document is a **code- and live-smoke-grounded** assessment of the current `dmis-platform` stack (Spring Boot 3.3 / Java 21 / Angular 18 / PostgreSQL / Flyway). It does **not** invent defects to inflate counts, does **not** claim production certification without ops secrets, and distinguishes **working code**, **stale ledger noise**, **fake/theatre**, and **real deferred product**.  
> **Live smoke this day:** 17/17 core APIs **200** (authenticated Super Admin where required); unauth protected sample **401**; health **UP**.

---

## 0. How to read this document

| Section | Purpose |
|---------|---------|
| **1** | What the “116 vs 700+” numbers really mean |
| **2** | System map (modules, controllers, FE routes) |
| **3** | Go-live readiness scorecard (honest) |
| **4** | Interlinkage assessment (how modules share truth) |
| **5** | Database state + **next-level DBA programme** |
| **6** | External integrations (EW entities, NIDA, LATRA, NAPA, Planning, Finance) |
| **7** | Issue register (working / residual / stale / fake / deferred) |
| **8** | Recommended sequence after go-live decision |

**Related ledgers (do not merge blindly):**

| File | Role |
|------|------|
| `dmis-platform/DMIS-AUDIT-FIX-LOG.md` | F01–F116 product findings |
| `space.md` | 2026-07-09 inventory + 712 **tasks** (re-scored N0xx 2026-07-10) |
| `ISSUE-SPACE-RECONCILIATION-2026-07-10.md` | Explains 487 + 712 ≠ 700 bugs |
| `LIVE-ISSUE-TRACKER.md` | Short dual-proof scoreboard |
| **space02.md (this file)** | **Go-live + DBA + integration positioning** |

---

## 1. Issue counting — permanent clarification

| Number | Meaning | Independent unfixed bugs? |
|-------:|---------|---------------------------|
| **116** | Official fix ledger **F01–F116** | Product findings (most closed in campaign) |
| **~154** | Original linkage audit set | Includes many already WORKING |
| **487** | Multi-source inventory rows in `space.md` | **No** — overlaps F+L+EW+SEC+N |
| **712** | Work-breakdown tasks (BA/FR/MI/LI/DO) | **No** — process units, not bugs |
| **1 199** | 487 + 712 “work units” | **No** — inventory + task expansion |

**July-9 live retest noise (N001–N039):** hollow JAR → API 500s; local god-mode → unauth 200s.  
**July-10 dual-proof:** those clusters are **closed** on the running stack (endpoints 200 with auth; unauth 401).  
They remain in `space.md` as history with status **FIXED 2026-07-10**, not as open stop-ship bugs.

---

## 2. System map (as implemented)

### 2.1 Stack

| Layer | Technology | Notes |
|-------|------------|--------|
| API | Spring Boot 3.3.4, context-path `/api` | Method security + ModuleGuard + AreaGuard |
| UI | Angular 18 standalone | ~161 route entries; hub modules permission-gated |
| DB | PostgreSQL 16 | ~**148** public base tables; Flyway files through **V185** |
| Auth | Self-issued HS256 JWT | Keycloak realm JSON exists but **decoder is self-JWT** (not live SSO) |
| SMS | M-Gov HMAC client | Real code; needs prod keys |
| Email | Spring Mail SMTP | Real code; needs prod SMTP |
| EW PDF | Python generate API `:8600` (sidecar) | Proxied as `/ew-api` — not the SoR for warnings |

### 2.2 Backend modules (controller concentration)

| Package | Controllers (approx.) | Primary concern |
|---------|----------------------:|-----------------|
| `response` | 22 | Incidents, CP, allocations, dispatch, assessments, declarations, bidding |
| `portal` + `content` | 9+ | Public portal, news, threats, education, SMS/email logs |
| `mitigation` | 8 | Hazards, RAS, frameworks, infrastructure, past disasters |
| `settings` | 7 | Users, roles, locations, resources, institutions, workflows |
| `ew` | 7 | Warnings, agency bus, products, scanner, bulletins |
| `preparedness` | 6 | Warehouses, inventory, ECs, trainings, subscriptions |
| `onehealth` | 5 | Events, directives, dissemination, dashboard |
| `recovery` | 4 | Relief, programmes, strategic projects, knowledge |
| `reports` | 4 | Incident / EW / resource / generated reports |
| `notification` | 4 | Feed, communication overview, webhooks, channel test |
| `finance` | 2 | Budgets/NDMF, Economics of Disaster |
| `repository` | 2 | Disaster events, Sendai analytics |
| `inform` | 2 | Strategic INFORM + portal public risk |
| `monitoring` | 1 | M&E dashboard / entry |
| `iam` | 1 | Login, 2FA, password lifecycle |
| `stakeholder` | 1 | Stakeholder directory admin |

### 2.3 Core interlink chains (code-backed)

```text
Public report / EW / Scanner
        │
        ▼
   incidents ──────────────► allocated_resources ──► inventory_items
        │                         │                        │
        │                         ▼                        ▼
        │                    budget_commitments      stock_movements
        │                    ndmf_disbursements      warehouses / ECs
        │
        ├──► response_activations (warning_id) ── Command Post
        ├──► anticipatory_action_plans / contingency_plans
        ├──► damage_assessments / DLNA / recovery_programs
        ├──► disaster_events (+ polymorphic links)
        └──► portal_news / early_warnings (publish)

EW entities (tma,mow,gst,moh,moa,nemc,mlf)
        │
        ▼
 ew_agency_submissions ──► dmd/consolidated ──► impact-support (INFORM)
        │                         │
        ▼                         ▼
 bulletins/ingest ──► warnings ──► products ──► disseminate (SMS/email)
```

**Economics of Disaster (v3)** rolls up ledgers via formulas (cash, in-kind, DRR, threat, season) — **deterministic**, not AI.

**PMO-DMD impact:** entity consolidation + PMO paint + **impact-support** layers (INFORM / suggested red-orange-yellow) — **does not** change entity merge or publish path.

---

## 3. Go-live readiness scorecard (honest)

| Domain | Verdict | Evidence |
|--------|---------|----------|
| **Core ops (incident → allocate → dispatch → stock)** | **Ready with ops caveats** | Controllers live; dual-proved in campaign; smoke 200 |
| **EW multi-agency + PMO consolidate + EOCC products** | **Ready for agency bus model** | Native `ew_agency_submissions`; PDF sidecar optional |
| **Finance / NDMF / Economics** | **Ready as DMIS ledger** | Not external IFMIS; formula economics live |
| **INFORM risk** | **Ready (deterministic)** | Engine + portal + impact-support join |
| **One Health / Recovery / M&E / Repository** | **Usable** | APIs smoke 200; depth varies |
| **Auth / RBAC / security baseline** | **Platform ready** | JWT, ModuleGuard, restricted storage, god-mode OFF, logout denylist |
| **SMS / email delivery** | **Code ready / ops-dependent** | M-Gov + SMTP; DLR webhook needs carrier registration |
| **External sector systems (NIDA, LATRA, NAPA, IFMIS…)** | **Not integrated** | Registry names only — see §6 |
| **AI / satellite impact AI** | **Not product** | F105/F114 deferred by design |
| **Fresh empty DB from V1** | **Unsafe** | Must use **baseline @ V122** + Flyway forward |
| **Production certificate** | **Not granted by this doc** | Requires prod profile + secrets + role walkthrough |

### Live smoke (2026-07-10, this assessment)

| Check | Result |
|-------|--------|
| Health | UP / 200 |
| 17 core APIs (auth where required) | **17/17 200** |
| Unauth `/v1/settings/users` | **401** |
| Consolidated EW + impact-support | **200** |

---

## 4. Interlinkage assessment — “is the system one product?”

### 4.1 What is genuinely interlinked

| Link | Mechanism | Quality |
|------|-----------|---------|
| Incident ↔ resources | `allocated_resources.incident_id` + warehouse deduct | Strong |
| Incident ↔ cash | `budget_commitments.incident_id`, NDMF earmark | Strong |
| Incident ↔ CP | `response_activations` + warning_id | Strong |
| EW entities ↔ PMO map | `ew_agency_submissions` + consolidated merge | Strong |
| EW → national warning | bulletin ingest → `warnings` → products | Strong |
| Training ↔ NDMF | `ndmf_disbursements.training_plan_id` | Present |
| Relief ↔ stock | relief confirm → stock movement | Present (post-fix) |
| Economics ↔ many tables | Read-only formula roll-up | Strong for planning |
| Portal ↔ EW/incidents | publish / show_on_map / news | Strong for public path |
| Notifications | NotificationService + sms_logs/email_logs | Backbone real; coverage incomplete for every domain event |

### 4.2 Where linkage is weak or dual-truth

| Issue | Risk | DBA / product action |
|-------|------|----------------------|
| `past_disasters` vs `disaster_events` | Two historical narratives | Master/slave policy + bridge jobs |
| `incidents.status` vs `workflow_status` | Can diverge | Invariants / triggers / UI single source |
| `disaster_event_links` polymorphic | No FK to target entity | Soft integrity jobs + optional typed FKs |
| `approval_workflows` polymorphic | Same | Same |
| Emergency Supplies vs warehouse-ops stock writes | Dual paths | Single write API + ledger reconcile |
| No domain event bus (outbox removed) | Cross-module async hard | F116: real contracts later, not fake outbox |
| District name strings across EW / INFORM / GADM | Match failures on paint/support | Canonical district_id everywhere |

### 4.3 Verdict on interlink

The system is a **real modular monolith with operational golden threads** (incident–stock–cash–EW–portal).  
It is **not** yet a fully event-driven “enterprise bus” product. For go-live, **monolith links + API contracts** are enough; multi-system federation is **phase 2**.

---

## 5. Database assessment & next-level DBA programme

### 5.1 Current facts

| Metric | Approx. value |
|--------|---------------|
| Public base tables | **148** |
| FK constraints (public) | **234** |
| Tables with **no** FK constraints | **56** (includes pure ref/lookup and some soft-link tables) |
| Flyway migration files on disk | **169** (V* through **185** lineage) |
| Fresh install path | **`baseline.sql` @ V122** then Flyway forward |

**Baseline honesty** (`db/baseline/README.md`): migrations were written against a Laravel-era `public` schema; empty DB from V1 fails (e.g. V25 → `agencies`). Baseline is the supported greenfield path. Baseline dump may include **demo users/hashes** — **do not use as production seed**.

### 5.2 Tabular / multi-module data harmony problem

Different modules evolved tables independently:

| Symptom | Example |
|---------|---------|
| Same concept, different tables | past disasters vs repository events |
| Same person, many user_id columns without FK | reviewers, allocators, dispatchers |
| Name-based joins | district_name text vs `districts.id` vs INFORM area code |
| Status vocabularies | incident vs allocation vs warning vs OH |
| Soft polymorphic links | event_links, notifications entity_type/id |

**Goal of next-level DBA work:** one **canonical reference layer** + **integrity jobs** without breaking live modules (non-destructive, expandable).

### 5.3 DBA programme (recommended waves)

#### Wave DBA-0 — Production hygiene (before go-live)

| Task | Action |
|------|--------|
| DBA-0.1 | Provision prod DB from **clean baseline** or certified migrate; **no demo passwords** |
| DBA-0.2 | Backup + PITR policy; connection pool sizing (`DB_POOL_MAX`) |
| DBA-0.3 | Roles: app user least privilege; no superuser for app |
| DBA-0.4 | Confirm Flyway `flyway_schema_history` present and max version matches jar |
| DBA-0.5 | Index health on hot paths: incidents (area, status), allocated_resources, sms_logs, ew_agency_submissions |

#### Wave DBA-1 — Reference data harmonisation (non-breaking)

| Task | Action |
|------|--------|
| DBA-1.1 | **Canonical geography:** `regions` / `districts` / `councils` / `wards` as SoR; backfill `region_id`/`district_id` where only names exist |
| DBA-1.2 | **District name dictionary:** map EW display names ↔ GADM ↔ INFORM codes (table `geo_name_aliases`) |
| DBA-1.3 | **Agency codes:** single `agencies.acronym` vocabulary (tma/mow/…) shared by EW, users, OH |
| DBA-1.4 | **Hazard catalogue:** one `hazards` SoR for incidents, EW, scanner, OH |
| DBA-1.5 | **Resource UoM / categories:** controlled vocab (already partially V65+) — freeze write paths |

#### Wave DBA-2 — Integrity without downtime

| Task | Action |
|------|--------|
| DBA-2.1 | Nightly **orphan report** jobs: user_id not in users; incident_id missing; warehouse stock vs journal drift |
| DBA-2.2 | **Soft FK validation** for polymorphic links (`disaster_event_links`, notifications) → quarantine table |
| DBA-2.3 | Inventory **reconciliation view** (quantity vs sum(movements)) — already campaign-hardened; keep as KPI |
| DBA-2.4 | Status invariant checks: workflow_status ∈ allowed set for operational status |
| DBA-2.5 | Optional: add missing FKs where 100% clean (never force if orphans exist) |

#### Wave DBA-3 — Integration-ready schemas (prepare for external systems)

| Task | Action |
|------|--------|
| DBA-3.1 | **`integration_endpoints`** registry (system, base URL, auth type, status) |
| DBA-3.2 | **`integration_messages`** (inbound/outbound, correlation_id, payload hash, status, retries) |
| DBA-3.3 | **`external_identity_map`** (system, external_id, local_table, local_id) — for NIDA/LATRA/etc. |
| DBA-3.4 | **Idempotency keys** on ingest tables (EW, PHR, NDMF, stakeholder) |
| DBA-3.5 | **CDC / audit** optional: `audit_log` or use existing history tables consistently |

#### Wave DBA-4 — Analytics warehouse (optional, after go-live)

| Task | Action |
|------|--------|
| DBA-4.1 | Read replica for M&E / Economics / Sendai heavy queries |
| DBA-4.2 | Star schemas for incident fact, allocation fact, EW fact (ETL nightly) |
| DBA-4.3 | Do **not** run analytics ETL inside OLTP transactions |

### 5.4 Tabular UI harmony (product + DBA)

| Concern | Approach |
|---------|----------|
| Every module invents its own grid columns | Shared **entity resolvers** (district name, user display, hazard label) |
| Cross-module reports inconsistent | **Views** (`vw_incident_finance`, `vw_incident_resources`, `vw_ew_district_day`) owned by DBA |
| “Single source of truth” for lists | Prefer `id` FKs in API; display names only at presentation |
| Module changes don’t break others | Contract tests on view columns; expand-only migrations |

---

## 6. External integrations — positioning for sectors & national systems

### 6.1 Early Warning entities (in-platform today)

| Entity | Code | Integration mode **today** | Go-live stance |
|--------|------|----------------------------|----------------|
| **TMA** | `tma` | Native REST submit → `ew_agency_submissions` + UI console + PDF helper | **Ready** as DMIS bus participant |
| **MoW** | `mow` | Same | **Ready** |
| **GST** | `gst` | Same (overlay, not hydromet tier) | **Ready** |
| **Health (MoH)** | `moh` | Same | **Ready** |
| **Agriculture (MoA)** | `moa` | Same | **Ready** |
| **NEMC** | `nemc` | Same | **Ready** |
| **MLF** | `mlf` | Same | **Ready** |
| **PMO-DMD** | national | Consolidated + impact-support + ingest multirisk | **Ready** (human decision + support layers) |

**Pattern:** entity systems → **POST `/api/v1/ew/agency/{code}/submission`** (or use DMIS console) → shared latest + consolidated.  
**Not required for go-live:** each ministry’s internal forecast model replacing DMIS; only **structured bulletin/assessment payload** into the bus.

**Future upgrade (without breaking bus):**

- API keys per agency + mTLS  
- Async pull from TMA/MoW official APIs (adapter per entity writing same submission table)  
- Schema version field on payload  

### 6.2 National / sector systems (assessment)

| System | Purpose (expected) | In code today | Positioning for integration |
|--------|-------------------|---------------|------------------------------|
| **NIDA** | National identity (persons) | **Absent** (no API client) | Use `external_identity_map` + verified stakeholder/user identity; never store full NIDA dumps in incidents |
| **LATRA** | Transport / road authority | **Absent** as API; may appear in **institution registry seed** | Partner as `agencies` / stakeholders; resource/logistics APIs later via integration_messages |
| **NAPA** | Planning / investment (national) | **Absent** as API | Finance/planning codes as reference data; future budget line mapping to NAPA programmes |
| **Planning & Investment systems** | Capital/project portfolio | **In-app only** (roles, strategic projects, recovery programmes) | Export/import project codes; do not claim live ERP sync |
| **Finance / IFMIS / MUSE / etc.** | National financial system | **DMIS internal** budgets + NDMF only | Integration via commitment/disbursement export files or payment advice API — **adapter layer**, keep DMIS as disaster ledger of record for ops |
| **M-Gov** | SMS | **Real client + DLR webhook** | Prod keys + DLR URL registration |
| **SMTP** | Email | **Real client** | Prod credentials |
| **Keycloak / IdP** | SSO | **Realm file only; runtime self-JWT** | Optional front door later; document decision |

### 6.3 Integration architecture (recommended — next level)

```text
                    ┌─────────────────────┐
                    │  External systems   │
                    │ NIDA LATRA NAPA …   │
                    │ TMA MoW … IFMIS     │
                    └──────────┬──────────┘
                               │ adapters (per system)
                               ▼
                    ┌─────────────────────┐
                    │ integration_messages│  idempotent, audited
                    │ external_identity_map
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   DMIS domain SoR   │
                    │ incidents, EW, cash │
                    │ stock, INFORM, OH   │
                    └─────────────────────┘
```

**Rules:**

1. **No direct dual-write** from external systems into core tables without adapter validation.  
2. **DMIS remains SoR** for disaster operations; external systems remain SoR for their domain (identity, finance treasury, etc.).  
3. **EW entities** already have a **first-class bus** — extend it; don’t invent a second.  
4. **Finance external:** start with **file/API export** of commitments/disbursements; import payment confirmations later.  
5. **NIDA:** verification service only (yes/no + hashed ref), not full citizen database inside DMIS.

### 6.4 Integration readiness matrix (summary)

| Capability | Ready now | Needs design | Blocked / absent |
|------------|-----------|--------------|------------------|
| Multi-agency EW into one PMO picture | ✅ | Agency API keys | — |
| PMO paint support (INFORM) | ✅ impact-support | Satellite/exposure | Full EO catalogue |
| SMS/email fan-out | ✅ code | Prod gateways | Carrier DLR ops |
| Incident–stock–cash chain | ✅ | — | — |
| NIDA person verify | — | Adapter + legal | No code |
| LATRA ops feed | — | Partner MoU + adapter | No code |
| NAPA programme codes | — | Code list + mapping | No code |
| National IFMIS | — | Export/import contracts | No code |
| AI decision support | — | F105 after F114 | Not faked |

---

## 7. Issue & concern register (space02)

### 7.1 Classification legend

| Tag | Meaning |
|-----|---------|
| **LIVE-OK** | Dual-proved working on current stack |
| **OPS** | Code ready; production config/ops required |
| **RESIDUAL** | Real gap, documented, not stop-ship if accepted |
| **DEFERRED** | Product roadmap (AI/satellite/capacity) |
| **STALE** | Old ledger/retest claim superseded by later proof |
| **FAKE** | Claimed feature that was theatre (mostly closed) |
| **DBA** | Database programme item |
| **INT** | External integration programme item |

### 7.2 Go-live critical concerns (must address or explicitly accept)

| ID | Tag | Concern | Honest status (pre-deploy 2026-07-10) |
|----|-----|---------|----------------------------------------|
| GL-01 | OPS | JWT secret, force-2FA, CORS origins, no `local` profile | **OPEN_AT_CUTOVER** — platform enforces; ops must set `prod` + secrets |
| GL-02 | OPS | M-Gov keys + DLR URL + `DMIS_MGOV_DLR_SECRET` | **ACCEPT_OR_CONFIGURE** — code ready; carrier residual |
| GL-03 | OPS | SMTP credentials | **ACCEPT_OR_CONFIGURE** — code ready |
| GL-04 | OPS | Clean prod database (no demo hashes from baseline dump) | **PLATFORM_OK** Flyway **V195**; clean-DB process at cutover |
| GL-05 | OPS | Role walkthrough: national/region/district + TMA/MoW + partner | **PLATFORM_PROVED** — `go-live-persona-jwt.sh` fail=0; re-run on prod users |
| GL-06 | OPS | Staffing seats for workflow ladder (DED/RDMC/EOCC) | **LIVE_OK** — 0 districts without DAS; 0 regions without RAS |
| GL-07 | RESIDUAL | Restricted storage row-jurisdiction | **CLOSED_PARTIAL** — F96 AreaGuard + fail-closed orphans (non-SA) |
| GL-08 | RESIDUAL | Officer phones sparse → SMS notify weak | **ACCEPT** — DAS phones sparse (data residual) |
| GL-09 | RESIDUAL | PDF generate sidecar HA | **ACCEPT** — optional `:8600`; SoR is Spring warnings |
| GL-10 | RESIDUAL | Self-JWT vs Keycloak messaging honesty | **DOCUMENTED** — self-JWT is SoR |

> Live capture also exposed on `GET /api/v1/ops/go-live-readiness` → `space02IssueRegister`.

### 7.3 Product residuals (not fake, not 700 bugs)

| ID | Tag | Item | Status |
|----|-----|------|--------|
| F105 | DEFERRED | AI/ML registry + prediction + disposition | **DEFERRED** (post go-live) |
| F114 | DEFERRED | Satellite / exposure / full impact snapshot (partial: impact-support INFORM done) | **DEFERRED** |
| F116 | DEFERRED | Executable linkage contracts + multiscale capacity | **DEFERRED** |
| DUAL-01 | DBA | past_disasters vs disaster_events | **LIVE_OK** — genuine past bridged; unbridged=0 |
| DUAL-02 | DBA | status vs workflow_status discipline | **LIVE_OK** — dual_flags=0 |
| POLY-01 | DBA | disaster_event_links soft integrity | **LIVE_OK** — V194 views + V195 orphan cleanup |
| GEO-01 | DBA | District name harmonisation EW/INFORM/GADM | **LIVE_OK** — 156/156 INFORM-mapped |

### 7.4 Stale claims (do not re-open as stop-ship)

| ID | Tag | Note |
|----|-----|------|
| N001–N021 | STALE→FIXED 2026-07-10 | Classpath hollow / 500s |
| N026–N039 | STALE→FIXED 2026-07-10 | Local unauth god-mode leaks |
| space.md OPEN 253 | STALE bookkeeping | Re-score partial; use this file + F-ledger for truth |
| “700 open bugs” | STALE misread | 712 = **tasks** |
| Keycloak “live SSO” | FAKE if claimed | Realm JSON only |
| NIDA/LATRA/NAPA “integrated” | FAKE if claimed | Registry text only |
| Warehouse “stocks always 0” | FAKE closed | Real inventory sum |
| AI “already in DMIS” | FAKE if claimed | Deterministic only |

### 7.5 Working pillars (do not regress)

| ID | Tag | Pillar |
|----|-----|--------|
| W-01 | LIVE-OK | Incident workflow + area scope |
| W-02 | LIVE-OK | Allocation / dispatch / warehouse ledger |
| W-03 | LIVE-OK | EW agency bus + consolidated + impact-support |
| W-04 | LIVE-OK | Budget / NDMF / Economics formulas |
| W-05 | LIVE-OK | INFORM engine + portal risk |
| W-06 | LIVE-OK | Portal public + subscribe path (post F83) |
| W-07 | LIVE-OK | Notification backbone + DLR + retry (platform) |
| W-08 | LIVE-OK | Security baseline (JWT, module guard, god-mode off) |

### 7.6 Integration programme issues (new, explicit)

| ID | Tag | System | Work |
|----|-----|--------|------|
| INT-EW-01 | INT | TMA/MoW/… | Per-agency API credentials + rate limits |
| INT-EW-02 | INT | Entity systems | Optional pull adapters → same submission table |
| INT-NIDA-01 | INT | NIDA | Legal + verify API + identity map |
| INT-LATRA-01 | INT | LATRA | MoU + logistics resource adapter |
| INT-NAPA-01 | INT | NAPA | Programme code list + project mapping |
| INT-PLAN-01 | INT | Planning/Investment | Project code exchange with strategic_projects / recovery |
| INT-FIN-01 | INT | Finance/IFMIS | Commitment export / payment confirmation import |
| INT-MSG-01 | DBA+INT | All | `integration_messages` + idempotency |
| INT-ID-01 | DBA+INT | All | `external_identity_map` |

---

## 8. Recommended path

### If go-live is the priority (next 2–6 weeks)

1. **GL-01…GL-06** ops checklist (secrets, clean DB, roles, phones, walkthrough).  
2. Freeze schema: **expand-only** migrations; no rewrite of baseline mid-go-live.  
3. Accept **DEFERRED** F105/F114 satellite/AI as post-go-live programme.  
4. Keep EW entity bus as the **only** multi-agency path (no parallel theatres).  

### If integration is the priority (parallel track)

1. Implement **DBA-3** tables (`integration_messages`, `external_identity_map`).  
2. Start with **one** external adapter (e.g. TMA product push **or** IFMIS export) end-to-end with dual-proof.  
3. NIDA only after legal + privacy design.  

### If impact realism is the priority (PMO red/orange/yellow)

1. **Already advanced:** impact-support + INFORM + suggested tiers (non-breaking).  
2. Next: exposure grids + satellite metadata (**F114**) still **on top of** consolidation, never replacing it.  
3. AI consolidator (**F105**) only **after** snapshots exist.  

---

## 9. Final go-live statement (one paragraph)

e-MAAFA/DMIS is a **working, interlinked modular disaster operations platform** with real incident–resource–cash–EW–portal–INFORM–finance threads, multi-agency EW consolidation for PMO, and security baselines suitable for a careful production cutover. It is **not** an AI platform, **not** fully integrated with NIDA/LATRA/NAPA/IFMIS, and **not** production-certified until secrets, clean data, gateway registration, and role walkthroughs are done. The appearance of “700+ issues” is largely **task expansion and stale retest noise**; the honest residual is a **manageable set of ops gates + deferred product/integration programmes**, not hundreds of stop-ship code defects.

---

## 10. Document control

| Field | Value |
|-------|--------|
| File | `docs/space02-go-live-assessment.md` |
| Assessment date | 2026-07-10 |
| Live smoke | 17/17 APIs 200; unauth 401 |
| Controllers | ~86 across 17 packages |
| Public tables | ~148 |
| Flyway lineage | through **V196** (V190–V191 integrity; V192–V193 genuine public-source history; **V194–V196 pre-deploy + residual accept flags space02 closeout** — poly-link integrity, UI-test exclude, issue register on readiness board) |
| Platform vs cutover | **Platform code/data integrity for space02 is dual-proved (next-level pre-deploy).** Prod certificate remains **open** until ops secrets, clean DB, role walkthrough, residual sign-off |
| Next review | After prod cutover or first external adapter |

---

## 11. Implementation progress (space02 → production bases) — 2026-07-10

Honest delivery against §5 DBA waves and §7.2 go-live gates. **No fake NIDA/LATRA/NAPA/IFMIS clients.**

| Item | Delivered | Notes |
|------|-----------|--------|
| **GO-LIVE-RUNBOOK** | ✅ `dmis-platform/docs/GO-LIVE-RUNBOOK.md` | GL-01…GL-06 checklist, smoke pack, acceptance form |
| **DBA-3.1–3.3** | ✅ Flyway **V187** | `integration_endpoints`, `integration_messages` (+ idempotency), `external_identity_map`; seed **planned** national systems |
| **DBA-1.2** | ✅ Flyway **V188** | `geo_name_aliases` seeded from `districts.name` |
| **DBA-2** | ✅ Flyway **V188** | Integrity views + `vw_integrity_summary` (report-only) |
| **Ops honesty board** | ✅ `GET /v1/ops/go-live-readiness` | Profile, JWT/M-Gov/SMTP presence, Flyway, integration liveCount (0 = honest) |
| **Integration registry** | ✅ `GET /v1/ops/integration-registry` | Admin read of endpoints + recent messages |
| **Integrity summary** | ✅ `GET /v1/ops/integrity-summary` | Orphan / missing-area / INFORM / dual-status / unbridged counts |
| **Geo alias service** | ✅ `GeoAliasService` + `GET /v1/ops/geo/resolve` | Wired into PMO impact-support name matching |
| **DBA-0.5 indexes** | ✅ Flyway **V189** | Hot-path status/area/export indexes |
| **Residual data integrity** | ✅ Flyway **V190–V191** | Warehouse region stamps; locatable incident area backfill; geo↔INFORM 156/156; drought bridge; terminal status dual repair; demote fake Active Response |
| **Genuine public history** | ✅ Flyway **V192–V193** | NDMS/FloodList/ECHO/EM-DAT/NAO past events + HIST bridges + candidate stadium ECs |
| **Pre-deploy closeout** | ✅ Flyway **V194–V195** | Poly-link integrity views; orphan link cleanup; UI-test hazards off; expanded integrity summary |
| **space02 issue board** | ✅ `go-live-readiness.space02IssueRegister` | Every §7 item live-dispositioned; **openCode=0** |
| **INT-FIN-01 export** | ✅ `POST /v1/ops/integrations/ifmis/export-commitments` | File/API handoff payload + `integration_messages` audit; **not** live IFMIS post |
| **GL-01…GL-06 code** | Platform ready | **Ops must** set secrets, clean DB, role walkthrough on real accounts |
| **INT-NIDA/LATRA/…** | Foundation only | No live clients; IFMIS export is first honest adapter path |

**Working pillars (W-01…W-08) must not regress** while integrating.

### Integrity dual-proof (local, 2026-07-10 post **V195** pre-deploy)

| Metric | Count | Notes |
|--------|------:|--------|
| orphan_allocations / orphan_stock_movements | 0 / 0 | Clean |
| warehouses_national_or_unscoped | 0 | City→region stamp |
| geo_aliases_with_inform | 156 / 156 | GEO-01 closed |
| incident_status_dual_flags | 0 | DUAL-02 closed |
| incidents_missing_area | 0 | Unscoped drafts soft-sim or stamped |
| past_disasters_unbridged | 0 | DUAL-01 closed (genuine history bridged) |
| poly_link_orphans / poly_event_orphans | 0 / 0 | POLY-01 closed (V194 views + V195 cleanup) |
| past_disasters_genuine / HIST-* | 10 / 10 | Public-source staging V192–V193 |
| evacuation_centers | 14 | Candidate shelters (not official gazette) |

### Honest residuals (cannot close in code alone — **captured, not hidden**)

| Class | Items | Disposition |
|-------|--------|-------------|
| **Ops cutover** | `prod` profile, JWT secret, M-Gov keys, SMTP, clean DB, GL-05 on real accounts | **OPEN_AT_CUTOVER / ACCEPT_OR_CONFIGURE** |
| **Legal/adapters** | NIDA / LATRA / NAPA / live IFMIS post | **PLANNED** (export path only) |
| **Deferred product** | F105 AI/ML, F114 satellite, F116 contracts | **DEFERRED** |
| **Data residual** | Sparse DAS phones (GL-08); demo users in local DB | **ACCEPT** at cutover after rotate/delete |

### Local cutover dual-proof (2026-07-10 pre-deploy)

| Check | Result |
|-------|--------|
| Smoke script `scripts/go-live-smoke.sh` | **12/12 PASS** (JWT Super Admin) |
| GL-05 persona JWT script | **fail=0** (DAS/RAS/SA area isolation) |
| GL-06 staffing seats | **0** districts without DAS; **0** regions without RAS; phones sparse = GL-08 |
| INT-FIN-01 IFMIS export | Platform export + audit; **not** live IFMIS |
| Geo + INFORM | `GET /ops/geo/resolve?name=Ilala` |
| Actuator health | **UP** (mail probe off until live SMTP) |
| Readiness board | integrity + `gl06_staffingSeats` + **`space02IssueRegister`** (all §7 items captured live) |
| Flyway | **V195** success |
| Code OPEN count on issue board | **0** (only ops gates + deferred/accept remain) |

### Prod-profile dry-run (same machine, port 18081, then stopped)

| Check | Result |
|-------|--------|
| Missing `DMIS_AUTH_JWT_SECRET` | **Refuse start** |
| Missing `DMIS_SECURITY_CORS_ALLOWED_ORIGINS` | **Refuse start** |
| Both set + DB | health **UP**; unauth **401**; `X-Local-Roles` **401** |
| Super Admin force-2FA enroll | `MFA_ENROLL_REQUIRED` → setup → enable → full session **200** |
| Super Admin force-2FA login | `MFA_REQUIRED` → `/2fa/verify` → full session **200** |
| **Bugfix** | `/v1/auth/2fa/verify` added to public allowlist (was 401 with no session) |
| Frontend production build | **OK** → `frontend/dist/dmis-web` (static index **200**) |
| Env template | `dmis-platform/docs/env.prod.example` |
| Snapshot / master scripts | `cutover-snapshot.sh`, `cutover-verify-all.sh` |

### Next concrete steps for cutover

1. Deploy with **`prod`** + secrets from `docs/env.prod.example` (JWT, CORS, DB).  
2. Create real Super Admin; enroll TOTP (force-2FA); **rotate/delete** demo passwords.  
3. Serve `frontend/dist/dmis-web` behind TLS proxy; re-run smoke with real Bearer.  
4. Sign residual acceptance table in GO-LIVE-RUNBOOK.  
5. Finance: dual-prove IFMIS export with MoF, then mark endpoint `live`.  
6. M-Gov/SMTP only when ready for controlled test send.  
7. National adapters only after MoU + dual-proved client.

**End of space02.md**
