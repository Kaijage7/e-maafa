# eGA-standard deep assessment + E2E (2026-07-13)

**Stance:** No sugarcoating. eGA structure is binding; Response/EW remain transitional fat packages until migrated. Fixes in this pass are security/correctness first, not cosmetic rewrites.

## 1. eGA compliance (as they are)

| Layer | Status | Evidence |
|-------|--------|----------|
| Canonical tree `controller` / `service` / `impl` / `repository` / `entity` / `dto` | **Present** | 44 thin eGA controllers, 44 service + 44 impl |
| Settings + preparedness masters | **Migrated** | users, roles, locations, institutions, resources, translations, warehouses, inventory, temp WH, training, alert-subs, evacuation |
| Response leaves | **Migrated** | **All former fat Response controllers** are eGA-layered |
| Response support engines | **eGA-aligned** | Under `service.support` (workflow, dispatch, activation, simulation) |
| EW | **Migrated** | Boundary + Warnings + Products + Agency + Ingest + Lifecycle + Scanner + **Management Report** |
| New endpoints rule | **Must use eGA layers** | Do not add controllers under `response/` / `ew/` for new work |
| Platform posture | **Excellent (EW+Response)** | Support hubs packaged; portal map one-step publish; PDF engine live-probed |

**Honest score:** Master data + Response + **all EW leaves + EW management report** eGA-shaped. Residual: Response support services + non-EW modules.

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
| EW Warnings index | SA **17** / Dist+Reg **5**; stats.total = list size; Dist hazard regions **Dodoma only**; Partner **403**; unauth **401**; no fake query filters (unknown query ignored, full national for SA) |
| EW Products | `severity`/`type` filters exact; nonsense = **0** list+stats; filtered stats.total = list n; show **404**; missing PDF **400**; Partner **403** |
| EW Agency bus | SA JSON baselines identical post-extract; TMA only sees self (latest/updates/consolidated); MoH→TMA read/write **403**; `agency=nosuch`/`warning_code` nonsense = **0**; history `limit` clamped; `exclude=tma` count **0**; empty/no-geo submit **422** without superseding latest; Partner **403**; unauth **401** |
| EW Bulletin Ingest | Unauth **401**; Partner/DAS **403**; missing `payload` **400**; bad `bulletin_type` / missing days **422** body; empty/unknown hazards **422** (no row growth); success **201** hazard_count=1; 1h re-push **200** duplicate; dmd empty **422**; net-zero delete restored 17/210; agency/products/warnings/boundary/dashboard regressions **200** |
| EW Warning Lifecycle | Unauth **401**; Partner/MDA(create)/DAS **403** (SoD); approve non-pending / publish non-approved / map pre-portal / re-approve/re-publish **422**; map missing **404**; missing PDF **400**; tiny/non-PDF **422**; counts hold on fails; full ingest→approve→bulletin→publish→map on/off net-zero (17\|210\|54\|76\|5); GET warnings coexist **200**; EOCC reaches approve |
| EW Scanner (advanced) | Dual stats: `status=new` → stats.total=matched=58, global.total=83; nonsense filters → 0 + global intact; AND hazard+status; severity/reliability/q/days/limit productive; show **404**; re-dismiss **404** (fixed); MoH taskings isolation **403** cross-agency; Partner **403**; report empty title success=false; bad dispatch `as` soft-fail; net-zero report→dismiss→delete |
| EW Management Report | SA summary+rows match pre-extract; `from`/`to` productive (2090 empty; 2000–01 empty; invalid dates full fallback); DAS Dodoma-only (4 windows); Partner **403**; unauth **401** |
| Hazard Area Context | lat/lng override; district/region **404** bad ids; areaName approx centroid; **warningId/code now return hazardType+severity** (join fix); submission top_alert/hazard_types; Partner **403**; unauth **401** |
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
- ~~EW Warnings index eGA extract~~ — **DONE** (EwWarningsServiceImpl; repos public/split; JurisdictionScope isolation verified; no invented filters).
- ~~EW Products eGA extract~~ — **DONE** (filters severity/type; stats aligned to filter; CurrentUserResolver; Mgov/Mail/Audience retained).
- ~~EW Agency bus eGA extract~~ — **DONE** (JurisdictionScope isolation; DmdImpactSupport + ActionGuide retained; productive filters; write validation preserves prior latest).
- ~~EW Bulletin Ingest eGA extract~~ — **DONE** (NotificationService afterCommit retained; productive multipart params; success 201 + duplicate 200; net-zero drill).
- ~~EW Warning Lifecycle eGA extract~~ — **DONE** (approve/publish/map/bulletin; NotificationService afterCommit publish broadcast retained; SoD + net-zero).
- ~~EW Scanner eGA extract + advanced filters~~ — **DONE** (dual stats filtered+global; productive multi-filters; re-dismiss fixed; DisasterScannerService OSINT retained).
- ~~EW Management Report eGA extract~~ — **DONE** (from/to productive; JurisdictionScope area isolation; stakeholder hide retained).
- ~~Hazard Area Context eGA extract~~ — **DONE** (productive geo params; **fixed** broken warning column SQL; submission real columns).

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
23. ~~eGA migrate **EW Warnings index**~~ — **DONE**.  
24. ~~eGA migrate **EW Products**~~ — **DONE**.  
25. ~~eGA migrate **EW Agency bus**~~ — **DONE**.  
26. ~~eGA migrate **EW Bulletin Ingest**~~ — **DONE**.  
27. ~~eGA migrate **EW Warning Lifecycle**~~ — **DONE**.  
28. ~~eGA migrate **EW Scanner** (+ advanced dual stats)~~ — **DONE**.  
29. ~~eGA migrate **EW Management Report**~~ — **DONE**.  
30. ~~eGA migrate **Hazard Area Context**~~ — **DONE**.  
31. Next: mitigation / portal / recovery leaves.  
32. Stamp area on temp warehouses + agency stock data hygiene.  
33. Integration tests: Reg assessments index, form-data picker, movements warehouse_id, loans Returned.

