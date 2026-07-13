# Operational linkage assessment (honest)

**Date:** 2026-07-13  
**Scope:** Live local DB + running API (`clean2`, profile `local`) + source inspection  
**Stance:** No sugar-coating. What works, what is half-built, what is broken or empty.

### P0 applied (2026-07-13, commit `6105bcc` / migration **V201**)

| Fix | Result |
|-----|--------|
| DAS no longer has false `incidents.approve` / `close` | Has `view` + `comment` (+ legacy create/update until further tighten) |
| Planning / logistic seats | District Planning **156**, District Logistic **156**, Regional Planning **26**, Regional Logistic **26** |
| Orphan `converted` PHR without link | Demoted to **reviewing** (4); remaining **converted=6 all linked** |
| Convert integrity | Code asserts `linked_incident_id` after convert |

This is the operational truth-check for: **roles → jurisdiction → public report → incident ladder → warehouse/dispatch → EW ↔ incident → portal → notifications → repository → command post / simulations → dissemination**.

---

## Executive verdict

| Area | Honest grade | One line |
|------|--------------|----------|
| Area jurisdiction (district / region / national) | **Strong** | Scoped lists + by-id guards are real code, not docs only |
| Incident approval ladder (Dist DC → DED → RDMC → RAS → EOCC → Director → PS) | **Strong core** | Engine enforces role **and** area at each stage |
| Viewer / comment roles (DC, RC, planning) | **Designed, under-staffed** | Perms exist; planning seats **not seeded** (0 users) |
| Public hazard → incident | **Works with data gaps** | Convert path real; some “converted” rows lack `linked_incident_id` |
| User registration by role in Settings | **Good admin surface** | eGA users/roles/locations/institutions; seat seeding for core posts only |
| Warehouse peacetime + response logistics | **Present, thin data** | Ops/dispatch/bids/approvals APIs live; small stock corpus |
| EW ↔ incident “was it forecast?” | **Analytic, not hard-linked** | Reports compute classes; almost no repository EW links |
| Portal map / news for incidents | **Implemented** | `push-map` / news; few incidents on map |
| In-app notifications | **Active** | 3k+ rows; workflow/EW/scanner types |
| SMS / email | **Partial** | Logs exist; SMS mostly critical + opt-in; not universal |
| Disaster repository | **Live surfaces** | Events + analytics + past disasters; EW coverage **~1.4%** manual |
| Command Post + virtual scenarios | **Substantial** | Coordination hub + scenario injects; large surface still to harden |
| End-to-end “every login sees exact staff” | **Mostly for seeded core posts** | Planning/logistic officer roles empty; DAS permission mismatch |

**Bottom line:** The spine (jurisdiction + modern incident ladder + convert from citizen reports + warehouse/dispatch modules + EW analytics + command post) is **real and operationally usable**. It is **not** yet a perfect fully staffed, fully linked production COP: several documented “viewer” seats are empty, some permission labels lie about who can approve, EW–incident coupling is soft, repository EW links are almost unused, and a few APIs/UI paths still 404 or mislead.

---

## 1. Roles & registration (System Settings)

### What is captured well

- **24 roles** with `category`, `scope_level`, `is_incident_flow`, `is_area_scoped`, `incident_stage` where relevant.
- **Seat seeding** for mainland regions/councils creates: Reg DC, RAS, RC (region) and Dist DC, DED, DAS, District Commissioner (council) — via location service on create/update.
- **User Management** (eGA): attach `region_id` / `district_id` / `council_id` / `agency_id` / `stakeholder_id`; last Super Admin guard; unknown role names rejected.
- **Live attachment quality (high for core posts):**

| Role | Users | With region | With district/council | Seeded |
|------|------:|------------:|----------------------:|-------:|
| DED | 201 | 196 | 201 / 184 | 196 |
| Dist DC | 197 | 196 | 197 / 184 | 196 |
| DAS | 201 | 196 | 201 / 184 | 196 |
| District Commissioner | 197 | 197 | 197 / 184 | 197 |
| RAS / RC | 58 | 57 | 0 | 27 |
| Reg DC | 28 | 27 | 0 | 27 |
| MDA Focal | 211 | 0 | agency 211 | 195 |
| Partners | 165 | stakeholder 165 | — | 160 |

