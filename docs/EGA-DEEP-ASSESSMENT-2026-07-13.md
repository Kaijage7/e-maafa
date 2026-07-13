# eGA-standard deep assessment + E2E (2026-07-13)

**Stance:** No sugarcoating. eGA structure is binding; Response/EW remain transitional fat packages until migrated. Fixes in this pass are security/correctness first, not cosmetic rewrites.

## 1. eGA compliance (as they are)

| Layer | Status | Evidence |
|-------|--------|----------|
| Canonical tree `controller` / `service` / `impl` / `repository` / `entity` / `dto` | **Present** | 65 thin eGA controllers (+2 portal public/threats), matching service + impl |
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
31. ~~eGA migrate **Frameworks**~~ — **DONE**.
32. ~~eGA migrate **Hazards**~~ — **DONE** (first mitigation master).
33. ~~eGA migrate **Mitigation remainder**~~ — **DONE**.
34. ~~eGA migrate **Recovery (4 leaves)**~~ — **DONE**.
35. ~~eGA migrate **Portal CMS admins (7 leaves)**~~ — **DONE**.
36. ~~eGA migrate **Portal public + threats**~~ — **DONE** (no `portal/` package left).
37. ~~eGA migrate **One Health dashboard**~~ — **DONE** (first OH leaf).
38. ~~eGA migrate **One Health action tracking**~~ — **DONE**.
39. ~~eGA migrate **One Health directives**~~ — **DONE**.
40. ~~eGA migrate **One Health events**~~ — **DONE**.
41. ~~eGA migrate **One Health dissemination**~~ — **DONE** (OH complete).
42. ~~eGA migrate **Finance (budget + economics)**~~ — **DONE** (+ reject SoD fix).
43. ~~eGA migrate **Monitoring & Evaluation**~~ — **DONE** (see §18).
44. ~~eGA migrate **Reports** (incident / resource / generated)~~ — **DONE** (see §19).
45. ~~eGA migrate **Notification HTTP surface**~~ — **DONE** (see §20; shared engines retained in `notification/`).
46. ~~eGA migrate **Stakeholder admin**~~ — **DONE** (see §22).
47. ~~eGA migrate **ops/IAM** (auth + go-live)~~ — **DONE** (see §24).
48. Primary fat-domain eGA arc complete.
49. ~~Residual **content / repository domain / INFORM web** eGA~~ — **DONE** (see §25). 
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


## 9. Mitigation eGA start (2026-07-13)

| Leaf | Path | Verified |
|------|------|----------|
| Frameworks | `/v1/frameworks` | page productive; stats/pagination baseline; show 404; Partner/DAS 403; create 400 |
| Hazards | `/v1/hazards` | page productive; stats baseline match; show 404; unauth 401; frameworks co-live |

| Mitigation measures | `/v1/mitigation-measures` | stats total 9; page=999 empty; show 404; unauth 401 |
| Infrastructure items | `/v1/infrastructure-items` | stats total 5; mapItems 5; page empty; show 404 |
| Past disasters | `/v1/past-disasters` | stats total 11; page empty; show 404 |

| Risk assessments | `/v1/risk-assessments` | stats total 3; page empty; show 404; Partner 403 |
| GIS map | `/v1/gis-map` | layer counts + regionData match baseline; Partner 403; DAS 200 |
| Mitigation dashboard | `/v1/mitigation/dashboard` | six counts match baseline |

**Mitigation controllers: complete** (helpers `RegionDataBuilder` remain under `mitigation/`).

## 10. Recovery eGA (2026-07-13)

| Leaf | Path | Verified |
|------|------|----------|
| Recovery programs | `/v1/recovery/recovery-programs` | SA baseline exact; status=NOPE → 0 + filter-aligned stats; status=Ongoing productive; create→Cancelled→SQL delete net-zero; unauth **401** |
| Relief distributions | `/v1/recovery/relief-distributions` | SA baseline exact; status=NOPE → 0; empty store **422**; confirm missing **404**; unauth **401** (stock write path retained, not mutated in verify) |
| Strategic projects | `/v1/recovery/strategic-projects` | SA baseline exact; status/sector/search productive; list filters (global stats preserved as legacy); create→Stopped→SQL delete net-zero |
| Knowledge repository | `/v1/recovery/knowledge` | SA baseline exact; type=NOPE → 0 entries; JSON create→approve→SQL delete net-zero; multipart `document`/`attachment` contract preserved |

**Recovery controllers: complete** (no `*Controller` under `recovery/`).

## 11. Portal CMS eGA batch (2026-07-13)

