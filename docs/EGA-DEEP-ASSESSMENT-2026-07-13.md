# eGA-standard deep assessment + E2E (2026-07-13)

**Stance:** No sugarcoating. eGA structure is binding; Response/EW remain transitional fat packages until migrated. Fixes in this pass are security/correctness first, not cosmetic rewrites.

## 1. eGA compliance (as they are)

| Layer | Status | Evidence |
|-------|--------|----------|
| Canonical tree `controller` / `service` / `impl` / `repository` / `entity` / `dto` | **Present** | 14 thin eGA controllers, 15 service + 15 impl |
| Settings + preparedness masters | **Migrated** | users, roles, locations, institutions, resources, translations, warehouses, inventory, temp WH, training, alert-subs, evacuation |
| Response R1 | **Migrated** | `StakeholderCoordinationController` + service |
| Response remaining | **Legacy fat** | 21 controllers under `response/` with JdbcTemplate (CommandCenter ~1.8k, Incident ~1.3k, Dispatch ~900, Bidding ~1k) |
| EW / finance / onehealth / portal | **Legacy feature packages** | Expected under transition rules |
| New endpoints rule | **Must use eGA layers** | Do not add controllers under `response/` / `ew/` for new work |
| Next eGA leaf (binding order) | ~~**Executive Watch**~~ **DONE** | Thin controller + service.impl; next: public reports (never engine/dispatch first) |

**Honest score:** Master data + first Response leaf are eGA-shaped. Operational Response spine is **production-real but not eGA-layered** yet. That is documented transition debt, not pretend compliance.

## 2. Deep multi-persona E2E (what is solid)

| Surface | Result |
|---------|--------|
| Incidents list/detail isolation | Dist Urban/City/Reg walls hold; OOA **404** |
| EW warnings + stats | Area seats Dodoma-only; stats match list |
| Warehouses / stock / intake | OOA **404**; Dist manage **403** |
| Allocations / track / dispatch board / approvals / procurement | Area walls hold |
| Multi-channel logistics | warehouse, temp, agency, agency-request, procurement, stakeholder (prior commits) |
| Task create/show area | OOA **404**; same-district create **200** |
| eGA thin APIs | users, roles, locations, institutions, inventory, training, SC all **200** |
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
- Next large eGA move: **Executive Watch** service extraction (read-only).

## 5. Commits in this deep-fix arc (logistics + assessment)

Prior: logistics SoD, procurement scope, agency-request, filter productivity.  
This commit: assessments 409 root cause + form-data + params + executive 403 + loan both-ends.

## 6. Recommended next work (order)

1. eGA migrate **ExecutiveWatch** (thin controller + service.impl) — binding next leaf.  
2. eGA migrate **Public Reports** (high operational value, smaller surface than dispatch).  
3. Keep logistics in place; extract services only when touching heavily.  
4. Stamp area on temp warehouses + agency stock data hygiene.  
5. Integration tests: Reg assessments index, form-data picker, movements warehouse_id, loans Returned.
