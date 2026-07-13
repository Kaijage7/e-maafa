# e-MAAFA Backend Structure — eGA Spring Boot Standard

**Status:** Binding development standard  
**Aligned with:** eGA de facto Spring Boot architecture (layered n-tier monolith) and eGA/EXT/APA/005 development standards (architecture, SDD, portability, e-GIF/GovESB)  
**Code root:** `backend/src/main/java/tz/go/pmo/dmis`

---

## 1. Decision

e-MAAFA backend code is organised in the **eGA layered structure**. This is the convenient and required arrangement for all **new** work and for incremental relocation of existing code.

```
controller  →  service (interface)  →  service.impl  →  repository  →  entity
dto / mapper
config
integration  (GovESB, NIDA, GePG, M-Gov, callbacks)
util
exception
```

This is a **layered n-tier monolith** (not microservices), matching systems eGA builds and supervises.

---

## 2. Canonical package tree

```text
tz.go.pmo.dmis
├── DmisPlatformApplication.java
├── controller/              # @RestController only (thin)
├── service/                 # XxxService interfaces
│   └── impl/                # XxxServiceImpl
├── repository/              # Spring Data JPA repositories (data access only)
├── entity/                  # @Entity classes
├── dto/
│   ├── request/             # write payloads
│   └── response/            # read models + ApiResponse envelope
├── mapper/                  # ModelMapper / MapStruct
├── config/                  # Security beans, OpenAPI, ModelMapper, CORS
├── util/                    # pure helpers
├── exception/               # business exceptions
├── integration/
│   ├── govesb/              # token, sign, encrypt, ESB client
│   ├── nida/
│   ├── gepg/
│   ├── mgov/
│   └── callback/            # async POST callbacks from GovESB
├── common/                  # shared security, errors, events (transitional home)
└── local/                   # profile-local seeders only (never production paths)
```

### Layer rules

| Layer | May depend on | Must not |
|--------|----------------|----------|
| `controller` | `service` interfaces, `dto` | repository, entity, JdbcTemplate, other controllers |
| `service` (iface) | `dto`, domain types | Spring Web annotations |
| `service.impl` | `repository`, `entity`, `integration`, `dto`, `mapper` | HTTP types (`HttpServletRequest` unless unavoidable) |
| `repository` | `entity` | controllers, DTOs as return types for external API |
| `entity` | JPA only | services, controllers |
| `integration.*` | config, util, DTOs for external envelopes | feature controllers calling raw crypto |

---

## 3. Standard API envelope

```json
{
  "status": "success",
  "message": "OK",
  "data": { }
}
```

Type: `tz.go.pmo.dmis.dto.response.ApiResponse<T>`

```java
return ApiResponse.success(data);
return ApiResponse.success("Disaster response activated.", result);
return ApiResponse.fail("Only pending injects can be removed.");
```

---

## 4. Naming conventions (eGA style)

| Kind | Pattern | Example |
|------|---------|---------|
| Controller | `{Feature}Controller` | `IncidentController` |
| Service interface | `{Feature}Service` | `IncidentService` |
| Service impl | `{Feature}ServiceImpl` | `IncidentServiceImpl` |
| Repository | `{Entity}Repository` | `IncidentRepository` |
| Entity | singular noun | `Incident` |
| Request DTO | `{Feature}Request` / `{Action}Request` | `IncidentWriteRequest` |
| Response DTO | `{Feature}Response` | `IncidentDetailResponse` |

---

## 5. Stack expectations (eGA-aligned)

| Concern | Choice |
|---------|--------|
| Runtime | Spring Boot 3.x, Java 17+ (platform uses 21) |
| Security | Spring Security — JWT / OAuth2 resource server |
| Persistence | Prefer **Spring Data JPA** + PostgreSQL for new work; open standards preferred |
| Migrations | Flyway |
| API docs | OpenAPI / Swagger (supports SDD) |
| Mapping | ModelMapper or MapStruct |
| Interop | **GovESB** for cross-institution exchange (e-GIF) |
| Deploy | JAR/WAR behind Nginx on GDC / GovNET |

JdbcTemplate remaining in legacy feature packages is transitional. New master data and CRUD should use JPA entities + repositories under `entity` / `repository`.

---

## 6. Functional modules vs packages

Disaster-management **capabilities** (Response, EW, Mitigation, …) remain **product modules** for product owners and the Angular UI. On the **backend**, they are **not** top-level package roots for new code.

