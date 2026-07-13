# Area-scope verification (live multi-persona)

**Date:** 2026-07-13  
**Method:** Local API with `X-Local-Roles` + `X-Local-User-Id` (pinned seat so area attachment is real)

## Controls (system management)

| Layer | Mechanism |
|-------|-----------|
| Tier | `JurisdictionScope` from user `region_id` / `district_id` / `council_id` + role fallback |
| Strict lists | Incidents: `appendAreaScopeWithCouncil` |
| Soft lists | Warehouses/stock/stakeholders: own area **or** national/shared (null area) |
| EW | `EwQueryService.visibleWarningIds` + hazard filter by region/district |
| Module enter | `role_has_permissions` + ModuleGuard (must have view authority) |
| Admin | Users/roles/locations in Settings (eGA); seats seeded per region/council/district |

## Results (this environment)

| Persona | Incidents | EW warnings (hazard regions) | Warehouses | Allocations |
|---------|-----------|------------------------------|------------|-------------|
| Super Admin | 15 (multi-region) | 17 (many regions) | 15 | 200 |
| Dist DC user 4 (Dodoma Urban) | **4 Dodoma only** | **3, hazards Dodoma only** | 200 (own+shared) | 200 |
| Reg DC user 11 (Dodoma) | **6 Dodoma only** | **5, Dodoma only** | 200 | 200 |
| Dist DC Arusha | **0** (no local incidents) | **0** | — | — |

**No cross-region incident or EW hazard leakage** observed in assertions.

## Gaps fixed during retest

1. **`X-Local-User-Id`** — pin acting user for honest area tests (not only min role id).  
2. **Tier fallback** — Planning / Logistic / District Commissioner in REGION/DISTRICT role sets.  
3. **Dist DC lacked warehouse/resource view** — 403 on stock/allocations; **V202** grants  
   `warehouse_and_stock.view`, `resource_allocation.view`, `resource_allocation.request`  
   (+ warehouse.view for DAS/DED).  
4. **Warehouse JPA list leak** — `findScoped` treated every `district_id IS NULL` as shared, so  
   Dist DC saw Dar/Arusha/Mbeya stores; fixed to own district **or** (null district **and**  
   own region or fully national). Dist DC Dodoma now **2** warehouses (was 10).  
5. **Backfill** `users.region_id` from district when missing (V202).

## Allocation write-path drill (careful pass, 2026-07-13)

Reversible drill (incident **37** temporarily `approved` + `Active Response`, then restored).

| Step | Dist DC Dodoma (user 4) | Result |
|------|-------------------------|--------|
| form-data before eligibility | 0 pickable incidents | OK (none approved/active) |
| form-data after eligibility | **[37]** only (not Dar #1) | OK |
| POST alloc against Dar #1 | **404** | OK area wall |
| POST alloc against #37 + WH 11 | **200** created id 54 | OK |
| Dist pending queue | sees **54** | OK |
| Track #54 Dist | **200** | OK |
| Track #54 Arusha Dist DC | **404** | OK |
| Cleanup | deleted 54; incident 37 restored `waiting_ded`/`Reported` | OK |

**No code change required** for write path — `assertOwn` on store + queue scope hold.

## Warehouse-ops re-check (careful pass)

| Check | Dist DC Dodoma | Reg DC Dodoma | National |
|-------|----------------|---------------|----------|
| Store list (zonal/temp) | 2 / scoped | 4 / scoped | full |
| Incident link picker | **only own-area incidents** (was 17 national) | Dodoma only | 17 |
| Stock sheet foreign WH | **404** | **404** | ok |
| Intake foreign WH (Reg has manage) | 403 (no manage) | **404** area | — |

**Fix:** warehouse-ops index incident picker uses `appendAreaScopeWithCouncil` (same wall as dispatch/allocations).

## Warehouse-ops **write-path** drill (manage seat, 2026-07-13)

Persona: **District Logistic Officer** user **2696** (Dodoma Urban) — has `warehouse_and_stock.manage`.  
Dist DC user 4 remains view-only on writes (403).

| Step | Result before fix | Result after fix |
|------|-------------------|------------------|
| Dist DC POST `/intake` | 403 | 403 |
| DLO intake OOA WH Ilala **13** | 404 | 404 |
| DLO intake in-area WH **11** | 200 | 200 (cleaned) |
| DLO intake WH 11 + **Dar incident #1** | **200 (hidden journal leak)** | **404** `assertOwn` on incident |
| DLO stock-taking WH 11 + **Dar inventory item #2** | **200; Dar qty 80→9999** | **404**; Dar qty stays **80** |
| Capacity `stockout_forecast` | national on-hand soft leak | scoped to visible stores |
| Cleanup | inv/mov restored to 25 / 57 | same baseline after retest |

**Root causes fixed in `WarehouseOpsController`:**

1. **Stock-taking membership** — count locked `inventory_items` by id only; now requires `warehouse_id = claimed store`.  
2. **Optional `incident_id`** on intake/remove/transfer/borrow — picker was scoped, body was not; now `requireIncidentInArea` → `AreaGuard.assertOwn`.  
3. **Capacity forecast** — velocity + on-hand use `appendStoreVisibility` (no national soft leak for area seats).

## Dispatch + inventory write re-check (careful pass)

| Check | Dist DC Dodoma | National |
|-------|----------------|----------|
| Dispatch board `grouped` | empty | Dar incident board |
| Dispatch incident picker | **no Dar #1** | includes Dar |
| Dispatch stats / pending approvals | **0** (area-scoped) | live counts |
| Dispatch sources on foreign alloc | **404** | ok |
| Inventory create OOA warehouse | blocked (manage perm / area guard) | — |

**Fixes:** Dispatch index picker + stats + findOr404 + pending approvals now join **incident area**.  
Inventory create/update/detail call `assertWarehouseVisible`.

## Allocations re-check (careful pass)

| Check | Dist DC Dodoma | Reg DC Dodoma | National |
|-------|----------------|---------------|----------|
| Allocation queues | empty (seed data is Dar) | empty | has Dar queues |
| Track OOA alloc #1 | **404** | — | 200 |
| Warehouse inventory panel | 2 Dodoma only | Dodoma only | all |
| `available_resources` qty | **area-scoped** (e.g. Food 0 vs Nat 7455) | scoped | full |
| form-data warehouses | 2 Dodoma | Dodoma | all |

**Fix:** `ResourceAllocationController` no longer returns national stock roll-ups on index/form-data.

**Flyway hygiene:** never edit applied migrations — V202 left as first applied; region backfill is **V203**.

## Notes (honest)

- Fully national warehouses (null region + null district) remain visible when policy allows.  
- Region officer sees **all districts in region** for incidents/EW — correct.  
- Module access without permission is **403** (not empty leak).  
- Seats still need passwords set by admin before human login.  
- Allocation seed data is mostly Dar incident #1 — Dodoma officers correctly see **empty queues**, not foreign requests.