| Leaf | Path | Verified |
|------|------|----------|
| Portal management | `/v1/content/portal` | SA baseline exact; unauth **401**; setting put net-zero |
| Content upload | `/v1/content/upload` | unauth **401**; missing file **400** |
| Portal news | `/v1/content/news` | SA baseline exact; create **201** + delete net-zero; empty title **400** |
| Educational content | `/v1/content/education` | SA baseline exact; unauth **401** |
| Education materials | `/v1/content/education-materials` | SA baseline exact |
| Portal sections | `/v1/content/sections/*` | hazard cards + json-settings baseline exact |
| Agency admin | `/v1/settings/agencies` | SA baseline exact (887 items); empty name **400** |

Public portal regressions exact: landing, threats, regions, education, shelters, publications, i18n.  

## 12. Portal public + threats eGA (2026-07-13)

| Leaf | Path | Verified |
|------|------|----------|
| Portal public | `/v1/portal/**` | Size baselines exact vs pre-extract; threat detail **200**; missing threat **404**; empty plan submit **400** |
| ThreatService | (public threats strip + detail + plan) | Active threats=2; public/admin co-live |
| Threat admin | `/v1/content/threats` | Size baseline exact; unauth **401**; Partner **403**; create **201** → delete net-zero; empty name **400** |

**Portal controllers: complete** (no `portal/` package). CMS admins still exact (news/portal/education sizes).

## 13. One Health validation + dashboard eGA (2026-07-13)

### Productive filters (live SA) — no fake params

| Surface | Param behaviour verified |
|---------|--------------------------|
| Events `/v1/onehealth/events` | `status=NOPE` → total **0**; real status exact match; `search=zzzz` → 0; `priority_level`/`event_type`/`area_of_concern_id` nonsense → 0; `event_type=ew_alert` → **3** all `ew_alert`; date future window → 0; bad `date_from` → **400** (not 500); page clamp works |
| Events list vs KPI | `total`/`data` **filter-aligned** (FE “Showing X of Y”); KPI `stats` stay area-scoped national snapshot (source parity for KPI navigation) |
| Directives | `status=NOPE` → total **0**; list total filter-aligned; show **404** |
| Disseminations | `approval_status=NOPE` → 0; `dissemination_type=stakeholder` productive |
| Form cascade | `districts/{region}` **200** (n>0); bad region → **[]**; concern-items productive |
| Dashboard | unauth **401**; SA baseline exact post-eGA extract |

### Security / integration / honesty

| Check | Result |
|-------|--------|
| Unauth | events/dashboard/directives/disseminations **401** |
| Partner | module **403** (`one_health.view`) |
| DAS/RAS without OH perm | **403** (module gate; not a leak) |
| EW → OH | 3 events with `source_warning_id` set; FE `?event_type=ew_alert` deep-link wired |
| Empty create | **422** with field errors (not silent success) |
| AI product claims | No OH AI features; platform `sat_ai` remains **out of scope**; impact-support lists AI consolidation under **deferred honestly** |
| FE organisation | Routes under `/m/one-health/*`; events FE params match backend names (`area_of_concern_id`, `event_type`, …) |

### eGA start

| Leaf | Path | Notes |
|------|------|-------|
| One Health dashboard | `/v1/onehealth/dashboard` | Thin controller + `OneHealthDashboardServiceImpl`; `statusLabel` public for service.impl |
| One Health action tracking | `/v1/onehealth/events/{id}/actions` (+ progress, close, archive) | Thin controller + `OneHealthActionTrackingServiceImpl`; AreaGuard; index baseline exact; empty store **422**; create → progress → SQL delete net-zero; helpers (`findEventOr404`, `formatDate`, `strOf`, …) public for eGA |
| One Health directives | `/v1/onehealth/directives` | Thin controller + `OneHealthDirectiveServiceImpl`; index/show/history **exact**; status/search nonsense → 0; unauth **401**; show **404**; empty PUT **422**; escalate **200** soft-fail if gateway unconfigured (no data mutation); `currentUserDbId` public |
| One Health events | `/v1/onehealth/events` | Thin controller + `OneHealthEventApiServiceImpl` (named to avoid clash with domain `OneHealthEventService`); index/show/form/qv/comments **exact**; status NOPE / ew_alert productive; empty store **422**; empty comment **422**; bad review priority **422**; siblings 200 |

| One Health dissemination | `/v1/onehealth/disseminations` | Thin controller + `OneHealthDisseminationServiceImpl`; index/show/recipients **exact**; approval/type filters productive; unauth **401**; show **404**; invalid approve soft `success:false`; empty stakeholder create **422**; all OH siblings **200** |

**One Health controllers: complete.** Residual under `onehealth/`: `OhEventWriteRequest` + `OneHealthEventService` helpers only (no `*Controller`).

## 14. Post-OH system validation (2026-07-13) — productive, no fake codes, no AI product

### One Health full matrix (live Super Admin)

