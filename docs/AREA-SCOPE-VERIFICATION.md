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

## Notes (honest)

- Fully national warehouses (null region + null district) remain visible to area officers.  
- Region officer sees **all districts in region** for incidents/EW — correct.  
- Module access without permission is **403** (not empty leak).  
- Seats still need passwords set by admin before human login.