## 7. System validation pass (2026-07-13) — productive E2E, no AI product claims

**Stance:** Every listed param must narrow or reject; empty public maps must be *gate*, not failure; AI is honesty-deferred only.

### 7.1 Integration points (live, verified)

| Chain | Status | Evidence |
|-------|--------|----------|
| Agency bus → DMD consolidate → impact-support | **Live** | `agency/latest` → `dmd/consolidated` sources; impact-support `ai:false` deterministic |
| Ingest → pending warnings → approve → publish → early_warnings | **Live** | lifecycle eGA; publish clones rows `show_on_map=false` by design |
| Publish → portal map | **Productive gate** | Portal `warnings` requires `early_warnings.show_on_map=true AND status=active`. Drill: map on → portal **3** rows; map off → **0** (net-zero). Empty portal ≠ broken integration |
| Products → portal bulletins | **Live** | landing `bulletins` count **2** (`is_published` + `show_on_map`) |
| Dashboard / Issued Alerts strip | **Live** | `area_early_warnings` **10** (published workbench view, area-scoped) |
| Scanner detections → entity taskings | **Live** | dual stats; taskings awaiting **11** |
| EW management report | **Live** | bus submissions + effectiveness summary |
| Hazard-area-context + warningCode | **Live (fixed)** | joins `warning_hazards` (was always null) |
| Communication overview | **Live** | stats / by_channel / recent_alerts |

### 7.2 Productive params (no decorative filters)

| Surface | Productive | Notes |
|---------|------------|-------|
| `/v1/ew/warnings` | Area isolation only | Unknown query params **ignored** (no fake status/severity filter) |
| `/v1/ew/products` | `severity`, `type` | Stats same WHERE as list |
| `/v1/ew/scanner/detections` | status, hazard, source, severity, reliability, region, q, days | Dual `stats` + `global`; `matched` before limit |
| `/v1/ew/agency/*` | agency, warning_code, limit, exclude, days | Agency-bound isolation |
| `/v1/reports/early-warnings` | `from`, `to` | Invalid dates → full-range fallback |
| `/v1/ops/hazard-area-context` | areaName, regionId, districtId, lat/lng, warning*, submissionId | Bad geo **404** |

### 7.3 AI / presentation honesty

| Item | Position |
|------|----------|
| Impact-support / Action Guide | `ai: false`, formula/`modelVersion` labels only |
| Economics of disaster | `ai: false`, formula engine |
| Hazard area context | Explicit “no satellite AI”; external EO links for human review |
| DMD roadmap `sat_ai` | **Out of scope** card (deferred, not toggleable) — not a product feature |
| No third-party LLM/AI SDKs in FE/BE source | Confirmed by scan |

### 7.4 Security (local profile posture)

| Check | Result |
|-------|--------|
| Unauth protected EW/response/report APIs | **401** |
| Partner without authority | **403** |
| Maker≠checker (MDA create vs approve lifecycle) | **403** on approve |
| Local god-mode default | **OFF** (header persona required) |

### 7.5 Frontend organisation (EW / alerts)

| Surface | Route | Backend |
|---------|-------|---------|
| EW workbench | `/m/preparedness/early-warnings` | `/v1/ew/warnings` |
| Entity consoles + DMD | `/m/preparedness/early-warnings/{tma,mow,…,consolidated}` | agency + dmd |
| New bulletin (722E_4) | `…/new-bulletin` | EW PDF engine + products store |
| Scanner / monitoring | `…/scanner` | `/v1/ew/scanner/*` |
| EOCC bulletins | `…/eocc-bulletin` | `/v1/ew/products` |
| Issued alerts (response + stakeholder) | `/m/response/issued-alerts`, stakeholder portal | dashboard strip + warnings + products + portal |
| EW effectiveness report | `/m/reports-analytics/early-warning-management` | `/v1/reports/early-warnings` |

### 7.6 Residual honest limits

- Portal public map empty until operators use **Publish to map** (`POST …/map`) — intentional PMO control, not a missing endpoint.
- Response support hubs remain transitional packages (not controllers).
- Dual resource catalogue paths remain elsewhere.
- Bulletin PDF engine is external (`:8600`); FE now fails closed with clear message when down.


## 8. Excellence closure (former residuals)

| Former residual | Now |
|-----------------|-----|
| Response hubs in `response/` package | **Moved** to `service.support` (intentional shared engines; package-info) |
| Portal map only via separate POST | **Also** optional `POST …/publish` body `show_on_map:true` (default false) |
| PDF engine “separate residual” | **Stack component**: start-all [4/5]; go-live `gl09_ewPdfEngine` live probe; FE fail-closed |
| Dual resource paths | **By design layers**: `/v1/settings/resources` catalogue vs `/v1/inventory` stock vs response settings vocab — not duplicate fat endpoints |

**Honest excellence:** Not “everything perfect” — dual SoR paths outside EW remain documented (past_disasters, JWT vs Keycloak). EW+Response operational path is production-grade layered, fail-closed, and integration-complete.