Instead, class names and URL prefixes carry the module:

| Capability | Example controller | Example base path |
|------------|--------------------|-------------------|
| Response | `CommandCenterController` | `/v1/response/coordination` |
| Early Warning | `EwController` | `/v1/ew/...` |
| Mitigation | `HazardController` | `/v1/mitigation/...` |

Optional later: subpackages under layers for readability only, e.g. `controller.response`, `service.impl.response` — still layer-first, not feature-first at the root.

---

## 7. Transition rules (existing code)

The tree still contains legacy feature packages (`response/`, `ew/`, `mitigation/`, …). That is expected until migration finishes.

| Rule | |
|------|---|
| **New files** | Only under eGA layers above |
| **Bugfixes** in old packages | Allowed in place; prefer extracting service interface when touching heavily |
| **New endpoints** | New or moved controller in `controller/` + `service` + `impl` |
| **No big-bang** | Move one capability at a time (e.g. Public Reports → then Settings → then Response) |
| **Do not** | Add new controllers under `response/`, `ew/`, etc. |

Suggested migration order:

1. ~~**Alert subscriptions**~~ — **DONE**  
2. ~~**Evacuation centres**~~ — **DONE**  
3. ~~**Warehouses**~~ — **DONE** (InventoryService import fix same change-set)  
4. ~~**Temporary warehouses**~~ — **DONE**  
5. ~~**Inventory + Resource entity**~~ — **DONE**  
6. ~~**Training plans**~~ — **DONE** (preparedness package fully migrated)  
7. ~~**Translations (Settings)**~~ — **DONE**  
8. ~~**Resource catalogue (Settings)**~~ — **DONE** (named ResourceCatalogue* to avoid clash with inventory `entity.Resource`)  
9. ~~**Approval workflows (Settings)**~~ — **DONE** (`RoleCatalogue` made public for service.impl reuse; engine remains SQL-coupled only)  
10. ~~**Locations (Settings)**~~ — **DONE** (hierarchy CRUD + seat seeding; SQL consumers unchanged)  
11. ~~**Institutions (Settings)**~~ — **DONE** (agencies + stakeholders governance; snake_case item keys preserved)  
12. ~~**Roles & permissions (Settings)**~~ — **DONE** (matrix + Super Admin rename/empty-matrix guards)  
13. ~~**User management (Settings)**~~ — **DONE** (last Super Admin guard; unknown role names rejected; RoleCatalogue remains shared helper)  
14. ~~**Stakeholder coordination (Response R1)**~~ — **DONE** (read-only first Response leaf)  
15. ~~**Executive Watch (Response R2)**~~ — **DONE** (read-only national COP; service.impl + thin controller)  
16. ~~**Public Reports (Response R3)**~~ — **DONE** (triage + convert; service.impl + thin controller; workflow helpers public for convert)  
17. ~~**Contingency Plans (Response R4 / map R3)**~~ — **DONE** (lifecycle; thin controller + service.impl; no workflow coupling)  
18. ~~**Support Pledges (map R4)**~~ — **DONE** (needs + pledge + accept/decline; NotificationService retained)  
19. ~~**Declarations (map R6)**~~ — **DONE** (statutory s.32/s.33 chain; thin controller + service.impl)  
20. ~~**Anticipatory Plans**~~ — **DONE** (area scope; matchingPlans on service for Command Post)  
21. Response remaining (never engine/dispatch/allocation first) then EW  

Full coupling map: [`EGA-INTERLINKAGE-MAP.md`](./EGA-INTERLINKAGE-MAP.md).

### Migration log