| Surface | Productive checks | Auth |
|---------|-------------------|------|
| Events | status/priority/type/area/search nonsense → **0**; `event_type=ew_alert` → **3** all match; `status=submitted` exact; future date window **0**; bad date **400** | unauth **401**, Partner **403** |
| Form cascades | regions→districts n>0; bad region → **[]** | SA **200** |
| EW→OH | DB: **3** events with `source_warning_id`; type `ew_alert` count **3**/5 | integration live |
| Directives | status NOPE / search zzzz → **0**; show **200**; **404** missing | **401/403** |
| Disseminations | approval NOPE → **0**; type=public productive; recipients **200** (n=7) | **401/403** |
| Actions | event 1: 2 actions, 1 directive, 7 stakeholders | **401/403** |
| Dashboard | total_events **5**, ew_alerts_active **3**, recent **5** | **401/403** |
| Write validation | empty event/action/directive/dissemination store → **422** field errors | no durable mutation |

### Frontend organisation (OH)

| Page | API params match backend |
|------|---------------------------|
| Events | `status`, `area_of_concern_id`, `region_id`, `event_type`, `priority_level`, `date_from`/`date_to`, `search` |
| Directives | `status`, `priority`, `filter`, `date_from`/`date_to`, `search`, `event_id` |
| Disseminations | `dissemination_type`, `approval_status`, `status`; approve posts `approval_status=approved` |
| Dashboard | `GET /dashboard`; deep-link to events `?event_type=ew_alert` |
| Actions | progress/store/close paths under `/v1/onehealth` |
| Routes | `/m/one-health/*` + stakeholder portal alias; breadcrumbs between event ↔ directive |

### AI / honesty footprint

| Item | Status |
|------|--------|
| Third-party LLM/AI SDKs / `ai: true` product flags | **None** in FE/BE |
| `sat_ai` | **Out of scope** card only (not a toggleable product feature) |
| Economics of disaster | **Deterministic formula** (`Not ML/AI` in service + FE copy) |
| INFORM / hazard context | Human basemaps + deferred honesty catalogue |

### Finance residual baseline (next domain; not yet eGA)

| Endpoint | Result |
|----------|--------|
| periods / budgets / thresholds / ndmf donations / economics | unauth **401**, SA **200** |
| empty period/budget create | **422** required fields |
| economics | disclaimer + deterministic modelVersion present |
| budgets `?status=NOPE` | **ignored** (no list filter params by design; FE has no status query filter) |
| FE | `/m/budget-finance/budgets`, detail, economics wired to `/api/v1/finance/*` |

### Cross-domain smoke

| Surface | Result |
|---------|--------|
| Portal public landing | **200** |
| Recovery programs | **200**, stats total **6** |

**Verdict:** OH is production-grade for productive filters, security walls, EW integration, and FE wiring. No AI product surface. Next carefully: finance eGA + optional productive budget filters if product owners want list query params.


## 15. Finance maker≠checker SoD + eGA (2026-07-13)

### Live SoD drills (Dodoma Urban budget line 1; net-zero cleanup)

| Drill | Personas | Result |
|-------|----------|--------|
| Self-approve commitment | SA request + SA approve (same user id) | **422** maker≠checker |
| Self-approve via elevated role | DPO request; same user id + Super Admin role approve | **422** |
| RBAC walls | DPO cannot approve (**403**); DED cannot commit/disburse (**403**) | pass |
| Happy path | DPO request → DED approve → DLO commit → DLO disburse | all **200** |
| Virement self-approve | DPO request; same user + SA role | **422**; DED approve **200** |
| Partner | any finance write | module **403** |
| **Self-reject (gap fixed)** | Requester with approve authority rejects own request | was **200**; now **422** *you cannot reject a spend you requested* |
| Self-reject virement | same pattern | **422** (paired fix) |
| Checker reject | DED rejects DPO request | **200** |

**Design note:** Commit and disburse both require `budget_and_finance.disburse` — same logistic officer may perform both stages (three authority classes: manage / approve / disburse), not four distinct people.

### eGA

| Leaf | Path | Notes |
|------|------|-------|
| BudgetService | `/v1/finance/*` | Thin `BudgetController` + `BudgetServiceImpl`; empty finance package |
| Economics | `/v1/finance/economics` | Thin controller + `EconomicsOfDisasterServiceImpl`; deterministic formula (not AI) |

Post-eGA: GETs **200**, unauth **401**, SoD self-approve/reject **422**, happy path **200**, ledger cleaned to original commitment only.


## 16. Finance money-path careful harden (2026-07-13, critical)

User direction: **more careful on finance — very crucial**. Residual SoD/money gaps closed after eGA; re-drilled with distinct user ids under Super Admin authority so **service-layer SoD** is proven (not masked by RBAC 403).

### Gaps closed

