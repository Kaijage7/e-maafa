# eGA-standard deep assessment + E2E (2026-07-13)

**Stance:** No sugarcoating. eGA structure is binding; Response/EW remain transitional fat packages until migrated. Fixes in this pass are security/correctness first, not cosmetic rewrites.

## 1. eGA compliance (as they are)

| Layer | Status | Evidence |
|-------|--------|----------|
| Canonical tree `controller` / `service` / `impl` / `repository` / `entity` / `dto` | **Present** | 29 thin eGA controllers, 29 service + 29 impl |
| Settings + preparedness masters | **Migrated** | users, roles, locations, institutions, resources, translations, warehouses, inventory, temp WH, training, alert-subs, evacuation |
| Response leaves | **Migrated** | SC, Executive Watch, Public Reports, Contingency Plans, Support Pledges, Declarations, Anticipatory Plans, Tasks, Assessments, Communication, Response Settings, Exercise Scenarios, Ops Timeline, DLNA, Dashboard + EOCC, **Resource Approvals** |
| Response remaining | **Legacy fat** | ~6 controllers under `response/` (CommandCenter ~1.8k, Incident ~1.3k, Dispatch ~900, Bidding ~1k, WarehouseOps, Allocations) |
| EW / finance / onehealth / portal | **Legacy feature packages** | Expected under transition rules |
| New endpoints rule | **Must use eGA layers** | Do not add controllers under `response/` / `ew/` for new work |
| Next eGA leaf (binding order) | ~~**Resource Approvals**~~ **DONE** | Next: logistics spine still last (dispatch/warehouse/allocations/bidding); hubs last |

**Honest score:** Master data + sixteen Response leaves are eGA-shaped. Operational Response spine is **production-real but not eGA-layered** yet. That is documented transition debt, not pretend compliance.

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
16. Next: logistics spine still last (dispatch / warehouse-ops / allocations / bidding).  
17. Keep logistics in place; extract services only when touching heavily.  
18. Stamp area on temp warehouses + agency stock data hygiene.  
19. Integration tests: Reg assessments index, form-data picker, movements warehouse_id, loans Returned.