| Module | Status | API paths | Verified |
|--------|--------|-----------|----------|
| Alert subscriptions | Done | `/v1/alert-subscriptions` | Full CRUD matrix + proxy + jar |
| Evacuation centres | Done | `/v1/evacuation-centers` (+ nearest) | Full matrix + regression |
| Warehouses | Done | `/v1/warehouses` | Full matrix + **Inventory** + warehouse-ops + prior modules |
| Temporary warehouses | Done | `/v1/temporary-warehouses` | Full matrix + residual-stock deactivate + warehouse-ops SQL consumers |
| Inventory + Resource | Done | `/v1/inventory`, `/reference` | Index, reference, create, update, AreaGuard, stock_movements; warehouse-ops + settings/resources + prior modules |
| Training plans | Done | `/v1/training-plans` (+ publish, push-priority, request-support) | Full CRUD + golden-thread actions + preparedness/response regressions |
| Translations | Done | `/v1/settings/translations` | Index/filter, create, conflict 409, update, delete, bad group 400; portal i18n + proxy + preparedness regressions |
| Resource catalogue | Done | `/v1/settings/resources` | CRUD + vocab guards + in-use delete 409; inventory/reference linkage; proxy + regressions |
| Approval workflows | Done | `/v1/settings/approval-workflows` | Index + roles, add/edit/move/delete level, toggle module restore, bad-role 400; FE proxy; allocations/coordination regressions; `ApprovalWorkflowRoleVocabTest` |
| Locations | Done | `/v1/settings/locations` | Index + cascade reads, region/district/council/ward lifecycle net-zero, delete-with-children 409; FE proxy; jurisdiction/user-mgmt regressions; location unit tests |
| Institutions | Done | `/v1/settings/institutions` | Index filters, one, classification + profile round-trip (agency/stakeholder type-normalize), blank-name 400, bad kind 400; **fixed** classification SQL (`updatepublic.*` text-block concat); snake_case items; FE proxy + regressions |
| Roles & permissions | Done | `/v1/settings/roles` | Index/catalogue/show, create/update/delete net-zero, dup 409, held-role delete 409; **Super Admin guards**: no rename, no delete, matrix save always re-applies full catalogue (closes prior 91/97 gap); auto `.view` on matrix save; FE proxy + regressions |
| User management | Done | `/v1/settings/users` | Index filters/groups, create/update/roles/password/delete net-zero; last Super Admin strip/delete 409; **unknown role 400** (was silent skip); bad password policy; FE proxy + roles/locations/institutions regressions |
| Stakeholder coordination | Done | `/v1/response/stakeholder-coordination` | Index + show 360°; not-found; FE proxy; preparedness/settings/response regressions; first Response eGA leaf |
| Executive Watch (Response R2) | Done | `/v1/response/executive` | Thin controller + service.impl; national tier only (area → 403); JSON unchanged; multi-persona verify |
| Public Reports (Response R3) | Done | `/v1/response/public-reports` | Thin controller + service.impl; paths/JSON/PreAuthorize unchanged; multi-persona list scopes; OOA review/dismiss/convert **404**; dismiss reason **422**; convert untagged/already-converted **422**; convert → waiting_ded + link integrity (drill reverted) |
| Contingency Plans (map R3) | Done | `/v1/response/contingency-plans` | Thin controller + service.impl; filters productive; lifecycle create→submit→reject→approve→archive; perm walls (Dist **403**); show 404; drill net-zero |
| Support Pledges (map R4) | Done | `/v1/response/support` | Thin controller + service.impl; needs/pledges; staff-on-behalf + donor scope; accept funds training/measure; decline; validation **422**; Dist accept **403**; drills net-zero |
| Declarations (map R6) | Done | `/v1/response/declarations` | Thin controller + service.impl; propose→review→endorse→declare→extend→revoke; Dist/Reg **403**; stage **422**; SA break-glass declare; drill net-zero |
| Anticipatory Plans | Done | `/v1/response/anticipatory-plans` | Thin controller + service.impl; area scope + OOA show **404**; Reg OOA create **422**; lifecycle drill net-zero; CommandCenter uses `AnticipatoryPlansService.matchingPlans` |

20. ~~**Anticipatory Plans**~~ — **DONE**; remaining Response leaves next (never engine/dispatch first)

---

## 8. eGA documentation pack (still required)

Structure alone is not compliance. Maintain alongside code:

- System Design Document (SDD) — this structure documented in §02  
- Database design + data dictionary (eGA/EXT/IFA/002 alignment)  
- Security architecture (eGA/EXT/ISA/001)  
- Interoperability via e-GIF / GovESB for external exchange  
- Audit logging design  

---

## 9. Quick checklist for a new feature

1. `entity/Foo.java`  
2. `repository/FooRepository.java`  
3. `dto/request/FooRequest.java`, `dto/response/FooResponse.java`  
4. `service/FooService.java` + `service/impl/FooServiceImpl.java`  
5. `controller/FooController.java` returning `ApiResponse`  
6. Flyway migration if schema changes  
7. OpenAPI annotations on the controller  
8. If external institution data: only through `integration/govesb` (or approved client)  

---

*This document is the binding backend arrangement standard for e-MAAFA. Where legacy layout and this standard disagree, new work follows this document.*