| Gap | Before | After |
|-----|--------|-------|
| Soft SoD (`me() != null &&`) | Unknown actor **skipped** maker≠checker | `requireActor()` fail-closed on all money writes |
| Missing maker audit id | Null `requested_by`/`approved_by`/`created_by` allowed transition | `requireRecordedActor` — incomplete trail **422** |
| Status races | UPDATE without expected-status predicate | Conditional `WHERE status='…'` + row-count; `FOR UPDATE` on commitment/virement/budget/donation |
| Expended overpay | Client could post expended **>** obligated | **422** must be positive and ≤ obligated amount |
| Budget envelope SoD | Creator could activate own draft (historical budget 1 is self-approved) | **422** *you cannot approve a budget you created* (draft→active only) |
| NDMF donation race | Remaining balance without row lock | Donation `FOR UPDATE` + existing fund advisory lock |

### Intentionally retained design

| Rule | Rationale |
|------|-----------|
| Same LO may **commit then disburse** | Three authority classes (manage / approve / disburse); PEFA encumbrance then cash-out can be one expenditure officer in small councils |
| NDMF single-step disburse | No multi-user SoD on NDMF path; controls = disburse authority + area + sim + fund/earmark locks + actor required |

### Live deep matrix (line 1 Dodoma Urban; net-zero)

| # | Drill | Result |
|---|-------|--------|
| B | User 2695 request then self-approve (SA role) | **422** SoD |
| C | Same self-reject | **422** SoD |
| D–G | 14 approve; 14/2695 commit blocked; 2696 commit | **422 / 200** |
| H–I | 14/2695 disburse blocked | **422** |
| J–K | expended 999999 / 0 | **422** money bound |
| L | 2696 disburse full amount | **200** |
| M | Budget create 2695 → self-approve **422** → 14 activate **200** | pass |
| N | Virement self-approve/reject **422**; 14 approve **200** | pass |
| — | Simulation incident 7 request | **422** sim guard |
| — | Cleanup | only historical commitment **1** / line **20M** remain |

### Code

- `BudgetServiceImpl` — all transitions above
- `FinanceWorkflowIntegrationTest` setUp — budget approve by DIRECTOR (not creator DED)

**Verdict:** Finance money paths are fail-closed on identity, maker≠checker, expenditure ceiling, and concurrent state. Ledger restored. Ready for next domain only after product sign-off.


## 17. System settings + formulas E2E (2026-07-13)

User: *make sure things are well automated and controlled in the system settings and formulas flow well and work end to end.*

### Surfaces exercised

| Surface | Settings → runtime control |
|---------|---------------------------|
| Incident approval automation | `portal_settings` (`incident_approval.*`) → `IncidentWorkflowService.settleStage` |
| Resource allocation chains | `approval_workflow_configurations` → `ApprovalWorkflowEngine.initialize` |
| Budget approval ceilings | `budget_approval_thresholds` → `BudgetServiceImpl.approveCommitment` |
| Economics formulas | live recompute `economics-v3-formula-engine` (24 formulaAudit steps, `ai:false`) |

### Controls hardened

| Gap | Fix |
|-----|-----|
| Thresholds accepted `village` / negative / zero | scope ∈ {district,region,national}; max_amount > 0 or null (unlimited) |
| Automation empty / partial-invalid body | empty **422**; validate whole payload before any write |
| Chain `order` gaps after delete / history | compact `1..n` on delete; one-time normalize live chain |
| Settings `can_skip` ignored by engine | `initialize` omits level when `can_skip` and no officer holds the role |

### Live E2E results (net-zero)

| Drill | Result |
|-------|--------|
| Set automation → read back | **200** / modes match |
| Invalid mode / unknown stage | **422** |
| Empty automation body | **422** |
| Lower district ceiling → approve overspend | **422** ceiling (settings drive money path) |
| Restore ceiling + delete drill commitment | ledger = historical only |
| Set DDMC/DED/RDMC=`auto` → submit incident | lands **waiting_ras** with 3× `auto_advanced` history |
| Restore automation defaults | skip_if_unstaffed ×3 + manual RAS/national |
| Economics GET | modelVersion + 24 formulaAudit steps + coefficients |
| Partner write automation/thresholds | **403** |
| Resource chain order after normalize | 1..6 contiguous |

### FE

- Approval Workflows page: automation tiers + resource_allocation levels (live save)
- Budget & Finance → Approval Ceilings: rejects non-positive client-side; surfaces BE errors
- Economics of Disaster: formula workbook + recompute

**Verdict:** System settings automation and formula paths are controlled, wired into runtime engines, and proven end-to-end with net-zero cleanup.


## 18. Monitoring & Evaluation eGA (2026-07-13, careful)

Progressive eGA of the next residual fat domain after finance/settings. **No path or JSON change** for Angular.

### Structure

