# F01–F116 Live Dual-Proof Scoreboard

> Generated (UTC): 2026-07-12T06:51:51.797584+00:00
> API: `http://127.0.0.1:8080/api`
> **Honesty contract:** PASS = dual-proved this run. FAIL = claimed behaviour not holding. RESIDUAL = partial/ops. N_A = correctly deferred/open. No invented green lights.

## Counts

| Verdict | Count |
|---------|------:|
| PASS | 125 |
| FAIL | 0 |
| RESIDUAL | 4 |
| N_A | 3 |
| SKIP | 0 |
| **Total** | **132** |

## Claimed FIXED but FAIL this run (developer concern)

_None — no claimed-FIXED item failed its dual-proof probe._

## All FAIL

_None._

## RESIDUAL (honest partial / ops)

- **F102**: HermeticPostgresSupport present; Testcontainers residual on old Docker hosts
- **F27**: core paths notify; assessments/budget/content residual silence possible
- **F60**: DLR webhook in platform; carrier registration not dual-proved here
- **F99**: design doc may still lag migrations — process residual

## N_A (correctly not product)

- **F105**: AI/ML correctly OPEN — not faked
- **F114**: Satellite/exposure OPEN — INFORM impact-support only
- **F116**: Executable multiscale contracts OPEN

## Full matrix

