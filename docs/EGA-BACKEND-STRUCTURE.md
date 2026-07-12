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
5. Inventory + Resource (Java hub)  
6. Training plans (leaf)  
7. Settings / catalogue  
8. Response / EW (SQL-heavy)  

Full coupling map: [`EGA-INTERLINKAGE-MAP.md`](./EGA-INTERLINKAGE-MAP.md).

### Migration log

| Module | Status | API paths | Verified |
|--------|--------|-----------|----------|
| Alert subscriptions | Done | `/v1/alert-subscriptions` | Full CRUD matrix + proxy + jar |
| Evacuation centres | Done | `/v1/evacuation-centers` (+ nearest) | Full matrix + regression |
| Warehouses | Done | `/v1/warehouses` | Full matrix + **Inventory** + warehouse-ops + prior modules |
| Temporary warehouses | Done | `/v1/temporary-warehouses` | Full matrix + residual-stock deactivate rule + warehouse-ops/dispatch SQL consumers untouched |

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