| Before | After |
|--------|--------|
| `monitoring/MonitoringEvaluationController` + 2 fat `@Service` classes (~3.3k lines) | Thin `controller/MonitoringEvaluationController` |
| | `service/MonitoringEvaluationService` + `MonitoringEvaluationEntryService` |
| | `service.impl/*ServiceImpl` |
| | `monitoring/` package **empty / removed** |

Paths remain `/v1/monitoring-evaluation/*`.

### Live validation (post-extract)

| Surface | Result |
|---------|--------|
| Dashboard SA | **200**, 19 top-level keys, 10 frameworkAims, NATIONAL scope |
| framework-aims | **200**, n=10 |
| workbench default | **200**, indicators n=12 (period context) |
| workbench `domain=NOPE` + `search=zzzz` | indicators/targets/values **0** (productive) |
| indicators list | **200**, n=127 |
| indicators `search=zzzznotfound` | **0** |
| unauth dashboard | **401** |
| Partner manage write | **403** (Partners have view/enter only by design) |
| empty indicator create | **400** code required |
| create E2E_ME_TEMP + SQL delete | net-zero |

**Verdict:** M&E is eGA-layered with productive filters and auth walls intact. Next carefully: reports / notification.


## 19. Reports eGA (2026-07-13, careful)

Three remaining analytics report controllers in `reports/` (EW management already eGA). **Paths/JSON unchanged.**

### Structure

| Path | Before | After |
|------|--------|-------|
| `/v1/reports/incidents` | fat controller | thin controller + `IncidentReportServiceImpl` |
| `/v1/reports/resource-allocations` | fat controller | thin controller + `ResourceReportServiceImpl` |
| `/v1/reports/generated` | fat controller | thin controller + `GeneratedReportsServiceImpl` |
| package `reports/` | 3 controllers | **removed** |

Controls retained: simulation exclusion on incident/resource reports; partner/stakeholder blocked (404/module 403); area scope via `appendAreaScopeWithCouncil`.

### Live validation

| Surface | Result |
|---------|--------|
| Incidents default | **200**, summary total **17**, records **17**, full breakdown keys |
| `status=NOPE_ZZZ` | total **0**, records **0** |
| inverted / bad dates | **422** |
| Resource default | **200**, summary + records **11** |
| future empty window | total **0** |
| inverted dates | **422** |
| Generated list | **200**, types catalogue present, n=0 |
| `type=NOPE` | n=**0** |
| EW management (prior eGA) | **200** still |
| unauth incidents | **401** |
| Partner all three | module **403** |

**Verdict:** Reports domain eGA complete with productive filters and security walls. Next carefully: notification.


## 20. Notification HTTP eGA (2026-07-13, careful)

**Blast-radius choice:** only HTTP controllers moved. Cross-domain engines (`NotificationService`, `MailService`, `AudienceService`, `ExternalDeliveryService`, `DeliveryRetryScheduler`, `AsyncConfig`) stay in `notification/` so dozens of service.impl consumers are not churned.

### Structure

| Path | After |
|------|--------|
| `/v1/notifications/*` | Thin `NotificationController` + `UserNotificationServiceImpl` |
| `/v1/communication/*` | Thin `CommunicationOverviewController` + `CommunicationOverviewServiceImpl` |
| `/v1/notifications/test/*` | Thin `ChannelTestController` + `ChannelTestServiceImpl` |
| `/v1/webhooks/*` DLR | Thin `DeliveryStatusController` + `DeliveryStatusServiceImpl` |
| Shared engines | Remain `notification/*` |

Paths/JSON unchanged. Unit test `DeliveryStatusMappingTest` retargeted to service impl.

### Live validation

| Surface | Result |
|---------|--------|
| Feed `limit=5` | **200**, items + unread_count |
| unread-count | **200** |
| preferences GET/POST | **200** |
| mark-all-read | **200**, updated count |
| overview `month` / `today` | **200**, sms/email/inapp/alerts + breakdowns |
| audiences | **200**, 4 audiences / 24 roles |
| test SMS empty / email invalid | soft `success:false` (unchanged contract) |
| DLR local empty secret | **200** updated 0; empty body **400** |
| unauth feed | **401** |
| Partner overview / test SMS | module / method **403** |
| DeliveryStatusMappingTest | **pass** |

**Verdict:** Notification HTTP surface is eGA-layered without breaking the shared delivery spine. Next carefully: stakeholder / ops-IAM.


## 21. System validation — productive params, integration, honesty (2026-07-13)

User direction: *keep validating; no fake codes; every functionality/param productive E2E; data integration well captured; FE organised; no AI footprints; presentable, secure, scalable, sustainable.*

### AI / product honesty