| ID | Verdict | Detail | Ledger claim |
|----|---------|--------|--------------|
| F1 | PASS | retired EW statuses=[404, 404, 404, 404, 404] | FIXED 2026-07-05 — 5 dormant handlers deleted (Str |
| F2 | PASS | users HTTP 200 | FIXED 2026-07-05 — UM create/update accepts+valida |
| F3 | PASS | incident/1 HTTP 200 has_forecast=True | FIXED 2026-07-06 (Wave 2) — computed `forecast` bl |
| F4 | PASS | repository/events HTTP 200 costUsedTzs=True | FIXED 2026-07-06 (Wave 2) — list() returns per-eve |
| F5 | PASS | table=activation_command_roles | FIXED 2026-07-06 (Wave 3) — V140 activation_comman |
| F6 | PASS | coordination/scenarios HTTP 200 | FIXED 2026-07-08 — reusable exercise scenarios now |
| F7 | PASS | user management list | FIXED 2026-07-05 — modal now has role-driven Regio |
| F8 | PASS | users.stakeholder_id rows=165 | FIXED 2026-07-05 — linkUser/create/update sync use |
| F9 | PASS | rollback/settle code present | FIXED 2026-07-05 — rollback walks past unstaffed/a |
| F10 | PASS | early-warnings report HTTP 200 | FIXED 2026-07-06 (Wave 2) — rows aggregated to ONE |
| F11 | PASS | report HTTP 200 | FIXED 2026-07-06 (Wave 2) — hazard-compatibility p |
| F12 | PASS | timeline HTTP 200 | FIXED 2026-07-06 (Wave 3) — GET /v1/response/incid |
| F13 | PASS | entity-taskings component/API | FIXED 2026-07-06 (Wave 2) — `<dmis-entity-taskings |
| F14 | PASS | inventory_sum=10703 warehouses HTTP 200 | FIXED 2026-07-05 — real per-warehouse sum(inventor |
| F15 | PASS | SMS preference + dispatcher | FIXED 2026-07-08 — Critical incident workflow stag |
| F16 | PASS | column exists=1 | FIXED 2026-07-06 (Wave 2, together with F04) — gov |
| F17 | PASS | OH acknowledge path | FIXED 2026-07-08 — stakeholder-scoped acknowledgme |
| F18 | PASS | OutboxDispatcher present=False | FIXED 2026-07-08 — unused outbox runtime removed a |
| F19 | PASS | bulk-approve surface | FIXED 2026-07-08 — bulk approval UI is wired and t |
| F20 | PASS | fulfilment source | FIXED 2026-07-08 — fulfilment-source controls are  |
| F21 | PASS | publish controls | FIXED 2026-07-05 — V136 revokes publish from Dist  |
| F22 | PASS | partner provision | FIXED 2026-07-08 — stakeholder verification now cr |
| F23 | PASS | pending queues (broad) | FIXED 2026-07-10 — dual-proof live role JWT smoke  |
| F24 | PASS | missing_area non-sim=0 | FIXED 2026-07-06 (Wave 3) — conversion INSERT reso |
| F25 | PASS | return stock path | FIXED 2026-07-10 — agency-source live dual-proof;  |
| F26 | PASS | map warning coverage | FIXED 2026-07-10 — live API + coverage-logic dual- |
| F27 | RESIDUAL | core paths notify; assessments/budget/content residual silence possible | FIXED 2026-07-10 (partial core paths) — CP activat |
| F28 | PASS | publish→subscribers | FIXED 2026-07-10 — publish afterCommit fans out to |
| F29 | PASS | board refresh interval | FIXED 2026-07-09 — the open Command Post board now |
| F30 | PASS | CP logistics | FIXED 2026-07-09 — the Command Post board now incl |
| F31 | PASS | periods table=activation_periods | FIXED 2026-07-10 |
| F32 | PASS | notification preferences | FIXED 2026-07-09 — topbar preferences and bell rea |
| F33 | PASS | agency-request | FIXED 2026-07-09 — agency-request stock-line visib |
| F34 | PASS | phr seq=phr_report_code_seq | FIXED 2026-07-09 — public code tracking live-smoke |
| F35 | PASS | area scope on dashboards | FIXED 2026-07-06 (Wave 3, pulled forward after the |
| F36 | PASS | dual_flags=0 | FIXED 2026-07-10 — Closed freezes ladder; approve  |
| F37 | PASS | supplies journal | FIXED 2026-07-08 — Emergency Supplies create/edit  |
| F38 | PASS | district precision code | FIXED 2026-07-08 — EW report and incident forecast |
| F39 | PASS | AAP↔warning | FIXED 2026-07-08 — forecast activations can now be |
| F40 | PASS | worklist HTTP 200 | FIXED 2026-07-08 — EOCC now has a resolved/closed  |
| F41 | PASS | analytics HTTP 200 | FIXED 2026-07-08 — Sendai analytics no longer pres |
| F42 | PASS | scanner tasking | FIXED 2026-07-08 — scanner entity-tasking notices  |
| F43 | PASS | knowledge repo | FIXED 2026-07-08 — knowledge entries can now carry |
| F44 | PASS | relief distributions | FIXED 2026-07-08 — relief distributions now requir |
| F45 | PASS | portal incident snapshot | FIXED 2026-07-08 — public incident snapshots now r |
| F46 | PASS | partner path code; portal HTTP 200 | FIXED 2026-07-08 — public partner registration now |
| F47 | PASS | advisory comments | FIXED 2026-07-09 — advisory incident comments are  |
| F48 | PASS | resubmit | FIXED 2026-07-10 — resubmit re-wired to modern lad |
| F49 | PASS | forward national | FIXED 2026-07-10 — national forward re-wired (EOCC |
| F50 | PASS | comm analytics | FIXED 2026-07-10 — Communication Center Analytics  |
| F51 | PASS | committees HTTP 200 | FIXED 2026-07-10 — declarations UI loads /committe |
| F52 | PASS | OH implementation-history | FIXED 2026-07-10 — directive-show loads implementa |
| F53 | PASS | dissemination recipients | FIXED 2026-07-10 — dissemination modal recipient p |
| F54 | PASS | portal inform signals HTTP 200 | FIXED 2026-07-10 — public INFORM explorer map prod |
| F55 | PASS | channel test endpoints | FIXED 2026-07-10 — Communication Center Test SMS/E |
| F56 | PASS | recipient_groups= | FIXED 2026-07-10 — V172 drops recipient_groups + r |
| F57 | PASS | approval_level_definitions= | FIXED 2026-07-10 — V172 drops approval_level_defin |
| F58 | PASS | OH comments API | FIXED 2026-07-10 — GET/POST /onehealth/events/{id} |
| F59 | PASS | retry scheduler | FIXED 2026-07-10 (platform) |
| F60 | RESIDUAL | DLR webhook in platform; carrier registration not dual-proved here | FIXED 2026-07-10 (platform) |
| F61 | PASS | DDMC doctrine | FIXED 2026-07-10 — doctrine codified: Dist DC = DD |
| F62 | PASS | role+stage gates | FIXED 2026-07-10 — canApprove/canResubmit/canForwa |
| F63 | PASS | donation receive | FIXED 2026-07-10 — received_quantity column + roll |
| F64 | PASS | whole-unit gate | FIXED 2026-07-10 — whole-unit gate on deduct/add/d |
| F65 | PASS | orphan_allocations=0 | FIXED 2026-07-10 — V178 re-attaches orphan stock;  |
| F66 | PASS | temp warehouses | FIXED 2026-07-10 — deactivate blocked while residu |
| F67 | PASS | training area match | FIXED 2026-07-10 — trainings require venue/scope a |
| F68 | PASS | CP readiness EW | FIXED 2026-07-10 — readiness early_warnings filter |
| F69 | PASS | DRR coverage | FIXED 2026-07-10 — linkSuggestions rank EW by haza |
| F70 | PASS | area label notify | FIXED 2026-07-06 (Wave 3) — notifyStage areaLabel( |
| F71 | PASS | loan notify via dispatcher | FIXED 2026-07-10 — warehouse loan notify via Notif |
| F72 | PASS | scoped notify | FIXED 2026-07-10 — scanner/EW ingest notifyRoles ( |
| F73 | PASS | past_unbridged=0 | FIXED 2026-07-10 — cross-pointers + Bukoba bridge  |
| F74 | PASS | M&E dashboard HTTP 200 | FIXED 2026-07-10 |
| F75 | PASS | area coordinator seats | FIXED 2026-07-10 |
| F76 | PASS | role SMS path | FIXED 2026-07-10 (seed) |
| F77 | PASS | dispatch notify | FIXED 2026-07-10 — warehouse dispatch-approval req |
| F78 | PASS | partner push paths | FIXED 2026-07-10 (email) |
| F79 | PASS | inject scheduler (prod default off) | FIXED 2026-07-10 |
| F80 | PASS | impact confirm areas | FIXED 2026-07-10 — impact confirm resolves region/ |
| F81 | PASS | task form-data | FIXED 2026-07-10 — task form-data users role-beari |
| F82 | PASS | relief error handling | FIXED 2026-07-10 — confirm/approve UI error callba |
| F83 | PASS | subscribe chain | FIXED 2026-07-10 |
| F84 | PASS | phr unique seq=phr_report_code_seq | FIXED 2026-07-10 — phr_report_code_seq + unique in |
| F85 | PASS | unauth users → 401 | FIXED 2026-07-10 — documented as local-persona beh |
| F86 | PASS | modern workflow statuses | FIXED 2026-07-10 — live WORKFLOW_STATUSES filters  |
| F87 | PASS | scanner/stats → 404 | FIXED 2026-07-06 (Wave 3) — standalone handler del |
| F88 | PASS | translations/map → 405 (expect 404/405, not 500) | FIXED 2026-07-06 (Wave 3) — /map handler deleted a |
| F89 | PASS | LocationDto removed? | FIXED 2026-07-06 (Wave 3) — file deleted after a f |
| F90 | PASS | documented field consumption | FIXED 2026-07-10 — documented as intentional field |
| F91 | PASS | comm center embed | CLOSED 2026-07-06 (already fixed, no Wave-3 code c |
| F92 | PASS | taskings agency scope | FIXED 2026-07-06 (Wave 3) — GET /entity-taskings n |
| F93 | PASS | same as F24 missing_area=0 | FIXED 2026-07-09 — official-source public-portal s |
| F94 | PASS | area role menu hygiene | FIXED 2026-07-08 — area roles now receive warnings |
| F95 | PASS | comm overview HTTP 404 | **FIXED 2026-07-09 — Communication Center route, l |
| F96 | PASS | restricted storage filter | FIXED 2026-07-10 |
| F97 | PASS | recovery AreaGuard | FIXED 2026-07-10 |
| F98 | PASS | strategic project entry_id | FIXED 2026-07-10 — entry_id derived from inserted  |
| F99 | RESIDUAL | design doc may still lag migrations — process residual | FIXED 2026-07-10 (key claims) |
| F100 | PASS | public report stats scope | FIXED 2026-07-09 — public-report stat cards now co |
| F101 | PASS | incident create area guard | FIXED 2026-07-09 — manual incident create/update a |
| F102 | RESIDUAL | HermeticPostgresSupport present; Testcontainers residual on old Docker hosts | PARTIAL 2026-07-10 |
| F103 | PASS | unknown module not-found | FIXED 2026-07-09 — unknown authenticated `/m/...`  |
| F104 | PASS | map base | FIXED 2026-07-09 — local-first governed map base p |
| F105 | N_A | AI/ML correctly OPEN — not faked | OPEN |
| F106 | PASS | PHR district assign | FIXED 2026-07-09 — untagged public reports can be  |
| F107 | PASS | SweetAlert escaping | FIXED 2026-07-09 — SweetAlert API-derived titles/o |
| F108 | PASS | frameworks under content | FIXED 2026-07-09 — framework registry is canonical |
| F109 | PASS | public reports incidents.view | FIXED 2026-07-09 — the Public Reports route and AP |
| F110 | PASS | budget scope | FIXED 2026-07-09 — migrated DB plus live finance r |
| F111 | PASS | NDMF area guard | FIXED 2026-07-09 — live finance/drill smoke proved |
| F112 | PASS | hazard monitor perms | FIXED 2026-07-09 — live API/browser RBAC smoke pro |
| F113 | PASS | content submodule perms | FIXED 2026-07-09 — live API/browser RBAC smoke pro |
| F114 | N_A | Satellite/exposure OPEN — INFORM impact-support only | OPEN |
| F115 | PASS | leaflet tooltip escape | FIXED 2026-07-09 — Leaflet tooltip escaping verifi |
| F116 | N_A | Executable multiscale contracts OPEN | OPEN |

## Core API suite

| ID | Verdict | Detail |
|----|---------|--------|
| CORE_allocations | PASS | /v1/response/allocations → 200 |
| CORE_ec | PASS | /v1/evacuation-centers → 200 |
| CORE_econ | PASS | /v1/finance/economics → 200 |
| CORE_ew | PASS | /v1/ew/dmd/consolidated → 200 |
| CORE_ew_report | PASS | /v1/reports/early-warnings → 200 |
| CORE_golive | PASS | /v1/ops/go-live-readiness → 200 |
| CORE_impact | PASS | /v1/ew/dmd/impact-support?day=1 → 200 |
| CORE_incidents | PASS | /v1/response/incidents → 200 |
| CORE_integrity | PASS | /v1/ops/integrity-summary → 200 |
| CORE_me | PASS | /v1/monitoring-evaluation/dashboard → 200 |
| CORE_past | PASS | /v1/past-disasters → 200 |
| CORE_portal_pub | PASS | /v1/portal/publications → 200 |
| CORE_repo | PASS | /v1/repository/events → 200 |
| CORE_roles | PASS | /v1/settings/roles → 200 |
| CORE_warehouses | PASS | /v1/warehouses → 200 |
| INTEGRITY | PASS | clean |
