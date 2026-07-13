# eGA-standard deep assessment + E2E (2026-07-13)

**Stance:** No sugarcoating. eGA structure is binding; Response/EW remain transitional fat packages until migrated. Fixes in this pass are security/correctness first, not cosmetic rewrites.

## 1. eGA compliance (as they are)

| Layer | Status | Evidence |
|-------|--------|----------|
| Canonical tree `controller` / `service` / `impl` / `repository` / `entity` / `dto` | **Present** | 36 thin eGA controllers, 36 service + 36 impl |
| Settings + preparedness masters | **Migrated** | users, roles, locations, institutions, resources, translations, warehouses, inventory, temp WH, training, alert-subs, evacuation |
| Response leaves | **Migrated** | **All former fat Response controllers** are eGA-layered |
| Response remaining | **Support hubs only** | Transitional services in `response/` (`IncidentWorkflowService`, `ApprovalWorkflowEngine`, `DispatchSupportService`, `ActivationService`, `SimulationGuard`) |
| EW | **In progress** | First leaf **Boundary** done; remaining: lifecycle, products, agency, bulletin ingest, scanner (+ query service) |
| New endpoints rule | **Must use eGA layers** | Do not add controllers under `response/` / `ew/` for new work |
| Next eGA leaf (binding order) | ~~**EW Boundary**~~ **DONE** | Next EW: smallest/safest remaining (`EwController`+query, or bulletin ingest) — never lifecycle engine first |

**Honest score:** Master data + full Response controllers + first EW leaf are eGA-shaped. Residual debt is EW fat controllers and Response support services.

## 2. Deep multi-persona E2E (what is solid)

| Surface | Result |
|---------|--------|
| Incidents list/detail isolation | Dist Urban/City/Reg walls hold; OOA **404** |
| EW warnings + stats | Area seats Dodoma-only; stats match list |
| Warehouses / stock / intake | OOA **404**; Dist manage **403** |
| Allocations / track / dispatch board / approvals / procurement | Area walls hold |
| Multi-channel logistics | warehouse, temp, agency, agency-request, procurement, stakeholder (prior commits) |
| Task create/show area | OOA **404**; same-district create **200** |
| eGA thin APIs | users, roles, locations, institutions, inventory, training, SC, executive, public-reports, contingency-plans, support, **declarations** all **200** |
| Public Reports scopes | Dist/Reg walls hold; OOA mutations **404**; convert lands `waiting_ded` |
| Contingency Plans | Filters productive; lifecycle + 422 rules; Dist/DLO **403**; national list by design |
| Support Pledges | National donor queue; accept funds training; Dist accept **403**; validation **422** |
| Declarations | Full statutory chain; Dist/Reg **403**; stage/role rules; drill net-zero |
| Anticipatory Plans | Reg area scope; OOA show **404**; OOA create **422**; CP readiness still has `anticipatory_plans` |
| Tasks | Reg stats area-scoped; OOA show/create **404**; status/assign **200**; drill net-zero |
| Assessments | Multipart create; Reg OOA **404**; Dist **403**; submit/verify; stats filter productive (no 409) |
| Communication | Dash/alerts/analytics **200**; Dist **403**; template CRUD; app-only send drill net-zero |
| Response Settings | Chains/resources/types/automation **200**; Dist **403**; resource in-use delete **422** |
| Exercise Scenarios | Index/show **200**; Dist **403**; create validation **422**; create drill net-zero |
| Ops Timeline | SA/Reg **200**; Dist OOA **404**; `source=dispatch` productive; bad source **422** |
| DLNA | Index/show **200**; Dist **403**; create/header/section drill net-zero |
| Dashboard + EOCC | SA/DED/RAS/DAS **200**; area stats match pre-extract baseline; unauth **401**; activate empty **422**; DAS activate **403** |
| Resource Approvals | SA/DED/RAS/DAS list match; DED show OOA **404**; RAS show in-region **200**; reject empty **422** net-zero; Partner/DLO approve **403**; pending unchanged |
| Resource Allocations | SA/DED/RAS/DAS index+form-data match; track SA **200** / DED+RAS OOA **404**; store empty **422** with `errors`; Partner **403**; reject empty net-zero; pending unchanged |
| Warehouse Ops | SA/DED/RAS/DAS warehouse counts match; movements/capacity/loans scoped; DED OOA stock **404**; Partner **403**; bad remove + empty stock-taking **422** (no ledger mutation) |
| Dispatch | SA/DED/RAS/DAS board stats match; sources SA/RAS **200** DED OOA **404**; procurement track DED **404**; empty dispatch **422** net-zero; Partner **403** |
| Stakeholder Bidding | SA/DED/RAS/DAS donations/open-needs/NDMF match; pool SA **200** Dist/Reg OOA **404**; empty bid/ndmf **422** net-zero; Partner module **403** |
| Incidents | SA/DED/RAS/DAS index+form-data match; show OOA **404**; ops-timeline coexists **200**; empty store/update **422** with `errors`; Partner approve **403**; no workflow mutation |
| Command Center | SA index/warnings/board/readiness/AAR match; scenarios coexists **200**; Dist/Reg board OOA **404**; Dist warnings **403**; bad posture/forecast **422** net-zero; Partner **403** |
| EW Boundary | GET reports **200**; blank filters = full list; `warning_code` scopes; nonsense = **0**; AND filters productive; empty store **422** (`focal_point_name`); create+filter+delete net-zero; Partner **403**; DAS create **403** |
| Module guards | Dist **403** on executive (no perm), anticipatory (no perm), settings |

