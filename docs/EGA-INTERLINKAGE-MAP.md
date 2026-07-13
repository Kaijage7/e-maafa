# e-MAAFA — System Interlinkage Map (eGA migration)

**Status:** Authoritative dependency map for safe package moves  
**Captured:** 2026-07-12  
**Backup:** `backup/pre-ega-reassess-20260712-212115`, stash `stash@{0}`,  
`/home/kaijage/model/maafa/backups/dmis-platform-pre-ega-reassess-20260712-212115.tar.gz`

Interlinkage is **system-wide**: package imports, shared Postgres tables, security scope helpers, Angular API paths, and RBAC permission areas. A file move is never local until all of these are checked.

---

## 1. Two kinds of coupling

| Kind | What it means | Risk on eGA move |
|------|----------------|------------------|
| **A. Java type coupling** | Class A imports Class B | Compile break if package changes without updating imports |
| **B. Data / contract coupling** | SQL, table names, URL paths, JSON field shapes | Runtime break even if compile succeeds |

Most Response / Finance / Recovery code uses **B** (JDBC on `public.warehouses`, `public.inventory_items`, …). Preparedness Inventory uses **A** on `Warehouse` + `WarehouseRepository`.

---

## 2. Package import graph (who depends on whom)

```
controller  → service, dto, common
service     → dto, entity, repository
repository  → entity   (+ legacy DisasterEvent* still here)
preparedness→ common, notification   (+ will import entity/repository after Warehouse move)
response    → common, notification
ew          → common, inform, notification
recovery    → common, response
monitoring  → common, mitigation
portal/content/onehealth/stakeholder/iam → common, notification (± ew)
common      ← almost everything (security, errors, SQL helpers)
notification← many modules (alerts, audience)
```

**Hub packages (high inbound):** `common`, `notification`, `ew`, then `entity`/`repository` once eGA layers grow.

**No feature package imports another feature package** except: recovery→response, monitoring→mitigation, ew↔notification/portal/content/onehealth, ops→integration.

---

## 3. Hot shared tables (code mentions)

| Table | Mentions (approx) | Primary owners | Other consumers |
|-------|-------------------|----------------|-----------------|
| `incidents` | 248 | response | reports, ew, recovery, finance, portal |
| `users` / roles | 200+ | iam, settings, common | all RBAC |
| `warehouses` | 53 | preparedness | response (dispatch, allocation, warehouse-ops), recovery, finance, monitoring, local seeder, GIS |
| `inventory_items` | 59 | preparedness | response warehouse-ops/dispatch/allocation, executive, finance, monitoring, settings catalogue |
| `temporary_warehouses` | 39 | preparedness | response dispatch/ops |
| `evacuation_centers` | 18 | preparedness (eGA) | command center readiness, portal, ew impact, finance, monitoring, Sendai |
| `alert_subscriptions` | 26 | preparedness (eGA) | notification Audience/NotificationService, EW lifecycle, portal, communication |
| `resources` | 89 | settings catalogue | preparedness inventory, response allocations |
| `regions` / `districts` | 84 each | settings locations | jurisdiction everywhere |

---

## 4. Preparedness module graph (migration order)

```
TrainingPlan  ──────────────────────────── leaf (almost isolated)

AlertSubscription (DONE eGA) ──SQL──► notification.AudienceService
                                     notification.NotificationService
                                     ew.EwWarningLifecycleController
                                     portal.PortalPublicService
                                     response.CommunicationController

EvacuationCenter (DONE eGA) ──SQL──► response.CommandCenter readiness
                                     portal, ew.DmdImpactSupport, finance, monitoring

Warehouse ◄──── Java type ──── InventoryService  (HARD LINK)
    │ SQL
    ├── response.WarehouseOpsController
    ├── response.DispatchController / DispatchSupportService
    ├── response.ResourceAllocationController / ResourceApprovalController
    ├── recovery.ReliefDistributionController
    ├── finance.EconomicsOfDisasterService
    ├── monitoring.*, mitigation.GisMapController
    └── local.LocalDataSeeder

TemporaryWarehouse ── parallel pattern to Warehouse (SQL + inventory stock)
    └── TemporaryWarehouseService aggregates inventory_items

Inventory ── Java: WarehouseRepository, Resource (package-private)
         ── SQL: inventory_items, stock_movements
         ── AreaGuard.assertWarehouseVisible on writes
```

### Safe migration order (from this map)

1. ~~Alert subscriptions~~  
2. ~~Evacuation centres~~  
3. ~~**Warehouse**~~ — **DONE** (InventoryService imports → `entity`/`repository` same commit)  
4. ~~**TemporaryWarehouse**~~ — **DONE** (SQL-only external consumers)  
5. ~~**Inventory + Resource (JPA catalogue entity)**~~ — **DONE**  
6. ~~**TrainingPlan**~~ — **DONE** (no external Java type importers; SQL consumers: SupportPledge, Bidding, M&E, finance, Command Post hub; actions write `portal_news` / `mitigation_measures` / notify Partners)  
7. Then non-preparedness modules by isolation (Settings, Response, EW, …)  

**Preparedness feature package is fully emptied of modules** — all moved to eGA layers.

**Never** move Warehouse without fixing InventoryService in the same commit. (Satisfied for module 3.)

---