| Check | Result |
|-------|--------|
| Third-party LLM/AI SDKs (incl. agent frameworks) in `pom.xml` / `package.json` | **None** |
| Runtime AI product toggles | **None** |
| `sat_ai` | FE **out-of-scope** card only (not a live feature) |
| Economics of Disaster | `automation.ai=false`, `economics-v3-formula-engine`, formulaAudit present |

### Productive filters (nonsense → empty; real → match)

| Surface | Param | Productive? |
|---------|-------|-------------|
| Incidents registry | `status_filter=Reported/Closed/NOPE` | **Yes** (11 / 1 / 0); FE sends `status_filter`/`workflow_filter`/`hazard_filter` |
| Incidents | wrong names `status`/`search` ignored | Expected — not declared params (not FE fakes) |
| One Health events | `event_type=NOPE` / `search=zzzz` / `event_type=ew_alert` | **0 / 0 / 3** |
| M&E indicators | `search=zzzz` | **0** |
| M&E workbench | `domain=NOPE` | indicators **0** |
| M&E workbench | `institutionClass` | reduces set (50→7 on agency) |
| Incident reports | `status=NOPE` | records **0** |
| Resource reports | future window | **0** |
| Generated reports | `type=NOPE` | **0** |
| Finance budgets list | no query filters | **By design** — FE does not send fake list filters; detail/SoD/thresholds productive |
| EW warnings index | no status query param | **By design** — full area-scoped catalogue; FE registry is load-all |
| Finance thresholds write | `village` / negative | **422** controlled vocabulary |

### Security walls

| Path | Unauth | Partner |
|------|--------|---------|
| finance budgets / economics / reports / settings / OH / incidents | **401** | **403** (module) |
| M&E dashboard | **401** | **200** (Partners have `monitoring_evaluation.view` by design) |
| notifications feed | **401** | **200** (own bell) |
| communication overview / channel test | **401** | **403** |

### Data integration points (live DB + APIs)

| Link | Evidence |
|------|----------|
| EW → One Health | **3** `oh_events.source_warning_id`; `event_type=ew_alert` total **3** |
| Budget → commitments / NDMF | ledger live; economics cash pulls disbursed + NDMF |
| Settings automation → incident ladder | 7 `incident_approval` portal_settings; settleStage proven earlier |
| Approval chain → resource allocation engine | 6 active levels on `resource_allocation` |
| M&E catalogue | **127** indicators; dashboard 10 framework aims from live ops |
| Notifications spine | **6k+** in-app rows; feed/unread/preferences **200** |
| Recovery spine | programs/projects/relief/knowledge all **200** with stats |
| Public portal | landing/threats/regions **200** unauth |

### Frontend organisation

| Item | Status |
|------|--------|
| Module hub | **11** modules (prevention → stakeholder portal) |
| Recovery FE bases | match `/v1/recovery/*` controllers exactly |
| M&E workbench params | `level`, `period`, `domain`, `search`, `institutionClass` → BE |
| Incidents filters | `status_filter` / `workflow_filter` / `hazard_filter` → BE |
| Finance | budgets / NDMF / thresholds / economics wired; no phantom query filters |
| Reports | incidents / resources / generated / EW mgmt paths live |

### Scalability / sustainability posture (observed)

- Layered eGA controllers for completed domains; shared engines isolated (`notification/`, `service.support/`)
- Area isolation on reports/incidents/finance/OH
- Fail-closed money/settings validation
- Deterministic formulas (not ML) for economics
- Residual fat packages only: **stakeholder**, **ops/IAM** (and shared notif engines intentionally kept)

### Residual product notes (not defects)

1. Budget **list** has no server status/search query — optional product enhancement if owners want list filters.
2. EW **index** is catalogue-style (no status query) — filtering is area + client UI; lifecycle actions are separate productive endpoints.
3. Partner M&E **view** is intentional RBAC, not a hole.

**Verdict:** No fake filter contracts found on FE-wired params; security walls hold; integration links are live; AI product surface absent; system remains presentable and eGA-organised. Ready for residual stakeholder / ops-IAM when requested.


## 22. Stakeholder admin eGA (2026-07-13, careful)

Single residual fat controller `stakeholder/StakeholderAdminController` (~403 lines). **Paths/JSON unchanged** (`/v1/stakeholders`).

### Structure

| Before | After |
|--------|--------|
| fat controller in `stakeholder/` | Thin `controller/StakeholderAdminController` |
| | `service/StakeholderAdminService` (+ write request record) |
| | `service.impl/StakeholderAdminServiceImpl` |
| | `stakeholder/` package **removed** |

Controls retained: area scope + partner self-isolation in `index()`; verify provisions Partners role + set-password email; link-user dual-column sync.

### Live validation (net-zero)