### Gaps (honest)

| Gap | Evidence | Impact |
|-----|----------|--------|
| **District / Regional Planning Officers: 0 users** | DB role counts | Documented “view + comment” seats never log in |
| **District / Regional Logistic Officers: 0 users** | DB | Warehouse/dispatch specialist seats empty |
| **Planning roles have perms (view/comment) but no accounts** | role_has_permissions | Feature exists in matrix, dead in operations |
| **DAS has `incidents.approve` but is not a stage owner** | STAGE_ROLES vs permissions | UI/API may show approve; engine rejects (wrong role) |
| **DAS lacks `incidents.comment`** | permission matrix | DAS cannot use the dedicated comment endpoint (has create/update/approve instead) |
| **Asst. Director not on incident STAGE_ROLES** | IncidentWorkflowService | Incident ladder: EOCC → Director → PS; Asst. Director is stronger on **resource** approval chain |
| Dual paths for approval **config** | Settings eGA + `response/SettingsController` | Operators can confuse which screen is authoritative |

### Desired vs actual ladder (incident stages)

| Documented / expected actor | Role name in system | Stage owner? | Live users |
|-----------------------------|---------------------|--------------|------------|
| District coordinator (DDMC) | Dist DC | **Yes** `waiting_ddmc` | 197 |
| DED | DED | **Yes** `waiting_ded` | 201 |
| Planning (district) | District Planning Officer | No — view/comment only | **0** |
| District Commissioner | District Commissioner | No — view/comment | 197 |
| DAS | DAS | **No** (has approve perm — mismatch) | 201 |
| RDMC | Reg DC | **Yes** `waiting_rdmc` | 28 |
| RAS | RAS | **Yes** `waiting_ras` | 58 |
| Planning (region) | Regional Planning Officer | No — view/comment | **0** |
| RC | RC | No — view/comment | 58 |
| EOCC | EOCC | **Yes** | 1 |
| Director | Director | **Yes** | 1 |
| PS | Secretary | **Yes** | 1 |

---

## 2. Jurisdiction (area-specific dashboards)

### What works

- `JurisdictionScope`: NATIONAL / REGION (RAS, RC, Reg DC) / DISTRICT (DED, DAS, Dist DC) with `appendAreaScope`, `appendAreaScopeWithCouncil`, `appendAreaScopeSharedOrOwn`, warehouse national widen.
- `AreaGuard.assertOwn` / `assertOwnOrShared` / `assertWarehouseVisible` on by-id mutations.
- Incident list and workflow **re-check area** at submit/approve (not list-only theatre).
- Live incidents carry `region_id` / `district_id` (and sometimes council); origin mostly `district`.

### Residual risks

- Officers with **role but null area** cannot action area stages (strict — correct, but bad if registration incomplete).
- “Shared or own” registries (stakeholders, some catalogues) intentionally leak national/shared rows into area views — by design, not a bug.
- Council vs district dual-key: incidents without `council_id` fall back to district match; mixed data quality can confuse LGA-only officers.

---

## 3. Public hazard report → incident → ladder

```
Citizen portal report (public_hazard_reports)
    → Response Public Reports (review / dismiss / convert)
    → incidents (workflow often starts at waiting_ded after DDMC convert)
    → Dist DC / DED / Reg DC / RAS / EOCC / Director / PS
    → comments (viewers) · resolve locally (DED/RAS) · close-rumor (DDMC path)
    → push-map / push-news (portal)
    → allocations / dispatch / tasks / command post
```

### Evidence

| Check | Result |
|-------|--------|
| Public reports statuses | new 14, converted 10, dismissed 1 |
| Converted **without** `linked_incident_id` | **4 rows** (integrity debt) |
| Incident workflow mix | draft, waiting_ded/rdmc/ras/eocc, approved, cancelled, closed |
| Convert API | Real; geo required; area guard on convert |
| Comment API | `POST .../incidents/{id}/comments` + history |
| Stage notify | `IncidentWorkflowService.notifyStage` → in-app; SMS if critical + user opt-in |

### Gaps