## 5. Warehouse deep consumers (complete list)

### Java type (`Warehouse` / `WarehouseRepository`)

| File | Use |
|------|-----|
| `preparedness/Warehouse*` | Own module (pre-move) |
| `preparedness/InventoryService` | `warehouses.findAll()`, `Warehouse::getId/getName` |

### SQL / table only (`public.warehouses`)

| File | Use |
|------|-----|
| `response/WarehouseOpsController` | Stock ops ledger |
| `response/DispatchController` | Source type Warehouse |
| `response/DispatchSupportService` | Available stock from warehouses |
| `response/ResourceAllocationController` | Preferred warehouse, scope |
| `response/ResourceApprovalController` | assertWarehouseVisible |
| `response/CommandCenterController` | readiness warehouses |
| `response/IncidentTimelineController` | timeline signals |
| `response/StakeholderBiddingController` | warehouse lists |
| `recovery/ReliefDistributionController` | source labels |
| `finance/EconomicsOfDisasterService` | stock value |
| `monitoring/MonitoringEvaluationService` | indicators |
| `mitigation/GisMapController` | map layers |
| `local/LocalDataSeeder` | seed rows |
| `common/security/JurisdictionScope` | `appendWarehouseScope` |
| `common/security/AreaGuard` | `assertWarehouseVisible` |

### Frontend API (must stay)

- `GET/POST /api/v1/warehouses`
- `GET/PUT /api/v1/warehouses/{id}`
- UI: `warehouses.component.ts`, `warehouse-create.component.ts`
- Inventory UI uses `/api/v1/inventory` + `/api/v1/inventory/reference` (warehouse dropdown)

### RBAC

- `warehouse_and_stock.view` / `.manage` / `.view_national`
- Create/update: `warehouse_and_stock.manage`
- Index/show: `isAuthenticated()` + AreaGuard on show/update

---

## 6. Already-migrated modules — external SQL links

| Module | eGA packages | External callers (SQL/logic) |
|--------|--------------|------------------------------|
| Alert subscriptions | controller/service/impl/repo/entity/dto | AudienceService, NotificationService, EW lifecycle, portal, CommunicationController |
| Evacuation centres | same | CommandCenter readiness, portal public, EW impact, finance, monitoring, DisasterEventService |

These callers use **table SQL**, not Java types — package move of controllers/services is safe if **API JSON and table schema** stay identical.

---

## 7. Package naming collision (system-wide)

`tz.go.pmo.dmis.repository` currently holds:

- **eGA data-access:** `AlertSubscriptionRepository`, `EvacuationCenterRepository`, `WarehouseRepository`, `TemporaryWarehouseRepository`, `InventoryItemRepository`, `ResourceRepository` (JPA), `TrainingPlanRepository`
- **Legacy feature:** `DisasterEventController`, `DisasterEventService`, `SendaiAnalyticsController`, `SendaiAnalyticsService`

**Resource dual access (resolved by naming):**

| Layer | Type | Role |
|-------|------|------|
| JPA | `entity.Resource` + `ResourceRepository` | Inventory read/join |
| JDBC admin | `ResourceCatalogueService` / `ResourceCatalogueController` | Settings CRUD on same `public.resources` table |

**Approval workflow dual access (SQL only):**

| Layer | Type | Role |
|-------|------|------|
| Settings admin (eGA) | `ApprovalWorkflowConfigController` / `ApprovalWorkflowConfigService` | Configure modules + level chains |
| Runtime engine | `response.ApprovalWorkflowEngine` | Snapshots chain when starting an approval |
| Parallel response UI | `response.SettingsController` | Older write paths on same tables (paths differ) |
| Shared role vocab | `settings.RoleCatalogue` (public) | Also used by RolePermission + UserManagement |

**Shared `@RequestMapping` bases (not bugs):** multiple controllers may share a base path when *method* paths differ, e.g. `/v1/response/incidents` (IncidentController + ops-timeline), `/v1/ew/warnings`, `/v1/onehealth/*` subpaths.

Plan later: relocate Disaster Repository feature to eGA `controller`/`service` and keep `repository` for JPA only.

---

## 8. Cross-cutting “must not break” while migrating

1. **JurisdictionScope** + **AreaGuard** — any registry with area columns  
2. **NotificationService** / **AudienceService** — alert_subscriptions, SMS/email  
3. **Command Center readiness** — warehouses + evacuation_centers queries  
4. **Warehouse-ops + dispatch + allocation** — same `inventory_items` predicates  
5. **Flyway** — no schema change required for package moves  
6. **Angular proxy** — paths under `/api/v1/*`  

---

## 9. Proceed checklist (per module)

1. List Java importers of every type being moved  
2. List SQL consumers of every table  
3. List FE paths and permission strings  
4. Move layers; update imports in same commit  
5. Compile  
6. Restart backend from new jar  
7. Test: index, detail, create, update, 400/401/403/404, proxy, **linked modules**  
8. Only then mark done  

---

## 10. Backup restore commands

```bash
# Restore WIP from stash
git stash list
git stash apply stash@{0}   # or pop

# Or full tree from tarball
tar -tzf /home/kaijage/model/maafa/backups/dmis-platform-pre-ega-reassess-20260712-212115.tar.gz | head
```

*This map is the gate for further eGA moves. Update it when a module finishes migration.*