| Drill | Result |
|-------|--------|
| Directory SA | **200**, n=**335**, stats total/verified/active/pending |
| Empty create | **400** name/organization required |
| Create E2E partner | **201** id |
| Toggle isActive | **200** Updated |
| Verify | **200**, `accountProvisioned=true` (login + pending email log) |
| Unverify | **200** revoked message |
| link-user missing email | **404** |
| Unauth list | **401** |
| Partner manage create | **403** |
| Cleanup | e2e stakeholder + provisioned user removed; directory back to **335** |

FE: `/m/stakeholder-portal/directory` → `/api/v1/stakeholders` (list/create/update/verify/link-user).

**Verdict:** Stakeholder admin is eGA-layered with isolation and verification flows intact. Residual fat: **ops/IAM** only.


## 23. Settings + formulas revalidation (2026-07-13)

User: *make sure things are well automated and controlled in the system settings and formulas flow well and work end to end.*

Full live re-pass after recent eGA; net-zero cleanup; **no code changes required**.

### Control surfaces → runtime

| Settings surface | FE | Runtime consumer | Control |
|------------------|----|------------------|---------|
| Incident approval automation | `/m/user-management/approval-workflows` → POST automation | `IncidentWorkflowService.settleStage` | modes: manual / auto / skip_if_unstaffed; empty/bogus stage/mode **422**; Partner **403** |
| Resource allocation chain | same page → `/v1/settings/approval-workflows` | `ApprovalWorkflowEngine.initialize` | 6 contiguous levels; can_skip honored when unstaffed |
| Budget approval ceilings | Finance → Approval Ceilings | `approveCommitment` tierCeiling | scope ∈ district/region/national; amount &gt; 0 or null; village/negative **422** |
| Economics formulas | `/m/budget-finance/economics` | live GET recompute | `ai:false`, 24 formulaAudit steps, cash stable across two GETs |
| Resource / incident types | Response settings + catalogue | ops modules | **200** (71 resources / 8 types) |

### End-to-end proofs (this pass)

1. **Automation → ladder:** set DDMC/DED/RDMC=`auto` → submit incident → rested at **`waiting_ras`** with 3× `auto_advanced` history → defaults restored → drill incident deleted.
2. **Threshold → money:** district ceiling **100k** → 150k commitment approve **422** ceiling → ceiling restored **50M** → commitment deleted.
3. **Automation write controls:** empty body / invalid mode / unknown stage **422**; Partner write **403**.
4. **Economics honesty:** deterministic engine, not ML/AI; historical cash **8,000,000** stable.
5. **Net-zero:** 1 historical budget commitment; 0 leftover settings-drill incidents; automation defaults intact.

**Verdict:** System settings automation and formulas remain controlled, FE-wired, and proven end-to-end.


## 24. ops/IAM eGA (2026-07-13, careful)

High-risk surface extracted last. **Paths/JSON and security annotations unchanged.**

### Structure

| Before | After |
|--------|--------|
| `iam/AuthController` + `TotpService` | Thin `controller/AuthController` + `service/AuthService` + `AuthServiceImpl` |
| | `service.support/TotpService` (pure RFC 6238 helper) |
| `ops/GoLiveOpsController` | Thin `controller/GoLiveOpsController` + `GoLiveOpsService` + impl |
| packages `iam/`, `ops/` | **empty / removed** |

Hazard-area context under `/v1/ops/hazard-area-context` was already eGA (unchanged).

### Live validation (local)

| Drill | Result |
|-------|--------|
| Login bad password | **401** |
| Login empty body | **401** |
| Login local admin (test password) | **200** `status=OK`, JWT issued, Super Admin |
| `GET /v1/auth/2fa/status` with JWT | **200** `enabled=false` |
| Forgot password | **200** (no enumeration) |
| Ops go-live readiness | **200**, localProfile true, honesty note (no AI/NIDA live claims) |
| Integration registry | **200**, 12 planned endpoints |
| Integrity summary | **200** |
| Geo resolve `Dodoma` | **200**, resolved district 101 |
| Hazard-area context | **200** |
| Unauth / Partner readiness | **401** / **403** |
| Finance budgets (local headers) | **200** (no regression) |

**Verdict:** Auth and go-live ops are eGA-layered without changing public contracts. Primary progressive eGA of fat domains is complete.


## 25. Residual content / repository / INFORM web eGA (2026-07-13, careful)

### Structure

| Surface | After |
|---------|--------|
| `/v1/content/email-logs` | Thin controller + `EmailLogServiceImpl` |
| `/v1/content/sms-logs` | Thin controller + `SmsLogServiceImpl` |
| `/v1/content/action-guide` | Thin controller (delegates `ActionGuideStatementService`) |
| `/v1/repository/events` | Thin controller + `DisasterEventServiceImpl` |
| `/v1/repository/analytics` | Thin controller + `SendaiAnalyticsServiceImpl` |
| `/v1/inform/*`, `/v1/portal/inform/*` | Controllers in `controller/`; domain+engine unchanged |
| JPA interfaces | Remain `repository/*Repository` |
| `Recipients` helper | `service.support` (public) |