- Not every converted report points at an incident (orphaned `converted` status).
- Operational statuses (`escalate` / `verify` / `close`) are **parallel** to the modern ladder (legacy-ish ops states) — can confuse operators if both are used without UI discipline.
- Citizen → DDMC “presence approve” is convert-time; full multi-step drama depends on officers actually logging in as Dist DC / DED in that area.

---

## 4. Warehouse, donations, dispatch (peace + incident)

| Capability | API / module | Live data (local) | Notes |
|------------|--------------|-------------------|--------|
| Warehouses registry | `/v1/warehouses` (eGA) | 15 warehouses | Area + national view_national |
| Inventory | `/v1/inventory` (eGA) | 25 lines, 57 movements | Peacetime stock real |
| Temp stores | `/v1/temporary-warehouses` | 8 | |
| Warehouse ops | `/v1/response/warehouse-ops` | 200 | Intake/transfer/borrow paths |
| Allocations | `/v1/response/allocations` | 15 allocated_resources | Incident-linked requests |
| Dispatch | `/v1/response/dispatch` | 200 | Stock journal; sim isolation |
| Approvals (resource chain) | `/v1/response/approvals` + engine | Configured module `resource_allocation` | Separate from **incident** ladder |
| Partner bids / donations | bidding controller | 12 bids | Index path returned **404** on smoke (investigate auth/path/guard) |
| Support pledges | `/v1/response/support` | 1 pledge | Training/measure funding |
| Agency stock | agency_resources | 4 lines | Stakeholder coordination name-match |

**Honest:** Logistics **code path is there** and safer than it was (simulation isolation, warehouse national flag). Local corpus is **demo-thin**. Partner donation/bid UX must be re-verified until bidding index is reliably 200 for Super Admin.

---

## 5. Early Warning ↔ incidents ↔ portal map

### What works

- Native EW bus (products, agency submissions, lifecycle, scanner, bulletins).
- **EW Management report** (`/v1/reports/early-warnings`) classifies:
  - warning → no incident  
  - warned incident (area + time + hazard match)  
  - unwarned incident  
  - preparedness during warning  
- Live summary (this environment): **8** warnings issued, **0** warned-incident hits, **15** unwarned incidents, **7** warning-no-incident, DRR EW coverage **1.4%** (manual repository links).

### What does **not** exist (important)

- **No `warning_id` / forecast FK on `incidents`** — linkage is **computed**, not stored at conversion/create time.
- Repository “linked to early warning” is **manual curation**, not automatic from the report.

### Portal map

- Incidents: `show_on_portal_map` via `push-map` — **3 / 25** on map in this DB.
- EW map UIs exist under preparedness / partner portal routes.
- Co-plotting “warning polygon + incident pin” depends on FE map layers + data quality (coords); not a single hard join table.

---

## 6. Notifications (in-app / SMS / email)

| Channel | Evidence | Honest take |
|---------|----------|-------------|
| In-app `resource_notifications` | 3121 rows; types: scanner_*, early_warning_*, incident_workflow (66), approval_*, task_*, warehouse_*, dispatch_* | **Working backbone** |
| SMS logs | 92 | Used; not every transition SMS |
| Email logs | 509 | Used for some digests / delivery |
| Incident stage notify | Soft-fail if notify throws (workflow continues) | Correct resilience; can hide delivery failure |
| User flags | `notify_in_app` / `notify_email` / `notify_sms` | SMS remains opt-in |

---

## 7. Disaster repository & knowledge

| Surface | Path | Live |
|---------|------|------|
| Past disasters | `/v1/past-disasters` | 200 (11 rows) |
| Repository events | `/v1/repository/events` | 200 (86 events) |
| Repository analytics | `/v1/repository/analytics` | 200 |
| EW management | `/v1/reports/early-warnings` | 200 |
| Knowledge (recovery) | recovery knowledge routes | Present in FE |

**Gap:** Aggregated “everything linked” story (incidents + EW + cost + warehouses) is **partial**: analytics exist, but automatic cross-entity graph is incomplete (especially EW links).

---

## 8. Command Post & virtual simulations

| Piece | Status |
|-------|--------|
| Command Post hub | `/v1/response/coordination` + FE command-center — **live** |
| Scenarios / injects | `/v1/response/coordination/scenarios`; local injects can be enabled |
| `is_simulation` isolation | Incidents/activations/dispatch respect simulation flags |
| Executive Watch | National-only COP; 404 for area officers (intentional) |
| Scale | CommandCenterController is **very large** (~1.8k lines) — high change risk; eGA migration deferred |

