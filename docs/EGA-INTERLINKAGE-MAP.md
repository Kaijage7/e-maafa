# e-MAAFA — System Interlinkage Map (eGA migration)

**Status:** Authoritative dependency map for safe package moves  
**Captured:** 2026-07-12 · **Updated:** 2026-07-13 (Settings complete; Response order locked)  
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
    ├── service.impl.ReliefDistributionServiceImpl (eGA; was recovery.ReliefDistributionController)
    ├── finance.EconomicsOfDisasterService
    ├── monitoring.*, controller.GisMapController (eGA)
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
7. ~~**Settings (full)**~~ — **DONE** (translations → resource catalogue → approval workflows → locations → institutions → roles → users; residual `RoleCatalogue` + `package-info` only)  
8. **Response** — by isolation (see §10); never engine/dispatch/allocation first  
9. **EW** — after Response leafs that are SQL-only; shared `/v1/ew/warnings` base needs method-path care  

**Preparedness feature package is fully emptied of modules** — all moved to eGA layers.  
**Settings feature controllers fully emptied** — only shared `RoleCatalogue` remains.

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
| `service.impl.ReliefDistributionServiceImpl` | source labels |
| `finance/EconomicsOfDisasterService` | stock value |
| `monitoring/MonitoringEvaluationService` | indicators |
| `controller.GisMapController` | map layers |
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
5. Baseline HTTP → package → jar bak → deploy → full matrix + regressions → commit  

---

## 10. Response module — coupling capture (2026-07-13)

### 10.1 Live health (Super Admin local) — all **200** before first Response move

Preparedness eGA + Settings eGA + key Response endpoints verified live.

### 10.2 Java type coupling (Response package)

| Type | Imported by (outside response/) | Risk |
|------|----------------------------------|------|
| `DispatchSupportService` | `service.impl.ReliefDistributionServiceImpl` | **Hard** — now under eGA impl (import from `service.support`) |
| `SimulationGuard` | `service.impl.ReliefDistributionServiceImpl` | **Hard** — same; package already eGA |
| All controllers | none found | Package move of controller alone is compile-safe |

**Internal hubs (stay in response/ until all callers moved):**  
`ApprovalWorkflowEngine`, `IncidentWorkflowService`, `DispatchSupportService`, `ActivationService`, `SimulationGuard`.

### 10.3 Shared path bases (not bugs)

| Base path | Controllers |
|-----------|-------------|
| `/v1/response/incidents` | `controller.IncidentController` (eGA) + `IncidentTimelineController` |
| `/v1/response/coordination` | `controller.CommandCenterController` (eGA) + scenarios under `/coordination/scenarios` |
| `/v1/response` | `controller.DashboardController` (dashboard + eocc + activate; eGA) |

### 10.4 Recommended Response migration order (safest first)