## 3. Issues found by deep audit → fixed this pass

| Sev | Issue | Fix |
|-----|-------|-----|
| **H** | Assessments index **409** for Reg/DAS/RAS | Stats/charts reused params that already held area binds → SQL arg mismatch. **Fresh filterParams per query.** |
| **H** | Assessments form-data national incident picker | `appendAreaScopeWithCouncil` on incidents |
| **M** | `status_filter=all` → 0 rows | Treat `all`/`any`/`*` as unfiltered |
| **M** | `movements?warehouse_id=` ignored | Productive zonal/temp filter + OOA 404 |
| **M** | Loans `status=Returned` ignored | Equality / allowlist |
| **M** | Loans showed Dar borrower via in-region lender | **Both ends** must be visible |
| **M** | Executive Reg → **404** | **403** AccessDenied for non-national tier |

## 4. Residual honest limits (not faked closed)

- Response/EW/CommandPost still fat JDBC packages (eGA migration backlog).  
- Support needs/pledges = national donor/PMO queue by design.  
- Untagged temp/agency stock still “shared” until stamped.  
- Dual resource catalogue paths remain.  
- ~~Next large eGA move: Executive Watch~~ — **DONE** (`d9fdb79`).  
- ~~Public Reports eGA extract~~ — **DONE** (`f8e7d7c`; convert still couples to `IncidentWorkflowService`).  
- ~~Contingency Plans eGA extract~~ — **DONE** (no Response workflow coupling; `CurrentUserResolver` only).  
- ~~Support Pledges eGA extract~~ — **DONE** (NotificationService retained; national donor queue by design).  
- ~~Declarations eGA extract~~ — **DONE** (statutory chain; `CurrentUserResolver` + NotificationService; no workflow coupling).  
- ~~Anticipatory Plans eGA extract~~ — **DONE** (`matchingPlans` on service; CommandCenter rewired off fat controller).  
- ~~Tasks eGA extract~~ — **DONE** (NotificationService retained; area scope on board/calendar/form-data/show).  
- ~~Assessments eGA extract~~ — **DONE** (multipart + ApprovalWorkflowEngine.initialize for resource lines).  
- ~~Communication eGA extract~~ — **DONE** (`@Scheduled` dispatch on service.impl; ExternalDeliveryService + NotificationService retained).  
- ~~Response Settings eGA extract~~ — **DONE** (JdbcTemplate only; `IncidentOptions` vocabulary helper retained).  
- ~~Exercise Scenarios eGA extract~~ — **DONE** (`ActivationService` retained for launch; create drill only, no launch in verify).  
- ~~Incident Ops Timeline eGA extract~~ — **DONE** (read-only; shared `/v1/response/incidents` base with fat IncidentController).  
- ~~DLNA eGA extract~~ — **DONE** (PDF + NotificationService retained; request records on service interface).
- ~~Dashboard + EOCC eGA extract~~ — **DONE** (`CurrentUserResolver` + `ActivationService` + JurisdictionScope; multi-persona baseline match).
- ~~Resource Approvals eGA extract~~ — **DONE** (`ApprovalWorkflowEngine` retained; `CurrentUserResolver`; reject validation → BusinessRuleException; multi-persona baseline match).
- ~~Resource Allocations eGA extract~~ — **DONE** (engine + DispatchSupportService + SimulationGuard retained; `ALLOCATION_TYPE` public; store `errors` map preserved; multi-persona baseline match).
- ~~Warehouse Ops eGA extract~~ — **DONE** (DispatchSupportService + SimulationGuard + NotificationService retained; multi-persona baseline; no stock mutation in verify).
- ~~Dispatch eGA extract~~ — **DONE** (DispatchSupportService + SimulationGuard + NotificationService retained; APPROVAL_REQUIRED_SOURCES public; multi-persona baseline; no stock mutation in verify).
- ~~Stakeholder Bidding eGA extract~~ — **DONE** (DispatchSupportService + SimulationGuard + NotificationService retained; multi-persona baseline; no stock/donation mutation in verify).
- ~~Incidents eGA extract~~ — **DONE** (IncidentWorkflowService retained; findOr404 public; multipart store/update; coexists with ops-timeline; multi-persona baseline; no workflow mutation in verify).
- ~~Command Center eGA extract~~ — **DONE** (ActivationService + AnticipatoryPlansService retained; coexists with scenarios; multi-persona baseline; no posture mutation in verify).
- ~~EW Boundary eGA extract~~ — **DONE** (JdbcTemplate + CurrentUserResolver; productive bulletin/warning filters; store validation; create drill net-zero).

