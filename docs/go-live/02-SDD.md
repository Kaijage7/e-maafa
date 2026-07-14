# System Design Document (SDD)

**Product:** e-MAAFA / DMIS  
**Version:** Go-live architecture 2026-07  
**Note:** This is the cutover architecture brief. The long living design history remains in `docs/SYSTEM-DESIGN-DOCUMENT.md` for archive. Prefer this file for go-live decisions.

## 1. System context

e-MAAFA is the PMO-DMD national disaster management platform. Operators use an Angular SPA. The public uses the same SPA routes that need no login. One Spring Boot service holds domain logic. PostgreSQL is the system of record. A small Python process builds official EW bulletin PDFs.

```
  [Operators / agencies]          [Citizens]
           |                           |
           v                           v
     Angular SPA  <---proxy--->  Spring Boot /api
           |                           |
           +---- /ew-api ---->  PDF service :8600
                                       |
                                       v
                                  PostgreSQL
```

## 2. Deployable units

| Unit | Tech | Role |
|------|------|------|
| Backend | Java 21, Spring Boot 3.3 | Business API, auth, Flyway |
| Frontend | Angular 18 | Operator UI and public portal |
| Database | PostgreSQL 16+ | SoR, Flyway schema |
| EW PDF | Python, localhost | HTML/PDF pipeline for bulletins |
| Reverse proxy | nginx or equivalent | TLS, static UI, `/api` proxy |

## 3. Backend structure

Layered packages (eGA style):

1. `controller` : HTTP only  
2. `service` + `service.impl` : business rules  
3. `repository` / JDBC where needed  
4. `entity`, `dto`  
5. `common` : security, errors, geo  
6. `integration` : external handoffs (no fake live clients)  
7. Domain hubs kept where migration is incomplete: `ew`, `inform`, `notification`

API base path: `/api`. Example: `/api/v1/portal/landing`.

## 4. Security design

| Topic | Design |
|-------|--------|
| Authentication | Self-issued HS256 JWT |
| Authorisation | Method security on permissions |
| Area scope | Jurisdiction filters on incident and resource paths |
| Public routes | Explicit allow list (portal, storage publications) |
| Production fail-fast | JWT secret length, CORS origins, no `local` profile on edge |

Local-only persona headers exist for engineering tests. They must not be enabled on production.

## 5. Core data domains

| Domain | Tables (examples) | Notes |
|--------|-------------------|--------|
| Identity | `users`, roles, permissions | RBAC |
| Early warning | `ew_agency_submissions`, `ew_generated_products`, `early_warnings` | One bus |
| Response | `incidents`, allocations, dispatches | Area scoped |
| Preparedness | warehouses, inventory, evacuation centres | Live registers |
| Risk | INFORM areas, indicators, values | Structural risk |
| Portal CMS | news, slides, settings | Public content |
| Integration | `integration_endpoints`, `integration_messages` | Honest status |

## 6. Early warning design

1. Agency console posts a submission (tier + areas + values).  
2. PMO consolidated view merges by highest-alert rule.  
3. Impact-support adds INFORM and ops context; it does not overwrite entity colour.  
4. Operator generates PDF via `/ew-api/generate/{kind}` (proxied to port 8600).  
5. Product is stored under `/api/storage/...`.  
6. Publish to map and/or publications is explicit.  

PDF generation is offline-capable relative to the Java process. If the sidecar is down, authoring still stores data; generate fails until the sidecar is up.

## 7. Portal design

Landing payload is one public read (`GET /v1/portal/landing`):

- Published bulletins on map (with PDF URL when present)
- Warning pins from map-enabled early warnings or published products
- Public-safe incidents (pinned or active response / escalated with coordinates)
- National situation aggregates (open load, by region, agency bus freshness)
- CMS content (news, slides, publications)

No private casualty board on the public map strip.

## 8. Integration design

External national systems are registered, not claimed live.

| Pattern | Use |
|---------|-----|
| Agency bus | TMA and other EW entities today |
| Handoff export | IFMIS commitments, NAPA programme map, LATRA logistics snapshot |
| Verify package | NIDA (hash only, no live call) |
| Bulk request | NBS population request package |

Status values: `planned`, `configured`, `live`, `disabled`, `error`. Mark `live` only after MoU and dual-proved round trip.

## 9. Configuration

| Profile | Use |
|---------|-----|
| `local` | Developer machine only |
| `prod` | Public edge |

Secrets: JWT, DB password, optional M-Gov and SMTP. Template: `docs/env.prod.example`.

## 10. Observability and ops

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/ops/go-live-readiness` | Cutover honesty board |
| `GET /api/v1/ops/integrity-summary` | Residual integrity counts |
| `GET /api/v1/ops/integration-registry` | External endpoint status |
| Actuator health | Process health (limited surface) |

## 11. What this design deliberately does not do

1. Does not dual-write core tables from unvalidated external feeds.  
2. Does not treat INFORM proxies as live NBS or NIDA registries.  
3. Does not run AI scoring as a product.  
4. Does not require Keycloak for cutover.  

## 12. References

- Package map: `docs/EGA-BACKEND-STRUCTURE.md`  
- Integration research: `docs/NATIONAL-DATA-INTEGRATION-RESEARCH.md`  
- Runbook: `docs/GO-LIVE-RUNBOOK.md`  