| # | Module | Path | Lines (approx) | Coupling notes | Status |
|---|--------|------|----------------|----------------|--------|
| R1 | **Stakeholder coordination** | `/v1/response/stakeholder-coordination` | ~138 | **Read-only**; SQL on stakeholders/tasks/bids/agency_resources; JurisdictionScope + AreaGuard; **no** response service imports | **DONE** |
| R2 | Executive watch | `/v1/response/executive` | ~214 | Read-only national COP; many tables; NATIONAL tier gate only | **DONE** |
| R3 | Contingency plans | `/v1/response/contingency-plans` | ~209 | Own path; FE lifecycle; no workflow coupling | **DONE** |
| R4 | Support pledges | `/v1/response/support` | ~260 | Writes + NotificationService; SQL to training_plans / mitigation_measures | **DONE** |
| R5 | Public reports | `/v1/response/public-reports` | ~278 | **Java type** → `IncidentWorkflowService` (helpers made public for eGA service.impl) | **DONE** |
| R6 | Declarations | `/v1/response/declarations` | ~294 | Executive/activation SQL consumers (SQL-only; controller eGA) | **DONE** |
| R7 | Resource approvals | `/v1/response/approvals` | ~285 | **ApprovalWorkflowEngine** retained in service.impl + warehouses scope | **DONE** |
| R8 | Anticipatory plans | `/v1/response/anticipatory-plans` | ~372 | Area scope; `matchingPlans` consumed by CommandCenter (now via service) | **DONE** |
| R9 | Tasks | `/v1/response/tasks` | ~429 | Area scope + NotificationService; no Java type importers | **DONE** |
| R10 | Assessments | `/v1/response/assessments` | ~541 | Multipart + AreaGuard + ApprovalWorkflowEngine.initialize | **DONE** |
| R11 | Communication | `/v1/response/communication` | ~712 | NotificationService + ExternalDeliveryService + SimulationGuard; @Scheduled dispatch | **DONE** |
| R12 | Response Settings | `/v1/response/settings` | ~371 | JdbcTemplate only; approval chains + catalogue + types + ladder automation | **DONE** |
| R13 | Exercise Scenarios | `/v1/response/coordination/scenarios` | ~592 | ActivationService for launch; create/show package | **DONE** |
| R14 | Incident Ops Timeline | `/v1/response/incidents/{id}/ops-timeline` | ~519 | Read-only trail merge; shares base with fat IncidentController | **DONE** |
| R15 | DLNA | `/v1/response/dlna` | ~715 | PDF + NotificationService + AreaGuard; Annex 1/2 | **DONE** |
| R16 | Dashboard + EOCC | `/v1/response/dashboard`, `/eocc`, `/eocc/activate` | ~542 | JurisdictionScope + AreaGuard + ActivationService; CurrentUserResolver | **DONE** |
| R17 | Resource allocations | `/v1/response/allocations` | ~719 | ApprovalWorkflowEngine + DispatchSupportService (returns) + SimulationGuard | **DONE** |
| R18 | Warehouse Ops | `/v1/response/warehouse-ops` | ~856 | DispatchSupportService + SimulationGuard + NotificationService | **DONE** |
| R19 | Dispatch | `/v1/response/dispatch` | ~900 | DispatchSupportService + SimulationGuard + NotificationService; APPROVAL_REQUIRED_SOURCES public | **DONE** |
| R20 | Stakeholder Bidding | `/v1/response/bidding` | ~1037 | DispatchSupportService + SimulationGuard + NotificationService; NDMF cash | **DONE** |
| R21 | Incidents | `/v1/response/incidents` | ~1283 | IncidentWorkflowService retained; multipart; coexists with ops-timeline | **DONE** |
| R22 | Command Center | `/v1/response/coordination` | ~1883 | ActivationService + AnticipatoryPlansService; coexists with scenarios | **DONE** |
| E1 | EW Boundary | `/ew/monitoring/reports` | ~99 | JdbcTemplate only; focal-point reports; productive filters | **DONE** |
| E2 | EW Warnings index | `GET /v1/ew/warnings` | ~226 | Area isolation; coexists with lifecycle POSTs; no fake query params | **DONE** |
| E3 | EW Products | `/v1/ew/products` | ~533 | severity/type filters + stats; SMS/email disseminate retained | **DONE** |
| E4 | EW Agency bus | `/v1/ew/agency/*`, `/v1/ew/dmd/*` | ~650 | JurisdictionScope agency isolation; DmdImpactSupport + ActionGuide; submit supersede + withdraw; productive filters | **DONE** |
| E5 | EW Bulletin Ingest | `POST /ew/bulletins/ingest` | ~339 | NotificationService afterCommit; pending Warning + hazards; tma/dmd parsers; 1h duplicate | **DONE** |
| E6 | EW Warning Lifecycle | `POST /v1/ew/warnings/{id}/approve\|publish\|map\|bulletin` | ~462 | early_warning.approve SoD; clone to early_warnings; NotificationService broadcast; OH kick | **DONE** |
| E7 | EW Scanner | `/v1/ew/scanner/*` | ~503+ | Dual stats; productive multi-filters; real dispatch router; DisasterScannerService OSINT; tasking SoD | **DONE** |
| E8 | EW Management Report | `GET /v1/reports/early-warnings` | ~388 | from/to window; area isolation; warned↔incident effectiveness + DRR coverage | **DONE** |
| O1 | Hazard Area Context | `GET /v1/ops/hazard-area-context` | ~337 | Context links only (no AI); geo + warning/submission resolve productive | **DONE** |
| M1–M8 | Mitigation full set | hazards/measures/infra/past/RA/GIS/dashboard/frameworks | — | All mitigation *Controller* eGA | **DONE** |
| RC1 | Recovery programs | `/v1/recovery/recovery-programs` | — | Area scope F97; status lifecycle | **DONE** |
| RC2 | Relief distributions | `/v1/recovery/relief-distributions` | — | DispatchSupportService + SimulationGuard + AreaGuard | **DONE** |
| RC3 | Strategic projects | `/v1/recovery/strategic-projects` | — | Reconstruction tracking; paths unchanged | **DONE** |
| RC4 | Knowledge repository | `/v1/recovery/knowledge` | — | Multipart document/attachment; approve | **DONE** |
| P1–P7 | Portal CMS admins | content/portal,news,upload,education,materials,sections + settings/agencies | — | Thin eGA | **DONE** |
| P8–P9 | Portal public + threats | `/v1/portal/**`, `/v1/content/threats` | — | PortalPublicServiceImpl + ThreatServiceImpl + ThreatAdmin; no portal package | **DONE** |
| OH1 | One Health dashboard | `/v1/onehealth/dashboard` | — | National KPIs; recent_events area-scoped; productive E2E validated | **DONE** |

### 10.5 Do **not** start with

- `ApprovalWorkflowEngine` (hub)  
- `DispatchController` / `WarehouseOpsController` / `ResourceAllocationController` (stock + incidents)  
- `IncidentController` / `CommandCenterController` (largest + shared path)  
- `StakeholderBiddingController` (1010 lines, multi-table writes)  

### 10.6 R1 deep capture — Stakeholder coordination

| Check | Result |
|-------|--------|
| Java importers of controller | **none** |
| Imports other response types | **none** (only JdbcTemplate, JurisdictionScope, AreaGuard, ResourceNotFoundException) |
| Tables read | `stakeholders`, `incident_tasks`, `disaster_response_functions`, `response_activations`, `incidents`, `stakeholder_resource_bids`, `resources`, `allocated_resources`, `agency_resources`, `agencies` |
| Writes | **none** |
| Path | unique `/v1/response/stakeholder-coordination` |
| FE | Response stakeholder coordination UI (if present) via same path |
| Baseline | GET index 200 (200 rows cap, stats 335 total); GET /{id} 200 (lanes/donations/stock/summary) |

---

## 11. Operational honesty assessment

Full open assessment (roles, ladder, warehouse, EW, portal, notifications, repository, COP, dead ends):

→ [`OPERATIONAL-LINKAGE-ASSESSMENT.md`](./OPERATIONAL-LINKAGE-ASSESSMENT.md)

---

## 12. Hidden issues already fixed during Settings eGA

| Issue | Fix commit line |
|-------|-----------------|
| Classification SQL `updatepublic.*` | institutions migration |
| Super Admin rename / partial matrix strip | roles migration (full catalogue re-apply) |
| Unknown user role names silent skip | users migration (400) |
| RoleCatalogue package-private | made public for service.impl |
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