## 5. Commits in this deep-fix arc (logistics + assessment)

Prior: logistics SoD, procurement scope, agency-request, filter productivity.  
This commit: assessments 409 root cause + form-data + params + executive 403 + loan both-ends.

## 6. Recommended next work (order)

1. ~~eGA migrate **ExecutiveWatch**~~ — **DONE**.  
2. ~~eGA migrate **Public Reports**~~ — **DONE**.  
3. ~~eGA migrate **Contingency Plans**~~ — **DONE**.  
4. ~~eGA migrate **Support Pledges**~~ — **DONE**.  
5. ~~eGA migrate **Declarations**~~ — **DONE**.  
6. ~~eGA migrate **Anticipatory Plans**~~ — **DONE**.  
7. ~~eGA migrate **Tasks**~~ — **DONE**.  
8. ~~eGA migrate **Assessments**~~ — **DONE**.  
9. ~~eGA migrate **Communication**~~ — **DONE**.  
10. ~~eGA migrate **Response Settings**~~ — **DONE**.  
11. ~~eGA migrate **Exercise Scenarios**~~ — **DONE**.  
12. ~~eGA migrate **Ops Timeline**~~ — **DONE**.  
13. ~~eGA migrate **DLNA**~~ — **DONE**.  
14. ~~eGA migrate **Dashboard + EOCC**~~ — **DONE**.  
15. ~~eGA migrate **Resource Approvals**~~ — **DONE**.  
16. ~~eGA migrate **Resource Allocations**~~ — **DONE**.  
17. ~~eGA migrate **Warehouse Ops**~~ — **DONE**.  
18. ~~eGA migrate **Dispatch**~~ — **DONE**.  
19. ~~eGA migrate **Stakeholder Bidding**~~ — **DONE**.  
20. ~~eGA migrate **Incidents**~~ — **DONE**.  
21. ~~eGA migrate **Command Center**~~ — **DONE**.  
22. ~~eGA migrate **EW Boundary**~~ — **DONE**.  
23. Next EW leaves: read registry (`EwController`/`EwQueryService`), then bulletin ingest, products, agency, lifecycle, scanner.  
24. Stamp area on temp warehouses + agency stock data hygiene.  
25. Integration tests: Reg assessments index, form-data picker, movements warehouse_id, loans Returned.
