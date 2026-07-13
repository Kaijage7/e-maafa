# eGA-standard deep assessment + E2E (2026-07-13)

**Stance:** No sugarcoating. eGA structure is binding; Response/EW remain transitional fat packages until migrated. Fixes in this pass are security/correctness first, not cosmetic rewrites.

## 1. eGA compliance (as they are)

| Layer | Status | Evidence |
|-------|--------|----------|
| Canonical tree `controller` / `service` / `impl` / `repository` / `entity` / `dto` | **Present** | 21 thin eGA controllers, 21 service + 21 impl |
| Settings + preparedness masters | **Migrated** | users, roles, locations, institutions, resources, translations, warehouses, inventory, temp WH, training, alert-subs, evacuation |
| Response leaves | **Migrated** | SC, Executive Watch, Public Reports, Contingency Plans, Support Pledges, Declarations, Anticipatory Plans, **Tasks** |
| Response remaining | **Legacy fat** | ~14 controllers under `response/` with JdbcTemplate (CommandCenter ~1.8k, Incident ~1.3k, Dispatch ~900, Bidding ~1k) |
| EW / finance / onehealth / portal | **Legacy feature packages** | Expected under transition rules |
| New endpoints rule | **Must use eGA layers** | Do not add controllers under `response/` / `ew/` for new work |
| Next eGA leaf (binding order) | ~~**Tasks**~~ **DONE** | Next: Assessments or Communication (never engine/dispatch first) |

**Honest score:** Master data + eight Response leaves are eGA-shaped. Operational Response spine is **production-real but not eGA-layered** yet. That is documented transition debt, not pretend compliance.

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
7. Next: Tasks (never engine/dispatch/allocation first).  
8. Keep logistics in place; extract services only when touching heavily.  
9. Stamp area on temp warehouses + agency stock data hygiene.  
10. Integration tests: Reg assessments index, form-data picker, movements warehouse_id, loans Returned.