---

## 9. Dead, misleading, or unproductive bits (found)

| Item | Nature | Action needed |
|------|--------|---------------|
| Planning / logistic **roles with 0 users** | Operational dead seats | Seed seats or drop from “required ops” narrative |
| **DAS has approve, not stage owner** | Misleading permission | Align: either add DAS stage or remove approve, add comment |
| **DAS missing `incidents.comment`** | Incomplete viewer path | Grant comment if DAS is advisory |
| Converted PHR without `linked_incident_id` | Data integrity | Repair script + enforce non-null on convert |
| **Asst. Director** on resource chain not incident ladder | Dual ladders confuse training | Document clearly in UI |
| Dual approval config UIs | Settings + response/settings | Prefer one canonical admin screen |
| Bidding **root** `/response/bidding` has no GET | Controller only exposes subpaths (`/donations`, `/open-needs`, bids…) | Document FE entry URLs; do not call root “broken module” |
| Dashboard “dead button” comment in code | Known incomplete UX | Finish or remove |
| Legacy workflow status labels | Residual rows/history | Keep for history only; hide from main filters |
| Soft EW–incident match with 0 hits | Analytics empty story | Improve matching and/or write hard links on convert |

---

## 10. What is already strong enough to trust as “linked”

1. **Area isolation** for incidents (list + action).  
2. **Modern incident ladder** with stage role + area enforcement + notify.  
3. **Citizen report convert** into the ladder.  
4. **Comment trail** for designated viewer roles (when accounts exist).  
5. **Resource allocation approval engine** (configurable chain; Super Admin catalogue guard fixed).  
6. **Warehouse/dispatch/sim isolation** patterns.  
7. **EW bus + effectiveness report** (even if hard FK missing).  
8. **Settings eGA** for users/roles/locations/institutions (admin registration path).  
9. **Command Post + scenarios** as operational hubs.  
10. **In-app notification volume** proves many modules fire events.

---

## 11. Priority fix backlog (operational perfection — ordered)

### P0 — trust / access correctness

1. Fix **DAS permission pack** (comment vs approve vs stage ownership) to match doctrine.  
2. **Seed Planning (+ optional Logistic) seats** per council/region (or stop documenting them as live).  
3. Repair **converted reports** missing `linked_incident_id`; enforce on convert.  
4. Resolve **bidding 404** for intended personas.

### P1 — linkage depth

5. On incident create/convert, optionally **stamp soft or hard EW context** (nearest covering warning).  
6. Raise repository EW link coverage (tools already note manual link suggestions).  
7. Ensure portal map + EW layers share consistent geo + hazard keys in FE.  
8. End-to-end drill script: citizen report → Dist DC → DED → Reg DC → RAS → EOCC (one region) with SMS/in-app proof.

### P2 — logistics & COP

9. Thicker warehouse/donation E2E tests (peace + incident).  
10. Continue **eGA Response leafs** only by isolation order (R2 executive → … never engine first).  
11. Slim/split Command Post over time; do not big-bang move.

### P3 — hygiene

12. Remove or finish dead dashboard actions.  
13. Collapse dual approval settings screens.  
14. Document dual ladders (incident vs resource) in operator handbook.

---

## 12. How this guides “proceed”

- **Do not** pretend planning officers are in production until seats exist.  
- **Do** keep jurisdiction + ladder as the non-negotiable spine when touching Response.  
- **Next engineering moves** should prefer: P0 permission/seed/data integrity, then P1 EW hard/soft link, then next safe eGA leaf (Executive Watch), with full regression matrix each time.

---

## 13. Evidence anchors (this environment)

- DB: `localhost:5440/dmis`  
- Roles: 24; planning/logistic users: 0  
- Incidents: 25 rows; public reports: 25; on portal map: 3  
- EW report: warned_incident 0, unwarned 15, coverage 1.4%  
- Notifications: 3121 in-app; SMS 92; email 509  
- Warehouses 15; inventory 25; allocations 15; bids 12  

*Re-run this assessment after each P0 fix; do not treat the document as static fiction.*