### Live validation

| Check | Result |
|-------|--------|
| Email logs | **200**, n=300; `status=NOPE` logs **0** |
| SMS logs | **200**, n=102; `status=NOPE` logs **0** |
| Action guide | **200** rows/common/hazards |
| Repository events | **200**, 86 events; status/hazard nonsense **0** |
| Sendai analytics | **200** targets/series/insights |
| INFORM indicators | **200**, 76; `owner=NOPE` **0** |
| Portal INFORM risk (public) | **200** |
| Unauth repo/inform | **401** |
| Partner repo | **403** |

**Verdict:** Residual HTTP surfaces eGA-layered with productive filters and walls. Platform controller layer is now consistently under `controller/`.


## 26. Next-level personal notification feed (2026-07-13)

User direction: *notification to be really of next level* — productive personal inbox (not AI). No schema change; categories derived from `type`.

### Backend (`UserNotificationServiceImpl`)

| Capability | Behaviour |
|------------|-----------|
| Feed filters | `unread`, `type`, `category`, `severity`, `q`, `before_id` (cursor), `limit` 1–100 |
| Category intelligence | Derived: `workflow`, `early_warning`, `approval`, `logistics`, `training`, `scanner`, `system` — SQL `CASE` mirrors `deriveCategory()` (first match wins) |
| Ordering | Unread first → critical/high/warning → newest |
| Enrichment | `category`, `category_label`, `category_icon`, `severity_norm` |
| Chips | `categories[]` with unread/total per bucket |
| Badge poll | `GET /unread-count` → `count`, `latest_id`, `by_severity` |
| Actions | mark read / mark **unread** / mark all / **dismiss** (DELETE own row only) |
| Preferences | channel catalogue + TZ mobile validation when SMS on |
| Bad category | **422** with allowed list; bad type/severity → empty list (0 rows) |

### Frontend

| Surface | Behaviour |
|---------|-----------|
| Bell (topbar) | Chips All / Unread / Critical / EW / Approvals; category labels; Centre link; smart poll via `latest_id` |
| Notification Centre | `/m/notifications` — stats, category chips, severity, search, load-older cursor, mark read/unread, dismiss |
| Module hub | Content Management → Notification Centre |

### Live validation (SA, net-zero where mutating)

| Check | Result |
|-------|--------|
| Feed + enrich | **200**, category/severity_norm present |
| Category matrix (all 7) | **0 mismatches** (filter SQL = enrich category) |
| `category=xyz` | **422** |
| unread-count + by_severity + latest_id | **200** |
| mark unread → count 1 critical → mark read → 0 | **200** net-zero |
| dismiss probe row | **200**, row gone; user count restored |
| bad dismiss id | **422** |
| cursor `before_id` | page2 ids strictly older |
| preferences GET/POST | **200** |

**Verdict:** Personal notification surface is productively next-level — filters, categories, smart poll, full centre UI — without AI claims or schema churn. Delivery engines remain the single `notification/` spine.


## 27. Productive validation pass — no fake params (2026-07-13)

User direction: *keep validating; no fake codes; every functionality/param productive end-to-end; work at all angles; detect and resolve issues.*

### Issues found and fixed

| Issue | Symptom | Fix |
|-------|---------|-----|
| Notification `severity=NOPE` | Silently returned **info** rows (fake productive filter) | Controlled vocab → **422** (`critical\|high\|warning\|info\|success` + aliases) |
| Feed `before_id` cursor | **7 dups**, **55/82** coverage under severity-aware ORDER BY | Keyset pagination aligned with ORDER BY; foreign `before_id` → empty; `limit+1` for accurate `has_more` |
| Search `q` unbounded | Possible abuse / noise | Max **200** chars → **422** |
| Communication `range=NOPE` | Silently treated as **this month** | Controlled vocab `today\|week\|month\|all` → **422**; response echoes `range` |

### Revalidation matrix (live)

| Surface | Result |
|---------|--------|
| Notif severity/category garbage | **422** |
| Notif cursor full walk | **82/82**, dups=**0** |
| Notif multi-persona ownership | director/eocc own rows only |
| Notif foreign mark-unread/dismiss | **422**; foreign row intact |
| Comm range today/week/month/all | **200** + `range` echo |
| Comm range garbage | **422** |
| Incidents `status_filter=Reported` | total **11** |
| Incidents `status_filter=NOPE` / workflow NOPE / hazard 999999 | **n=0** |
| Email/SMS logs `status=NOPE` | **n=0** |
| Repository events `status=NOPE` | **n=0** |
| Unauth notif / comm / incidents | **401** |

**Verdict:** Detected fake-filter behaviours fixed; productive params work end-to-end; isolation and walls hold.
