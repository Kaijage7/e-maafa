# e-MAAFA — System Design Document

## Document Control

| Field | Value |
|---|---|
| Document title | e-MAAFA — System Design Document |
| Version | 1.0 |
| Date | {{DATE}} |
| Status | Draft |
| Owner | PMO-DMD (Prime Minister's Office — Disaster Management Department) |
| Audience | Backend & frontend engineers; PMO ICT; architecture reviewers; auditors; technical stakeholders |
| System | e-MAAFA — Tanzania PMO Disaster Management Information System (`dmis-platform`) |
| Source of truth | The source tree at `/home/kaijage/model/maafa/dmis-platform`. Where code and prose disagree, the code wins. |

---

## Executive Summary

e-MAAFA is the Tanzania Prime Minister's Office (PMO) Disaster Management Information System — the national platform for early warning, incident response, prevention & mitigation, recovery and public information across the full disaster-management lifecycle. It is a re-platform of a legacy Laravel application onto a modern, single deployable backend with a rich operator UI and a public citizen portal, built to be both faithful to the existing institutional workflows and fully functional end-to-end.

**Purpose.** e-MAAFA gives the PMO Disaster Management Department (DMD), the Emergency Operations Coordination Centre (EOCC), regional and district authorities, sector ministries and partner organisations one coordinated system to: run the multi-agency Early Warning pipeline; command incident response with jurisdiction-scoped approval chains; plan and track risk-reduction (mitigation); coordinate cross-sector One Health events; manage recovery and a Sendai-aligned national disaster-loss repository; disseminate alerts to the public over SMS, email and in-app channels; and publish the national disaster picture to citizens.

**The nine functional modules.**

1. **Early Warning (EW)** — multi-agency bulletin authoring, PMO-DMD consolidation, EOCC publication, dissemination and OSINT monitoring.
2. **Response** — incident command, area-scoped statutory approval, the EOCC Command Center, resource allocation/dispatch, alerting and DM-Act-2022 declarations.
3. **Prevention & Mitigation** — hazard registry, risk assessments, mitigation measures, strategic infrastructure, past-disaster repository, GIS risk map and dashboard.
4. **Preparedness** — warehouses, relief inventory, evacuation centres, training plans, contingency/anticipatory plans and citizen alert subscriptions (delivered jointly with EW).
5. **Recovery** — recovery programmes, reconstruction (strategic) projects, relief distribution and the lessons-learned knowledge library.
6. **One Health** — cross-sector (human/animal/environment) event reporting, directives, dissemination and action tracking.
7. **Public Portal & Content** — the citizen-facing portal and the CMS that authors it.
8. **Disaster Repository** — the Sendai/DesInventar national disaster-loss database and analytics.
9. **Settings, Identity & Notifications** — user/role/permission management, location hierarchy, resource catalogue, translations, approval-workflow configuration, login, the notification backbone and stakeholder administration.

**Architecture style.** e-MAAFA is a **modular monolith**: one Spring Boot 3.3.4 service on Java 21 hosts every bounded context, modules collaborate through a transactional outbox rather than direct cross-module calls, and the package and event seams are arranged so a future split into services is mechanical rather than a redesign. The operator UI is an Angular 18 single-page application of 100% standalone components with lazy-loaded routes. Data lives in one PostgreSQL 17 database shared with the still-running legacy application during migration. A thin, unchanged Python service generates the official Early-Warning bulletin PDFs. The backend serves under context-path `/api`; the frontend proxies `/api`→`:8080` and `/ew-api`→`:8600`.

**The most important design decisions.**

- **Strangler re-platform from Laravel.** e-MAAFA runs against the *same* PostgreSQL database as the legacy Laravel app and takes over functionality module by module. The governing rule: Flyway owns only the new schemas and never mutates the legacy `public` tables; new code reads and additively extends those tables through `JdbcTemplate`.
- **Modular monolith, not microservices.** One process, one connection pool, in-process events via the outbox — prioritising faithful behaviour and a single deployable unit, with the outbox relay documented as the single future point of change for a message broker.
- **Keycloak resource server with a self-issued HS256 token, plus a local persona.** The platform mints and validates its own HS256 JWT (`sub = users.id`) so it is runnable and fully testable without a live Keycloak; a `local`-profile persona filter authenticates dev/E2E requests from an `X-Local-Roles` header while still exercising the real `@PreAuthorize` gates.
- **Jurisdiction & area scoping.** Authorization is role-based, layered with a jurisdiction model so that "only the nation sees everywhere": national tier sees the whole country, region tier its region, district tier its district — enforced server-side (STRICT for incidents, shared-or-own for registries).
- **A single notification backbone.** Every outbound message — in-app bell, SMS via the national M-Gov gateway, email via SMTP — flows through one dispatcher with per-user channel preferences, off-thread delivery and a full cross-channel audit, replacing the legacy app's scattered notification logic.
- **The native EW pipeline replacing Streamlit.** The Python/Streamlit EW workbench has been fully retired and re-platformed natively on Spring Boot + Angular; only the stateless Python *generate-engine* (port 8600) remains, to render the official bulletin PDF.
- **Read-model over shared tables.** New modules treat the legacy `public` tables as a read model materialised idempotently (`CREATE TABLE IF NOT EXISTS`) so production is untouched while a standalone database is runnable — and write through those same tables for ported flows that must match Laravel behaviour byte-for-byte.

The remainder of this document is the authoritative, file-grounded reference: fourteen sections covering context, architecture, security, data, the notification backbone, and each module, then deployment and operations, followed by appendices for the role/authorization matrix, the migration ledger and a glossary.

---

## Table of Contents

1. [Introduction, Scope & System Context](#01-introduction-scope--system-context)
2. [System Architecture & Technology Stack](#02-system-architecture--technology-stack)
3. [Security & Authorization Model](#03-security--authorization-model)
4. [Data Architecture & Persistence](#04-data-architecture--persistence)
5. [Notification & Communication Backbone](#05-notification--communication-backbone)
6. [Preparedness & the Early Warning System](#06-preparedness--the-early-warning-system)
7. [Response Module](#07-response-module)
8. [Prevention & Mitigation Module](#08-prevention--mitigation-module)
9. [One Health Module](#09-one-health-module)
10. [Recovery, Disaster Repository & Reports](#10-recovery-disaster-repository--reports)
11. [Settings, IAM & the Control Plane](#11-settings-iam--the-control-plane)
12. [Public Portal & Stakeholder Coordination](#12-public-portal--stakeholder-coordination)
13. [Frontend Architecture (Angular 18)](#13-frontend-architecture-angular-18)
14. [Deployment, Build & Operations](#14-deployment-build--operations)
- [Appendix A — Role & Authorization Matrix](#appendix-a--role--authorization-matrix)
- [Appendix B — Migration Ledger](#appendix-b--migration-ledger)
- [Appendix C — Glossary](#appendix-c--glossary)

---

## 01. Introduction, Scope & System Context

> **Purpose (executive summary).** e-MAAFA is the Tanzania Prime Minister's Office (PMO) Disaster Management Information System — the national platform for early warning, incident response, mitigation, recovery and public information. This document is the authoritative System Design Document (SDD) for the re-platformed system: a Spring Boot + Angular + PostgreSQL modular monolith that is incrementally replacing a legacy Laravel application while sharing the same database. This opening section establishes what the document covers, who it is for, the nine functional modules at a glance, the strangler-migration context, and the standing assumptions, constraints and vocabulary that the rest of the SDD relies on.

### 1.1 Document Purpose & Responsibilities

This SDD describes the design and implementation of the e-MAAFA backend (`dmis-platform`) as it actually exists in source, not as aspirationally planned. Its responsibilities are:

- To give engineers a precise, file-grounded reference for the platform's structure: the bounded-context modules, their controllers/services/entities, the database schema and the Flyway migration that created each table, the public API surface, and the security model.
- To record the **key design decisions and the rationale** behind them (the strangler pattern, the self-issued JWT identity story, the transactional outbox, the local-profile persona filter, Flyway-owns-schema), so future contributors do not re-litigate or accidentally undo them.
- To make the **known gaps, constraints and deferred work** explicit, so they are managed rather than rediscovered.

Every claim in this document is intended to be verifiable against the source tree rooted at `/home/kaijage/model/maafa/dmis-platform/backend`. Where code and prose disagree, the code wins.

### 1.2 Scope & Intended Audience

**In scope.** The `dmis-platform` Spring Boot backend (the modular monolith), its relationship to the legacy Laravel `public` schema, the Angular 18 frontend's integration contract (the `/api` and `/ew-api` proxies), and the standalone Python Early-Warning generate-engine that produces 722E-4 bulletin PDFs.

**Out of scope / referenced only.** The legacy Laravel application's internals; the operational deployment topology (reverse proxy, TLS termination, Keycloak provisioning) beyond what the configuration files declare; and the EWS standalone early-warning sub-application, which is documented separately.

**Audience.** Primarily backend and frontend engineers working on the platform, and technical stakeholders (PMO ICT, architecture reviewers, auditors). Each section opens with a 2–3 sentence purpose statement that a non-engineer executive can read; the body is technical reference material.

### 1.3 System Context & Runtime Topology

e-MAAFA is a **modular monolith**. A single Spring Boot 3.3.4 application (Java 21, `tz.go.pmo.dmis.DmisPlatformApplication`) hosts every bounded context; modules communicate across boundaries through domain events written to a transactional outbox rather than direct cross-module calls. The runtime pieces and how they connect:

| Component | Technology | Port / path | Role |
|---|---|---|---|
| Backend API | Spring Boot 3.3.4, Java 21 | `:8080`, context-path `/api` | The modular monolith; all REST endpoints live under `/api/...` |
| Frontend | Angular 18 SPA | dev server proxies | Calls `/api/*` (proxied to `:8080`) and `/ew-api/*` (proxied to `:8600`) |
| Database | PostgreSQL 17 | `:5440` (local) / env-driven (prod) | Shared with the legacy app; new schemas + legacy `public` |
| EW generate-engine | Python (Streamlit/FastAPI) | `:8600` | Produces 722E-4 bulletin PDFs/maps; **must not be modified** |
| Identity provider | Keycloak (documented alternative) | `:8081/realms/dmis` | OAuth2 issuer; overridden in practice by the self-issued HS256 path |

Key facts established by `pom.xml` and `application.yml`:

- **Context path is `/api`** (`server.servlet.context-path: /api`), so a controller mapped to `/v1/ew/warnings` is reachable at `/api/v1/ew/warnings`. The frontend `proxy.conf.json` rewrites `/api` → `http://localhost:8080` and `/ew-api` → `http://localhost:8600` (path-stripped).
- **The application is stateless** — `@EnableScheduling` drives the outbox relay and reconciliation jobs; `spring.jpa.open-in-view: false`; sessions are `STATELESS` in both security profiles.
- **`@EnableJpaAuditing(auditorAwareRef = "auditorProvider")`** stamps created/updated audit columns from the authenticated principal.

Source: `backend/pom.xml`, `backend/src/main/java/tz/go/pmo/dmis/DmisPlatformApplication.java`, `backend/src/main/resources/application.yml`, `dmis-platform/frontend/proxy.conf.json`.

### 1.4 The Nine Functional Modules at a Glance

Each module is a top-level package under `tz.go.pmo.dmis`. They map to the disaster-management lifecycle (mitigation → preparedness → early warning → response → recovery) plus the cross-cutting public, identity and settings concerns.

| # | Module | Package(s) | Primary responsibility | Representative controllers |
|---|---|---|---|---|
| 1 | **Early Warning (EW)** | `ew` (+ `ew.scanner`) | Ingest PMO-DMD bulletins, run the pending → approved → published warning lifecycle, store generated 722E-4 products, disseminate alerts, field monitoring | `EwBulletinIngestController`, `EwWarningLifecycleController`, `EwProductController`, `EwBoundaryController`, `ScannerController` |
| 2 | **Response** | `response` | Incident command, damage assessment, resource allocation + approval chain, dispatch/warehouse ops, statutory declarations, anticipatory/contingency plans, stakeholder bidding | `IncidentController`, `ResourceAllocationController`, `DispatchController`, `DeclarationController`, `ApprovalWorkflowEngine` |
| 3 | **Mitigation** | `mitigation` | Hazard register, disaster-risk frameworks, risk assessments, infrastructure inventory, GIS map, mitigation dashboard | `HazardController`, `FrameworkController`, `MitigationDashboardController`, `GisMapController` |
| 4 | **Preparedness** | `preparedness` | Evacuation centres, relief inventory, temporary/zonal warehouses, training plans, alert subscriptions | `EvacuationCenterController`, `InventoryController`, `TemporaryWarehouseController`, `AlertSubscriptionController` |
| 5 | **Recovery** | `recovery` | Recovery programmes, strategic projects, relief distributions, knowledge repository | `RecoveryProgramController`, `StrategicProjectController`, `ReliefDistributionController`, `KnowledgeRepositoryController` |
| 6 | **One Health** | `onehealth` | Cross-sector (human/animal/environment) event reporting, directives, action tracking, dissemination | `OneHealthEventController`, `OneHealthDirectiveController`, `OneHealthDisseminationController`, `OneHealthDashboardController` |
| 7 | **Public Portal & Content** | `portal`, `content` | Citizen-facing portal (public, no auth), CMS for news/education/hazard cards/agencies, SMS/email logs | `PortalPublicController`, `EducationalContentAdminController`, `ThreatAdminController`, `SmsLogController` |
| 8 | **Disaster Repository** | `repository` | Sendai-framework historical disaster event store and analytics | `DisasterEventController`, `SendaiAnalyticsController` |
| 9 | **Settings, Identity & Notifications** | `settings`, `iam`, `notification`, `stakeholder`, `reports` | User/role/permission management, location hierarchy, resource catalogue, translations, approval-workflow config; login; multi-channel dispatch (SMS via M-Gov, email via SMTP); stakeholder admin; cross-module reports | `UserManagementController`, `AuthController`, `NotificationController`, `RolePermissionController` |

Cross-module integration is event-driven via the outbox (`common/event/OutboxAppender`, `OutboxRelay`); the canonical example is EW ingest firing a best-effort One Health "cross-sector kick", and Response dispatch driving the single inventory ledger.

### 1.5 The Strangler-from-Laravel Context

> **Why this matters.** e-MAAFA does not replace the legacy system in one cutover. It runs against the *same PostgreSQL database* as the existing Laravel application and incrementally takes over functionality module by module — the classic *strangler-fig* pattern. The single most important operational rule that flows from this: **the new platform never mutates the legacy Laravel `public` tables' schema, and Flyway is forbidden from touching them.**

Concrete evidence and mechanics from the configuration:

- **Flyway owns only the new schemas.** `spring.flyway.schemas` = `platform, registry, incident, ew, dissemination, notification`, `default-schema: platform`, with `baseline-on-migrate: true` and `baseline-version: 0`. The comment in `application.yml` is explicit: *"the shared database already exists (strangler migration); baseline so Flyway only manages the new platform schemas, never the legacy Laravel `public` tables."*
- **Read/write through the same tables, never reshape them.** Many migrations operate on `public.*` tables that the legacy app owns (e.g. `V3__ew_read_model.sql`, `V5__auth_read_model.sql`, `V22__response_read_models.sql`). Every such statement is guarded with `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` so that on a real production database — where the tables already exist with data — the migration is a no-op, while on a standalone/local database it materialises the schema so the platform is runnable in isolation.
- **Faithful port, but everything must work.** The standing reproduction policy (see project working rules) is: reproduce the legacy LOOK and contracts 1:1, but make every action functional. Where the Laravel source is broken (missing methods, doomed validations, field-name mismatches), the platform implements the obviously-intended behaviour and logs the deviation. Several controllers (e.g. `EwBulletinIngestController`, `EwBoundaryController`) are documented as **faithful ports** of named Laravel controllers preserving identical request/response contracts and identifiers (e.g. `EW-YYYY-NNNNN` warning codes).
- **Hibernate validates, Flyway migrates.** `spring.jpa.hibernate.ddl-auto: validate` — Hibernate never issues DDL; it only checks that the JPA mappings agree with the Flyway-built schema. There are **79 migrations** (`V1`…`V95`, with reserved/skipped blocks reflecting parallel-agent version reservations and `out-of-order: true`).

### 1.6 Security & Identity Context

> **Purpose.** The platform is built as an OAuth2 resource server, but it ships a runnable, fully testable identity story that does **not** require a live Keycloak: it mints and validates its own HS256 bearer tokens. A separate local profile substitutes a header-driven persona so developers and E2E tests still exercise the real authorization gates.

- **Two security profiles, one shared allowlist.** `SecurityConfig` (`@Profile("!local")`) and `LocalSecurityConfig` (`@Profile("local")`) both enable `@EnableMethodSecurity`, disable CSRF (no cookies), set `STATELESS` sessions, and share the *same* public-path allowlist (`SecurityPaths.PUBLIC_PATHS`) so the two profiles cannot drift. The local profile additionally registers `LocalAuthFilter`, which authenticates tokenless requests from an `X-Local-Roles` persona header (defaulting to the full role set) while still yielding to a real `Authorization: Bearer` token.
- **Self-issued HS256 token.** `JwtSecurityConfig` wires both a `JwtEncoder` (login mints) and a `JwtDecoder` (resource server validates) over a single shared secret `dmis.auth.jwt.secret`. The `JwtDecoder` bean **overrides** the Keycloak `issuer-uri` left in `application.yml` as a documented alternative — no Keycloak instance is contacted unless that bean is removed. **Fail-fast:** in any non-`local` profile, startup aborts if the secret is blank, still the dev default, or shorter than 32 bytes.
- **Login over the legacy identity tables.** `AuthController` (`POST /v1/auth/login`) authenticates against `public.users` + the Spatie role tables (`public.model_has_roles`, `public.roles`) using BCrypt, with a constant-time decoy hash to close an email-enumeration timing oracle. The minted token carries `sub = users.id`, `realm_access.roles = SRS roles`, plus name/email for the audit actor.
- **Authorization is role-based and centralized.** `common/security/Authz` is the single source of truth for the 13 operational SRS roles (Super Admin, Secretary, Director, Asst. Director, EOCC, Comms Officer, ICT Admin, MDA Focal, RAS, Reg DC, DAS, Dist DC, Partners — plus DED/RC and the statutory authorities) and the `@PreAuthorize` SpEL expression constants. Role names are matched by **exact string** (spaces and the period in `"Asst. Director"` are significant) and map to Spring `ROLE_*` authorities via `KeycloakRealmRoleConverter`.

### 1.7 Key API Endpoints (Context-Wide Reference)

Representative entry points across the modules. **All paths are prefixed by the `/api` context path.** Read endpoints are generally `isAuthenticated()`; writes are gated by the `Authz.*` role groups.

| Method | Full path (incl. `/api`) | `@PreAuthorize` gate | Purpose |
|---|---|---|---|
| POST | `/api/v1/auth/login` | *(public — in allowlist)* | Authenticate email+password; mint the self-issued HS256 token |
| POST | `/api/ew/bulletins/ingest` | `Authz.EW_INGEST` | Faithful port of Laravel "Push to PMO"; create pending warnings (`EW-YYYY-NNNNN`) |
| POST | `/api/v1/ew/warnings/{id}/approve` | `Authz.EW_APPROVE` | Maker-checker approval of a pending warning |
| POST | `/api/v1/ew/warnings/{id}/publish` | `Authz.EW_APPROVE` | Release an approved warning to the public map |
| POST | `/api/v1/ew/products` | `Authz.EW_INGEST` | Store a generated 722E-4 bulletin PDF (produced by the `:8600` engine) |
| POST | `/api/ew/disseminate` | `Authz.EW_DISSEMINATE` | Dual SMS (public/leaders) + stakeholder email dissemination |
| GET | `/api/v1/repository/events` | `isAuthenticated()` | List Sendai historical disaster events |
| POST | `/api/v1/repository/events` | `CAN_WRITE` (repository write set) | Create a historical disaster event |
| POST | `/api/v1/response/incidents` | `Authz.RESPONSE_OPERATE` | Report a new incident (multipart) |
| POST | `/api/v1/response/incidents/{id}/approve` | `Authz.RESPONSE_OPERATE` | Advance an incident through its approval chain |
| POST | `/api/v1/response/declarations/declare` | `Authz.DECLARE_AUTHORITY` | Statutory Disaster Area / State of Emergency declaration |
| GET | `/api/v1/portal/**` | *(public — in allowlist)* | Citizen-facing portal content (no auth) |
| GET | `/api/v1/settings/users` | `Authz.SYS_ADMIN` | User administration (Super Admin / ICT Admin) |
| GET | `/api/actuator/health/**` | *(public — in allowlist)* | Liveness/readiness probes |
| GET | `/api/swagger-ui.html` | *(public — in allowlist)* | OpenAPI / Swagger UI |

Note: the EW endpoints under `/api/v1/ew/*` are deliberately **not** in the public allowlist — the old unauthenticated Streamlit SSO callbacks have been retired, so every EW path now requires a token.

### 1.8 Data Design Context

The schema is partitioned between the new platform schemas (Flyway-managed) and the legacy `public` schema (read/written, never reshaped). Foundational tables:

| Table | Schema | Created/extended by | Role |
|---|---|---|---|
| `outbox_event` | `platform` | `V1__create_outbox.sql` | Transactional outbox: one row per domain event, partial index on unpublished rows for the relay |
| `users`, `roles`, `model_has_roles` | `public` | `V5__auth_read_model.sql` | Legacy identity tables (Spatie); login authenticates here |
| `warnings`, `warning_hazards`, `hazards`, `regions`, `districts` | `public` | `V3__ew_read_model.sql` (+ V48–V51, V86–V90) | EW pipeline read model over existing app tables |
| `incidents`, `allocated_resources`, `inventory_items`, `stock_movements` | `public` | `V22__response_read_models.sql` (+ V24–V30, V62–V64) | Response state machine + single stock ledger/journal |
| `councils`, `wards` (+ `regions`/`districts` reconcile) | `public` | `V68__tanzania_administrative_hierarchy.sql` | Full TZ admin hierarchy (31 regions / 154 districts / 195 councils / 4081 wards) |
| `permissions`, role→permission pivot | `public` | `V44__permissions.sql` | Permission matrix documenting the access model (enforcement is currently by role) |

Design rules in force: Flyway owns DDL and Hibernate only validates; all `public.*` DDL is idempotent (`IF NOT EXISTS`); JDBC time zone is pinned to `Africa/Dar_es_Salaam`; the Response module deliberately keeps `inventory_items` + `stock_movements` as the single ledger/journal and treats `warehouse_stocks`/`inventory_transactions` as legacy (never read).

### 1.9 Assumptions & Constraints

- **Shared database.** The platform assumes co-tenancy with the legacy Laravel app on one PostgreSQL instance. Production schema/data must never be mutated outside the new platform schemas.
- **Flyway out-of-order migrations.** `out-of-order: true` is required because parallel development reserves version blocks; a lower-numbered migration may legitimately arrive after a higher one has applied.
- **Externalized secrets.** SMTP (`MAIL_*`), the M-Gov SMS gateway (`MGOV_*`), the DB credentials, and the JWT secret (`DMIS_AUTH_JWT_SECRET`) come from the environment. Non-local profiles fail fast without a real JWT secret.
- **M-Gov sender registration.** SMS dissemination via the M-Gov gateway requires a registered sender ID; the registered numeric `15200` is the default — the alphanumeric `e-MAAFA` sender must be registered with M-Gov by PMO ICT first.
- **Uploads.** Container multipart limit is 10 MB (12 MB request) so scanned EOCC bulletin PDFs reach the upload controllers; the news/gallery upload path additionally enforces its own 5 MB check.
- **TLS termination at a proxy** in production (`forward-headers-strategy: framework`), which is what makes HSTS actually emit.

### 1.10 Known Gaps, TODOs & Deferred Work

- **Authorization is role-based, not permission-based.** The `V44` permission matrix documents and *can drive* finer-grained enforcement, but the backend currently authorizes by `hasAnyRole(...)`. Per-permission and per-institution/jurisdiction scoping is deferred (SQL hooks exist; local persona acts as Super Admin).
- **Statutory declaration authorities are not yet seeded.** Only the 13 operational roles are seeded by `LocalDataSeeder`; the Minister/President/National Technical & Steering Committees exist as `Authz` constants, so the declaration gates currently keep everyone below national command out and will tighten once those roles are seeded.
- **List endpoints are unpaginated and capped (≈100–200 rows)** — pagination is required before national-scale data volumes.
- **Notifications default to a `database` channel** that is designed to be swappable to SMS/FCM without schema change; some channels (e.g. role-targeted SMS) require phone numbers to be seeded, and there is no delivery-receipt (DLR) tracking yet.
- **Keycloak is a documented-but-unused alternative.** The runnable identity path is the self-issued HS256 token; fronting the app with Keycloak requires removing the overriding `JwtDecoder` bean and provisioning the realm.

### 1.11 Glossary of Key Terms

| Term | Meaning |
|---|---|
| **PMO** | Prime Minister's Office (Tanzania) — owner of the disaster-management mandate and of e-MAAFA. |
| **DMD** | Disaster Management Department within the PMO; originates the official bulletins ("Push to PMO") that the EW module ingests. |
| **EOCC** | Emergency Operations Coordination/Command Centre — an operational role and the producer/consumer of EOCC bulletins; a seeded SRS role with broad EW/Response operate privileges. |
| **EW** | Early Warning — the module and pipeline that ingests bulletins, runs the warning lifecycle (pending → approved → published), generates products and disseminates alerts. |
| **722E-4** | The standard PMO early-warning bulletin form/product; the generated 722E-4 PDF (produced by the `:8600` Python engine) is stored against its geography and surfaced on the EOCC bulletin/map. |
| **Sendai** | The Sendai Framework for Disaster Risk Reduction (2015–2030) — the basis for the historical Disaster Repository's event taxonomy and analytics. |
| **One Health** | The cross-sector approach linking human, animal and environmental health; the module coordinates cross-sector events, directives and dissemination. |
| **DRRC / DRR** | Disaster Risk Reduction (Committee); the mitigation/preparedness posture aimed at reducing risk before disasters occur. |
| **DRF** | Disaster Response Fund / Framework — coordination lanes and disbursements in the Response/command-post workflow (see `V89__ndmf_disbursements.sql`). |
| **NDMF / NDMC** | National Disaster Management Framework / committees referenced by the statutory declaration chain (Disaster Management Act No. 6 of 2022). |
| **Spatie** | The Laravel roles/permissions package whose tables (`roles`, `permissions`, `model_has_roles`) the platform reads for identity and authorization. |
| **Strangler pattern** | Incremental replacement of a legacy system by routing functionality through a new app against the same database until the legacy app can be retired. |
| **M-Gov** | The Tanzania Government SMS gateway used as the national delivery path for alert dissemination. |
| **Persona filter** | The local-profile `LocalAuthFilter` that authenticates tokenless dev/E2E requests from an `X-Local-Roles` header so the real `@PreAuthorize` gates are still exercised. |

---

## 02. System Architecture & Technology Stack

> **Purpose (executive summary).** e-MAAFA is a single deployable backend (a "modular monolith") that re-platforms the Tanzania PMO's legacy Laravel disaster-management system one bounded context at a time without a big-bang rewrite. The backend is a Spring Boot 3.3.4 service on Java 21, the operator UI is an Angular 18 single-page app, data lives in one PostgreSQL 17 database shared with the legacy app during the migration, and a separate Python service generates Early-Warning products. This section documents the runtime topology, the package layout that enforces module boundaries, the shared cross-cutting plumbing (error handling, security, the event outbox), and the conventions every module follows.

---

### 02.1 Runtime topology (3-tier + EW engine)

e-MAAFA runs as four cooperating processes. The Angular dev server proxies all API traffic so the browser only ever talks to one origin; in production the same routing is provided by a reverse proxy.

```
                          ┌──────────────────────────────────────────────┐
                          │  Browser (operator / citizen portal)          │
                          │  Angular 18 SPA  —  http://localhost:4200      │
                          │  Bearer token (self-issued JWT) in Authorization header
                          └───────────────┬───────────────┬──────────────┘
                                          │ /api/**        │ /ew-api/**
                                          │ (proxy.conf)   │ (proxy.conf, path-rewrite ^/ew-api -> "")
                                          ▼                ▼
        ┌──────────────────────────────────────────┐   ┌──────────────────────────────────┐
        │  Spring Boot 3.3.4  (Java 21)             │   │  Python EW generate-engine        │
        │  tz.go.pmo.dmis.* modular monolith        │   │  (Streamlit / FastAPI)            │
        │  http://localhost:8080  context-path /api │   │  http://localhost:8600            │
        │  ─ OAuth2 resource server (HS256 JWT)     │   │  scanner / DMD impact map /       │
        │  ─ @PreAuthorize method security          │   │  722E_4 product generation        │
        │  ─ Flyway-managed schemas                 │   │  (DO NOT modify — see memory)     │
        │  ─ transactional outbox + relay           │   └───────────────┬──────────────────┘
        └───────────────┬───────────────────────────┘                   │
                        │ JDBC :5440                         "Push to PMO" / bulletin ingest
                        ▼                                    (HTTP POST -> /api/ew/bulletins/ingest,
        ┌──────────────────────────────────────────┐         /api/ew/products) writes pending
        │  PostgreSQL 17   localhost:5440           │◄────────warnings into the shared DB
        │  ─ public.*      (legacy Laravel, R/O+R/W via JDBC)
        │  ─ platform.*    (outbox + Flyway history)
        │  ─ registry, incident, ew, dissemination, notification (new contexts)
        └──────────────────────────────────────────┘
```

| Tier | Technology | Port | Notes |
|------|------------|------|-------|
| Presentation | Angular 18.2 SPA (`dmis-web`), Leaflet 1.9 maps, `keycloak-js` 25 (optional), RxJS 7.8 | 4200 (dev) | Dev server proxies `/api`→:8080 and `/ew-api`→:8600 (`frontend/proxy.conf.json`). |
| Application | Spring Boot 3.3.4, Spring Security OAuth2 resource server, Spring Data JPA + raw `JdbcTemplate`, springdoc-openapi 2.6, MapStruct 1.6.2, Lombok | 8080 | Servlet context-path `/api` (`application.yml` `server.servlet.context-path`). |
| Data | PostgreSQL 17, Flyway 11 (Boot-managed), Testcontainers for integration tests | 5440 | One physical DB shared with the legacy app; Flyway owns only the new schemas. |
| EW generation | Python engine (separate repo, MUST NOT be touched) | 8600 | Generates warnings/PDF bulletins and pushes them into the backend via the EW ingest endpoints. |

**Key decisions and why.**
- **Modular monolith, not microservices.** One process, one DB connection pool, in-process events. This is a strangler re-platform — the priority is faithful behaviour and a single deployable unit, with module boundaries enforced in code (package + event seams) so that a future split is mechanical, not a redesign (`DmisPlatformApplication` Javadoc; `OutboxRelay` notes "the single place that changes to push onto a message broker").
- **Context-path `/api`.** Lets the SPA proxy a single prefix and lets a reverse proxy front the EW engine on a sibling prefix without collisions.
- **Two-origin proxy.** `/ew-api` is rewritten to strip the prefix so the browser can reach the Python engine directly for generation screens, while all persisted EW state flows back through `/api/ew/*` on the Spring backend.

---

### 02.2 Modular-monolith package layout

All backend code lives under `tz.go.pmo.dmis` (`backend/src/main/java/tz/go/pmo/dmis`). There are 16 top-level packages: one shared `common` package, a dev-only `local` seeding package, and 14 feature modules. Each module owns its controllers, services, JPA entities/repositories and request/response records; modules collaborate only through the shared `common` event outbox or through the shared database tables (never by calling another module's internals).

| Package | Module / responsibility | Base path(s) | Representative files |
|---------|------------------------|--------------|----------------------|
| `common` | Cross-cutting infrastructure: error handling, security, domain base types, event outbox, web DTOs, config | — | `common/error`, `common/security`, `common/event`, `common/config`, `common/domain` |
| `iam` | Identity & access — email/password login over the legacy `users`/Spatie tables; mints the self-issued JWT | `/api/v1/auth` | `AuthController.java` |
| `repository` | Disaster Repository (national loss database, UNDRR DesInventar-Sendai event cards) + Sendai analytics | `/api/v1/repository/events`, `/api/v1/repository/analytics` | `DisasterEventController`, `SendaiAnalyticsService` |
| `ew` | Early Warning — bulletin ingest from PMO-DMD/TMA, warning lifecycle/approval, generated products, agency submissions, dissemination, field monitoring, scanner | `/api/v1/ew/*`, `/api/ew/*` | `EwWarningLifecycleController`, `EwBulletinIngestController`, `EwBoundaryController`, `scanner/ScannerController` |
| `response` | Response & coordination — incidents, damage assessments, resource allocation/approval, dispatch, warehouse ops, declarations, tasks, command centre, public reports, stakeholder bidding | `/api/v1/response/*` | `IncidentController`, `ResourceApprovalController`, `DeclarationController`, `ApprovalWorkflowEngine` |
| `preparedness` | Preparedness assets — training plans, evacuation centres, warehouses, temporary warehouses, inventory, alert subscriptions | `/api/v1/{training-plans,evacuation-centers,warehouses,temporary-warehouses,inventory,alert-subscriptions}` | `WarehouseController`, `EvacuationCenterService`, `AlertSubscriptionController` |
| `mitigation` | Prevention & Mitigation (DRR) — mitigation measures, infrastructure items, hazards, frameworks, risk assessments, past disasters, GIS map, dashboard | `/api/v1/{mitigation-measures,hazards,frameworks,risk-assessments,past-disasters,infrastructure-items,gis-map,mitigation/dashboard}` | `MitigationMeasureService`, `RiskAssessmentController`, `GisMapController` |
| `recovery` | Recovery — recovery programs, strategic projects, relief distribution, knowledge repository | `/api/v1/recovery/*` | `RecoveryProgramController`, `ReliefDistributionController`, `KnowledgeRepositoryController` |
| `onehealth` | One Health — cross-sector events, directives, action tracking, dissemination, dashboard | `/api/v1/onehealth/*` | `OneHealthEventService`, `OneHealthDirectiveController`, `OneHealthDisseminationController` |
| `notification` | Notification backbone — SMS (M-Gov gateway) + email delivery, audience targeting, channel diagnostics, communication overview, async dispatch | `/api/v1/{notifications,communication}` | `NotificationService`, `ExternalDeliveryService`, `MailService`, `AudienceService` |
| `content` | CMS / public-portal admin support — SMS & email audit logs, recipients | `/api/v1/content/{sms-logs,email-logs}` | `SmsLogController`, `EmailLogController`, `Recipients` |
| `portal` | Public-facing portal + CMS admin — news, education, hazard cards, sections, agencies, threats, media upload | `/api/v1/portal` (public), `/api/v1/content/*` (admin) | `PortalPublicController`, `PortalNewsAdminController`, `ContentUploadController`, `ThreatAdminController` |
| `stakeholder` | Stakeholder (partner organisation) registry administration | `/api/v1/stakeholders` | `StakeholderAdminController` |
| `settings` | Platform settings — users, roles/permissions, locations, resource catalogue, approval-workflow config, translations | `/api/v1/settings/*` | `UserManagementController`, `RolePermissionController`, `LocationController`, `TranslationController` |
| `reports` | Cross-module operational reports — incidents, resource allocations, early-warning management | `/api/v1/reports/*` | `IncidentReportController`, `ResourceReportController`, `EwManagementController` |
| `local` | **Dev/E2E-only** data seeders (active under the `local` profile) | — | `LocalDataSeeder`, `ResponseLocalSeeder`, `OneHealthLocalSeeder`, `UserRoleCoverageSeeder` |

> Note: `portal` and `content` together implement the citizen-facing portal and its CMS; the public read API is under `/api/v1/portal/**` (allowlisted as unauthenticated) while authoring is under `/api/v1/content/**` (role-gated). The `EwBoundaryController` is mapped at `/api/ew/*` (not `/v1/ew`) because it is a faithful path-for-path port of the legacy Laravel `/api/ew/*` dissemination/monitoring routes.

---

### 02.3 Cross-cutting `common/` utilities

The `common` package is the only code every module depends on. It is deliberately thin: error translation, security, base domain types, and the event outbox.

#### 02.3.1 Error handling — RFC 7807 ProblemDetail

`common/error/GlobalExceptionHandler.java` is a single `@RestControllerAdvice` that converts exceptions into `application/problem+json` (RFC 7807) responses. It never leaks internals (`server.error.include-stacktrace: never` in `application.yml`). Every problem body carries a `title`, a `detail`, a `timestamp`, and — critically — a duplicated `message` property, because several frontend code paths read `err.error.message` while ProblemDetail natively populates only `detail`.

The two design-significant behaviours:
- **SQLState-aware integrity mapping.** `handleIntegrity` walks the cause chain to the underlying `SQLException` and branches on the Postgres SQLState so the client gets an accurate status, not a blanket 409: `23505`→409 duplicate, `23503`→409 FK, `23502`→400 missing field, `23514`→400 out-of-range, `22001`→400 too long, `22007/22008/22P02`→400 bad date/number.
- **`ResponseStatusException` reason surfacing.** Hand-thrown `ResponseStatusException`s (used widely by the repository/Sendai/response services) have their `reason` surfaced as the detail, so data-entry mistakes are diagnosable instead of showing a blank "Action not allowed".

Field-level `@Valid` errors are surfaced via `handleValidation` (a `Map<field,message>` under `errors`) reinforced by `server.error.include-binding-errors: always`, so create-forms can tell the user which field failed. Custom domain exceptions live alongside: `BusinessRuleException` (→422) and `ResourceNotFoundException` (→404).

#### 02.3.2 Security

The security model is profile-split but shares one token format and one allowlist.

| Concern | File | Behaviour |
|---------|------|-----------|
| Self-issued JWT wiring | `common/security/JwtSecurityConfig.java` | Mints **and** validates HS256 tokens with one shared secret `dmis.auth.jwt.secret`. The `JwtDecoder` bean overrides the Keycloak `issuer-uri`, so no Keycloak server is contacted. **Fail-fast:** any non-`local` profile aborts startup if the secret is blank, still the bundled dev default, or `< 32` bytes. |
| Token minting | `common/security/JwtTokenService.java` | Called by `AuthController.login` to mint `sub = users.id`, `realm_access.roles = SRS roles`, plus name/email. |
| Production chain | `common/security/SecurityConfig.java` (`@Profile("!local")`) | Stateless resource server, CSRF off, `@EnableMethodSecurity`, public allowlist then `anyRequest().authenticated()`. |
| Local chain | `common/security/LocalSecurityConfig.java` (`@Profile("local")`) | Mirrors production (method security **on**) but adds `LocalAuthFilter` so tokenless dev/E2E requests are authenticated. |
| Dev persona filter | `common/security/LocalAuthFilter.java` | Tokenless requests are authenticated from the `X-Local-Roles` header (defaults to the full role set `Authz.ALL`); a real JWS-shaped bearer wins and falls through to the resource server. Resolves a real `users.id` subject so audit attribution is genuine. |
| Public allowlist | `common/security/SecurityPaths.java` | Single shared list so the two chains cannot drift: `/v1/auth/login`, `/actuator/health/**`, swagger/api-docs, `/v1/portal/**`, `/storage/**`. EW paths are deliberately **not** public. Uses `AntPathRequestMatcher` (not MVC matchers) so static `/storage/**` is matched. |
| Role catalogue + gates | `common/security/Authz.java` | Single source of truth for the 13 operational SRS roles + 4 statutory authorities and all `@PreAuthorize` SpEL expressions (`SYS_ADMIN`, `RESPONSE_OPERATE`, `EW_APPROVE`, `MITIGATION_MANAGE`, …). Roles are matched by exact string against `public.roles.name` (spaces/periods significant, e.g. `Asst. Director`). |
| Acting-user resolution | `common/security/CurrentUserResolver.java` | `actingUserId()` reads the numeric `users.id` from the JWT subject; falls back to `admin@example.com`, then `min(id)`, so per-user reads/audit always resolve to a real account. |
| Hardening + rate limiting | `SecurityHardeningConfig`, `LoginRateLimitFilter`, `EwUploadRateLimitFilter`, `PortalWriteRateLimitFilter`, `FixedWindowRateLimiter` | Security response headers and fixed-window throttles on login brute-force, EW uploads, and public-portal writes. |
| Jurisdiction scoping (scaffold) | `JurisdictionScope`, `AreaLookup`, `SecurityUtils` | Helpers for area-based scoping (region/district). Enforcement is role-based today; per-jurisdiction filtering is partial — see gaps. |

**Why HS256 self-issued, not Keycloak:** the deployment target had no running Keycloak, so the platform mints/validates its own token to give a runnable, fully testable identity story end-to-end. The Keycloak `issuer-uri` remains in `application.yml` as a documented alternative path (override the `JwtDecoder` bean and front the app with Keycloak to switch).

#### 02.3.3 Domain base + transactional event outbox

`common/domain` provides `BaseEntity`, `AggregateRoot` (raises `DomainEvent`s) and an embeddable `Location`. `common/event` implements the transactional-outbox pattern that is the sanctioned inter-module seam:

- `OutboxAppender` (`@EventListener`) serialises each raised `DomainEvent` to JSON and saves an `OutboxEvent` **in the same transaction** as the state change (the transactional-outbox guarantee).
- `OutboxRelay` (`@Scheduled`, `dmis.outbox.relay-delay-ms` default 2000ms) claims up to 100 unpublished rows oldest-first and dispatches each in its **own** transaction via `OutboxDispatcher`, dead-lettering after 5 attempts so one bad consumer cannot replay the whole batch.
- The schema is `platform.outbox_event` (`V1__create_outbox.sql`): `id UUID PK, event_type, aggregate_type, aggregate_id UUID, payload JSONB, occurred_at, published_at`, with a partial index `ix_outbox_unpublished` on `(occurred_at) WHERE published_at IS NULL`.

This is the documented single point of change for a future broker (Kafka/RabbitMQ) when the monolith is split.

---

### 02.4 Data design — Flyway schemas and the read-model pattern

> **Purpose.** The platform shares one PostgreSQL database with the still-running legacy Laravel app. Flyway manages only the *new* schemas and never touches the legacy `public` tables; new modules read and write the legacy tables directly via `JdbcTemplate`, treating them as a "read model" (and write-through where the behaviour must match Laravel exactly).

**Schema ownership.** `spring.flyway.schemas = platform, registry, incident, ew, dissemination, notification`; default schema `platform` (which also holds the Flyway history table). `baseline-on-migrate: true`, `baseline-version: 0`, and `out-of-order: true` (two agents develop with reserved version blocks). Hibernate is `ddl-auto: validate` — **Flyway owns DDL, Hibernate only validates the mapping** (`application.yml`).

**Migration corpus.** 79 migrations, `V1` … `V95` (gaps are reserved blocks). Categories:

| Migration range | Theme | Examples |
|-----------------|-------|----------|
| `V1`, `V2` | Platform infrastructure | `V1__create_outbox.sql`, `V2__outbox_resilience.sql` |
| `V3`–`V21` | Per-module **read models** over legacy `public` tables | `V3__ew_read_model.sql`, `V9__mitigation_measures_read_model.sql`, `V15__one_health_read_models.sql`, `V21__public_portal_read_models.sql` |
| `V22`–`V30` | Response module (incidents, allocation/approval, dispatch, bidding, tasks, command centre) | `V22__response_read_models.sql`, `V24__generalized_approval_workflow.sql`, `V26__stakeholder_bidding.sql` |
| `V31`–`V51` | Portal/content, disaster repository (Sendai), declarations, recovery, EW products/submissions | `V31__content_education_agencies_read_models.sql`, `V38__disaster_repository_sendai.sql`, `V43__declarations_and_committees.sql`, `V47__recovery_and_sms_modules.sql` |
| `V61`–`V95` | Hardening / reference data / cross-module columns | `V64__notification_channels_and_preferences.sql`, `V68__tanzania_administrative_hierarchy.sql`, `V71__statutory_declaration_roles.sql`, `V92__users_area_location.sql`, `V95__users_agency_stakeholder_link.sql` |

**The read-model + JdbcTemplate-over-shared-tables pattern.** This is the defining data decision. Migrations such as `V3__ew_read_model.sql` create the legacy tables (`public.hazards`, `public.regions`, `public.districts`, `public.warnings`, `public.warning_hazards`) **`IF NOT EXISTS`** — so production (where the legacy tables already exist) is untouched, while a standalone/local DB gets them materialised for development. The new code then reads/writes those same tables through `JdbcTemplate` rather than via JPA entities, because:
1. The legacy table shapes (Laravel `public.*`) do not map cleanly to clean JPA aggregates, and forcing them would risk schema drift against the running app.
2. Behaviour must match Laravel byte-for-byte for ported flows (e.g. `EwBulletinIngestController` reproduces the exact `warning_code` format `EW-YYYY-00001` and hazard/level maps).
3. Read-heavy dashboards/analytics (`SendaiAnalyticsService`, mitigation dashboards) are simpler and faster as hand-written SQL.

Examples in code: `AuthController` queries `public.users` / `public.model_has_roles` / `public.roles`; `CurrentUserResolver` and `LocalAuthFilter` resolve subjects from `public.users`; `EwBoundaryController` reads `public.stakeholders`. JPA (Spring Data) is still used where a module owns a clean aggregate (e.g. mitigation/preparedness entities with their own repositories). The strangler rule is explicit in `V22`'s header: "we never mutate production data, only read/write through the same tables."

`V68__tanzania_administrative_hierarchy.sql` is the authoritative reference-data seed: the full TZ hierarchy of **31 regions, 154 districts, 195 councils, 4081 wards**, reconciled idempotently by source CSV codes so existing FKs (incidents, OH events) are preserved.

---

### 02.5 Request/response conventions

| Convention | Rule | Source |
|------------|------|--------|
| Versioned paths | All endpoints under `/api/v1/...` (a small set of faithful legacy ports use `/api/ew/...`). | controller `@RequestMapping` |
| Errors | RFC 7807 `application/problem+json`, with both `detail` and `message` populated, plus `timestamp`; field errors under `errors`. | `GlobalExceptionHandler` |
| Auth | `Authorization: Bearer <HS256 JWT>`; subject is numeric `users.id`; roles in `realm_access.roles`. | `JwtSecurityConfig`, `AuthController` |
| Authorization | Per-endpoint `@PreAuthorize` using `Authz.*` constants; defence-in-depth checks also at the service layer. | `Authz`, `SecurityConfig` |
| Validation | `@Valid` request records; binding errors always surfaced. | `application.yml`, `GlobalExceptionHandler` |
| Uploads | Container multipart cap 10MB / 12MB request; oversize → 413 with a precise message; missing/non-multipart → 400. | `application.yml`, `GlobalExceptionHandler` |
| Time zone | JDBC time zone `Africa/Dar_es_Salaam`. | `application.yml` |
| API docs | springdoc OpenAPI at `/api/swagger-ui.html` and `/api/v3/api-docs` (allowlisted). | `OpenApiConfig`, `SecurityPaths` |
| Ops | Actuator `health`,`info` exposed; liveness/readiness probes enabled. | `application.yml` |

---

### 02.6 Key API endpoints

A representative slice across modules (full path includes the `/api` context-path). Reads are typically `isAuthenticated()`; writes are role-gated by `Authz.*`.

| Method | Full path | `@PreAuthorize` gate | Purpose |
|--------|-----------|----------------------|---------|
| POST | `/api/v1/auth/login` | *(public)* | Email/password login over legacy `users`; mints HS256 JWT (constant-time bcrypt to defeat email enumeration). |
| GET | `/api/v1/portal/**` | *(public)* | Citizen-facing portal content (news, education, hazard cards). |
| POST | `/api/v1/response/incidents` | `RESPONSE_OPERATE` | Report a new incident (multipart). |
| POST | `/api/v1/response/incidents/{id}/approve` | `RESPONSE_OPERATE` | Advance an incident through its approval workflow. |
| POST | `/api/v1/response/incidents/{id}/push-map` | `RESPONSE_OPERATE` | Publish an incident to the public map. |
| POST | `/api/v1/response/declarations` | `RESPONSE_COMMAND` | Propose a statutory disaster declaration. |
| POST | `/api/v1/response/declarations/{id}/technical-review` | `DECLARE_REVIEW` | National Technical Committee s.10 review. |
| POST | `/api/v1/response/declarations/{id}/endorse` | `DECLARE_ENDORSE` | National Steering Committee s.8 endorsement. |
| POST | `/api/v1/response/declarations/{id}/declare` | `DECLARE_AUTHORITY` | Minister (s.32) / President (s.33) declaration. |
| POST | `/api/v1/response/assessments` | `RESPONSE_ASSESS_WRITE` | Create a field damage assessment (maker). |
| POST | `/api/v1/response/assessments/{id}/verify` | `RESPONSE_ASSESS_VERIFY` | Verify an assessment (checker; maker≠checker). |
| POST | `/api/ew/bulletins/ingest` | `EW_INGEST` | PMO-DMD/TMA bulletin "Push to PMO" → pending warnings. |
| POST | `/api/v1/ew/warnings/{id}/approve` | `EW_APPROVE` | Approve a pending warning (maker-checker on public alert). |
| POST | `/api/v1/ew/warnings/{id}/publish` | `EW_APPROVE` | Publish an approved warning to the public map. |
| POST | `/api/ew/disseminate` | `EW_DISSEMINATE` | Multi-channel dissemination (public/leaders SMS + email). |
| POST | `/api/v1/repository/events` | `REPOSITORY_WRITE` (`CAN_WRITE`) | Create a Sendai disaster-event loss card. |
| GET | `/api/v1/repository/analytics` | `isAuthenticated()` | Sendai targets A–D/G analytics. |
| POST | `/api/v1/mitigation-measures` | `MITIGATION_MANAGE` | Author a DRR mitigation measure. |
| POST | `/api/v1/risk-assessments/{id}/approve` | `MITIGATION_APPROVE` | Approve/publish a risk assessment (excludes author tier). |
| POST | `/api/v1/onehealth/events` | `OH_REPORT_EVENT` | Report a cross-sector One Health event. |
| POST | `/api/v1/onehealth/directives` | `OH_OPERATE` | Issue a One Health directive. |
| POST | `/api/v1/notifications` | (notification gates) | Send a notification through the SMS/email backbone. |
| POST | `/api/v1/notifications/test` | `CHANNEL_TEST_WRITE` | Gateway commissioning test SMS/email. |
| POST | `/api/v1/settings/users` | `SYS_ADMIN` | Create/manage a platform user. |
| POST | `/api/v1/settings/locations` | `LOCATION_WRITE` | Maintain the administrative-area reference data. |
| POST | `/api/v1/stakeholders` | `STAKEHOLDER_ADMIN` | Register a partner organisation. |

---

### 02.7 Integration points

- **Angular ↔ backend.** All UI calls go to `/api/**`, proxied to :8080 in dev (`proxy.conf.json`). The SPA attaches the `Authorization: Bearer` token minted by `/api/v1/auth/login`.
- **Angular ↔ Python EW engine.** Generation/scanner screens call `/ew-api/**` (proxied to :8600 with the `^/ew-api`→`""` rewrite), keeping the browser single-origin.
- **Python EW engine → backend.** Generated warnings and bulletin PDFs are pushed into the shared DB through `/api/ew/bulletins/ingest` and `/api/v1/ew/products`; from there the warning lifecycle (`EwWarningLifecycleController`) and dissemination run inside the Spring app. The EW engine is treated as an external producer and **must not be modified** (per project memory).
- **Inter-module (in-process).** Modules collaborate via the transactional outbox (`OutboxAppender`/`OutboxRelay`) — e.g. EW ingest issues a best-effort cross-sector One Health kick — never by direct cross-module method calls.
- **Outbound delivery.** SMS via the M-Gov national gateway (`dmis.mgov.*`, sender-id `15200`); email via SMTP (`spring.mail.*`, Gmail by default). Both pull secrets from the environment; the `notification` module centralises delivery and the `content` module logs every send.
- **Legacy Laravel app.** Continues to run against the same `public.*` tables; the strangler contract (Flyway never touches `public`, code reads/writes through `JdbcTemplate`) keeps the two coexisting during migration.

---

### 02.8 Known gaps, constraints & TODOs

- **Identity is self-issued, not federated.** The runnable path is HS256 minted/validated in-process; Keycloak is wired only as a documented, currently-overridden alternative (`JwtSecurityConfig`, `application.yml` `issuer-uri`). Switching to real Keycloak requires removing/overriding the `JwtDecoder` bean and fronting the app.
- **Local persona filter must never reach production.** `LocalAuthFilter`/`LocalSecurityConfig` are `@Profile("local")` and authenticate tokenless requests; the build fails fast on a dev/blank JWT secret outside `local`, but operational discipline is still required to keep `local` out of shared environments.
- **Authorization is role-based, not per-jurisdiction.** `JurisdictionScope`/`AreaLookup`/`SecurityUtils` exist as scaffolding, but most endpoints gate on roles only; per-region/district data scoping is partial. `Authz.PREPAREDNESS_MANAGE` is documented as "provided for the module owner to apply" — several preparedness controllers are still `isAuthenticated()`-only.
- **Statutory declaration roles are interim.** The Minister/President/Committee authorities are seeded (`V71`) and gated (`DECLARE_*`), but `RESPONSE_COMMAND` is documented as the interim broad gate until those roles are fully exercised end-to-end.
- **Shared-DB coupling.** During the strangler period the platform shares one PostgreSQL instance and the legacy `public` schema with the live Laravel app; `JdbcTemplate`-over-legacy-tables means schema changes in either system must be coordinated.
- **Single-process eventing.** The outbox relay is in-process polling on a 2s fixed delay; throughput/latency are bounded by that, and there is no external broker yet (the documented future change point).
- **EW engine is out of scope for modification.** Map/generation behaviour in the Python service is fixed and read-only from this codebase's perspective; backend EW work must not assume it can change the engine.

---

## 03. Security & Authorization Model

The e-MAAFA backend is a stateless OAuth2 resource server: every API call (under context-path `/api`) must present a bearer token, and each protected operation is gated by a Spring `@PreAuthorize` role check. The platform mints and validates its own HS256 JSON Web Token through a single login endpoint (no external identity provider is contacted at runtime), while a `local`-profile persona filter lets developers and end-to-end tests act as any role without an identity server. On top of the role gate, a jurisdiction (region/district/agency) layer narrows what an officer can see and act on so that, as the requirement states, "only the nation sees everywhere."

This section documents the identity flow, the role catalogue and method-security enforcement, the public allowlist, the area/institution scoping model, transport hardening and rate limiting, and the known constraints of the model.

### 3.1 Purpose & Responsibilities

- **Authentication** — establish who the caller is. A `POST /api/v1/auth/login` exchanges email + password for a signed bearer token; the resource server validates that token on every subsequent request.
- **Authorization (coarse)** — role-based method security. `@PreAuthorize` annotations enforce that the caller holds an appropriate SRS role before a controller method runs. Authorization is **role-based, not permission-based**: all gates use `hasRole`/`hasAnyRole` over role names; there are zero `hasAuthority`/`hasPermission` checks (verified across the backend).
- **Authorization (fine / jurisdiction)** — data scoping. Service- and query-level helpers restrict region/district officers to their own area, partner logins to their own stakeholder record, and EW agency focal logins to their own agency's bulletins.
- **Transport hardening** — CORS allow-listing, security response headers, and per-IP rate limiting on the unauthenticated and abuse-prone surfaces.
- **Profile isolation** — the dev persona convenience (`LocalAuthFilter`, `X-Local-Roles`) is wired only under the `local` profile and is provably absent in any other profile, which is true deny-by-default.

All security code lives under `backend/src/main/java/tz/go/pmo/dmis/common/security/`; the login controller lives at `backend/src/main/java/tz/go/pmo/dmis/iam/AuthController.java`.

### 3.2 Authentication: the self-issued HS256 token

There is no running Keycloak instance. The platform is both the **issuer** (login) and the **validator** (resource server) of a single HS256-signed JWT, using one shared secret. The Keycloak `issuer-uri` remains in `application.yml` as a documented alternative path but is overridden at runtime by the `JwtDecoder` bean.

**Login flow** (`iam/AuthController.java`, `POST /api/v1/auth/login`):

1. Look up the account: `select id, name, email, password from public.users where lower(email) = lower(?)`.
2. Verify the password with `BCryptPasswordEncoder.matches`. To close the email-enumeration timing oracle (auditor flag A1), the controller **always runs exactly one bcrypt compare** — against a constant decoy hash when the email is unknown — so "no such user" and "wrong password" are latency-indistinguishable. Both failures return `401`.
3. Load the user's role names: `select r.name from public.model_has_roles mhr join public.roles r on r.id = mhr.role_id where mhr.model_id = ?` (Spatie-style role pivot).
4. Mint the token via `JwtTokenService.mint(...)` and return `{ token, user{name,email,roles} }`.

**Token claim shape** (`common/security/JwtTokenService.java` — the single place the shape is defined):

| Claim | Value | Purpose |
|---|---|---|
| `sub` | string form of numeric `public.users.id` | The single subject contract; `CurrentUserResolver` parses it back to a `Long` for audit-actor attribution. |
| `realm_access.roles` | array of SRS role names | Mapped to `ROLE_*` authorities by `KeycloakRealmRoleConverter` for `hasAnyRole`. |
| `name` / `preferred_username` / `email` | display + audit identity | Used by `SecurityUtils.currentUserName()` for audit columns. |
| `iss` | `dmis` (`dmis.auth.jwt.issuer`) | Validated by the decoder. |
| `iat` / `exp` | now / now + TTL | Validity window; default TTL 720 minutes (12h), `dmis.auth.jwt.ttl-minutes`. |

The subject contract `sub = users.id` is deliberate: it makes every numeric resolver (`CurrentUserResolver.actingUserId`, the incident/One-Health audit-actor resolvers) resolve the real account. The earlier `UUID.randomUUID()` subject was meaningless and is gone.

**Token signing & validation** (`common/security/JwtSecurityConfig.java`):

- The encoder (`NimbusJwtEncoder`) and decoder (`NimbusJwtDecoder`) are HS256 over `dmis.auth.jwt.secret`. `nimbus-jose-jwt` is already on the classpath via `spring-boot-starter-oauth2-resource-server`, so no new dependency was added.
- The decoder enforces issuer + default validity validators and **overrides** the Keycloak `issuer-uri`.
- **Fail-fast hardening**: in any non-`local` profile, startup aborts if the secret is blank, still the bundled dev default (`DEV_SECRET`), or shorter than 32 bytes (256 bits, the HS256 minimum). The check runs in the constructor (before the `@Bean` methods), so a deployed instance must inject a real secret via `DMIS_AUTH_JWT_SECRET` or it will not boot. Under `local`, a bundled dev default is permitted.
- `KeycloakRealmRoleConverter` (`common/security/KeycloakRealmRoleConverter.java`) reads `realm_access.roles` and emits `SimpleGrantedAuthority("ROLE_" + name)` — so the role-name spaces and punctuation (e.g. `"Asst. Director"`) are significant and must match `public.roles.name` verbatim.

**Frontend contract** (background): the SPA stores the token in `localStorage['dmis.token']`; an Angular interceptor attaches `Authorization: Bearer <token>` to `/api/**` calls only and logs out on `401`.

### 3.3 Profile-specific security chains

Two mutually exclusive Spring Security filter chains share one public allowlist and one role converter, so the profiles cannot drift.

| Profile | Config class | Behaviour |
|---|---|---|
| `!local` (prod/dev) | `common/security/SecurityConfig.java` | Stateless resource server. CSRF off, CORS on, security headers, `SessionCreationPolicy.STATELESS`. `publicMatchers()` permitted, `anyRequest().authenticated()`. Validates the self-issued JWT via the shared decoder. **No persona** — a tokenless request is a true `401`. |
| `local` | `common/security/LocalSecurityConfig.java` | Same chain shape and same allowlist, but adds `LocalAuthFilter` before the bearer filter and a `JwtShapedBearerTokenResolver`. `@EnableMethodSecurity` is ON, so `@PreAuthorize` is actually enforced where the app runs. |

Both chains declare `@EnableMethodSecurity`. The historically critical bug this fixes: method security previously lived only on `SecurityConfig` (`!local`), while the running `local` chain was a blanket `permitAll()` with method security off — silently disabling every `@PreAuthorize`. The `local` chain now mirrors the real chain so the gates are exercised in the profile we actually run.

**The local persona** (`common/security/LocalAuthFilter.java`, `@Profile("local")` only):

- If the request carries a JWS-shaped bearer (`header.payload.signature`, exactly two dots), the filter yields and the resource server validates it — so the real login path works end-to-end locally.
- Otherwise it sets a persona `JwtAuthenticationToken` whose `sub` is a **real** `users.id` (resolved from `model_has_roles` for the chosen role and cached), so audit attribution is a genuine account.
- The acting role set comes from the `X-Local-Roles` header (comma-separated). With no header it defaults to the full canonical role set (`Authz.ALL`), preserving existing dev/E2E flows; with `X-Local-Roles=DAS` only DAS gates pass, so real `403`s are observable locally.

**The EW-bearer gotcha** — `common/security/JwtShapedBearerTokenResolver.java`: the resource server's `BearerTokenAuthenticationFilter` would `401` any present bearer it cannot decode, including the Python EW engine's HMAC SSO token (a 2-segment, one-dot token, not a JWS). This resolver reports any non-two-dot bearer as absent, so it is invisible to the JWT decoder and falls through to the persona instead of being rejected. `LocalAuthFilter` applies the same two-dot test before yielding.

> **Streamlit SSO retired.** The old unauthenticated Streamlit `/user` SSO callback contract has been removed. As documented in `SecurityPaths`, no EW path (`/v1/ew/*`) is publicly open; EW endpoints require authentication and method-level authorization like the rest of the API.

### 3.4 Role catalogue & method-level authorization

Authorization is enforced by `@PreAuthorize` (~343 annotations across ~72 controllers). Of these, 57 are bare `isAuthenticated()`; the remainder are `hasRole`/`hasAnyRole` over the names defined in `common/security/Authz.java`. There are **no** `hasAuthority`/`hasPermission` checks anywhere.

`Authz` is the single source of truth for role names and `@PreAuthorize` expressions. It replaced seven divergent, copy-pasted `CAN_WRITE` literals; settings controllers now reference `Authz.SYS_ADMIN` etc. Each expression is a compile-time-constant SpEL string built by concatenating role-name tokens (so it is a legal annotation value).

**The role set** (verbatim names from `Authz`; the 15 operational roles are seeded by the local data seeder, the 4 statutory roles by migration `V71`):

| Group | Roles (`Authz` constant → seeded name) |
|---|---|
| Platform admin | `SUPER_ADMIN` (Super Admin), `ICT_ADMIN` (ICT Admin) |
| National command | `SECRETARY` (Secretary), `DIRECTOR` (Director), `ASST_DIRECTOR` (Asst. Director), `EOCC` (EOCC) |
| Public voice | `COMMS_OFFICER` (Comms Officer) |
| Sector | `MDA_FOCAL` (MDA Focal) |
| Region tier | `RAS`, `RC` (Regional Commissioner), `REG_DC` (Reg DC) |
| District tier | `DED` (District Executive Director), `DAS`, `DIST_DC` (Dist DC) |
| External | `PARTNERS` (Partners) |
| Statutory (DM Act No. 6 of 2022) | `MINISTER` (s.32), `PRESIDENT` (s.33), `NATIONAL_TECHNICAL_COMMITTEE` (s.10), `NATIONAL_STEERING_COMMITTEE` (s.8) |

**Expression groups** (representative; all defined in `Authz`). The recurring pattern is a **maker ≠ checker / author ≠ approver** split — an OPERATE/WRITE tier that drafts and a narrower OVERSIGHT/APPROVE tier that releases:

| Constant | Roles | Governs |
|---|---|---|
| `SYS_ADMIN` | Super Admin, ICT Admin | User/role/permission management |
| `SUPER_ADMIN_ONLY` | Super Admin | Defense-in-depth on otherwise service-locked writes |
| `LOCATION_WRITE` / `CATALOGUE_WRITE` / `REPOSITORY_WRITE` | admin + Director (+ EOCC/Asst.Dir) | Reference-data, resource catalogue, Sendai repository |
| `OH_OPERATE` / `OH_APPROVE` / `OH_ACKNOWLEDGE` | operators vs oversight vs recipient institutions | One Health workflow (acknowledge is the documented Partners exception) |
| `EW_INGEST` / `EW_APPROVE` / `EW_DISSEMINATE` / `EW_REPORT` | trusted operators / oversight / + Comms / all field operators | EW bulletin ingest, publish + withdraw, dissemination, field reports |
| `RESPONSE_OPERATE` vs `RESPONSE_OVERSIGHT` | field+ops authors vs Super Admin/EOCC/Director/Asst.Dir | Response request/approve (maker ≠ checker) |
| `RESPONSE_COMMAND` | Super Admin, Secretary, Director, Asst. Director, EOCC | High-level response command |
| `DECLARE_REVIEW` / `DECLARE_ENDORSE` / `DECLARE_AUTHORITY` | NTC / NSC / Minister+President | Statutory declaration chain, each step to its own authority |
| `MITIGATION_MANAGE` vs `MITIGATION_APPROVE` | author tier vs approver tier (excludes MDA Focal + ICT) | Prevention & Mitigation (closes a live "viewer approved a risk assessment" hole) |
| `CONTENT_MANAGE` / `AGENCY_MANAGE` / `COMMS_DISSEMINATE` | Comms + admin (+ field for broadcasts) | CMS portal content, partner-agency registry, Communication Center |
| `STAKEHOLDER_ADMIN` vs `STAKEHOLDER_VERIFY` | registrar vs trust-decision tier | Stakeholder registry (register vs verify) |
| `PREPAREDNESS_MANAGE` | ops + sector + field officers | Preparedness assets/plans (offered for that module owner to apply) |
| `CHANNEL_TEST_WRITE` | Super Admin, ICT Admin, Comms Officer | Outbound test SMS/email (gateway commissioning) |

**Permissions tables are documentation, not enforcement.** Migration `V44__permissions.sql` creates `public.permissions` (module.action catalogue) and `public.role_has_permissions` (Spatie pivot). These rows are CRUD-managed in System Settings and capture the policy matrix, but the Spring backend authorizes by role — the permission rows are **never checked** by Spring at runtime. They exist to document the access model and to drive finer enforcement later.

### 3.5 Public allowlist

`common/security/SecurityPaths.java` is the single allowlist shared by both filter chains; everything not listed requires a valid bearer token.

| Path | Why public |
|---|---|
| `/api/v1/auth/login` | Mints the token — must be reachable without one (chicken-and-egg). |
| `/api/actuator/health/**` | Liveness/readiness probes. |
| `/api/v3/api-docs/**`, `/api/swagger-ui/**`, `/api/swagger-ui.html` | API docs. |
| `/api/v1/portal/**` | Citizen-facing portal, public by design (mirrors the legacy public routes). |
| `/api/storage/**` | Public static uploads (news/gallery/publication images). |

Two implementation notes: the allowlist is exposed as `AntPathRequestMatcher`s (not raw strings) so `/storage/**` — served by a `ResourceHttpRequestHandler`, invisible to the MVC introspector — is matched by path rather than falling through to `authenticated()` and `401`-ing. And the EW endpoints are deliberately **not** in the allowlist.

### 3.6 Jurisdiction & institution scoping

Role gating answers "may this role perform this action type"; the jurisdiction layer answers "on which rows". `common/security/JurisdictionScope.java` (a `@Component`) is the shared model, mirroring the incident chain doctrine: national tier sees the whole country, region tier sees its own region, district tier sees its own district.

**Tier sets** (`JurisdictionScope`):

- `NATIONAL` = Super Admin, ICT Admin, Director, Asst. Director, Secretary, EOCC, MDA Focal + the 4 statutory roles.
- `REGION` = RAS, RC, Reg DC.
- `DISTRICT` = DED, DAS, Dist DC.
- `currentTier()` resolves the actor's tier (NATIONAL wins, then REGION, then DISTRICT, else NONE) from `SecurityUtils.currentUserRoles()`. `currentArea()` reads the actor's own `region_id`/`district_id` from `public.users`.

**Two scoping policies:**

| Method | Policy | Used by |
|---|---|---|
| `appendAreaScope(alias, where, params)` | **STRICT**: every row has an area; non-area roles and area-roles-with-no-area get `1=0` (see nothing). | Incidents — security wall. |
| `appendAreaScopeSharedOrOwn(...)` / `sharedOrOwnFilter()` → `AreaFilter` | **LENIENT (shared-or-own)**: area officer sees own-area OR NULL (shared/national); national + non-area roles see all; NULL is never hidden. | Shared registries — warehouses, temporary warehouses, stakeholders, stock. An operational convenience, not a security wall. |

A name-based variant `appendAreaScopeByName(...)` handles legacy tables that store the area as free text; `common/security/AreaLookup.java` resolves the canonical region/district NAMES emitted by the shared `<dmis-region-district>` picker back to FK ids (case-insensitive; null → "national/shared").

**Incident enforcement (the STRICT case)** — `response/IncidentWorkflowService.assertStageAccess(stage, incident)`: each workflow stage maps to a `Scope` (`waiting_das_approval`/`rolled_back_to_das` → DISTRICT, `waiting_ras_approval` → REGION, the national stages → NATIONAL). To action a stage the actor must hold the stage role **and**, for DISTRICT/REGION stages, match the incident's own district/region (`users.district_id`/`region_id` vs the incident's). Super Admin is the documented break-glass override. An officer with no area assigned cannot action an area-scoped stage. The `IncidentController` list query applies `appendAreaScope("i", ...)` so visibility follows the same rule.

**Institution scoping** — `JurisdictionScope` exposes:

- `currentAgencyId()` / `currentAgencyCode()` — the login's agency (`users.agency_id`), the code being lowercase `agencies.acronym` (tma/mow/gst/moh/moa/nemc). Null = not agency-scoped (national/admin), treated as "act for any agency".
- `currentStakeholderId()` — the login's `users.stakeholder_id`; null = not a partner account.

**Per-agency EW enforcement** — `ew/EwAgencySubmissionController` is the cross-agency integration bus (a native re-platform of the Python file-bus). Cross-agency **reads** stay open (entities interlink — e.g. MoW reads TMA rainfall). The two **writes** call `assertAgencyWrite(agency)`: an agency-bound login (`currentAgencyCode()` non-null) may author only for its own code, else `AccessDeniedException`; a national/admin login (null code) may act for any agency. This uses the real JWT subject, not the dev role header, so it holds in production.

### 3.7 Transport hardening & rate limiting

`common/security/SecurityHardeningConfig.java` (applied identically in both chains):

- **CORS** — explicit allow-list from `dmis.security.cors.allowed-origins` (default `http://localhost:4200`); methods `GET/POST/PUT/PATCH/DELETE/OPTIONS`; allowed headers `Authorization, Content-Type, X-Local-Roles, Accept`; exposed `Content-Disposition`; `allowCredentials=false` (token auth, not cookies); 1h max-age.
- **Headers** — HSTS (1 year, includeSubDomains), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Content-Security-Policy: frame-ancestors 'none'` as API defence-in-depth (the full document CSP belongs on the SPA's nginx host).

**Rate limiting** — three auto-registered `OncePerRequestFilter`s sharing one `FixedWindowRateLimiter` and `AbstractRateLimitFilter` (per-client-IP fixed window, in-memory). Each is a self-restricting pass-through at `HIGHEST_PRECEDENCE`:

| Filter | Scope | Default cap | `429` on exceed |
|---|---|---|---|
| `LoginRateLimitFilter` | `POST .../v1/auth/login` | 10 / 60s | yes, with `Retry-After` |
| `PortalWriteRateLimitFilter` | mutating `/v1/portal/**` (GET excluded — heavy public polling) | 30 / 60s | yes |
| `EwUploadRateLimitFilter` | `POST .../v1/ew/warnings/{id}/bulletin` and `.../v1/ew/products` (multipart PDF writes) | 20 / 60s | yes |

The client-IP key is the unspoofable socket address; `X-Forwarded-For` is honoured **only** when the direct peer is a configured trusted proxy (`DMIS_RATELIMIT_TRUSTED_PROXIES`), otherwise the header is attacker-controlled and ignored. The window state is per-instance — adequate for the single-instance deployment, but a multi-instance deployment behind a load balancer should additionally rate-limit at the edge.

### 3.8 Key API endpoints

| Method | Path (incl. `/api`) | `@PreAuthorize` gate | Purpose |
|---|---|---|---|
| POST | `/api/v1/auth/login` | (public, allowlisted) | Email+password → signed HS256 token + roles. |
| GET | `/api/v1/settings/users` | `isAuthenticated()` | List user accounts (for the management screen). |
| POST | `/api/v1/settings/users` | `Authz.SYS_ADMIN` | Create a user account. |
| PUT | `/api/v1/settings/users/{id}` | `Authz.SYS_ADMIN` | Update a user account. |
| PUT | `/api/v1/settings/users/{id}/roles` | `Authz.SYS_ADMIN` | Assign roles to a user. |
| POST | `/api/v1/settings/users/{id}/password` | `Authz.SYS_ADMIN` | Reset a user's password (bcrypt). |
| DELETE | `/api/v1/settings/users/{id}` | `Authz.SYS_ADMIN` | Delete a user account. |
| (CUD) | `/api/v1/settings/roles/**` | `Authz.SYS_ADMIN` | Manage roles & the documentation-only permission matrix. |
| POST | `/api/v1/ew/agency/{agency}/submission` | `Authz.EW_REPORT` + `assertAgencyWrite` | An entity submits its bulletin (own agency only unless national). |
| POST | `/api/v1/ew/agency/{agency}/update` | `Authz.EW_REPORT` + `assertAgencyWrite` | Update an already-issued warning. |
| DELETE | `/api/v1/ew/agency/{agency}/latest` | `Authz.EW_APPROVE` + `assertAgencyWrite` | Withdraw an agency's current bulletin (retract a false alert). |
| GET | `/api/v1/ew/agency/{agency}/latest` | `isAuthenticated()` | Cross-agency read of one agency's latest (interlinking). |
| GET | `/api/v1/ew/agency/latest` | `isAuthenticated()` | Cross-agency visibility map (all agencies' latest). |
| GET | `/api/v1/portal/**` | (public, allowlisted) | Citizen-facing portal reads. |

The full per-endpoint gate matrix is the `@PreAuthorize` annotations themselves; `Authz` is the dictionary that defines every gate referenced above.

### 3.9 Data design

| Table | Key columns | Created/altered by |
|---|---|---|
| `public.users` | `id` (BIGSERIAL, the JWT subject), `name`, `email` (unique), `password` (bcrypt — the only password column) | `V5__auth_read_model.sql` |
| `public.users` (+area) | `region_id`, `district_id` (nullable FK → regions/districts, ON DELETE SET NULL) | `V92__users_area_location.sql` |
| `public.users` (+institution) | `agency_id` (FK → agencies), `stakeholder_id` (FK → stakeholders); both nullable, backfilled for the 6 EW agency focals + partner logins | `V95__users_agency_stakeholder_link.sql` |
| `public.roles` | `id`, `name` (matched verbatim by `hasAnyRole`), `guard_name`, `description` | `V5` (+ `description` in `V44`) |
| `public.model_has_roles` | `role_id`, `model_type`, `model_id` (= users.id) — Spatie pivot | `V5` |
| `public.permissions` | `name` (module.action), `module`, `action`, `label` — **documentation only** | `V44__permissions.sql` |
| `public.role_has_permissions` | `permission_id`, `role_id` — Spatie pivot, **not enforced** | `V44` |
| `public.roles` (DED, RC) | district/region area-tier roles for the incident chain | `V93__incident_chain_area_roles.sql` |
| `public.roles` (statutory) | Minister, President, National Technical Committee, National Steering Committee | `V71__statutory_declaration_roles.sql` |
| `public.warehouses`, `public.agency_resources`, `public.stakeholders` (+area) | `region_id`, `district_id` (nullable FK) for shared-or-own scoping | `V94__area_columns_cross_module.sql` |
| `public.ew_agency_submissions` | `agency`, `submitted_by` (FK → users), `is_latest`, payload/denormalised columns | `V49__ew_agency_submissions.sql` (+ `V50` one-latest) |

All migrations are idempotent (`IF NOT EXISTS` / guarded constraint creation) so the standalone/local database and production can apply the same scripts safely. `public.users` is the only table with a password column.

### 3.10 Integration points

- **Every module** — `@PreAuthorize` referencing `Authz` is the cross-cutting enforcement point; `SecurityUtils.currentUserName()`/`currentUserRoles()` and `CurrentUserResolver.actingUserId()` supply audit-actor identity and who-sees-what filtering to the response, One Health, EW and notification modules.
- **Response / incident chain** — consumes `JurisdictionScope` (STRICT) and `users.region_id/district_id` for stage-by-area enforcement and list visibility.
- **EW module** — consumes `currentAgencyCode()` for per-agency write enforcement; the EW SSO HMAC token is handled by `JwtShapedBearerTokenResolver`.
- **Notification / dissemination** — `users.region_id/district_id` (added in `V92`) enables area-targeted dissemination to the correct regional/district coordinators.
- **Python EW generate-engine (`:8600`)** — calls the authenticated EW endpoints; the frontend proxies `/api` → `:8080`.

### 3.11 Known gaps, constraints & TODOs

1. **Permission matrix is inert.** `public.permissions` / `role_has_permissions` are maintained but never checked by Spring; all enforcement is role-name based. Migrating to permission-based authorization (`hasAuthority`) is a future option the matrix is designed to enable.
2. **Frontend is not role-gated.** The SPA route guard checks login only; the module hub is static. All authenticated users see all modules in the UI and can reach any URL — the backend `@PreAuthorize` (and jurisdiction checks) are the real wall, returning `403`/`422`. A role/agency-aware menu filter is outstanding.
3. **Jurisdiction scoping is partial by design.** STRICT scoping is applied to incidents; shared-or-own scoping covers only the high-value registries (warehouses, temporary warehouses, stakeholders). The resource **catalogue** (national list of types) and the contingency/anticipatory/training **plans** are intentionally left national. `agency_resources` carries the area columns (`V94`) but is not yet scoped — it has no standalone registry/CRUD, so scoping was deferred rather than built speculatively.
4. **In-memory rate-limit state** is per-instance; multi-instance deployments need edge/shared-store rate limiting in addition.
5. **Statutory authority enforcement is interim.** `RESPONSE_COMMAND` currently keeps everyone below national command out of the declaration steps; the per-step tightening to `DECLARE_REVIEW`/`DECLARE_ENDORSE`/`DECLARE_AUTHORITY` depends on those statutory roles being seeded and assigned (`V71` seeds the role rows; account seeding/assignment is operational).
6. **`@EnableMethodSecurity` parity is load-bearing.** The model only holds because both filter chains enable method security; any change to a security config or shared bean must be verified by booting the Spring context (a unit pass once hid a bean-wiring bug that crashed the shared build), not by unit tests alone.

---

## 04. Data Architecture & Persistence

> **Purpose (executive summary).** e-MAAFA is a strangler re-platform: a new Spring Boot service runs alongside the legacy Laravel application against the **same PostgreSQL 17 database**. This section documents how that shared database is structured, how schema change is controlled (79 Flyway migrations, V1–V95), and how the new platform reads and writes the legacy `public` tables without ever destabilising production. The governing rule is: **Flyway owns DDL, the legacy `public` schema is treated as a read/write surface we extend additively, and the new bounded-context schemas (`platform`, `incident`, …) are ours alone.**

### 4.1 Responsibilities & Scope

The persistence layer is responsible for:

- **A single shared database** holding both the legacy Laravel domain (`public` schema) and the new platform's own data (`platform` and other context schemas).
- **Controlled, versioned schema evolution** via Flyway, applied at application boot.
- **A "read-model" projection layer** that materialises the legacy tables locally so the new app can authenticate and operate standalone, while never mutating the production schema.
- **Reference master data** — the full Tanzania administrative hierarchy (regions → districts → councils → wards) and controlled vocabularies (incident types, hazards, permissions, translations).
- **Cross-module integration tables** — the transactional outbox, the cross-agency Early Warning submission bus, and the unified notification feed.

This section does **not** cover the Python EW generate-engine on `:8600` (it authors PDFs and JSON; the Spring app only ingests the returned blobs), nor the application-service/business-logic layer except where a schema decision is load-bearing.

### 4.2 Database Topology & Schema Strategy

The database is shared by two applications mid-migration, so schema ownership is explicit. Configuration lives in `dmis-platform/backend/src/main/resources/application.yml` (Flyway block, lines 40–54):

| Schema | Owner | Contents |
|---|---|---|
| `public` | Legacy Laravel app (shared) | All domain tables (users, roles, regions, incidents, warnings, oh_*, …). The new app reads and additively extends these; **never drops or mutates existing structure**. |
| `platform` | New platform | Shared infrastructure: `outbox_event`, the Sendai/DesInventar disaster repository (`disaster_events`, `disaster_event_effects`, `disaster_event_links`, `sendai_baselines`, `sendai_indicators`). Flyway's history table also lives here. |
| `registry`, `incident`, `ew`, `dissemination`, `notification` | New platform (bounded contexts) | Reserved per-context schemas (`create-schemas: true`). Most domain tables today still live in `public` by necessity (the legacy app reads them too); these schemas hold context-private state. |

Key Flyway settings and **why**:

- `default-schema: platform`, `schemas: platform,registry,incident,ew,dissemination,notification` — the Flyway history table is isolated from the legacy app, which has its own (Laravel) migration bookkeeping.
- `baseline-on-migrate: true`, `baseline-version: 0` — the shared database already exists; baselining tells Flyway to manage only the new platform migrations and **not** to attempt to own the pre-existing Laravel tables.
- `out-of-order: true` — two engineers developed in parallel with reserved version blocks, so a lower-numbered migration can legitimately arrive after a higher one has applied (this is why the sequence has gaps: V51 → V61, V72 → V80).
- `spring.jpa.hibernate.ddl-auto: validate` — **Hibernate never generates DDL.** Flyway is the single source of schema truth; JPA only validates that the entity mappings match the migrated schema at boot. `open-in-view: false`.

### 4.3 Migration / Versioning Strategy

79 migrations, `V1__…` through `V95__…`, in `dmis-platform/backend/src/main/resources/db/migration`. Conventions enforced throughout:

1. **Additive and idempotent.** Almost every statement is `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`, and FK/constraint creation is guarded by `pg_constraint` look-ups inside `DO $$ … $$` blocks. This is mandatory because (a) production may already carry the Laravel table, and (b) the standalone EWS app shares the database and may have created an object via its own DDL first (see V90's explicit note). A migration must be a safe no-op where the object already exists.
2. **Reserved version blocks** for parallel work (ops `V22–V30`, public-portal `V31+`), enabled by `out-of-order: true`.
3. **Soft FKs to `public.users`** (`references public.users(id) on delete set null`) for actor columns, so deleting a user never cascades destruction of audit/history rows.
4. **The migration header is the design record.** Each file opens with a comment explaining the source Laravel migration it mirrors, the strangler constraint it respects, and the bug or requirement that motivated it. These comments are the primary design rationale and were used to author this section.

**Recent area/identity migrations (V92–V95) — jurisdiction scoping & institution binding.** These four migrations introduce area-based row scoping so an officer sees only their jurisdiction while the national tier sees all:

| Migration | What it adds | Design intent |
|---|---|---|
| `V92__users_area_location.sql` | `users.region_id`, `users.district_id` (nullable FK, `ON DELETE SET NULL`) + indexes | Area-targeted dissemination (an EW bulletin pushed for specific districts) can reach RAS/Reg DC by region and DAS/Dist DC by district. Existing users unaffected until seeded. |
| `V93__incident_chain_area_roles.sql` | Seeds roles **DED** (District Executive Director) and **RC** (Regional Commissioner) | The jurisdiction-scoped incident approval chain needs a district-stage approver and a regional viewer. Ids = `max(id)+1` to coexist with explicitly-id'd seeded roles. |
| `V94__area_columns_cross_module.sql` | `region_id`/`district_id` on `warehouses`, `agency_resources`, `stakeholders` (+ FK, index, backfill from free-text names) | NULL = national/shared (visible to all). Applies area to **stock** (`agency_resources`), not the national resource catalogue. Temporary warehouses already carried area columns. |
| `V95__users_agency_stakeholder_link.sql` | `users.agency_id`, `users.stakeholder_id` (nullable FK) + backfill of the six EW-agency focal logins by acronym and stakeholder logins by reverse `user_id` link | Scopes a login to the institution it represents (an EW agency focal acts only on its agency's submissions; a partner sees only its own stakeholder records). NULL = national/admin, no restriction. |

The nullable-and-NULL-means-national pattern is deliberate: it lets the feature ship without a destructive backfill and keeps every pre-existing row visible until an area/institution is explicitly assigned.

### 4.4 The Read-Model Pattern

The single most important data-architecture decision. Because the new app must run **standalone in dev** (and faithfully against the shared production schema), it cannot assume the legacy Laravel tables exist. Migrations V3–V22 (and others) therefore **materialise the legacy tables locally** with `CREATE TABLE IF NOT EXISTS`:

- On **production**, where Laravel already created the table, `IF NOT EXISTS` makes the statement a no-op — the legacy schema is untouched (V3 header: *"The platform only READS them … this only materialises them on a standalone/local database"*).
- On a **fresh standalone DB**, the table is created so the new app's repositories, login, and screens work end-to-end.

Read-models are typically a **subset of the real Laravel columns** the new screens need (V10 `resources` carries only `id/name/category`; V13 `incidents` started as a 9-column mitigation-dashboard stub). As the new app took over a module, later migrations **widen** the stub to the full source shape — e.g. V22 adds ~50 columns to `incidents` (the full Draft→DAS→RAS→National approval chain, casualty figures, damage fields) on top of V13's stub.

Consequences and constraints engineers must respect:

- **Two representations of the same domain concept can coexist.** Early Warning has the normalised `warnings` + `warning_hazards` pair (V3) *and* a separate flat `early_warnings` table (V21) that is the **public portal map's** data source. V21's header flags this explicitly (*"distinct from the normalised warnings/warning_hazards pair (source issue EW-1)"*). Writers must update the correct projection; V88 added `early_warnings.affected_districts` precisely to push warning geography down to the public projection.
- Entity mappings are validated, not generated (`ddl-auto: validate`), so a column added in a migration must be wired through the JPA `@Entity` and every layer above it, or it is silently dropped on write (see §4.9, pitfall 4).

### 4.5 Principal Tables by Domain

The following groups the production-relevant tables. The migration shown is where the table was first created; columns are often extended by later migrations.

**Identity / auth (`public`)** — Spatie-style model from Laravel.
- `users` (V5; extended V64 phone/notify_*, V92 region/district, V95 agency/stakeholder), `roles` (V5; description added V44; DED/RC seeded V93; statutory authorities Minister/President/NTC/NSC seeded V71), `model_has_roles` (V5 pivot, user↔role).
- `permissions` + `role_has_permissions` (V44) — Spatie permission catalogue (`module.action`). **Note:** the backend authorises by *role* (`hasAnyRole`); these rows document/govern the policy and can drive finer enforcement later — they are not yet the enforcement path.

**Locations / reference hierarchy (`public`)** — seeded complete by V68 from NBS CSVs.
- `regions` (V3), `districts` (V3), `councils` (V68, new level), `wards` (V15; `council_id` added V68). FK chain: `districts.region_id → councils.district_id → wards.council_id`. Authoritative counts: **31 regions, 156 districts, 195 councils (184 mainland + 11 Zanzibar), 4081 wards.** Linkage in V68 is by source CSV codes, not source row ids, so existing incident/oh_event FKs are preserved.

**Early Warning (`public`)** — see §4.6.

**Incidents & response (`public`)** — V13 stub, V22 full shape.
- `incidents` (V13/V22; portal-surface columns V91; area FKs V94 chain), `incident_types` (V22; vocabulary normalised V67), `incident_tasks`, `incident_updates`, `incident_workflow_histories` (V22), `allocated_resources` + `approval_workflows` + `approval_histories` (V22, the relief request approval chain), `damage_assessments` + `assessment_categories` + `assessment_photos` (V22), `alerts` + `alert_templates` + `alert_recipients` + `recipient_groups` (V22, response-side comms), `stock_movements` (V22), `agency_resources` (V25, physical stock), `resources`/`inventory_items` (V10), `warehouses` (V7).

**Stakeholders & agencies (`public`)**
- `stakeholders` (V15; `region`/`district` free-text; `country` V81; `region_id`/`district_id` FK V94), `agencies` (V31; the six EW agencies + partners).

**One Health (`public`)** — 18 `oh_*` tables created together in V15.
- `oh_areas_of_concern`, `oh_concern_items`, `oh_area_stakeholder`, `oh_events` (the central report; FK to stakeholder/area/region/district/ward and a soft FK `source_warning_id → warnings`), `oh_event_*_details` (environmental/health/agricultural/food-safety), `oh_event_animal_entries`, `oh_directives` + `oh_directive_stakeholder` + `oh_directive_implementation_updates`, `oh_disseminations` + `oh_dissemination_stakeholders` (ack columns V20) + `oh_dissemination_logs`, `oh_action_trackings`, `oh_event_workflow_histories`, `oh_event_comments`.

**Notification / communication (`public`)**
- `resource_notifications` (V24) — generalised by V64 (`link`, `entity_type`, `entity_id`, `severity`) into the **single per-user in-app feed**. `sms_logs` (V47) and `email_logs` (V64) — per-channel delivery audits. `alerts` (V22) on the response side.

**Public portal & subscriptions (`public`)**
- `portal_settings`, `portal_slides`, `portal_gallery`, `portal_news`, `early_warnings`, `public_hazard_reports` (V21); `portal_hazard_cards` (V33). `alert_subscriptions` (V18; `unsubscribed_at` V32, `unsubscribe_reason` V70), `alert_unsubscribe_requests` (V69, hashed one-time confirmation codes).

**Platform infrastructure (`platform`)**
- `outbox_event` (V1; attempt-tracking & dead-letter columns V2) — the transactional outbox. Disaster repository: `disaster_events`, `disaster_event_effects`, `disaster_event_links`, `sendai_baselines`, `sendai_indicators` (V38/V39).

### 4.6 Early Warning Data Model (cross-agency bus)

Purpose: faithfully re-platform the legacy Python file-bus (`ew/output/bridge/latest_<agency>.json`) as a native, queryable integration table while leaving the Python authoring pages untouched.

| Table | Migration | Role |
|---|---|---|
| `warnings` + `warning_hazards` | V3 | Normalised legacy EW model; `warnings` gained `created_by`/`updated_by`/`attachments` in V51 for bulletin-ingest dedup. |
| `early_warnings` | V21 | Flat public-portal map projection (separate from the above); `affected_districts` added V88. |
| `ew_generated_products` | V48 | Generated 722E_4 bulletin PDFs anchored to geography; `description` V86; `is_published`/`published_at`/`published_by`/`show_on_map` V87 (EOCC registry state). |
| `ew_agency_submissions` | V49 | The cross-agency bus: every agency (TMA/MoW/GST/MoH/MoA/NEMC) submits; others read each other's latest; PMO-DMD reads all. Revision/update columns + `warning_code` added V90. |
| `ew_focal_point_reports` | V51 | Port of the Streamlit EW Monitoring page's focal-point reports. |
| `scanner_detections` + `scanner_entity_taskings` | V90 | OSINT disaster scanner detections and the per-entity verification inbox. |

Two integrity decisions worth noting:
- **`ux_ew_sub_one_latest` (V50)** — a *partial unique index* `ON ew_agency_submissions(agency) WHERE is_latest = true`. The supersede-then-insert in `submit()` is not race-safe alone; two concurrent posts could leave two `is_latest=true` rows that double-count in DMD consolidation. The index makes the second concurrent insert fail cleanly. V50 first demotes any pre-existing duplicate latest rows so the index can be created.
- **`scanner_detections.dedup_key UNIQUE`** — OSINT ingestion is idempotent on the source's dedup key.

### 4.7 Data Dictionary (most important tables)

| Table | Schema | Purpose | Key columns | First created |
|---|---|---|---|---|
| `outbox_event` | platform | Transactional event outbox; domain event written in the same tx as the state change | `id`, `event_type`, `aggregate_type/id`, `payload`(jsonb), `published_at`, `attempts`, `last_error` | V1 (V2) |
| `users` | public | Identity; now carries channel prefs, area & institution scope | `id`, `email`, `password`, `phone`, `notify_in_app/email/sms`, `region_id`, `district_id`, `agency_id`, `stakeholder_id` | V5 |
| `roles` / `model_has_roles` | public | Spatie roles + user↔role pivot | `roles.name`, `guard_name`, `description`; `model_has_roles(role_id, model_type, model_id)` | V5 |
| `permissions` / `role_has_permissions` | public | Permission catalogue + role→permission pivot (documents policy; role-based enforcement today) | `permissions.name`(`module.action`), `module`, `action` | V44 |
| `regions` / `districts` / `councils` / `wards` | public | Full TZ admin hierarchy (31/156/195/4081) | `name`, `*_code`, parent FK (`region_id`→`district_id`→`council_id`) | V3/V3/V68/V15 |
| `incidents` | public | Disaster incident record + Draft→DAS→RAS→National approval workflow + casualty/damage figures | `workflow_status`, `origin_level`, `region_id`, `district_id`, `severity_level`, `*_reviewed_by/at`, `deaths_total`, `show_on_portal_map` | V13 (V22, V91) |
| `incident_types` | public | Controlled incident vocabulary | `name`, `default_severity`, `icon_class` | V22 (V67) |
| `allocated_resources` | public | Relief resource request + multi-stage approval/dispatch/receipt lifecycle | `incident_id`, `resource_id`, `quantity_requested/allocated`, `status`, `approved_by`, `deployed_from_warehouse`, bidding cols | V22 |
| `approval_histories` | public | Audit of approve/reject actions on allocations | `allocation_id`, `action`(approved/rejected), `user_id`, `remarks` | V22 (V23) |
| `damage_assessments` | public | Initial/Detailed/Final damage assessment per incident | `incident_id`, `assessment_type`, `damage_level`, `estimated_loss`, `status` | V22 |
| `resources` / `inventory_items` | public | Resource catalogue + warehouse stock lines | `resources(name,category)`; `inventory_items(resource_id, warehouse_id, quantity, expiry_date)` | V10 |
| `agency_resources` | public | Physical agency-held stock (area-scoped) | `agency_id`, `resource_id`, `quantity`, `condition_status`, `latitude/longitude`, `region_id`, `district_id` | V25 (V94) |
| `warehouses` | public | Permanent warehouses (area-scoped) | `id`, capacity/loan cols (V62), `region_id`, `district_id` | V7 |
| `warnings` / `warning_hazards` | public | Normalised legacy EW model | `warning_code`, `status`, `is_approved`; hazard: `warning_level`, `validity_start/end`, `region_id/district_id`, lat/lng | V3 |
| `early_warnings` | public | Flat public-portal map projection | `warning_code`, `hazard_type`, `severity_level`, `affected_regions`, `affected_districts`, `show_on_map` | V21 (V88) |
| `ew_generated_products` | public | Generated/EOCC bulletin PDFs + publish state | `bulletin_type`, `warning_code`, `severity`, `regions`(json), `pdf_path`, `is_published`, `show_on_map` | V48 (V86/V87) |
| `ew_agency_submissions` | public | Cross-agency EW submission bus (one latest per agency) | `agency`, `payload`(json), `top_alert`, `is_latest`, `warning_code`, `revision`, `is_update` | V49 (V50/V90) |
| `scanner_detections` | public | OSINT/scanner detections (idempotent) | `dedup_key`(unique), `hazard_type`, `severity`, `region/district`, `status`, `incident_id` | V90 |
| `stakeholders` | public | Partner/stakeholder registry (area + country scoped) | `name`, `type`, `sector`, `region`/`district`(text), `country`, `region_id`/`district_id`, `is_verified` | V15 (V81/V94) |
| `agencies` | public | Government/partner agencies (incl. the 6 EW agencies) | `name`, `acronym`, `agency_type`, contact cols | V31 |
| `oh_events` | public | One Health event report (central table of 18 oh_* tables) | `event_id`, `event_type`, `status`, `region_id`/`district_id`, `priority_level`, `source_warning_id` | V15 |
| `resource_notifications` | public | Unified per-user in-app notification feed | `user_id`, `type`, `is_read`, `link`, `entity_type`, `entity_id`, `severity` | V24 (V64) |
| `sms_logs` / `email_logs` | public | Per-channel delivery audit | `recipient_phone`/`recipient_email`, `status`, `sent_at`, `delivered_at`, `retry_count` | V47/V64 |
| `alert_subscriptions` | public | Citizen alert subscriptions (hazards/area/channel) | `subscription_id`, `phone_number`, `hazards_of_interest`, `location_of_interest`, `is_active`, `unsubscribed_at`, `unsubscribe_reason` | V18 |
| `portal_settings` / `portal_news` / `early_warnings` | public | Public-portal content + map data | `portal_settings(group,key,value)`; `portal_news(slug,body)` | V21 |

### 4.8 Key Data-Layer API Endpoints

These are the endpoints that read/write the core data structures above. Full path includes the `/api` context-path. `@PreAuthorize` shows the gate (`Authz.*` constants resolve to role expressions; `isAuthenticated()` is any logged-in user).

| Method | Path | Gate | Purpose |
|---|---|---|---|
| GET | `/api/v1/settings/locations` | `isAuthenticated()` | List regions for Location Management (`LocationController`). |
| GET | `/api/v1/settings/locations/regions/{regionId}/districts` | `isAuthenticated()` | Districts cascade. |
| GET | `/api/v1/settings/locations/districts/{districtId}/wards` | `isAuthenticated()` | Wards cascade. |
| POST/PUT/DELETE | `/api/v1/settings/locations/regions\|districts\|wards` | `CAN_WRITE` | Maintain the admin hierarchy. |
| GET | `/api/v1/response/incidents` | (read, controller-level) | List/filter incidents for the response dashboard (`IncidentController`). |
| POST | `/api/v1/response/incidents` | `Authz.RESPONSE_OPERATE` | Create an incident (multipart). |
| POST | `/api/v1/response/incidents/{id}/submit\|approve\|forward\|rollback\|close` | `Authz.RESPONSE_OPERATE` | Drive the Draft→DAS→RAS→National workflow state machine. |
| POST | `/api/v1/response/incidents/{id}/push-map` / `push-news` | `Authz.RESPONSE_OPERATE` | Surface an incident to the public portal (`incidents.show_on_portal_map`, `portal_news_id`). |
| POST | `/api/v1/ew/agency/{agency}/submission` | `Authz.EW_REPORT` | An EW agency submits its bulletin to the cross-agency bus (`ew_agency_submissions`). |
| POST | `/api/v1/ew/agency/{agency}/update` | `Authz.EW_REPORT` | Post a revision/update under an issued warning code. |
| GET | `/api/v1/ew/agency/{agency}/latest` | `isAuthenticated()` | Read another agency's current latest submission (interlinking). |
| GET | `/api/v1/ew/dmd/consolidated` | `isAuthenticated()` | PMO-DMD consolidated view across all agencies. |
| POST | `/api/v1/ew/products` | `Authz.EW_INGEST` | Store a generated bulletin product (`ew_generated_products`). |
| POST | `/api/v1/ew/products/upload` | `Authz.PREPAREDNESS_MANAGE` | Manual EOCC bulletin PDF upload (contingency path). |
| PATCH | `/api/v1/ew/products/{id}/publish` | `Authz.PREPAREDNESS_MANAGE` | Mark a bulletin published / on-map. |
| GET/POST/PUT | `/api/v1/stakeholders` | read `isAuthenticated()`; write `Authz.STAKEHOLDER_ADMIN` | Stakeholder registry CRUD (`StakeholderAdminController`). |
| PUT | `/api/v1/stakeholders/{id}/verify` | `Authz.STAKEHOLDER_VERIFY` | Verify a stakeholder. |
| PUT | `/api/v1/stakeholders/{id}/link-user` | `Authz.STAKEHOLDER_ADMIN` | Bind a login to a stakeholder (`users.stakeholder_id`, V95). |
| GET | `/api/v1/notifications` / `/unread-count` | (read) | The per-user bell feed (`resource_notifications`). |
| POST | `/api/v1/notifications/preferences` | `Authz.AUTHENTICATED` | Set per-user channel prefs (`users.notify_*`). |
| GET/POST/PUT | `/api/v1/alert-subscriptions` | read `isAuthenticated()`; write `Authz.PREPAREDNESS_MANAGE` | Citizen alert subscription management. |
| POST | `/api/v1/onehealth/events` | `Authz.OH_REPORT_EVENT` | Submit a One Health event (`oh_events`). |
| POST | `/api/v1/onehealth/events/{id}/review` | `Authz.OH_APPROVE` | Review/advance an OH event workflow. |
| GET / POST | `/api/v1/content/sms-logs` / `/send` | read (controller); send `Authz.COMMS_DISSEMINATE` | SMS audit log + send (Communication Center). |

### 4.9 Known Data Pitfalls & Constraints

These are recurring, code-confirmed failure modes in this codebase (carried from the project's accumulated-experience notes); they are design constraints every data change must respect:

1. **`count(*)+1` code generation collides after a gap.** Business codes (event codes, `subscription_id`, warehouse codes) were minted with `count(*)+1`. Fix pattern: `MAX(numeric suffix)+1` filtered to the prefix, or a DB sequence. **V80** added the missing `UNIQUE` constraints (`temporary_warehouses.code`, `evacuation_centers.ecentre_id`, `alert_subscriptions.subscription_id`) so any residual race is a clean 409, not two rows sharing a code.
2. **Seeded ids without bumping the sequence.** `LocalDataSeeder` inserts explicit `users`/`roles`/`regions` ids without `setval`, which later collides with `BIGSERIAL`. V93/V71 deliberately compute `max(id)+1` to coexist.
3. **New columns silently dropped (accept-and-discard).** With `ddl-auto: validate`, a column added in a migration that is *not* wired into the JPA entity, service INSERT/UPDATE, and frontend form returns 200 but loses the data. Adding a column means wiring it through every layer.
4. **Status-gated visibility traps.** Rows created with a default status (e.g. `Open`/`Draft`) can be invisible to analytics that count only `Validated`/`Archived`. Seed important data in the visible state or document the gap.
5. **Dual representations diverge.** EW has both `warnings/warning_hazards` (normalised) and `early_warnings` (flat portal projection); writers must keep the public projection in sync (the motivation for V88's `affected_districts`).
6. **Unindexed FKs / dashboard filters.** Before **V72**, 103 declared FK columns had no leading index and the incident dashboard filtered/sorted on unindexed `status`/`reported_at`; V72 added them all (non-`CONCURRENTLY`, since Flyway runs in a transaction — a DBA may prefer out-of-band `CONCURRENTLY` on large production tables).

**Outstanding constraints / TODOs:**

- **Permission enforcement is role-based, not permission-based.** `permissions`/`role_has_permissions` (V44) document and govern the access matrix but the backend authorises by `hasAnyRole`; per-permission enforcement is future work.
- **Translations are not yet the live source.** `translations` (V46) is the managed EN/SW registry, but the live public i18n still renders from the code-based `PortalLabels` service; a hydrating loader is pending (V46 header is explicit about this "honest scope").
- **Area scoping is opt-in via NULL.** V92/V94/V95 columns are nullable with NULL = national; until rows are assigned an area/institution, scoping does not constrain visibility. Backfill is partial (V94 stakeholders by name match; V95 the six agency focals by acronym).
- **Identity path.** The platform mints/validates its own HS256 token (`dmis.auth.jwt`); the documented Keycloak `issuer-uri` is overridden by the `JwtDecoder` bean in `JwtSecurityConfig` and is not contacted unless that bean is removed.

---

## 05. Notification & Communication Backbone

> **Purpose (executive summary).** Every outbound message the e-MAAFA platform produces — an in-app bell alert, an SMS to a field officer, an email to a partner agency, or a public broadcast — flows through a single, auditable backbone. One dispatcher decides who receives a notice and on which channels (honouring each user's own preferences), a dedicated off-thread sender talks to the national M-Gov SMS gateway and Gmail SMTP, and a Communication Center provides operators with one cross-channel delivery log and a compose surface. This design replaces the scattered notification logic of the legacy Laravel app with one funnel, so delivery is consistent, traceable, and never blocks the business request that triggered it.

This section documents the backbone as built in `tz.go.pmo.dmis.notification` (dispatcher, delivery, mail, audience, overview, diagnostics) and the Communication-Center compose/log controllers in `tz.go.pmo.dmis.content`. The SMS gateway client itself lives in `tz.go.pmo.dmis.ew` (`MgovSmsService`, `SmsAuditLogger`) because it predates the backbone as the proven Early-Warning delivery path; the backbone reuses it rather than duplicating it.

### 5.1 Responsibilities

- **Single dispatch funnel.** All flows (incident, alert, early warning, CP/AAP activation, dispatch to response teams, content publication, approvals, training) call one service, `NotificationService`, instead of each writing feed rows or calling gateways directly.
- **Per-user channel routing.** Each notice records which channels it is *eligible* for; the final gate is the recipient's own preference (`notify_in_app` / `notify_email` / `notify_sms`).
- **Off-request external delivery.** SMS and email are sent on a bounded background pool so a flow that notifies many users returns immediately.
- **Full delivery audit.** Every SMS lands in `sms_logs` and every email in `email_logs`; every in-app notice lands in `resource_notifications`. The Communication Center rolls these three up into one cross-channel view.
- **Operator compose + diagnostics.** Comms operators can send ad-hoc SMS/email to a parsed list or a resolved audience group; ICT can fire a real test message down each channel to commission the gateways.

### 5.2 Key components

| Component | File | Role |
|---|---|---|
| `NotificationService` | `backend/.../notification/NotificationService.java` | The ONE dispatcher. `notifyUser` / `notifyUsers` / `notifyRoles` / `notifyAllUsers`, the `Notice` record, per-user channel gating, in-app feed insert. |
| `ExternalDeliveryService` | `backend/.../notification/ExternalDeliveryService.java` | `@Async("notificationExecutor")` SMS+email delivery. Separate bean so the async proxy actually applies. Also `deliverAlert` and `deliverOhDissemination` (post-commit status reconciliation). |
| `MgovSmsService` | `backend/.../ew/MgovSmsService.java` | M-Gov gateway client: builds the payload, signs HMAC-SHA256(base64) into the `hash` header with `sysId`, POSTs. `formatPhone` → `255XXXXXXXXX`. Single audit sink for SMS. |
| `SmsAuditLogger` | `backend/.../ew/SmsAuditLogger.java` | Writes `sms_logs` rows in a **separate transaction** (`REQUIRES_NEW`) so an audit-write failure can never abort the caller. |
| `MailService` | `backend/.../notification/MailService.java` | Gmail SMTP via `JavaMailSender`. `sendBulk` (pre-wrapped HTML), `sendComposed` (wraps plain text + attachments), `wrap` (branded shell), `email_logs` audit. |
| `AudienceService` | `backend/.../notification/AudienceService.java` | Resolves a Communication-Center audience selection (subscribers / hazard / stakeholders / EW leaders / role / all / area) into deduplicated phone + email lists; area targeting uses the `AreaLookup` FK match. |
| `AreaLookup` | `backend/.../common/security/AreaLookup.java` | Resolves region/district NAMES → `regions`/`districts` ids so area targeting matches the same FK columns that govern jurisdiction scoping. |
| `NotificationController` | `backend/.../notification/NotificationController.java` | The signed-in user's bell feed + self-service channel preferences. |
| `CommunicationOverviewController` | `backend/.../notification/CommunicationOverviewController.java` | Cross-channel rollup (counts, success rate, by-channel/type/corner, recent activity) + audience/hazard/role pickers. |
| `ChannelTestController` | `backend/.../notification/ChannelTestController.java` | Admin diagnostics: send a real test SMS / email per channel. |
| `SmsLogController` | `backend/.../content/SmsLogController.java` | SMS Management: `sms_logs` delivery log + compose-and-send. |
| `EmailLogController` | `backend/.../content/EmailLogController.java` | Email Management: `email_logs` delivery log + compose-and-send (with attachments). |
| `Recipients` | `backend/.../content/Recipients.java` | Parses a compose-box recipients field (JSON list, or comma/semicolon/newline-separated string). |
| `AsyncConfig` | `backend/.../notification/AsyncConfig.java` | `@EnableAsync` + the bounded `notificationExecutor` pool (core 2, max 6, queue 200). |

### 5.3 Dispatch model — the `Notice` and channel gating

`NotificationService.Notice` is an immutable record carrying `type`, `title`, `message`, `link`, `entityType`, `entityId`, `severity`, and two channel-eligibility flags `sms`/`email`. Factory helpers express intent:

- `Notice.inApp(...)` — bell only.
- `Notice.all(...)` — eligible for in-app + SMS + email.
- `.withChannels(sms, email)` — fine-tune eligibility.

Recipient selectors all funnel into one private `dispatch(...)`:

- `notifyUser(userId, n)` / `notifyUsers(ids, n)` — explicit users.
- `notifyRoles(roleNames, n)` — every user holding a Spatie role (`model_has_roles` ⋈ `roles`).
- `notifyAllUsers(n)` — broad broadcast (`where 1=1`).

`dispatch` reads `id, name, email, phone, notify_in_app, notify_email, notify_sms` for the resolved users and applies the two-stage rule: **a notice is eligible for a channel AND the user has opted in**. In-app is always eligible and defaults ON; a feed row is inserted per opted-in user (`channel = 'database'`). SMS requires `n.sms() && notify_sms` AND a non-blank phone; email requires `n.email() && notify_email` AND an `@`-bearing address. The collected phone/email lists are handed to `external.deliver(...)`; the request thread returns without waiting on any gateway.

**Defaults (set in V64):** in-app ON, email ON (free Gmail SMTP), SMS **OFF** (metered M-Gov credits) — SMS is enabled per-user for response teams / focal points who need field alerts.

### 5.4 External delivery (off-thread)

`ExternalDeliveryService.deliver(Notice, phones, emails)` runs on `@Async("notificationExecutor")`. For SMS it composes `title[: message]` and calls `MgovSmsService.sendBulk(..., type, entityId)`; for email it builds the branded HTML via `MailService.wrap(title, message + link)` and calls `MailService.sendBulk(...)`. Each channel is wrapped in its own try/catch so one failing channel cannot break the other, and any failure is logged rather than thrown (nothing is waiting on the result).

Two specialised async methods reconcile status **after** the caller's transaction commits, so no gateway I/O is ever held inside a transaction and a rolled-back transaction can never discard a sent message:

- `deliverAlert(alertId, ...)` — sends the Communication-Center alert bulk, then flips the `alert_recipients` rows that the (non-transactional) `sendAlert` left `pending` to the gateway outcome (`sent` / `failed` / `pending` when not configured).
- `deliverOhDissemination(dissId, ...)` — sends a One Health dissemination, flips the `pending` `oh_dissemination_logs` rows, and writes the true `sms_sent_count` / `email_sent_count` on `oh_disseminations`.

### 5.5 SMS gateway (`MgovSmsService` + `SmsAuditLogger`)

`MgovSmsService` is a faithful port of the Laravel `BulkSmsService`. It formats each number (`0?[67]XXXXXXXX` → `255XXXXXXXXX`, or accepts an already-`255` / generic 10–15 digit number), builds the `{recipients, message, datetime, mobileServiceId, senderId, messageId}` payload, signs it `HMAC-SHA256` (base64) into the `hash` header alongside the `sysId` header, and POSTs to the M-Gov URL. Configuration comes from env via `dmis.mgov.*` (`url`, `api-key`, `system-id`, `mobile-service-id`, `sender-id` default `15200`); a blank api-key/system-id means **not configured** ⇒ no send attempt and a `pending` audit row.

The **tracked** overload `sendBulk(recipients, message, notificationType, notificationId)` is the single SMS audit sink: after the transmit it calls `SmsAuditLogger.record(...)`, which writes one `sms_logs` row per recipient (valid numbers at the real outcome, invalid numbers as a `failed` row with "Invalid phone number"). Because `SmsAuditLogger.record` is annotated `@Transactional(propagation = REQUIRES_NEW)`, an audit-write failure cannot poison a transactional caller (e.g. the public unsubscribe flow); audit exceptions are additionally swallowed in `MgovSmsService`, upholding the "logging never breaks a send" guarantee. The recipient is clipped to 20 chars to fit `sms_logs.recipient_phone varchar(20)`.

### 5.6 Email gateway (`MailService`)

Gmail SMTP through Spring's `JavaMailSender`, credentials from `spring.mail.*` (`MAIL_USERNAME` / `MAIL_PASSWORD`); a blank username ⇒ not configured ⇒ no send, recipients recorded as `pending` so the audit shows what *would* have gone out. Each recipient gets a **separate** message (no leaked address list). Two send paths:

- `sendBulk(...)` — callers pass pre-wrapped HTML (used by `ExternalDeliveryService`, alerts, OH).
- `sendComposed(recipients, subject, plainMessage, attachments, sentBy)` — Communication-Center compose: wraps the plain message in the branded HTML shell, supports `Attachment(filename, contentType, byte[])` via `MimeMessageHelper` multipart, and logs the **plain** message to `email_logs` (so the log is readable text, never the raw HTML wrapper).

`wrap(title, body)` produces the branded e-MAAFA shell (PMO/DMD footer, `\n`→`<br>`). `logEmail` truncates the subject to 255 chars so a long subject cannot abort the audit write for a mail that actually went out.

### 5.7 Audience resolution (`AudienceService`)

`resolve(type, hazard, role)` returns a deduplicated `Audience(phones, emails)` pulled live from existing system data:

| `type` | Source |
|---|---|
| `all_subscribers` | `alert_subscriptions` where `is_active` |
| `subscribers_by_hazard` | `alert_subscriptions` whose `hazards_of_interest::jsonb @> ["<hazard>"]` |
| `stakeholders` | `stakeholders` (primary + contact-person phone/email) where active |
| `ew_leaders` | active government-type `stakeholders` |
| `all_users` | `users` |
| `role` | `users ⋈ model_has_roles ⋈ roles` for the named role |

**Area (location) targeting** for EW-style bulletins is handled by `resolveAreas(areaNames)` and `resolveAreaCoordinators(areaNames)`. Affected areas arrive as administrative **names**; for stakeholders these are matched on the `region_id`/`district_id` FK resolved from the name via `AreaLookup` (the same columns jurisdiction scoping uses), with the legacy `region`/`district` text kept as a fallback for un-backfilled rows. Subscribers stay name-based (`alert_subscriptions` has no area FK — only `location_of_interest` JSON / `subscriber_location` text). `coordinatorUserIds(...)` matches `users.region_id`/`district_id` against the affected areas for the `AREA_COORDINATOR_ROLES` set (RAS, Reg DC, RC, DAS, Dist DC, DED); it degrades to an empty set (never an error) when the columns are absent/unseeded. The picker helpers `audiences()`, `hazards()`, `roles()` return live reachable counts for the compose form.

### 5.8 Data design

The backbone owns three log/feed tables plus four columns on `users`. Migrations are additive (`IF NOT EXISTS`), Flyway-managed.

**`resource_notifications`** — the unified per-user in-app feed. Created by **V24** (originally the resource-approval feed) and **generalised by V64** into the single feed for all notification types.

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial PK | |
| `user_id` | bigint NOT NULL | recipient |
| `allocated_resource_id` | bigint FK | legacy (nullable) |
| `type` | varchar(255) NOT NULL | notice type |
| `title` / `message` | varchar(255) / text | |
| `channel` | varchar(255) default `'database'` | always `database` for feed rows |
| `is_read` / `read_at` | boolean / timestamptz | |
| `link` | varchar(255) | **V64** — deep link the bell opens |
| `entity_type` | varchar(64) | **V64** — source record type |
| `entity_id` | bigint | **V64** — source record id |
| `severity` | varchar(20) | **V64** — info/success/warning/critical |
| `created_at` / `updated_at` | timestamptz | |

Indexes: `rn_user_read_index (user_id, is_read)` (V24), `rn_user_created_index (user_id, created_at desc)` (V64).

**`sms_logs`** — SMS delivery audit. Created by **V47**.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint identity PK | |
| `notification_type` | varchar(40) | corner/type tag (e.g. `manual`, `alert`, `oh_dissemination`) |
| `notification_id` | bigint | optional entity id |
| `recipient_phone` | varchar(20) NOT NULL | clipped at send |
| `message` | text NOT NULL | |
| `status` | varchar(20) | CHECK `pending`/`sent`/`failed`/`delivered` |
| `response_data` / `external_id` / `error_message` | text / varchar(120) / text | gateway response, message id, error |
| `sent_at` / `delivered_at` | timestamptz | |
| `retry_count` | integer default 0 | |
| `created_at` / `updated_at` | timestamptz | |

Index: `idx_sms_status_created (status, created_at)`.

**`email_logs`** — email delivery audit (mirror of `sms_logs`). Created by **V64**.

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial PK | |
| `notification_type` | varchar(60) | |
| `notification_id` | bigint | |
| `recipient_email` | varchar(255) NOT NULL | |
| `recipient_name` | varchar(255) | |
| `subject` | varchar(255) | truncated by `logEmail` |
| `message` | text | plain text (not the HTML wrapper) |
| `status` | varchar(20) | CHECK `pending`/`sent`/`failed`/`delivered` |
| `response_data` / `error_message` | text | |
| `sent_at` / `delivered_at` | timestamptz | |
| `retry_count` | integer default 0 | |
| `sent_by` | bigint | acting user (compose) |
| `created_at` / `updated_at` | timestamptz | |

Indexes: `idx_email_status_created (status, created_at)`, `idx_email_recipient (recipient_email)`.

**`users` channel columns** — added by **V64**: `phone varchar(30)`, `notify_in_app boolean default true`, `notify_email boolean default true`, `notify_sms boolean default false`. **V92** added `users.region_id`/`district_id` (the columns `coordinatorUserIds` matches on). **V94** added `region_id`/`district_id` to `stakeholders` (and warehouses/agency_resources), the FK columns area-targeting uses.

### 5.9 Key API endpoints

All paths are prefixed with the `/api` context path. `Authz.AUTHENTICATED` = `isAuthenticated()`. `COMMS_DISSEMINATE` = SUPER_ADMIN, ICT_ADMIN, COMMS_OFFICER, EOCC, DIRECTOR, ASST_DIRECTOR, MDA_FOCAL, RAS, REG_DC, DAS, DIST_DC. `CHANNEL_TEST_WRITE` = SUPER_ADMIN, ICT_ADMIN, COMMS_OFFICER.

| Method | Path | Gate | Purpose |
|---|---|---|---|
| GET | `/api/v1/notifications` | (authenticated session) | Bell feed: recent notices + unread count for the current user. |
| GET | `/api/v1/notifications/unread-count` | (authenticated session) | Lightweight unread-badge poll. |
| POST | `/api/v1/notifications/{id}/read` | `AUTHENTICATED` | Mark one notice read (scoped to current user). |
| POST | `/api/v1/notifications/read-all` | `AUTHENTICATED` | Mark all current-user notices read. |
| GET | `/api/v1/notifications/preferences` | (authenticated session) | The current user's contact + channel preferences. |
| POST | `/api/v1/notifications/preferences` | `AUTHENTICATED` | Save own in-app/email/SMS toggles + phone. |
| POST | `/api/v1/notifications/test/sms` | `CHANNEL_TEST_WRITE` | Send a real diagnostic SMS to one number. |
| POST | `/api/v1/notifications/test/email` | `CHANNEL_TEST_WRITE` | Send a real diagnostic email to one address. |
| GET | `/api/v1/communication/audiences` | (authenticated session) | Audience group counts + hazard & role sub-pickers for the compose form. |
| GET | `/api/v1/communication/overview` | (authenticated session) | Cross-channel rollup: counts, success rate, by-channel/type/corner, recent activity (`?range=today\|week\|month\|all`). |
| GET | `/api/v1/content/sms-logs` | (authenticated session) | SMS delivery log + stats + by-type + `configured` flag (filters: status/search/from/to). |
| POST | `/api/v1/content/sms-logs/send` | `COMMS_DISSEMINATE` | Compose & send SMS to a parsed list and/or a resolved audience. |
| GET | `/api/v1/content/email-logs` | (authenticated session) | Email delivery log + stats + by-type + `configured` flag. |
| POST | `/api/v1/content/email-logs/send` | `COMMS_DISSEMINATE` | Compose & send email (with optional base64 attachments) to a list and/or audience. |

> Endpoints without a method-level `@PreAuthorize` rely on the platform security baseline (Keycloak/JWT, or the local-profile persona filter) to require an authenticated session; the read/feed and own-preference reads are deliberately not role-gated. Write/dissemination/diagnostic endpoints carry explicit `@PreAuthorize` gates.

### 5.10 Design decisions and rationale

- **One dispatcher, not per-flow notification code.** Every flow calls `NotificationService`, so channel gating, feed-row shape, and audit are defined once. This is the central correction of the legacy Laravel sprawl.
- **External delivery in its own bean.** `@Async` is proxy-based; a self-invocation inside `NotificationService` would run synchronously. Splitting `ExternalDeliveryService` out guarantees the async hop actually happens.
- **Audit in a `REQUIRES_NEW` transaction.** `SmsAuditLogger` isolates the audit write so it cannot poison a transactional caller, and audit exceptions are swallowed — "logging never breaks a send."
- **Status reconciliation after commit.** `deliverAlert` / `deliverOhDissemination` flip `pending` rows to the gateway outcome only after the originating transaction commits, so no HTTP/SMTP I/O is held in a transaction and a rollback can never discard a message that actually went out.
- **Separate message per recipient.** Both SMS and email send per-recipient, avoiding leaked address lists and giving one audit row per recipient.
- **"Not configured" ⇒ pending, not silent drop.** Both gateways record a `pending` audit row when credentials are absent, so operators can see what would have been sent once the gateway is commissioned.
- **SMS default OFF.** M-Gov credits are metered; SMS is opt-in per user, while in-app and (free) email default ON.
- **Area targeting on FK, not text.** `AudienceService` resolves area names to `region_id`/`district_id` via `AreaLookup`, matching the same columns jurisdiction scoping uses, with text fallback for un-backfilled rows — so "who gets alerted for an area" and "who can see an area" stay consistent.
- **Parameterised log queries; range as a fixed enum.** All log filters bind parameters; the overview `range` is resolved through a fixed `switch` (`since`/`sinceCol`), never interpolating user text into SQL.

### 5.11 Integration points

The dispatcher is consumed across the modular monolith (callers of `NotificationService` / the `notify*` methods):

- **Early Warning** (`ew`): `EwBulletinIngestController`, `EwProductController`, `EwWarningLifecycleController`, `scanner.ScannerController` — publish/lifecycle notices; the EW module also owns `MgovSmsService`/`SmsAuditLogger` that the whole backbone reuses.
- **Response** (`response`): `ApprovalWorkflowEngine`, `CommunicationController`, `DispatchController`, `StakeholderBiddingController`, `TaskController` — approvals, alert dissemination (`alert_recipients`), dispatch, bidding, task assignment.
- **Preparedness** (`preparedness`): `TrainingPlanService` — training plan workflow notices.
- **Stakeholder** (`stakeholder`): `StakeholderAdminController`.
- **One Health**: dissemination delivery + status reconciliation via `deliverOhDissemination` over `oh_disseminations` / `oh_dissemination_logs`.
- **Communication Center frontend**: the SMS/Email Management screens, the compose surface, the overview dashboard, and the bell all consume the endpoints in §5.9. The overview's `by_corner` mapping classifies `notification_type` prefixes (`oh_`, `ew_`, `alert`, `warehouse`, `stakeholder`, `task`/`approval`/`dispatch`, `training`, `manual`, diagnostics) back to their originating module.

### 5.12 Known gaps, constraints, and TODOs

- **No delivery receipts (DLR).** Status is the gateway's accept/reject at send time (`sent`/`failed`/`pending`); there is no inbound webhook moving rows to `delivered`. The `delivered` status and `delivered_at` columns exist but are not populated by an automated path, and `retry_count` is not yet driven by a retry job.
- **Role/area SMS requires seeded `users.phone`.** A user with `notify_sms` ON but no phone is silently skipped for SMS (still gets in-app/email). Role and coordinator audiences only reach users whose phone is on record.
- **Area-coordinator targeting needs seeding.** `resolveAreaCoordinators` / `coordinatorUserIds` depend on `users.region_id`/`district_id` (V92) being populated per user; until seeded they resolve to an empty set (by design, never an error).
- **Gateways are credential-gated.** With `dmis.mgov.*` or `MAIL_USERNAME`/`MAIL_PASSWORD` unset, sends are recorded `pending` and nothing leaves the platform — expected in dev, must be commissioned for production (diagnostics in §5.9 verify this).
- **Subscribers are name-matched.** `alert_subscriptions` has no area FK, so subscriber area targeting still relies on JSON/text location matching, unlike the FK-matched stakeholders.
- **Attachment cap.** Compose-email attachments are capped at 10 MB each and silently skipped if base64 fails to decode (the send still proceeds).
- **No quiet-hours / digest / dedup.** Notices are dispatched immediately and individually; there is no batching, rate-limiting per user, or suppression window.

---

## 06. Preparedness & the Early Warning System

> **Purpose (executive summary).** This module is the operational heart of pre-disaster readiness in e-MAAFA. It runs the national Early Warning (EW) pipeline — the seven mandated warning entities author their bulletins, PMO-DMD consolidates them into one multi-hazard impact bulletin, the EOCC publishes it to the public portal map, and it is disseminated to the people in the affected areas — and it manages the supporting preparedness assets (warehouses, inventory, evacuation centres, training plans, contingency/anticipatory plans, alert subscriptions). The legacy Python/Streamlit EW workbench has been retired; the pipeline now runs natively on Spring Boot + Angular, with the unchanged Python *generate-engine* (port 8600) retained only to render the bulletin PDF.

---

### 06.1 Scope and responsibilities

The Preparedness module delivers two distinct but linked capabilities:

1. **The Early Warning System** — a multi-agency authoring, consolidation, publication, dissemination and monitoring pipeline for hazard warnings. This is the flagship subsystem and the bulk of this section.
2. **Preparedness asset management** — warehouses, temporary warehouses, relief inventory, evacuation centres, training plans, anticipatory/contingency plans and citizen alert subscriptions.

Both live under the frontend route prefix `/m/preparedness/...` and the backend Java packages `tz.go.pmo.dmis.ew` (+ `…ew.scanner`) and `tz.go.pmo.dmis.preparedness`. All backend paths below are shown with the `/api` context-path included; the Angular dev server proxies `/api`→`:8080`.

A key architectural fact established up front: the EW subsystem deliberately carries **two parallel data models** bridged by the `warning_code`:

* the normalised **authoring** model — `warnings` + `warning_hazards` (status `pending → approved → published`; level `Advisory / Warning / Major Warning`); and
* the flat **public/dispatch** model — `early_warnings` (severity `Watch / Warning / Emergency`; `show_on_map`).

**Publish is the bridge**: publishing an approved warning clones each `warning_hazard` row into an `early_warnings` row. This split is faithful to the legacy Laravel app and is preserved intentionally (see §06.9).

---

### 06.2 The retirement of the Streamlit engine

> The original EW workbench was a Python/Streamlit application (agency authoring forms, the impact-analysis map, OSINT scanner, dissemination/monitoring UI) launched via an SSO iframe. It was a recurring source of data-model drift, a non-race-safe `warning_code` allocator, four divergent dissemination paths and an inert scanner.

The Streamlit app has been **fully retired and re-platformed natively**. The SSO bridge classes (`EwBridgeController`, `SsoUserController`, `EwSsoService`), the iframe shell, the `/ew-engine`→`:8501` proxy and the Streamlit dashboard code were all removed. What remains of the Python side is **only** the *generate-engine* on port 8600 — a stateless PDF renderer the Angular consoles call (`POST /generate/<kind>`) to produce the official bulletin document. The engine renders, but no longer owns, the pipeline.

The native replacement is the **flow hub** at `/m/preparedness/early-warnings/engine` (`ew-engine.component.ts`), which presents the pipeline as a top-to-bottom timeline of four stages, each card routing to a native console:

| Stage | Console(s) |
|---|---|
| **Hazard Information** | The 7 entity consoles (author + push) |
| **Impact Analysis** | PMO-DMD Consolidated Impact (`dmd-consolidated`) |
| **Dissemination** | EOCC Bulletin (`generated-bulletins`) |
| **Monitoring (EOCC)** | EW Monitoring hub (`disaster-scanner`) |

---

### 06.3 The EW pipeline — data-flow diagram

```
                          ┌──────────────────────────────────────────────────────────────┐
                          │  ① HAZARD INFORMATION — the 7 warning entities author bulletins │
                          └──────────────────────────────────────────────────────────────┘
  TMA (ew-alert-map)   MoW (mow-flood)   GST · MoH · MoA · NEMC · MoLF (agency-event-console)
        │ map + delineation + hazard + level, then per console two actions:
        │   (a) Generate Warning ─► POST /api/ew-api/generate/<kind> (Python :8600) ─► PDF blob
        │                                                              └─► POST /api/v1/ew/products  (store, EW_INGEST)
        │   (b) Push to EOCC ─────► POST /api/v1/ew/agency/{agency}/submission  (EW_REPORT; per-agency write check)
        ▼
   public.ew_agency_submissions  (one is_latest row per agency; the cross-agency BUS)
        │  cross-entity visibility: GET /api/v1/ew/agency/latest  (ew-cross-agency-panel on every console)
        ▼
                          ┌──────────────────────────────────────────────────────────────┐
                          │  ② IMPACT ANALYSIS — PMO-DMD consolidation (dmd-consolidated)   │
                          └──────────────────────────────────────────────────────────────┘
   GET /api/v1/ew/dmd/consolidated   (TMA+MoW → hydromet tier choropleth; GST/MoH/MoA/NEMC/MoLF → overlay layer)
        │  operator narrows districts/tiers, draws delineations, generates the multirisk impact bulletin (PDF), previews
        │  confirmPush:
        │    (a) POST /api/ew/bulletins/ingest  (bulletin_type=dmd, EW_INGEST)
        │          └─► mints pending warnings (EW-YYYY-NNNNN) + warning_hazards per district/region/national
        │    (b) POST /api/v1/ew/products       (store the PDF: centroid + envelope.area_points per district + region fallback)
        ▼
   public.warnings (pending) + public.warning_hazards        public.ew_generated_products (bulletin_type='GENERATED')
        │
        ▼
                          ┌──────────────────────────────────────────────────────────────┐
                          │  ③ LIFECYCLE — EwWarningLifecycleController (EW_APPROVE)         │
                          └──────────────────────────────────────────────────────────────┘
   POST /api/v1/ew/warnings/{id}/approve  (pending → approved; maker-checker)
   POST /api/v1/ew/warnings/{id}/publish  (approved → published)
        │   └─► clones each warning_hazard ─► public.early_warnings (show_on_map=true, status='active')
        │   └─► fires One Health event (oh_events, source_warning_id)  [non-fatal]
        │   └─► in-app broadcast to all users (afterCommit)
        ▼
                          ┌──────────────────────────────────────────────────────────────┐
                          │  ④ EOCC BULLETIN + PUBLIC PORTAL (generated-bulletins)          │
                          └──────────────────────────────────────────────────────────────┘
   GET /api/v1/ew/products (list)   PATCH /api/v1/ew/products/{id}/publish {publications, map}
        │   map=true ─► show_on_map ─► PortalPublicService.landing() renders a BLINKING pulse marker
        │               per PMO-selected district (envelope.area_points), coloured by level + centroid PDF pin
        │   publications=true ─► disaster_risk_frameworks document_type='Bulletin'
        ▼
                          ┌──────────────────────────────────────────────────────────────┐
                          │  ⑤ DISSEMINATION → Communication Center                         │
                          └──────────────────────────────────────────────────────────────┘
   POST /api/v1/ew/products/{id}/disseminate  (COMMS_DISSEMINATE)
        │   areas = bulletin districts ∪ parent regions
        │   audiences: area (subscribers+stakeholders) · hazard (opt-in) · coordinators (RAS/Reg DC/DAS/Dist DC/RC/DED)
        │   ├─ SMS  (MgovSmsService.sendBulk → sms_logs,  notification_type='ew_dissemination')
        │   ├─ email + PDF (MailService.sendComposed → email_logs)
        │   └─ in-app (NotificationService.notifyUsers → coordinators)
        ▼
                          ┌──────────────────────────────────────────────────────────────┐
                          │  MONITORING (parallel) — scanner + reports + entity updates     │
                          └──────────────────────────────────────────────────────────────┘
   DisasterScannerService (USGS/GDACS/ReliefWeb/GDELT/news → public.scanner_detections, hourly sweep)
        │   POST /api/v1/ew/scanner/{id}/dispatch {as: 'entity'|'incident'|'dismiss'}
        │     entity  ─► scanner_entity_taskings + notify owning agency (verify & issue assessment)
        │     incident─► public.incidents (workflow_status='draft') → DAS→RAS→Director chain (Response module)
   POST /api/v1/ew/agency/{agency}/update  (entity revises an issued warning_code; supersedes is_latest)
   GET/POST /api/ew/monitoring/reports     (focal-point / DRRC field verification → ew_focal_point_reports)
```

---

### 06.4 Key components

| Component | File | Role |
|---|---|---|
| `EwAgencySubmissionController` | `ew/EwAgencySubmissionController.java` | Cross-agency integration **bus** — submit / update / read-latest / consolidate. Native re-platform of the Python file-bus. |
| `EwBulletinIngestController` | `ew/EwBulletinIngestController.java` | Ingests a TMA / PMO-DMD bulletin into the authoring model — mints a pending `warnings` row (`EW-YYYY-NNNNN`) + `warning_hazards`. |
| `EwProductController` | `ew/EwProductController.java` | Stores generated/manual bulletin PDFs (`ew_generated_products`), publishes them, and disseminates. The EOCC Bulletin backend. |
| `EwWarningLifecycleController` | `ew/EwWarningLifecycleController.java` | Approve → publish; clones to `early_warnings`; map toggle; manual bulletin upload; One Health kick. |
| `EwController` + `EwQueryService` | `ew/EwController.java`, `ew/EwQueryService.java` | Read-only warning registry + statistics for the EW index screen. |
| `EwBoundaryController` | `ew/EwBoundaryController.java` | Faithful port of the Laravel `/ew/*` dissemination + monitoring endpoints (stakeholder list, dual SMS, gateway test, focal-point reports). |
| `DisasterScannerService` + `ScannerController` | `ew/scanner/…` | OSINT scanner (fetch/classify/dedupe/persist) + the triage/dispatch API. |
| `MgovSmsService`, `SmsAuditLogger` | `ew/MgovSmsService.java`, `ew/SmsAuditLogger.java` | M-Gov SMS gateway client; self-logging audit (`REQUIRES_NEW`) into `sms_logs`. |
| EW entities | `ew/EwWarning.java`, `EwWarningHazard.java`, `EwHazard.java`, `EwRegion.java`, `EwDistrict.java` | JPA read-model entities over the existing EW tables. |
| Frontend EW consoles | `frontend/src/app/pages/preparedness/ew-agencies/*`, `ew-engine.component.ts`, `generated-bulletins.component.ts`, `disaster-scanner.component.ts` | The native flow hub, 7 entity consoles, PMO consolidation, EOCC bulletin, monitoring. |
| Preparedness CRUD | `preparedness/{Warehouse,TemporaryWarehouse,Inventory,EvacuationCenter,TrainingPlan,AlertSubscription}{Controller,Service,…}` | Asset registries (read + manage). |

---

### 06.5 The seven warning entities and the submission bus

The seven mandated entities (codes in parentheses) author through native consoles:

| Code | Entity | Console | Primary hazards |
|---|---|---|---|
| `tma` | Tanzania Meteorological Authority | `ew-alert-map.component.ts` | Heavy rain, large waves, strong wind, extreme temperature (722E-4) |
| `mow` | Ministry of Water | `mow-flood.component.ts` | Floods (basin/catchment) |
| `gst` | Geological Survey of Tanzania | `agency-event-console.component.ts` (`gst-geo`) | Earthquake, landslide, volcano |
| `moh` | Ministry of Health | `agency-event-console.component.ts` (`moh-health`) | Disease outbreaks |
| `moa` | Ministry of Agriculture | `agency-event-console.component.ts` (`moa-drought`) | Drought / food security |
| `nemc` | National Environment Management Council | `agency-event-console.component.ts` (`nemc-air`) | Air pollution |
| `mlf` | Ministry of Livestock & Fisheries | `mlf-livestock.component.ts` | Livestock disease, fisheries hazards |

Each console offers two actions: **Generate Warning** (call the Python engine for the PDF + store it) and **Push to EOCC** (submit to the bus). Every console embeds `ew-cross-agency-panel`, which calls `GET /api/v1/ew/agency/latest` so each entity sees what every other entity has submitted (MoW reads TMA rainfall, etc.).

**The bus** (`EwAgencySubmissionController`, base path `/api/v1/ew`) normalises the differing per-agency payload shapes (`days[]` for TMA/MoW; `events[]`/`outbreaks[]`/`assessments[]` for the rest) through a single `flatten()` into a common `Item` record (day, type, alertLevel, regions, districts, description). On submit it supersedes the agency's previous `is_latest` row and inserts the new one with denormalised `regions`/`districts`/`hazard_types`/`alert_summary`/`top_alert`.

**Per-agency write enforcement.** The two write paths (`submit`, `update`) call `assertAgencyWrite(agency)`, which compares `JurisdictionScope.currentAgencyCode()` (resolved from the real JWT subject) against the `{agency}` path segment:

* an agency-bound login may write **only** for its own code (a non-matching code → `AccessDeniedException` → 403);
* a `null` code (PMO / EOCC / national / admin) is the **PMO-tier override** and may act for any entity.

Cross-agency **reads** (`/agency/{a}/latest`, `/agency/latest`, `/dmd/consolidated`, history, updates) stay open by design — interlinking is the whole point. *Known gap:* `mlf` is not yet a row in `public.agencies`, so an MoLF login resolves `currentAgencyCode()=null` and falls through to the PMO override (cannot be tightened until the agencies backfill includes it).

**Consolidation** (`GET /dmd/consolidated`) overlays all latest submissions with the legacy "highest-alert-wins per district" merge, but splits the presentation: only `tma` + `mow` (the `HYDROMET` set) drive the alert-tier choropleth; `gst/moh/moa/nemc/mlf` are returned as a distinct hazard-overlay layer so an earthquake or outbreak is never conflated with the rain/flood tier scale. Regions are expanded to district granularity via the bundled `/ew/region_districts.json`.

---

### 06.6 PMO-DMD consolidation, ingestion and product storage

The PMO-DMD console (`dmd-consolidated.component.ts`) reads `/dmd/consolidated`, lets the operator narrow districts per tier and draw delineations, generates the multirisk impact bulletin PDF, previews it, then `confirmPush` performs two writes:

1. **Ingest** → `POST /api/ew/bulletins/ingest` (`EwBulletinIngestController`, gated `EW_INGEST`). With `bulletin_type=dmd` it parses `district_summaries[]` grouped by alert tier; with `bulletin_type=tma` it parses `days[].hazards[]`. For each resolvable district/region it inserts a `warning_hazard` and the parent `warning` is created with status `pending` and a fresh `warning_code` of the form **`EW-YYYY-NNNNN`** (`nextWarningCode()` reads `max(...)+1` for the year). Notable robustness:
   * **id-sequence self-heal** (`healSeq`) before insert — a recurring DMIS pattern where explicit-id seeding leaves `*_id_seq` stale and a plain insert collides on the PK;
   * **dedup** keyed on `created_by IS NOT DISTINCT FROM ?` within a 1-hour window (so a re-push by an unresolved user still dedupes rather than creating a duplicate pending warning);
   * a bulletin that resolves to **zero** recognizable hazards/districts throws and rolls back (no phantom "ingested" warning with nothing in it);
   * an in-app "bulletin received / pending approval" notice fires `afterCommit`.

2. **Store product** → `POST /api/v1/ew/products` (`EwProductController.store`, gated `EW_INGEST`). The PDF is validated by `%PDF-` magic bytes + minimum 1 KB, stored under `storage/public/ew-products/<uuid>.pdf`, and a `ew_generated_products` row records the `centroid_lat/lng`, the full `envelope` (per-district `area_points`), `regions`, severity and `warning_code`. If the client could not resolve a centroid, a **region-centroid fallback** (`/ew/region_centroids.json`, averaged over the affected districts' parent regions) guarantees a coordinate so the bulletin can never be permanently invisible on the public map. The row is inserted **before** the file is written, with `Files.deleteIfExists` on write failure, so a rollback never strands an orphan PDF.

The Python handoff (`POST /api/ew-api/generate/<kind>`) is engine-independent of these writes: TMA's `generate()` also pushes to the bus so the pipeline works even when the engine is unavailable.

---

### 06.7 Warning lifecycle, the public portal and One Health

`EwWarningLifecycleController` (base `/api/v1/ew/warnings`, class-gated `EW_APPROVE`) implements the maker-checker release of a public alert:

* **approve** (`POST /{id}/approve`) — `pending → approved` (status-guarded; only pending can be approved).
* **publish** (`POST /{id}/publish`) — `approved → published`, then **clones each `warning_hazard` into `early_warnings`** with `show_on_map=true`, `status='active'`. Warning levels map to public severity (`Advisory→Watch`, `Warning→Warning`, `Major Warning→Emergency`). Coordinates missing on the hazard are filled from the real region centroid (`region_centroids.json`) — an explicit improvement over the Laravel source, which defaulted null coordinates to Dar es Salaam. The district is carried through (`affected_districts`) so the portal colours the specific district rather than the whole region. Publish then fires an `afterCommit` in-app broadcast and a **One Health kick** (`createOhEventFromWarning` → `oh_events` row with `source_warning_id`, mapping hazard keywords to an OH area-of-concern; non-fatal try/catch).
* **map toggle** (`POST /{id}/map {show}`) — flips `early_warnings.show_on_map` for the warning's code; this is the portal "Add to map / Remove from map" control.
* **manual bulletin** (`POST /{id}/bulletin`) — the **Option-2 contingency** upload when the engine is not auto-generating: a hardened multipart PDF upload (magic-byte + 1 KB validation; approved/published business-state gate; description trimmed/stripped/capped at 1000 chars; one authoritative MANUAL product per `warning_code` with superseded files cleaned `afterCommit`).

On the **public portal**, `PortalPublicService.landing()` surfaces both `early_warnings` (blinking pulse marker at the region centroid) and published `ew_generated_products` (a **blinking pulse marker per PMO-selected district** from `envelope.area_points`, coloured by level, plus the centroid PDF pin). The bulletin `description` and `hazard_type` are joined by `warning_code` into the portal popup.

---

### 06.8 EOCC Bulletin, dissemination and monitoring

**EOCC Bulletin** (`generated-bulletins.component.ts`, route `…/eocc-bulletin`) is the dissemination registry over `ew_generated_products`:

* `GET /api/v1/ew/products` — list + stats;
* `POST /api/v1/ew/products/upload` — upload a standalone (MANUAL) bulletin not tied to a warning;
* `PATCH /api/v1/ew/products/{id}/publish {publications, map}` — publish to the portal map (`show_on_map`) and/or the public Publications library (`disaster_risk_frameworks`, `document_type='Bulletin'`, keyed `EOCC-BULLETIN-<id>`). Neither target selected = unpublish.

**Dissemination** (`POST /api/v1/ew/products/{id}/disseminate`, gated `COMMS_DISSEMINATE`) is the wire into the **Communication Center**. It computes affected areas = the bulletin's districts ∪ their parent regions, then resolves audiences via `AudienceService`:

* `area` — subscribers (matched on `location_of_interest`/`subscriber_location`) + stakeholders (matched on region/district FK, with legacy text fallback);
* `hazard` — `subscribers_by_hazard`;
* `coordinators` — area coordinators (`RAS / Reg DC / RC / DAS / Dist DC / DED`, matched on `users.region_id/district_id`).

SMS goes via `MgovSmsService.sendBulk(…, "ew_dissemination", null)`, email (with the bulletin PDF attached) via `MailService.sendComposed(...)`, and an in-app notice to coordinators via `NotificationService.notifyUsers`. **Every SMS/email is logged** to `sms_logs`/`email_logs`, so all sends appear in the Communication Center cross-channel dashboard. Manual extra recipients are accepted and routed by `@`.

The older `EwBoundaryController` (`/api/ew/disseminate`, gated `EW_DISSEMINATE`) is the faithful Laravel port that disseminates by **explicit stakeholder selection** with a dual public/leader SMS split; it coexists with the product-centric, area-resolved path above.

**Monitoring** (`disaster-scanner.component.ts`, route `…/scanner`) is a four-stream EOCC hub:

1. **Disaster Scanner** — `DisasterScannerService` fetches USGS (earthquakes near TZ), GDACS, ReliefWeb RSS, GDELT and Tanzania/Swahili news feeds; classifies hazard type by keyword, extracts the region, scores severity from casualty/affected counts, ranks source reliability, and content-hash-dedupes into `public.scanner_detections`. It runs an automatic sweep 60 s after startup then hourly (`@Scheduled`). `POST /api/v1/ew/scanner/{id}/dispatch {as}` routes a detection to **entity** (creates a `scanner_entity_taskings` row + notifies the owning agency via `HAZARD_TO_AGENCY`, incl. El Niño→`moa`) or **incident** (inserts a draft `public.incidents` row, `workflow_status='draft'`, that rides the Response DAS→RAS→Director chain) or **dismiss**.
2. **Regional & Sectorial** — `POST /api/v1/ew/scanner/report` files a field report as a detection (`reliability='official'`) so it rides the same triage.
3. **EW Entities Update** — `POST /api/v1/ew/agency/{agency}/update?warningCode=` lets an entity revise an already-issued warning; it supersedes `is_latest` and stamps `is_update`/`warning_code`/`revision`. `GET /api/v1/ew/agency/updates` reads them.
4. **Focal/DRRC Verification** — `GET/POST /api/ew/monitoring/reports` → `public.ew_focal_point_reports`.

---

### 06.9 Data design

#### EW authoring + public model (pre-existing tables, read-modelled in V3 / V21)

| Table | Created by | Key columns | Notes |
|---|---|---|---|
| `warnings` | `V3__ew_read_model.sql` (+ `V51` adds `created_by/updated_by/attachments`) | `warning_code`, `status`, `is_approved`, `approved_at`, `deleted_at` | Authoring header; `EW-YYYY-NNNNN`. |
| `warning_hazards` | `V3__ew_read_model.sql` | `warning_id`, `hazard_id`, `warning_level`, `likelihood_of_occurrence`, `validity_start/end`, `region_id`, `district_id`, `latitude`, `longitude`, `technical_description` | One row per hazard×area. |
| `hazards`, `regions`, `districts` | `V3__ew_read_model.sql` | masters | Resolution targets for ingest. |
| `early_warnings` | `V21__public_portal_read_models.sql` (+ `V88` adds `affected_districts`) | `warning_code`, `hazard_type`, `severity_level`, `alert_message`, `affected_regions`, `affected_districts`, `latitude/longitude`, `show_on_map`, `status` | Flat **public/portal** model; written by `publish()`. |

#### EW native tables

| Table | Created by | Key columns | Purpose |
|---|---|---|---|
| `ew_agency_submissions` | `V49__ew_agency_submissions.sql` (+ `V50` one-latest index; `V90` adds `warning_code`, `parent_submission_id`, `revision`, `is_update`) | `agency`, `is_latest`, `payload` (json), `regions/districts/hazard_types/alert_summary` (json), `top_alert`, `item_count`, `submitted_by`, `bridge_ts` | The cross-agency bus; one `is_latest` row per agency (`ux_ew_sub_one_latest` partial unique index prevents concurrent double-latest). |
| `ew_generated_products` | `V48__ew_generated_products.sql` (+ `V86` `description`; `V87` `is_published`/`published_at`/`published_by`/`show_on_map`) | `bulletin_type` (`722E_4`/`GENERATED`/`MANUAL`), `warning_code`, `severity`, `regions` (json), `envelope` (json, `area_points`), `centroid_lat/lng`, `pdf_path`, `file_name`, `is_published`, `show_on_map` | Stored bulletin PDFs + geo envelope; the EOCC Bulletin registry + portal map source. |
| `ew_focal_point_reports` | `V51__ew_focal_point_reports.sql` | `bulletin_number`, `warning_code`, `focal_point_name`, `status`, `bulletin_received`, `impact_verified`, `people_affected`, `households_evacuated` | Field verification reports. |
| `scanner_detections` | `V90__ew_monitoring_updates_and_scanner.sql` | `source_id`, `dedup_key` (unique), `hazard_type`, `severity`, `reliability`, `region`, `status`, `dispatched_as`, `assigned_entity`, `incident_id`, `raw` (json) | OSINT/field detections. |
| `scanner_entity_taskings` | `V90__ew_monitoring_updates_and_scanner.sql` | `detection_id` (FK), `agency`, `hazard_type`, `region`, `status`, `responded_submission_id` | Entity verification inbox. |

#### Preparedness asset tables

| Table | Created by | Notes |
|---|---|---|
| `warehouses` | `V7__warehouses_read_model.sql` (+ `V62` capacity/loans, `V85` inventory FK) | Permanent warehouse registry. |
| `temporary_warehouses` | `V16__temporary_warehouses_read_model.sql` (+ `V84` council) | Activated-during-response storage. |
| `inventory` | `V10__inventory_read_model.sql` (+ `V85` warehouse FK) | Relief stock; `/reference` master items. |
| `evacuation_centers` | `V4__evacuation_centers_read_model.sql` (+ `V83` council) | Capacity, location, council. |
| `training_plans` | `V17__training_plans_read_model.sql` (+ `V19`, `V82` workflow links) | Drills/training with publish + push-priority + request-support actions. |
| `alert_subscriptions` | `V18__alert_subscriptions_read_model.sql` (+ `V32`/`V69` unsubscribe) | Citizen subscriptions (`hazards_of_interest`, `location_of_interest`, channels, consent). |
| Anticipatory / contingency plans | `V40__anticipatory_task_lanes.sql`, `V42__anticipatory_action_plans.sql`, `V45__public_reports_triage_and_contingency.sql` | Surfaced under Preparedness but implemented by the Response module components. |

`V80__preparedness_code_unique_constraints.sql` adds unique constraints on the human-readable codes across preparedness entities (a recurring `count(*)+1` collision fix).

---

### 06.10 Key API endpoints

| Method | Path (incl. `/api`) | `@PreAuthorize` | Purpose |
|---|---|---|---|
| POST | `/api/v1/ew/agency/{agency}/submission` | `EW_REPORT` (+ per-agency check) | Entity pushes its bulletin to the bus. |
| POST | `/api/v1/ew/agency/{agency}/update` | `EW_REPORT` (+ per-agency check) | Entity revises an issued `warning_code`. |
| GET | `/api/v1/ew/agency/{agency}/latest` | `isAuthenticated()` | One entity's latest envelope. |
| GET | `/api/v1/ew/agency/latest` | `isAuthenticated()` | All entities' latest (cross-agency visibility). |
| GET | `/api/v1/ew/agency/updates` | `isAuthenticated()` | Entity update stream (Monitoring). |
| DELETE | `/api/v1/ew/agency/{agency}/latest` | `EW_APPROVE` | Withdraw/retract an agency bulletin. |
| GET | `/api/v1/ew/dmd/consolidated` | `isAuthenticated()` | PMO-DMD overlay (tiers + overlays + comments). |
| POST | `/api/ew/bulletins/ingest` | `EW_INGEST` | Ingest TMA/DMD bulletin → pending warning + hazards. |
| POST | `/api/v1/ew/products` | `EW_INGEST` | Store a generated bulletin PDF + envelope. |
| POST | `/api/v1/ew/products/upload` | `PREPAREDNESS_MANAGE` | Upload a standalone (MANUAL) bulletin. |
| GET | `/api/v1/ew/products` | `isAuthenticated()` | List products (EOCC Bulletin + map). |
| GET | `/api/v1/ew/products/{id}` | `isAuthenticated()` | One product with full envelope. |
| PATCH | `/api/v1/ew/products/{id}/publish` | `PREPAREDNESS_MANAGE` | Publish to map / Publications. |
| POST | `/api/v1/ew/products/{id}/disseminate` | `COMMS_DISSEMINATE` | Disseminate to affected-area audiences (SMS/email/in-app). |
| GET | `/api/v1/ew/warnings` | `isAuthenticated()` | Warning registry + statistics (read model). |
| POST | `/api/v1/ew/warnings/{id}/approve` | `EW_APPROVE` | pending → approved. |
| POST | `/api/v1/ew/warnings/{id}/publish` | `EW_APPROVE` | approved → published; clone to `early_warnings` + OH kick. |
| POST | `/api/v1/ew/warnings/{id}/map` | `EW_APPROVE` | Add/remove from the portal map. |
| POST | `/api/v1/ew/warnings/{id}/bulletin` | `EW_APPROVE` | Manual contingency PDF upload. |
| POST | `/api/v1/ew/scanner/scan` | `EW_REPORT` | Trigger a live OSINT scan. |
| GET | `/api/v1/ew/scanner/detections` | `isAuthenticated()` | List detections + stats. |
| POST | `/api/v1/ew/scanner/report` | `EW_REPORT` | File a regional/sectorial field report. |
| POST | `/api/v1/ew/scanner/{id}/dispatch` | `EW_INGEST` | Route detection → entity / incident / dismiss. |
| GET | `/api/v1/ew/scanner/entity-taskings` | `isAuthenticated()` | Entity verification inbox. |
| GET | `/api/ew/stakeholders` | `isAuthenticated()` | Active stakeholders with contacts. |
| POST | `/api/ew/disseminate` | `EW_DISSEMINATE` | Stakeholder-selected dual SMS + email. |
| POST | `/api/ew/sms-test` | `CHANNEL_TEST_WRITE` | M-Gov gateway test SMS. |
| GET/POST | `/api/ew/monitoring/reports` | read `isAuthenticated()` / write `EW_REPORT` | Focal-point report list / store. |
| POST | `/api/ew/monitoring/request-update` | `EW_INGEST` | SMS focal points for updates. |
| GET / POST / PUT | `/api/v1/warehouses`, `/api/v1/temporary-warehouses`, `/api/v1/inventory`, `/api/v1/evacuation-centers`, `/api/v1/training-plans`, `/api/v1/alert-subscriptions` | GET `isAuthenticated()`; POST/PUT `PREPAREDNESS_MANAGE` | Preparedness asset CRUD. |
| POST | `/api/v1/training-plans/{id}/{publish,push-priority,request-support}` | `PREPAREDNESS_MANAGE` | Training-plan workflow actions. |

EW `@PreAuthorize` tiers (`common/security/Authz.java`): **`EW_INGEST`** = Super Admin/ICT Admin/EOCC/Director/Asst.Director (trusted ingest); **`EW_APPROVE`** = Super Admin/EOCC/Director/Asst.Director (the maker-checker release tier); **`EW_DISSEMINATE`** adds Comms Officer; **`COMMS_DISSEMINATE`** is the broad Communication-Center tier (ops + field officers + Comms); **`EW_REPORT`** = `OH_REPORT_EVENT` (all operators incl. regional/district field officers); **`PREPAREDNESS_MANAGE`** = ops + sector + field officers.

---

### 06.11 Design decisions and rationale

* **Two data models bridged by `warning_code`, with publish as the only bridge.** Kept faithful to the Laravel source so the public-facing flat model (`early_warnings`) and the normalised authoring model (`warnings`/`warning_hazards`) can evolve independently; `publish()` is the single, status-gated clone point.
* **Path-derived agency on the bus, enforced by `JurisdictionScope`.** The agency is taken from the URL path and validated against a fixed set; the write check compares it to the caller's resolved agency code, with a deliberate PMO/EOCC override. Reads stay open because interlinking between entities is a functional requirement.
* **Centroid fallback + insert-before-write.** A bulletin must never be invisible on the public map (region-centroid fallback) and a DB rollback must never strand a PDF on disk (insert-then-write with `deleteIfExists`). Both close real defects observed in the legacy flow.
* **`afterCommit` for all feed/notification side-effects.** Ingest and publish register `TransactionSynchronization.afterCommit` callbacks so a notification failure can never mark the core transaction rollback-only, and the broadcast does not lengthen the critical transaction.
* **All dissemination logs to the Communication Center.** Routing through `MgovSmsService`/`MailService`/`NotificationService` means every send is auditable in `sms_logs`/`email_logs`, eliminating the legacy "four divergent dissemination paths, success-on-failure" problem.
* **The scanner is real and scheduled.** Replacing the inert in-session queue with persisted, deduped, dispatchable detections (content-hash dedup; hourly `@Scheduled` sweep) makes monitoring an operational capability rather than a UI demo.
* **One bulletin code allocator with self-heal.** `EW-YYYY-NNNNN` is allocated per year; `healSeq()` defuses the recurring stale-sequence collision; dedup uses `IS NOT DISTINCT FROM` so a null submitter still dedupes.

---

### 06.12 Integration points

* **Communication Center** — `AudienceService`, `MgovSmsService`/`SmsAuditLogger`, `MailService`, `NotificationService`; all EW sends log to `sms_logs`/`email_logs` and the in-app bell.
* **Public Portal** — `PortalPublicService.landing()` reads `early_warnings` (region-centroid blink) and published `ew_generated_products` (per-district blink + PDF pin); publish also writes the Publications library (`disaster_risk_frameworks`).
* **One Health** — `publish()` auto-creates an `oh_events` row (`source_warning_id`, area-of-concern mapped from hazard keywords).
* **Response / Incidents** — scanner `dispatch as=incident` inserts a draft `public.incidents` row into the DAS→RAS→Director approval chain.
* **Jurisdiction & RBAC** — `JurisdictionScope.currentAgencyCode()` (per-agency write), `AreaLookup` + `users.region_id/district_id` (coordinator/stakeholder area resolution), `Authz` role tiers.

---

### 06.13 Known gaps, constraints and TODOs

* **`mlf` not in `public.agencies`** — an MoLF login resolves `currentAgencyCode()=null` → PMO override; per-agency write enforcement for MoLF is not yet effective until the agencies backfill adds it.
* **Coordinator SMS/in-app reaches 0 until users carry an area** — coordinator resolution depends on `users.region_id/district_id` being seeded (same pattern as role-SMS needing phones).
* **`subscribers_by_hazard` resolves 0 for PMO multirisk bulletins** — the PMO envelope has no per-day hazard `type`, so the area audience is the primary channel unless an operator sets a hazard.
* **Pre-Increment-1 bulletins have a null centroid** and won't map; only new pushes benefit from the centroid logic.
* **No delivery receipts (DLR)** — sends are logged as attempted/sent/failed from the gateway response; no carrier delivery confirmation.
* **`alert_subscriptions` has no area FK** — citizen subscribers are name-matched on `location_of_interest`/`subscriber_location` only (a future FK improvement).
* **`sendComposed` hardcodes the email log `notification_type`** — EW dissemination emails log as `manual` rather than `ew_dissemination` (minor; SMS logs correctly).
* **Anticipatory/contingency plans under Preparedness are implemented by the Response module** — the routes live here but the components and tables are shared with Response.
* **`V51__ew_focal_point_reports.sql` comment still references "Streamlit"** — left untouched intentionally (a Flyway checksum on an applied migration must not change).

---

## 07. Response Module

The Response Module is the operational heart of e-MAAFA: it covers the full disaster lifecycle from the moment an incident is reported through area-scoped statutory approval, response activation (the EOCC Command Center), resource allocation and dispatch, public/stakeholder coordination, alerting, and formal disaster declarations. Its defining design principle is *jurisdiction-scoped authority* — officers act and see only within their administrative window (district → region → national), enforced server-side so that "only the nation sees everywhere". It is the largest module in the platform, comprising 23 controllers/services backed primarily by the `incidents`, `allocated_resources`, `response_activations`, `incident_tasks`, and `alerts` tables.

All code referenced here lives under `dmis-platform/backend/src/main/java/tz/go/pmo/dmis/response/` (backend) and `dmis-platform/frontend/src/app/pages/response/` (frontend). The module is a faithful re-implementation ("strangler") of the legacy Laravel `Admin\IncidentController`, `Response\CoordinationController`, `Response\CommunicationAlertsController`/`AlertSystemController`, and `App\Services\ApprovalWorkflowService`, with the source's deferred IAM/jurisdiction logic and several source bugs fixed (documented inline and in `issues/response.issues.md`).

### 07.1 Purpose and Responsibilities

- **Incident lifecycle** — report, triage, situation updates, periodic history (situation) reports, escalate/verify/close, and an area-scoped statutory approval chain that routes a report from a district up to the Permanent Secretary.
- **EOCC Command Center** — open a response *activation* (live or simulation) over the 15 NDPRP Disaster Response Functions (DRFs) as coordination "lanes" with a 72-hour critical-task strip; supports *anticipatory* (forecast-triggered) activation before any incident exists, walking a posture ladder (monitoring → emergency → disaster → safeguard).
- **Resource allocation and dispatch** — request resources against an incident, run them through a configurable approval chain (`ApprovalWorkflowEngine`), then source/dispatch them from warehouses, temporary warehouses, agency stock, procurement, or stakeholder bidding/donation, with FIFO stock deduction and a warehouse-manager gate.
- **Communication & Alert Center** — compose templated alerts, fan out one delivery record per recipient × channel (SMS/email/app/web), schedule future sends, and report cross-channel delivery analytics.
- **Stakeholder coordination, bidding & donations** — publish open needs to partners, accept pledges/bids, record NDMF cash donations and disbursements.
- **Damage assessment, task management, dashboards, declarations, executive watch** — supporting surfaces for assessment capture/verification, task boards, the EOCC operational picture, statutory disaster declarations (DM Act 2022), and a leadership watch summary.

### 07.2 Key Components

| Component | File | Role |
|-----------|------|------|
| `IncidentController` | `IncidentController.java` | Incident registry, multipart report form (photos/video), show hub, situation updates, history reports, workflow + operational actions, portal publish/unpublish |
| `IncidentWorkflowService` | `IncidentWorkflowService.java` | The area-scoped approval chain; `assertStageAccess` enforces role + jurisdiction at every stage; submit/approve/rollback/forward/resubmit + operational status |
| `IncidentOptions` | `IncidentOptions.java` | Verbatim vocabularies (severity, statuses, workflow labels, infrastructure/needs maps, status-ordering CASE) |
| `CommandCenterController` | `CommandCenterController.java` | Activation index/board/lanes, forecast lifecycle (forecast/posture/impact/cancel/readiness), lane assign/task CRUD, deactivate |
| `ActivationService` | `ActivationService.java` | Opens a live or simulation (drill-clone) activation, seeds DRF default tasks, starts the 72-hour clock; `log()` writes the activity timeline |
| `ResourceAllocationController` | `ResourceAllocationController.java` | Request → forward → approve/reject → status transitions → track; auto-suggests warehouse source; initializes the approval engine per line |
| `ResourceApprovalController` | `ResourceApprovalController.java` | Approval queues, my-requests, show with chain, approve/reject/rollback/resubmit, fast-track, bulk-approve |
| `ApprovalWorkflowEngine` | `ApprovalWorkflowEngine.java` | Generalized configurable approval engine (snapshot chain, step-by-step approve, reject, rollback, resubmit, fast-track) with maker-checker enforcement |
| `DispatchController` / `DispatchSupportService` | `DispatchController.java`, `DispatchSupportService.java` | Dispatch board, nearest-source discovery (haversine), FIFO row-locked stock deduction, warehouse-manager gate, procurement and agency channels |
| `WarehouseOpsController` | `WarehouseOpsController.java` | Intake/remove/transfer, movement ledger, stock-taking, capacity, inter-warehouse borrow/loan |
| `CommunicationController` | `CommunicationController.java` | Consolidated alert center: compose/fan-out, scheduled dispatch, templates, resend-failed, analytics |
| `StakeholderCoordinationController` / `StakeholderBiddingController` | same | Stakeholder coordination, open needs, bidding/pledging, NDMF donations/fund/disbursements |
| `AssessmentController` | `AssessmentController.java` | Damage assessment registry, multipart create, Draft → Pending Verification → Completed, severity report |
| `TaskController` | `TaskController.java` | Task board/my-tasks/calendar, dependency/due-date rules |
| `DashboardController` | `DashboardController.java` | `/dashboard` overview + `/eocc` operational picture + `/eocc/activate` |
| `DeclarationController` | `DeclarationController.java` | DM Act 2022 declarations (s.32 Disaster Area / s.33 State of Emergency) and committee reference |
| `AnticipatoryPlanController` / `ContingencyPlanController` | same | Anticipatory action plans and contingency plans (draft → approve workflow) |
| `ExecutiveWatchController` / `PublicReportsController` / `SettingsController` | same | Leadership watch summary; public-report triage→convert-to-incident; approval-chain/catalogue/incident-type admin |

Frontend Angular standalone components mirror these one-to-one (e.g. `incidents.component.ts`, `incident-show.component.ts`, `command-center.component.ts`, `resource-allocations.component.ts`, `approvals.component.ts`, `dispatch-console.component.ts`, `communication.component.ts`). The frontend proxies `/api → :8080`.

### 07.3 Incident Lifecycle and the Area-Scoped Approval Chain

An incident moves through two orthogonal axes: an **operational status** (`status`: Reported, Verified, Escalated, Active Response, Closed, …) and a **workflow status** (`workflow_status`: the approval chain). The chain is the module's central governance mechanism and is implemented in `IncidentWorkflowService`.

**Chain (per administrative tier):**

```
district:  draft → waiting_das_approval      (DED approves / DAS views, own district)
regional:  waiting_ras_approval              (RAS approves / RC views, own region)
national:  waiting_assistant_director_approval (Asst. Director)
         → waiting_director_approval          (Director)
         → waiting_ps_approval                (Permanent Secretary / Secretary)
         → approved
```

District-origin incidents enter at `waiting_das_approval`; region-origin incidents (`origin_level = 'regional'`) enter directly at `waiting_ras_approval` (`submit()`). Every reviewer may roll back exactly one level (`rollback()`, comments mandatory, `rollback_count` incremented); `resubmit()` re-enters the chain after a rollback; `forward()` lets a national reviewer route to a specific Assistant Director or the Director.

**The strict area gate** is `IncidentWorkflowService.assertStageAccess(stage, incident)`, called from `approve`, `rollback`, and `forward`. It enforces two conditions for every action:

1. **Role** — the acting user must hold the role that *owns* the stage (`STAGE_ROLES`: DED owns DAS stages, RAS owns the region stage, Asst.Director/Director/Secretary own the national stages).
2. **Jurisdiction** — for district/region stages (`STAGE_SCOPE`), the acting user's own `users.district_id` / `users.region_id` must match the incident's. National stages are not area-bound. An officer with no area assigned cannot action an area-scoped stage (STRICT). `Super Admin` is the documented break-glass override.

**Region authority from district** — on create and update, `IncidentController.regionOfDistrict(districtId, postedRegionId)` derives `region_id` from the chosen district (`districts.region_id`), overriding any missing or mismatched posted region. This guarantees an incident always routes to the correct RAS and stays visible to its region (UP = district → region → national; DOWN = national sees all / region sees its districts / district sees its own).

**Area-scoped visibility** — `IncidentController.index()` calls the shared `JurisdictionScope.appendAreaScope("i", …)` (in `common/security/`), which appends a SQL predicate: national roles see every row, region roles see only their region (`region_id`), district roles only their district (`district_id`), and any other role sees nothing (`1=0`). This is the STRICT policy; shared registries elsewhere use the LENIENT `appendAreaScopeSharedOrOwn` variant.

Every transition is written to `incident_workflow_histories` via `logHistory()` (action, from/to status, performed-by role resolved from `model_has_roles`, comments), producing the audit timeline rendered on the incident show hub.

### 07.4 EOCC Command Center and Anticipatory Activation

`CommandCenterController` (`/v1/response/coordination`) coordinates a response as 15 NDPRP DRF lanes over `incident_tasks`, keyed by `activation_id`. Two activation modes share identical machinery:

- **Live** — runs the real approved incident (`ActivationService.activate(incidentId, false, notes)`).
- **Simulation** — a flagged drill-clone (`is_simulation = true`, V29) so live data is never touched; public reads exclude flagged incidents.

`ActivationService.activate()` seeds the NDPRP default tasks from `drf_default_tasks` as lanes and starts the 72-hour clock. The board (`GET /{id}`) returns per-DRF live stats, the `is_72hr_critical` strip, a challenges feed, a recent-activity timeline, and a `posture_doctrine` reference (V41: posture → TEPRP level / alert colour / authorising office per DM Act 2022 + NDPRP 2022).

**Anticipatory (forecast-triggered) activation** runs before any incident exists — the "cyclone coming" doctrine:

| Step | Endpoint | Effect |
|------|----------|--------|
| Open from forecast | `POST /forecast` | Inserts a `response_activations` row with `incident_id = null`, `posture = 'monitoring'`, `trigger_type = 'forecast'`; seeds all DRF default tasks (every DRF "on call") |
| Walk the posture ladder | `POST /{id}/posture` | monitoring → emergency → disaster → safeguard (de-escalation allowed; doctrine forbids jumping Red→stood-down without `safeguard`) |
| Confirm impact | `POST /{id}/impact` | Creates and links an incident (`workflow_status='approved'`, posture jumps to `disaster`), re-parents the lane tasks to it |
| Cancel / stand down | `POST /{id}/cancel-forecast` | Marks `deactivated`, journals the reason |
| Readiness picture | `GET /{id}/readiness` | Evacuation centres, warehouses/stockpiles, active early warnings, stakeholders on call, matched anticipatory plans — scoped to the forecast/incident area |

`response_activations.incident_id` is nullable (V30) precisely to support forecast activations, and the board/index queries `LEFT JOIN incidents` (falling back to `hazard_description` for the title) so a forecast activation still renders. JSON columns (`affected_areas`, `forecast_track`) are parsed server-side (`cleanActivationJson`) into clean arrays so the frontend never sees raw PostgreSQL `PGobject` values.

### 07.5 Resource Allocation, the Approval Engine, and Dispatch

**Allocation request** (`ResourceAllocationController.store`, `/v1/response/allocations`) is gated to approved/active incidents (verbatim source rule). Each requested line becomes an `allocated_resources` row (`status='Requested'`), with the source warehouse auto-suggested (approvers refine it later), and the configurable approval chain is snapshotted onto it via `approvals.initialize("resource_allocation", id, null)`.

**The generalized approval engine** (`ApprovalWorkflowEngine`) is the configurable, Settings-managed chain (seeded DAS → RAS → EOCC → Asst. Director → Director in V24):

- `initialize()` snapshots the module's active `approval_workflow_configurations` into per-record `approval_workflows` step rows, skipping the requester's own role.
- `approve()` advances step-by-step; `reject()` ends the chain; `rollback()` sends to `requires_revision`; `resubmit()` resets every step to pending; `fastTrack()` (Super Admin) approves all remaining steps.
- **Maker-checker is enforced** (`assertNotRequester`): the person who submitted a request (`allocated_resources.requested_by`) can never approve or fast-track it, regardless of chain config. `assertStepRole` makes each step actionable only by the configured `approver_role` (or Super Admin), turning the configured chain from advisory into binding.
- The simpler dashboard `ResourceAllocationController.approve()` keeps the two engines in sync: if a configurable chain is attached with pending steps, it `fastTrack()`s the engine so the governance chain cannot remain `pending_approval` while the operational status reads `Approved`.

**Dispatch** (`DispatchController`, `/v1/response/dispatch`) sources approved allocations from warehouses, temporary warehouses, agency stock, procurement, or stakeholder bidding:

- `DispatchSupportService.availableSources()` discovers every fulfilment source, sorted nearest-first by haversine `distanceKm` from the incident; channels without coordinates sink to the bottom.
- Dispatch validates against the **remaining** need (gross allocation minus already-dispatched minus pending dispatch-approvals) so repeated requests cannot over-commit.
- Warehouse/temporary-warehouse sources require a manager gate (`dispatch_approvals`, status `Pending`); stock moves only on approval. Agency stock dispatches directly. Deduction is FIFO and row-locked (`deductStock`). A KEY source bug was fixed here: the Laravel source never deducted stock on dispatch approval due to a `'warehouse'`/`'Warehouse'` constant mismatch.
- A JSON dispatch journal (`source_details`) records each partial dispatch; movements are written to `stock_movements`.

### 07.6 Communication & Alert Center

`CommunicationController` (`/v1/response/communication`) is the single consolidated alert stream (the source ran two parallel alert systems; this merges them into one delivery log).

**Flow:** compose (template → `{placeholder}` substitution) → resolve recipients from 8 group keys → write the `alerts` row → **fan out one `alert_recipients` row per recipient × channel** → send/schedule.

- The 8 group keys (`GROUP_ROLES`) map to real recipients: `all_users`, `pmo_staff`, `regional_coordinators`, `district_coordinators`, `response_agencies` (Partners), `sectoral_focal` (MDA Focal), `emergency_teams` (EOCC), and `public` (the `alert_subscriptions` registry). Three of these (`sectoral_focal`, `emergency_teams`, `public`) resolved to nobody in the source and are now correctly mapped.
- `fanOut()` writes the in-app bell feed synchronously via the shared `NotificationService.notifyUsers` for `app` channel; `web` records `sent`; SMS/email rows are written `pending` and the real send is offloaded to the `@Async ExternalDeliveryService` (M-Gov SMS / SMTP / FCM in production), which flips rows to `sent`/`failed` from the gateway result. `sendAlert` is deliberately **not** `@Transactional` so no DB connection is held across gateway I/O and a record of a sent message can never be rolled away.
- `incident_id` on `alerts` links an alert to its incident (e.g. for `previewTemplate` substitution and the alert history join).
- `@Scheduled(fixedDelay=60000) dispatchScheduledAlerts()` claims each due `scheduled` alert atomically (status guard) and fans it out — without this, scheduled alerts sat unsent forever (source bug fixed).
- `resend-failed` re-dispatches only failed deliveries through the same gateway path, resetting them to `pending` so status stays truthful.

Delivery analytics (`GET`, `/analytics`, `/alerts/{id}`) report cross-channel delivery rate, by-channel/by-type/by-severity breakdowns from `alert_recipients`.

### 07.7 Data Design

The response schema is created principally by **`V22__response_read_models.sql`** (the master migration), which extends the V13 `incidents` stub to its full ~70-column source shape and creates the supporting tables. Subsequent migrations add features additively (strangler rule: `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`, never mutating existing data).

| Table | Created/extended by | Purpose |
|-------|---------------------|---------|
| `incidents` | V13 (stub) → V22 (full shape) → V29 (`is_simulation`) → V91 (portal surfaces) → V92/V93/V94 (area FKs/roles) | Incident record: location, casualty/damage figures, workflow + per-stage reviewer columns, `region_id`/`district_id` |
| `incident_types` | V22 | Incident type vocabulary |
| `incident_tasks` | V22 (+ DRF coordination cols) | Tasks; also the DRF lanes when keyed by `activation_id`/`drf_id` |
| `incident_updates` | V22 | Per-incident situation log |
| `incident_workflow_histories` | V22 | Approval-chain audit trail (action CHECK constraint) |
| `incident_history_reports` | V22 | Periodic situation figures (casualties + property loss) |
| `allocated_resources` | V22 (+ V27 `assessment_id`) | The request → approve → dispatch → receipt → delivery chain |
| `approval_workflows` | V22 (legacy threshold shape) → V24 (polymorphic step rows) | Per-record approval step instances |
| `approval_workflow_modules` / `approval_workflow_configurations` | V24 | Which models run the engine; the configurable role chain |
| `resource_notifications` | V24 | In-app notices to approvers/requesters |
| `approval_histories` | V22 (+ V23 widened action CHECK) | Allocation approval audit |
| `damage_assessments` / `assessment_categories` / `assessment_photos` | V22 | Damage assessment suite |
| `alerts` / `alert_templates` / `alert_recipients` | V22 | Alert center: alert, templates, per-recipient×channel delivery log |
| `stock_movements` | V22 (+ V25 CHECK fix, V63 incident link) | Warehouse movement ledger |
| `disaster_response_functions` / `drf_default_tasks` | V22 | The 15 NDPRP DRFs and their default tasks |
| `response_activations` | V22 → V29 (`is_simulation`) → V30 (`posture`/`trigger_type`/forecast cols, `incident_id` nullable) | EOCC activations incl. anticipatory |
| `task_activity_log` | V22 | Command Center activity timeline |
| `dispatch_approvals` / `stock_taking_records` / `agency_resources` | V25 | Warehouse-manager gate, physical counts, agency stock source |
| `stakeholder_resource_bids` / `ndmf_donations` | V26 | Bidding/donations |
| `posture_doctrine` | V41 | Posture → TEPRP level / alert colour / authoriser reference |
| `anticipatory_action_plans` | V42 | Per-area preparedness plans |
| `disaster_declarations` / `declaration_events` / `disaster_committees` | V43 | DM Act 2022 declarations + statutory committee hierarchy |
| `ndmf_disbursements` | V89 | NDMF fund disbursements |

`allocated_resources` (selected columns): `incident_id`, `resource_id`, `quantity_requested`, `quantity_allocated`, `unit_of_measure`, `status`, `workflow_status`, `current_workflow_step`, `requested_by`, `forwarded_by`, `approved_by`, `rejected_by`, `deployed_from_warehouse`, `source_details` (JSON dispatch journal), `published_for_stakeholder_bidding`, `bid_deadline`.

`alert_recipients` (the delivery log): `alert_id`, `recipient_type` (`user`/`subscriber`), `recipient_id`, `delivery_method` (sms/email/app/web), `status` (pending/sent/delivered/read/failed), `sent_at`/`delivered_at`/`read_at`.

### 07.8 Key API Endpoints

All paths are prefixed with the `/api` context-path. `Authz.RESPONSE_OPERATE` = the wide field-officer + admin set (Super Admin, ICT Admin, EOCC, Director, Asst. Director, MDA Focal, RAS, Reg DC, DAS, Dist DC, DED, Secretary); `RESPONSE_OVERSIGHT`/`RESPONSE_ASSESS_VERIFY` = the narrow verify set (Super Admin, EOCC, Director, Asst. Director); `RESPONSE_COMMAND` adds Secretary; `DECLARE_*` are the statutory committee/authority roles. Read (GET) registry endpoints are not annotated and rely on framework authentication plus the in-query `JurisdictionScope` filter.

| Method | Path | `@PreAuthorize` | Purpose |
|--------|------|-----------------|---------|
| GET | `/api/v1/response/incidents` | (auth + area scope) | Incident registry, area-scoped + filtered + paginated |
| POST | `/api/v1/response/incidents` | `RESPONSE_OPERATE` | Create incident (multipart: photos + video) |
| PUT | `/api/v1/response/incidents/{id}` | `RESPONSE_OPERATE` | Update incident |
| GET | `/api/v1/response/incidents/{id}` | (auth) | Incident show hub (updates, workflow history, tasks, allocations) |
| POST | `/api/v1/response/incidents/{id}/submit` | `RESPONSE_OPERATE` | Submit draft into the approval chain |
| POST | `/api/v1/response/incidents/{id}/approve` | `RESPONSE_OPERATE` (then `assertStageAccess`) | Approve at the current stage |
| POST | `/api/v1/response/incidents/{id}/rollback` | `RESPONSE_OPERATE` (then `assertStageAccess`) | Roll back one level (comments required) |
| POST | `/api/v1/response/incidents/{id}/forward` | `RESPONSE_OPERATE` (then `assertStageAccess`) | Forward to a national role |
| POST | `/api/v1/response/incidents/{id}/escalate\|verify\|close` | `RESPONSE_OPERATE` | Operational status actions |
| POST | `/api/v1/response/incidents/{id}/push-map\|push-news\|remove-news` | `RESPONSE_OPERATE` | Publish incident to the citizen portal |
| GET | `/api/v1/response/coordination` | (auth) | Activations index (active/completed/awaiting + posture doctrine) |
| POST | `/api/v1/response/coordination/activate/{incidentId}` | `RESPONSE_OPERATE` | Open a live/simulation activation |
| POST | `/api/v1/response/coordination/forecast` | `RESPONSE_OPERATE` | Anticipatory activation from a forecast |
| POST | `/api/v1/response/coordination/{id}/posture` | `RESPONSE_OPERATE` | Walk the posture ladder |
| POST | `/api/v1/response/coordination/{id}/impact` | `RESPONSE_OPERATE` | Confirm impact → create + link incident |
| GET | `/api/v1/response/coordination/{id}` | (auth) | Command board (DRF lanes, 72hr strip, challenges, timeline) |
| POST | `/api/v1/response/coordination/{id}/drf/{drfId}/assign` | `RESPONSE_OPERATE` | Assign a DRF lane to a stakeholder |
| POST | `/api/v1/response/coordination/{id}/task/{taskId}` | `RESPONSE_OPERATE` | Update a lane task (journalled) |
| POST | `/api/v1/response/allocations` | `RESPONSE_OPERATE` | Submit a resource request (initializes approval chain) |
| POST | `/api/v1/response/allocations/{id}/forward\|approve\|reject` | `RESPONSE_OPERATE` | Allocation transitions |
| GET | `/api/v1/response/approvals` | (auth) | Approval queue |
| POST | `/api/v1/response/approvals/{id}/approve\|reject\|rollback\|resubmit` | `RESPONSE_OPERATE` | Engine actions (maker-checker + step-role enforced) |
| POST | `/api/v1/response/approvals/{id}/fast-track` | `RESPONSE_OVERSIGHT` | Approve all remaining steps |
| POST | `/api/v1/response/approvals/bulk-approve` | `RESPONSE_OVERSIGHT` | Bulk-approve current steps |
| GET | `/api/v1/response/dispatch` | (auth) | Dispatch board grouped by incident |
| POST | `/api/v1/response/dispatch/allocations/{id}/dispatch` | `RESPONSE_OPERATE` | Dispatch (warehouse gate or direct agency) |
| POST | `/api/v1/response/dispatch/approvals/{id}/approve\|reject` | `RESPONSE_OVERSIGHT` | Warehouse-manager dispatch gate |
| POST | `/api/v1/response/communication/alerts` | `RESPONSE_OPERATE` | Compose + fan out (or schedule) an alert |
| POST | `/api/v1/response/communication/alerts/{id}/resend-failed` | `RESPONSE_OPERATE` | Retry failed deliveries via the gateway |
| GET | `/api/v1/response/communication/analytics` | (auth) | Cross-channel delivery analytics |
| GET | `/api/v1/response/assessments` | (auth) | Damage assessment registry |
| POST | `/api/v1/response/assessments/{id}/verify` | `RESPONSE_ASSESS_VERIFY` | Verify a submitted assessment |
| POST | `/api/v1/response/declarations` | `RESPONSE_COMMAND` | Propose a declaration |
| POST | `/api/v1/response/declarations/{id}/technical-review` | `DECLARE_REVIEW` | National Technical Committee review (s.10) |
| POST | `/api/v1/response/declarations/{id}/endorse` | `DECLARE_ENDORSE` | National Steering Committee endorsement |
| POST | `/api/v1/response/declarations/{id}/declare` | `DECLARE_AUTHORITY` | Minister (s.32) / President (s.33) declares |
| GET | `/api/v1/response/dashboard` and `/api/v1/response/eocc` | (auth) | Overview + EOCC operational picture |

### 07.9 Important Design Decisions and Rationale

- **Two orthogonal status axes on an incident** (operational `status` vs `workflow_status`). The approval chain governs institutional sign-off while operational status tracks the field reality; resources can only be requested once an incident is `approved` or `Active`/`Verified`. This mirrors the source while making the relationship explicit.
- **Server-side STRICT jurisdiction enforcement, not UI-gating.** Visibility (`appendAreaScope`) and action authority (`assertStageAccess`) are enforced in SQL/service code so the rule holds regardless of the client. The source deferred this "to the IAM layer" and never implemented it; e-MAAFA closes that gap. The frontend itself is *not* role-gated — all modules are visible to all signed-in users; enforcement is at the API.
- **Region authoritative from district.** Deriving `region_id` from the chosen district prevents the chain from mis-routing to the wrong RAS — a correctness invariant for the whole approval flow.
- **Maker-checker keyed on the person, not the role** (`assertNotRequester` on `requested_by`). This is the correct segregation-of-duties test and holds even though the chain is currently initialized with a null requester role.
- **Alert center is deliberately not transactional** and offloads gateway I/O to an `@Async` service. This avoids holding a DB connection across slow external SMS/SMTP calls and ensures the delivery log can never be rolled back after a message physically went out — delivery status reflects the real gateway outcome.
- **One consolidated alert stream and one notification dispatcher.** The source's two parallel alert systems and three half-journals are merged into a single `alert_recipients` fan-out, and in-app notices route through the shared `NotificationService` (the platform's single dispatcher).
- **Live vs Simulation share one code path** (`is_simulation` flag) so drills exercise the exact production machinery without touching live data or leaking into public reads.
- **Anticipatory activation before an incident exists** (nullable `incident_id`, `LEFT JOIN` everywhere) implements the NDPRP 2022 forecast-to-impact doctrine rather than forcing an incident to pre-exist.
- **Additive, strangler-safe migrations** (`IF NOT EXISTS`) so an environment already carrying the legacy Laravel schema is read/written through the same tables, never rewritten.

### 07.10 Integration Points

- **Preparedness / Warehouses & Inventory** — dispatch sources read `warehouses`, `temporary_warehouses`, `inventory_items`, and `agency_resources`; readiness reads evacuation centres and stockpiles. Area columns (`region_id`/`district_id`) were added cross-module in V94.
- **Notification backbone** — `NotificationService` (in-app bell feed) and `ExternalDeliveryService` (async SMS/SMTP/FCM) are shared platform services used by both the alert center and the approval engine.
- **Early Warning** — readiness surfaces active `early_warnings`; forecast activations consume EW forecast data conceptually (the Python EW generate-engine on `:8600` is upstream).
- **Public Citizen Portal** — incidents can be pushed to the portal live map (`show_on_portal_map`) and News & Events (`portal_news`), opening the public snapshot at `/v1/portal/incidents/{id}`. `PublicReportsController` triages citizen-submitted reports and can convert them into incidents.
- **Common security** — the entire module depends on `common/security/` (`JurisdictionScope`, `Authz`, `SecurityUtils`) for the local-profile persona filter, role resolution, and area scoping.
- **Recovery / Assessments** — damage assessments link to allocations (`allocated_resources.assessment_id`, V27) and feed recovery.

### 07.11 Known Gaps, Constraints, and TODOs

- **No per-institution (agency) row-scoping.** Although V95 added a `users.agency_id`/stakeholder link and EW agency focal logins exist, response endpoints do not row-scope by agency; scoping is by administrative area only. EW agency accounts are distinct logins but endpoints don't filter by agency.
- **`agency_resources` has no standalone registry/CRUD.** It is written only by the seeder and read via embedded sub-views (dispatch source picker, stakeholder coordination panel); its V94 area columns exist but scoping awaits a registry being built first (deferred, not built speculatively).
- **Catalogue, contingency, anticipatory, and training plans are national-only** by deliberate decision (high-value scoping only) — they are not area-scoped.
- **`fast-track` deliberately bypasses the per-step area check** on incidents (it remains an oversight/break-glass override and must stay so) — note this is the incident chain's national fast-track, distinct from the allocation engine's `fastTrack` which still enforces maker-checker.
- **No SMS/email delivery receipts (DLR).** Delivery status is the gateway send result, not a carrier-confirmed read receipt; the `read`/`delivered` statuses on `alert_recipients` are not driven by real DLR callbacks locally.
- **Local-profile acting user** falls back to the seeded `admin@example.com` when the JWT subject is non-numeric, which is a dev convenience and must not be relied on in production (Keycloak supplies a numeric `sub`).
- **`users` has no `is_active` column locally**, and some demo fixtures (mutated incidents 2/3, "(test)" warehouses in Dodoma/Arusha) remain in the dev DB to demonstrate scoping; these are harmless dev artefacts.
- **JSON columns return PostgreSQL `PGobject`** from JDBC; every controller that exposes them must parse them server-side (`cleanActivationJson`, `parseJsonField`) — a recurring maintenance constraint to keep the API contract clean.

---

## 08. Prevention & Mitigation Module

**Purpose for non-specialists.** This module is e-MAAFA's Disaster Risk Reduction (DRR) planning surface: the place where the PMO records the *hazards* Tanzania faces, the *risk assessments* that quantify them by location, the *mitigation measures* (projects/programmes) that reduce them, the registry of *strategic infrastructure* at risk, and the *repository of past disasters*. It feeds a national GIS risk-mapping view and a module dashboard, and is a faithful re-platform of the legacy Laravel `Admin/*Controller` screens onto Spring Boot + Angular, preserving the existing shared `public.*` tables so production data is untouched.

### 8.1 Responsibilities and scope

The module owns six related but independent record types over the shared PostgreSQL `public` schema:

| Sub-feature | Backing table | Legacy controller mirrored | Notes |
|---|---|---|---|
| Hazard registry | `public.hazards` | `Admin/HazardController` | Catalogue of hazard types; referenced by EW, Response, plans |
| Risk assessments | `public.risk_assessments` | `Admin/RiskAssessmentController` | Richest record; SRS field set, draft→publish lifecycle, file uploads, code generation |
| Mitigation measures | `public.mitigation_measures` | (`Admin/MitigationController` measures section) | DRR projects/programmes; index + full CRUD |
| Strategic infrastructure | `public.infrastructure_items` | `Admin/InfrastructureItemController` | Critical infrastructure registry with coordinates |
| Disaster repository | `public.past_disasters` | `Admin/PastDisasterController` | Historical events with optional report document |
| Risk frameworks | `public.disaster_risk_frameworks` | `Admin/...FrameworkController` | DRR policy/framework library; tagged `Content Management` in OpenAPI |
| Module dashboard | aggregate (read-only SQL) | `Admin/MitigationController@index` | Counts + choropleth + 6 chart datasets + 3 recent tables |
| GIS risk map | aggregate (read-only SQL) | `Admin/GisMapController@index` | 5 marker layers + 4 stats + choropleth region data |

Design intent throughout: **be a faithful re-platform** of the legacy screens (same payloads, same column subsets, same code formats), while *correcting* a handful of legacy defects that are explicitly annotated in the source as `DELIBERATE FIX` (see §8.7).

### 8.2 Key components and file references

All backend types live in package `tz.go.pmo.dmis.mitigation` under
`dmis-platform/backend/src/main/java/tz/go/pmo/dmis/mitigation/`.

**Controllers (REST entry points)**

| Controller | Base path | File |
|---|---|---|
| `HazardController` | `/v1/hazards` | `HazardController.java` |
| `RiskAssessmentController` | `/v1/risk-assessments` | `RiskAssessmentController.java` |
| `MitigationMeasureController` | `/v1/mitigation-measures` | `MitigationMeasureController.java` |
| `InfrastructureItemController` | `/v1/infrastructure-items` | `InfrastructureItemController.java` |
| `PastDisasterController` | `/v1/past-disasters` | `PastDisasterController.java` |
| `FrameworkController` | `/v1/frameworks` | `FrameworkController.java` |
| `GisMapController` | `/v1/gis-map` | `GisMapController.java` |
| `MitigationDashboardController` | `/v1/mitigation/dashboard` | `MitigationDashboardController.java` |

(All paths are under the application context-path `/api`; the full URL is `/api/v1/...`.)

**Services** — one per aggregate, holding the legacy business logic:
`HazardService`, `RiskAssessmentService`, `MitigationMeasureService`, `InfrastructureItemService`, `PastDisasterService`, `FrameworkService`. The two read-only views (`GisMapController`, `MitigationDashboardController`) hold their SQL inline via `JdbcTemplate` rather than a service, and both delegate choropleth construction to the shared `RegionDataBuilder` (`RegionDataBuilder.java`).

**Entities** — JPA `@Entity` classes mapped onto existing tables (`@Table(schema = "public", ...)`):
`MitHazard` (table `hazards`; named `MitHazard` to avoid clashing with other modules' `Hazard`), `RiskAssessment`, `MitigationMeasure`, `InfrastructureItem`, `PastDisaster`, `DisasterRiskFramework`.

**Repositories** — Spring Data JPA: `MitHazardRepository`, `RiskAssessmentRepository`, `MitigationMeasureRepository`, `InfrastructureItemRepository`, `PastDisasterRepository`, `FrameworkRepository`.

**Request/response DTOs** — `*WriteRequest` (validated inbound bodies) and `*Responses` / `*IndexResponse` / `*DetailResponse` (outbound records).

**Frontend** — standalone Angular components under
`dmis-platform/frontend/src/app/pages/mitigation/`, routed under `m/prevention-mitigation/*` in `app.routes.ts` (all behind `authGuard`): `mitigation-dashboard`, `gis-map`, `hazards` (+ `hazard-create` / `hazard-edit`), `measures` (+ `measure-create`, reused for edit), `risk-assessments` (+ `risk-assessment-form` for create/edit), `infrastructure` (+ create/edit), `past-disasters` (+ create/edit). The GIS map is additionally exposed at `m/reports-analytics/gis-map`.

### 8.3 Data design

Tables pre-date the platform (created by Laravel); the Flyway migrations below mirror them locally with `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` so **production is never re-created or altered**. Migration files are under `dmis-platform/backend/src/main/resources/db/migration/`.

| Table | Created/extended by | Notes |
|---|---|---|
| `hazards` | base in `V3__ew_read_model.sql`; detail columns in `V6__hazards_detail_columns.sql` | `V6` adds `category`, `severity`, `frequency`, `typical_duration`, `seasonal_pattern`, `is_active` and seven JSON columns (`warning_signs`, `impact_areas`, `response_required`, `prevention_measures`, `historical_incidents`, `affected_sectors`, `vulnerability_factors`) |
| `infrastructure_items` | `V11__infrastructure_items_read_model.sql` | `status NOT NULL DEFAULT 'Unknown'`; `latitude`/`longitude` `NUMERIC(10,7)` |
| `risk_assessments` | `V12__risk_assessments_read_model.sql` | Largest table; `CHECK` constraints on `assessment_status`, `knowledge_type`, `visibility_level`; indexes on `assessment_code`, `risk_level`, `assessment_status`; FK `hazard_id → hazards(id) ON DELETE CASCADE` |
| `mitigation_measures` | `V9__mitigation_measures_read_model.sql` | Renamed from legacy `mitigation_strategies`; deliberately keeps **duplicate column pairs** (`implementing_institution` vs `implementing_institution_name`, `type_of_mitigation` vs `mitigation_type`) and `CHECK`s on `implementing_entity`, `type_of_mitigation`, `project_status`, `priority`, `approval_status`, `visibility_level` — load-bearing for legacy `store` behaviour |
| `past_disasters` | `V8__past_disasters_read_model.sql` | FK `hazard_id → hazards(id) ON DELETE SET NULL`; optional `report_document_path` |
| `disaster_risk_frameworks` | `V13__mitigation_dashboard_read_models.sql`; extended by `V14__frameworks_extra_columns.sql` | `V13` also creates the dashboard's auxiliary read tables (`strategic_projects`, `disaster_knowledge_repositories`, `training_plans`, `incidents`); `V14` adds `sectors_covered`, `key_stakeholders`, `related_documents` |

**Selected data dictionary — `risk_assessments` (the canonical record, `RiskAssessment.java` / `V12`).**

| Column | Type | Meaning |
|---|---|---|
| `assessment_code` | VARCHAR | Generated `RA-YYYYMM-####` (monthly sequence) |
| `plan_type` | VARCHAR | `anticipatory` \| `contingency` |
| `hazard_id` | BIGINT FK | Required reference into `hazards` |
| `location_name`, `district_council`, `ward`, `village` | VARCHAR | Geographic placement |
| `latitude`, `longitude` | NUMERIC(10,7) | Map placement (drives GIS markers + choropleth) |
| `population_at_risk`, `households_affected` | INTEGER | Exposure |
| `risk_level`, `likelihood`, `severity_of_impact` | VARCHAR | Risk inputs |
| `risk_matrix` | JSON | Computed scores (see §8.4 `calculateRiskMatrix`) |
| `economic_impact`, `mitigation_budget` | NUMERIC(15,2) | Money |
| `assessment_status` | VARCHAR + CHECK | `draft` → `under_review` → `approved` → `published` |
| `is_published` | BOOLEAN | True only after publish |
| `repository_entry_id` | VARCHAR UNIQUE | Generated `REP-YYYY-######` when a knowledge type is set |
| `version`, `version_history` | INTEGER / JSON | Versioning (every update appends an entry) |
| `attachments`, `risk_maps`, `hazard_maps`, `media_files` | JSON | Uploaded-file metadata arrays (`name`/`path`/`size`/`uploaded_at`) |

Note: the legacy schema carries columns the platform deliberately does **not** map/write (e.g. on `hazards` the seven JSON detail columns are `insertable=false, updatable=false` because no existing form writes them; on `mitigation_measures` the duplicate/legacy columns such as `description`, `mitigation_type`, `budget`). This keeps writes byte-for-byte compatible with the legacy app.

### 8.4 Key API endpoints

All paths below include the `/api` context-path. Gates are `@PreAuthorize` SpEL from `tz.go.pmo.dmis.common.security.Authz`:
`MITIGATION_MANAGE = hasAnyRole('Super Admin','ICT Admin','Director','Asst. Director','EOCC')` and
`MITIGATION_APPROVE = hasAnyRole('Super Admin','Director','Asst. Director','EOCC')` (excludes ICT Admin and MDA Focal so the author tier cannot self-approve).

| Method | Path | Gate | Purpose |
|---|---|---|---|
| GET | `/api/v1/hazards?page=` | `isAuthenticated()` | Hazard registry page + 4 stats + category/severity chart data |
| GET | `/api/v1/hazards/{id}` | `isAuthenticated()` | Full hazard detail (View modal) |
| POST | `/api/v1/hazards` | `MITIGATION_MANAGE` | Register a hazard (unique name enforced) |
| PUT | `/api/v1/hazards/{id}` | `MITIGATION_MANAGE` | Update a hazard |
| POST | `/api/v1/hazards/{id}/status` | `MITIGATION_MANAGE` | Toggle `is_active` |
| DELETE | `/api/v1/hazards/{id}` | `MITIGATION_MANAGE` | Delete, blocked if referenced by EW/plans (§8.5) |
| GET | `/api/v1/risk-assessments?page=` | `isAuthenticated()` | Priority-ordered page + aggregate stats + hazard options |
| GET | `/api/v1/risk-assessments/{id}` | `isAuthenticated()` | Full assessment (view/edit/history) |
| POST | `/api/v1/risk-assessments` (multipart) | `MITIGATION_MANAGE` | Create (full SRS set, draft/submit, code gen, file uploads) |
| PUT | `/api/v1/risk-assessments/{id}` (multipart) | `MITIGATION_MANAGE` | Update (narrower set, matrix recalc, version append) |
| DELETE | `/api/v1/risk-assessments/{id}` | `MITIGATION_MANAGE` | Delete record and its stored files |
| POST | `/api/v1/risk-assessments/{id}/approve` | `MITIGATION_APPROVE` | Approve (sets `approved_by`/`approved_date`) |
| POST | `/api/v1/risk-assessments/{id}/publish` | `MITIGATION_APPROVE` | Publish (only if `approved`) |
| GET | `/api/v1/mitigation-measures?page=` | `isAuthenticated()` | Measures registry + stats + priority chart |
| GET | `/api/v1/mitigation-measures/{id}` | `isAuthenticated()` | Full measure |
| POST | `/api/v1/mitigation-measures` | `MITIGATION_MANAGE` | Create a measure (full SRS field set) |
| PUT | `/api/v1/mitigation-measures/{id}` | `MITIGATION_MANAGE` | Update a measure |
| DELETE | `/api/v1/mitigation-measures/{id}` | `MITIGATION_MANAGE` | Delete a measure |
| GET | `/api/v1/infrastructure-items?page=` | `isAuthenticated()` | Registry + stats + map markers + form options |
| GET | `/api/v1/infrastructure-items/{id}` | `isAuthenticated()` | Full item |
| POST/PUT/DELETE | `/api/v1/infrastructure-items[/{id}]` | `MITIGATION_MANAGE` | Create / update / delete |
| GET | `/api/v1/past-disasters?page=` | `isAuthenticated()` | Records page + stats + chart + hazard options |
| GET | `/api/v1/past-disasters/{id}` | `isAuthenticated()` | Full record |
| POST/PUT (multipart) | `/api/v1/past-disasters[/{id}]` | `MITIGATION_MANAGE` | Create / update (optional report document) |
| DELETE | `/api/v1/past-disasters/{id}` | `MITIGATION_MANAGE` | Delete record and its document |
| GET | `/api/v1/frameworks?page=` | `isAuthenticated()` | Framework registry + stats + doughnut data |
| GET | `/api/v1/frameworks/{id}` | `isAuthenticated()` | Full framework |
| POST/PUT (multipart) | `/api/v1/frameworks[/{id}]` | `MITIGATION_MANAGE` | Create / update (attachment replace) |
| DELETE | `/api/v1/frameworks/{id}` | `MITIGATION_MANAGE` | Delete and remove attachment |
| GET | `/api/v1/gis-map` | `isAuthenticated()` | 5 marker layers + 4 stats + choropleth `regionData` |
| GET | `/api/v1/mitigation/dashboard` | `isAuthenticated()` | 6 counts + choropleth + 6 chart datasets + 3 recent tables |

### 8.5 Important design decisions and rationale

- **Faithful re-platform over the shared `public.*` tables.** Entities map onto the existing Laravel tables with `IF NOT EXISTS` migrations and read-only mappings for unused columns, so the Spring app and the legacy app can coexist on one database without schema divergence. This is the strangler-fig constraint applied module-wide.

- **Author/approver separation enforced at the gate.** `MITIGATION_MANAGE` (authoring) and `MITIGATION_APPROVE` (approve/publish) are distinct role sets. The `Authz` doc comments record *why*: a live test proved a read-only viewer could create and delete a hazard, and an MDA Focal could approve a risk assessment — both holes are now closed by these two gates.

- **Risk-matrix scoring is computed server-side, verbatim from legacy** (`RiskAssessmentService.calculateRiskMatrix`): `likelihood_score × severity_score = risk_score`, banded `≤4 Low`, `≤9 Medium`, `≤14 High`, `≤19 Very High`, else `Critical`. Likelihood/severity ordinals come from fixed vocabularies (`Rare…Almost Certain`, `Insignificant…Catastrophic`). Recomputed on both create and update so the matrix never drifts from inputs.

- **Generated identifiers.** Assessment codes are `RA-YYYYMM-####` scoped to the current month; repository entry ids are `REP-YYYY-######` scoped to the year. Both scan the latest existing row and increment, in `Africa/Dar_es_Salaam`. (See §8.7 for the collision caveat.)

- **Risk-assessment lifecycle.** `store` sets status to `under_review` (with `submitted_for_approval_at`) when `action=submit`, else `draft`. `approve` sets `approved`, records `approved_by` (the JWT numeric subject = `users.id`) and `approved_date`. `publish` is guarded — *only* an `approved` assessment can be published, flipping `is_published=true`. Files are stored under `dmis.storage.public-root` with UUID names and JSON metadata; `destroy` best-effort deletes them (a missing file never fails the delete).

- **Relation-guarded hazard deletion.** `HazardService.destroy` refuses deletion while the hazard is referenced by `early_warnings` (by id), or by `anticipatory_action_plans` / `contingency_plans` (by name), returning a `BusinessRuleException`. Each check is wrapped in a `to_regclass` existence probe so a standalone local DB lacking those tables does not error.

- **Choropleth built once, shared.** `RegionDataBuilder` is the single component both the dashboard and the GIS map use to colour Tanzania's 31 regions. It matches an assessment to a region by exact name on `district_council`/`location_name`, falling back to nearest region centre; measures are counted from the `coverage_area` JSON (`Region`/`Regions`/`Priority_regions`, plus `national` scope counting everywhere). All 31 centres — including the 5 Zanzibar regions that the legacy code dropped — are hard-coded so no assessment is silently lost.

- **Tolerant aggregate queries.** Both `GisMapController` and `MitigationDashboardController` wrap every SQL block in try/catch returning empty fallbacks (and the dashboard probes optional tables), mirroring the legacy controller's defensive style so a partially-seeded database still renders.

- **`MitigationMeasureController` exposes full CRUD on purpose.** The class comment notes the legacy `show/edit/update/destroy` routes had *no* controller methods and its `store` could never insert (missing NOT NULL `title`, non-fillable fields, value-casing mismatches). The platform repairs this: `title` mirrors `project_programme_name`, `implementing_institution`/`type_of_mitigation` are persisted with values mapped to the DB `CHECK`s, and `priority` is stored capitalised.

### 8.6 Integration points with other modules

- **Hazards are a cross-module reference.** `risk_assessments`, `past_disasters` and `mitigation_measures` carry `hazard_id`; deletion of a hazard is blocked while **Early Warning** (`early_warnings`) or **Response/Preparedness** plans (`anticipatory_action_plans`, `contingency_plans`) reference it.
- **GIS map is a cross-module read view.** `GisMapController` joins five domains onto one map: `infrastructure_items` and `risk_assessments` (this module), plus `incidents` (Response), `warehouses` (Preparedness/logistics) and `past_disasters`. It is surfaced both here (`risk-mapping`) and under Reports & Analytics (`reports-analytics/gis-map`).
- **Dashboard aggregates beyond the module.** Counts/recent-tables pull from `strategic_projects` and `disaster_knowledge_repositories` (Recovery), `training_plans` (Preparedness), and `mitigation_measures`/`disaster_risk_frameworks`.
- **Auth.** `approved_by` and `created_by` are populated from the authenticated principal's numeric subject (the self-issued HS256 JWT `sub = users.id` under the local persona filter / Keycloak in higher environments).
- **Shared front-end picker.** Risk-assessment forms use the platform's region/district hierarchy (TZ administrative data) for `district_council`/`ward`/`village`.

### 8.7 Known gaps, constraints and TODOs

- **Code-generation race.** `RA-YYYYMM-####` and `REP-YYYY-######` derive the next sequence by scanning the latest row and incrementing in application code; under concurrent creates this can collide (a recurring `count(*)+1`-style pattern in this codebase). No DB-level unique sequence enforces uniqueness on `assessment_code`.
- **Frameworks are filed under the wrong OpenAPI tag.** `FrameworkController` is tagged `Content Management`, not `Prevention & Mitigation`, despite living in this package and table set — a documentation/grouping inconsistency.
- **Legacy column debt retained on purpose.** `mitigation_measures` still carries duplicate/unused columns (`implementing_institution_name`, `mitigation_type`, `description`, `budget`, `affected_people`, etc.) and `hazards` carries seven unmapped JSON detail columns. They are kept for legacy/production compatibility, not used by the platform — a future clean-up item once the legacy app is retired.
- **No platform-wide approval engine for assessments.** Approve/publish are simple status transitions in `RiskAssessmentService`, independent of the generalized `ApprovalWorkflowEngine` used by Response/EW; there is no multi-step/maker-checker chain or rejection path beyond status fields.
- **Map data depends on coordinates.** GIS markers and choropleth only include rows with non-null `latitude`/`longitude`; assessments/items/disasters without coordinates are invisible on the map (though still counted in their own registries).
- **Read-only dashboard/GIS endpoints swallow SQL errors.** The defensive try/catch means a broken query or missing column degrades to empty data silently rather than surfacing an error — convenient for partial databases, but it can mask real failures.

---

## 09. One Health Module

The One Health module is e-MAAFA's cross-sector coordination workspace for events that span human, animal, and environmental health (zoonoses, epidemic-prone diseases, food safety, AMR, biosafety, climate-health). It captures a multi-sector event report, routes it through a fixed review-and-action workflow, lets the PMO issue directives to assigned institutions, disseminates alerts to stakeholders or the public, and tracks implementation to closure. It is a faithful re-platform of the legacy Laravel `OneHealth\*` controllers and `OneHealthService`, preserving the original authorization invariants and workflow semantics while fixing a set of known source bugs (tracked as OH-1..OH-14).

### 9.1 Purpose and Responsibilities

The module owns the full lifecycle of a One Health event:

- **Event intake** — capture a sector-tagged event (area of concern + optional concern item) with universal sub-sections for human cases, animal entries, and environmental conditions, plus a legacy category-based detail sub-form retained for backward compatibility.
- **Workflow** — drive an event through the status machine `submitted → under_review → directive_issued → disseminated → monitoring → closed → archived`, logging every transition to an immutable workflow history.
- **Directives** — let PMO oversight issue action directives to one or more assigned institutions, collect acknowledgements, and track per-stakeholder implementation progress with an audit trail of updates.
- **Dissemination** — author stakeholder-targeted or public alerts, gate them behind an approval step, fan them out to per-recipient delivery logs, and dispatch through the shared notification gateway after commit.
- **Action tracking** — manage discrete action items per event whose average completion rolls up into the event's completion percentage, and drive event closure/archive.
- **Dashboard** — 12-month trends, status breakdowns, 7-day sparklines, overdue directives, and top-region statistics.
- **EW integration** — accept auto-created `ew_alert` events kicked from the Early Warning publish flow (`source_warning_id` linkage).

A deliberate architectural choice: the module is implemented entirely with `JdbcTemplate` against the existing `oh_*` schema rather than JPA entities. It is a read/write port of a Laravel app's SQL behaviour, so hand-written SQL keeps payload shapes and query semantics verbatim-faithful to the source. There are no `@Entity` classes; the only DTO is `OhEventWriteRequest`.

### 9.2 Key Components

All backend sources live under `dmis-platform/backend/src/main/java/tz/go/pmo/dmis/onehealth/`.

| Component | File | Responsibility |
| --- | --- | --- |
| `OneHealthEventController` | `OneHealthEventController.java` | Event index (filters + KPI stats), form-data reference, store, full show hub, locked edit/update, review, quick-view, issue-directive, and AJAX location/area cascades. Base path `/v1/onehealth/events`. |
| `OneHealthEventService` | `OneHealthEventService.java` | `@Service` shared by all controllers. Event-ID generation (`OH-YYYY-NNNNN`), status/action labels and badge/icon helpers, `createEvent`, `review`, `issueDirective`, `updateEventStatus`/`logWorkflow`, `quickView`, `findEventOr404`, acting-user resolution, and scalar coercion helpers. |
| `OhEventWriteRequest` | `OhEventWriteRequest.java` | The only request DTO (Lombok `@Getter/@Setter`). Carries scalar event fields plus the universal `human` (map), `animals` (list of maps), `environment` (map) sections and the legacy `detail` map. |
| `OneHealthDirectiveController` | `OneHealthDirectiveController.java` | Directive registry + KPI stats, full show (acknowledgement + implementation matrices), update with stakeholder sync, acknowledge, escalate (reminders), respond (implementation update + auto-complete), and grouped implementation history. Base path `/v1/onehealth/directives`. |
| `OneHealthDisseminationController` | `OneHealthDisseminationController.java` | Dissemination index/show, dual-track store (stakeholder/public, multipart recipient-file capable), approve/reject (triggers send), acknowledge, resend, recipients lookup, and the `sendDissemination` fan-out. Injects `ExternalDeliveryService` and `MailService`. Base path `/v1/onehealth`. |
| `OneHealthActionTrackingController` | `OneHealthActionTrackingController.java` | Action-item index/store/update, progress slider (rolls up event completion), and the close/archive workflow. Base path `/v1/onehealth`. |
| `OneHealthDashboardController` | `OneHealthDashboardController.java` | Aggregate dashboard statistics. Base path `/v1/onehealth/dashboard`. |

**Supporting components (outside the package):**

- `tz.go.pmo.dmis.local.OneHealthLocalSeeder` — verbatim port of the Laravel `OneHealthSeeder`; seeds 14 government institutions, the 9 areas of concern, concern items, and the area↔stakeholder pivot. Guards on an empty `oh_areas_of_concern` count so it is idempotent.
- `tz.go.pmo.dmis.ew.EwWarningLifecycleController` — owns the EW→OH bridge (`createOhEventFromWarning`); see §9.7.
- `tz.go.pmo.dmis.notification.ExternalDeliveryService` / `MailService` — the shared async SMS+SMTP sender used by dissemination dispatch.

**Frontend** (`dmis-platform/frontend/src/app/pages/onehealth/`): standalone Angular 18 components — `dashboard`, `events` (+ `event-show`, `report-event-modal`), `directives` (+ `directive-show`), `disseminations` (+ `dissemination-show`), and `action-tracking`. Routes are registered in `frontend/src/app/app.routes.ts` under `m/one-health/*` (all behind `authGuard`), with `m/stakeholder-portal/one-health` reusing the events list.

### 9.3 Data Design

All tables are created by **`V15__one_health_read_models.sql`** in their final legacy-migration state (the comment header maps them to Laravel migrations `2026_02_05_000001..2026_03_26_000003`). Every `CREATE TABLE` uses `IF NOT EXISTS` so the migration is inert against a production database that already holds the `oh_*` schema. Two follow-on migrations adjust the schema:

- **`V20__oh_dissemination_stakeholders_ack_columns.sql`** — additively backfills `acknowledgement_status`, `acknowledged_at`, `acknowledged_by` on `oh_dissemination_stakeholders` (a source migration missed by the V15 stub).
- **`V72__index_foreign_keys_and_incident_filters.sql`** — adds the foreign-key covering indexes for every `oh_*` FK column (events, directives, disseminations, action trackings, comments, detail tables, and `oh_events.source_warning_id`).

`V15` also creates local **read-model stubs** for FK targets that are not owned by this module locally: `public.stakeholders` and `public.wards`. (`regions`, `districts`, `hazards`, `warnings`, `users`, `roles`, `model_has_roles` are provided by other modules' migrations.)

**Core tables (data dictionary):**

| Table | Purpose / key columns |
| --- | --- |
| `oh_areas_of_concern` | The 9 sectors. `code` (unique, e.g. `ZOONOTIC`, `EPT`, `FOOD_SAFETY`, `CLIMATE_HEALTH`, `AMR`, `BIOSAFETY`, `ENVIRONMENT`, `NCD`, `OTHER`), `name`, `category` (drives the legacy sub-form dispatch), `sort_order`, `is_active`. |
| `oh_concern_items` | Optional finer-grained item under an area; `area_of_concern_id` FK, `name`, `sort_order`, `is_active`. |
| `oh_area_stakeholder` | Pivot scoping which institutions belong to each area of concern. `UNIQUE(area_of_concern_id, stakeholder_id)`. **This is the area-scoping table** that drives the recipient/assignee lists for directives, disseminations, and action items (`asx` joins throughout). |
| `oh_events` | The root aggregate. `event_id` (unique `OH-YYYY-NNNNN`), `stakeholder_id` (reporting institution, NOT NULL), `area_of_concern_id` (NOT NULL), `concern_item_id`, `event_title`, `event_type CHECK IN ('hazard','outbreak','incident','other','ew_alert')`, `event_description`, `date_of_occurrence`, location (`region_id` NOT NULL, `district_id`, `ward_village`, `ward_id`, lat/long), `status` (7-state machine), `priority_level`, `risk_level`, review/closure columns, `completion_percentage`, **`source_warning_id` → `warnings(id)`** (EW linkage), `deleted_at` (soft delete). Indexed on `status` and `date_of_occurrence`. |
| `oh_event_environmental_details` | One-to-one universal/environmental sub-form: `hazard_id`, weather/temperature/rainfall/wind, `environmental_impact`. |
| `oh_event_health_details` | One-to-one human/health sub-form: disease name/status/transmission, `cases_male/female/children/total`, `deaths`, `admitted`, animal columns, `lab_results`. |
| `oh_event_agricultural_details` | One-to-one agriculture sub-form: crop/livestock, pest/disease, `area_affected_ha`, `severity_level`, `farmers_affected`. |
| `oh_event_food_safety_details` | One-to-one food-safety sub-form: product, source, reason, quantities, `people_affected`. |
| `oh_event_animal_entries` | One-to-many repeatable animal rows: `species`, `species_other`, `cases`, `deaths`, `notes`. |
| `oh_directives` | Action directives per event. `directive_title`, `action_description`, `deadline`, `priority_level`, `risk_level`, `coordination_notes`, `status CHECK IN ('draft','issued','acknowledged','in_progress','completed','overdue')`, `issued_by`, `issued_at`, `deleted_at`. Indexed on `deadline`. |
| `oh_directive_stakeholder` | Directive→institution pivot carrying the acknowledgement + current-implementation state per recipient: `acknowledgement_status CHECK ('pending','acknowledged','declined')`, `acknowledged_at`, `response_notes`, `implementation_status`, `implementation_percentage`, `implementation_notes`, `last_update_at/by`. `UNIQUE(directive_id, stakeholder_id)`. |
| `oh_directive_implementation_updates` | Append-only audit trail of implementation responses: `stakeholder_id`, `user_id`, `implementation_status`, `implementation_percentage`, `update_notes` (NOT NULL), `challenges`, `expected_completion_date`. |
| `oh_disseminations` | Alert record. `dissemination_type CHECK ('stakeholder','public')`, `alert_message`/`alert_message_sw`, `target_audience` (JSON), `channels` (JSON), `language`, `sector`, `directives` (≤500), `approval_status CHECK ('pending','approved','rejected')`, approval/sent audit columns, `status CHECK ('draft','pending_approval','approved','sent','failed')`, `sms_sent_count`/`email_sent_count`, `uploaded_file`, `uploaded_recipients` (JSON). |
| `oh_dissemination_stakeholders` | Dissemination→institution pivot (stakeholder track) + ack columns added by V20. `UNIQUE(dissemination_id, stakeholder_id)`. |
| `oh_dissemination_logs` | One row per recipient per channel: `channel`, `recipient`, `status CHECK ('pending','sent','delivered','failed')`, `response_data`, `external_id`. Written `pending` on dispatch; the async gateway flips it to sent/failed. |
| `oh_action_trackings` | Action items: `directive_id` (nullable), `stakeholder_id` (nullable), `action_title`, `completion_percentage`, `status CHECK ('pending','in_progress','completed','overdue')`, `target_date`, `completed_date`, `remarks`. |
| `oh_event_workflow_histories` | Immutable transition log: `from_status`, `to_status`, `action`, `performed_by_role`, `comments`, `metadata`, `ip_address`. |
| `oh_event_comments` | Threaded event comments (`parent_id` self-FK, `comment_type`); schema present and indexed but not yet wired to a controller (see §9.8). |

### 9.4 Key API Endpoints

All paths are prefixed with the application context-path `/api`. Read endpoints (index/show/dashboard/cascades/recipients lookup) carry no `@PreAuthorize` and are visibility-read-all, faithful to the source. Write endpoints are gated by the `Authz.OH_*` constants (§9.5).

| Method | Path | Gate | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/onehealth/dashboard` | — | Aggregate dashboard statistics (trends, status, sparkline, regions, recent). |
| GET | `/api/v1/onehealth/events` | — | Event registry: filters, pagination (15/page), and global KPI stats. |
| GET | `/api/v1/onehealth/events/form-data` | — | Reference data for the registry/create screen (areas, regions, statuses, institutions, hazards). |
| POST | `/api/v1/onehealth/events` | `OH_REPORT_EVENT` | Create + submit an event with its universal sections and legacy detail. |
| GET | `/api/v1/onehealth/events/{id}` | — | Full event hub: event, all detail sub-forms, directives with ack/impl matrices, disseminations, actions, workflow history, area stakeholders. |
| GET | `/api/v1/onehealth/events/{id}/edit` | — | Returns HTTP 403 — events are locked after submission (source invariant). |
| PUT | `/api/v1/onehealth/events/{id}` | `SUPER_ADMIN_ONLY` | Returns HTTP 403 — locked; gate is defense-in-depth over a service-layer lock. |
| POST | `/api/v1/onehealth/events/{id}/review` | `OH_APPROVE` | Record review comments/priority/risk and advance to `under_review`. |
| GET | `/api/v1/onehealth/events/{id}/quick-view` | — | Compact event summary (directives, actions, dissemination summary, history). |
| POST | `/api/v1/onehealth/events/{id}/directives` | `OH_OPERATE` | Issue a directive to one or more stakeholders; advances event to `directive_issued`. |
| GET | `/api/v1/onehealth/events/{regionId-or-areaId}` cascades: `/districts/{regionId}`, `/wards/{districtId}`, `/concern-items/{areaId}`, `/area-stakeholders/{areaId}` | — | AJAX cascade lookups for the create/dissemination/action forms. |
| GET | `/api/v1/onehealth/directives` | — | Directive registry with filters (`status`, `priority`, `event_id`, dates, `mine`) and KPI stats. |
| GET | `/api/v1/onehealth/directives/{id}` | — | Full directive show with stakeholder ack/impl tables and area-stakeholder edit checklist. |
| PUT | `/api/v1/onehealth/directives/{id}` | `OH_OPERATE` | Update directive fields and sync the stakeholder set (attach/detach, keep pivot data). |
| POST | `/api/v1/onehealth/directives/{id}/acknowledge` | `OH_ACKNOWLEDGE` | Stakeholder-session acknowledgement; PMO/admin sessions get the source 403 ("not associated with a stakeholder"). |
| POST | `/api/v1/onehealth/directives/{id}/escalate` | `OH_OPERATE` | Send SMS/email reminders to unacknowledged stakeholders (gateway wiring logged locally). |
| POST | `/api/v1/onehealth/directives/{id}/respond` | `OH_RESPOND` | Submit an implementation update for a chosen attached institution; auto-completes the directive when all reach 100%. |
| GET | `/api/v1/onehealth/directives/{id}/implementation-history` | — | Implementation updates grouped by stakeholder. |
| GET | `/api/v1/onehealth/disseminations` | — | Dissemination registry with filters and KPI stats. |
| GET | `/api/v1/onehealth/disseminations/{id}` | — | Dissemination show: parsed channels/audience, stakeholders, delivery logs (capped 50) + log stats. |
| POST | `/api/v1/onehealth/events/{eventId}/disseminations/stakeholder` | `OH_DISSEMINATE` | Create a stakeholder-targeted alert (multipart or JSON; optional recipient file); `pending_approval`. |
| POST | `/api/v1/onehealth/events/{eventId}/disseminations/public` | `OH_DISSEMINATE` | Create a public alert (target audience + channels); `pending_approval`. |
| POST | `/api/v1/onehealth/disseminations/{id}/approve` | `OH_APPROVE` | Approve (triggers send) or reject a dissemination. |
| POST | `/api/v1/onehealth/disseminations/{id}/acknowledge` | `OH_ACKNOWLEDGE` | Stakeholder ack; PMO sessions get the source 403. |
| POST | `/api/v1/onehealth/disseminations/{id}/resend` | `OH_APPROVE` | Re-run the send fan-out. |
| GET | `/api/v1/onehealth/disseminations/recipients` | — | Recipient lookup for the creation modal (`type=stakeholder` → area-scoped; `public` → all active). |
| GET | `/api/v1/onehealth/events/{eventId}/actions` | — | Action-tracking index for an event (actions, directives, area stakeholders). |
| POST | `/api/v1/onehealth/events/{eventId}/actions` | `OH_OPERATE` | Create an action item. |
| PUT | `/api/v1/onehealth/actions/{id}` | `OH_OPERATE` | Edit an action item (partial-update via `coalesce`/`case` guards). |
| POST | `/api/v1/onehealth/actions/{id}/progress` | `OH_OPERATE` | Quick progress update; recomputes and rolls up event completion. |
| POST | `/api/v1/onehealth/events/{eventId}/close` | `OH_APPROVE` | Close an event with outcome summary/lessons; sets completion to 100. |
| POST | `/api/v1/onehealth/events/{eventId}/archive` | `OH_APPROVE` | Archive (only `closed` events). |

### 9.5 Authorization Model

The `OH_*` gates are defined as Spring SpEL constants in `tz.go.pmo.dmis.common.security.Authz` and applied via `@PreAuthorize`. They mirror the Laravel `OhEvent`/`OhDirective`/`OhDissemination` `can*()` checks and intentionally separate the maker/checker and recipient/operator roles:

| Constant | Roles granted | Used on |
| --- | --- | --- |
| `OH_REPORT_EVENT` | Super Admin, ICT Admin, EOCC, Director, Asst. Director, MDA Focal, RAS, Reg DC, DAS, Dist DC | Event store. |
| `OH_APPROVE` | Super Admin, EOCC, Director, Asst. Director | Event review, dissemination approve/resend, event close/archive. |
| `OH_OPERATE` | Super Admin, ICT Admin, EOCC, Director, Asst. Director | Issue directive, directive update, escalate, action create/edit/progress. |
| `OH_DISSEMINATE` | `OH_OPERATE` set + Comms Officer | Author (draft) stakeholder/public disseminations — Comms can author but not approve. |
| `OH_ACKNOWLEDGE` | Super Admin, Partners, MDA Focal, RAS, Reg DC, DAS, Dist DC | Recipient-stakeholder acknowledgement (the documented Partners-allowed exception). |
| `OH_RESPOND` | `OH_OPERATE` set + Partners, MDA Focal, RAS, Reg DC, DAS, Dist DC | Submit directive implementation responses (with a per-row attachment guard in the service). |

Notes:

- **Method security** is active only in the local profile per the platform's persona-filter dev setup; in production these gates evaluate against Keycloak-issued roles.
- **Acting-user resolution** (`OneHealthEventService.actingUserId`): a numeric JWT `sub` is treated as `users.id`; the local profile's synthetic subject is non-numeric, so NOT NULL audit columns fall back to the seeded `admin@example.com` account (then `min(id)`). Production tokens carry the numeric id directly.
- The `acknowledge` endpoints deliberately return 403 for PMO/admin sessions because those sessions carry no stakeholder linkage — this is the exact source response, not a defect.
- Local sessions are treated as Super Admin, so several show payloads set `can_edit`/`can_approve`/`can_issue_directive`/`can_review` to `true`.

### 9.6 Important Design Decisions

- **Events are immutable after submission.** `createEvent` inserts directly as `submitted`; there is no draft state. `GET /{id}/edit` and `PUT /{id}` both return 403 unconditionally (the Laravel `OhEvent::canBeEditedBy` is always false). The `index` payload reports `can_edit=false` for every row. This is the OH-6 invariant, preserved by design.
- **Universal sections vs. legacy sub-form.** `createEvent` persists the three universal sections (`human` → `oh_event_health_details`, `animals` → `oh_event_animal_entries`, `environment` → `oh_event_environmental_details`) only when a non-empty/non-zero value is present (`hasAnyValue`). It then *also* dispatches the legacy `detail` map by the area's `category` (`createSubFormDetails`) for backward compatibility (fixes OH-2/OH-3, where the universal sections were never serialized and the animal-entry row was dead).
- **Event type rule (OH-4).** The store accepts `outbreak`/`incident`/`other`; `ew_alert` is reserved exclusively for the EW→OH bridge and `hazard` is a legacy value retained in the CHECK constraint but not offered by the UI.
- **Status machine is explicit and audited.** Every transition flows through `updateEventStatus` → `logWorkflow`, which resolves the actor's role from `roles`/`model_has_roles` and writes an `oh_event_workflow_histories` row. Status is advanced as a side effect of business actions (review → `under_review`, first directive → `directive_issued`, first send → `disseminated`).
- **Dissemination is maker-checker with no gateway I/O inside the transaction.** Authoring creates a `pending_approval` record; `approve` flips approval state and calls `sendDissemination`, which writes per-recipient `oh_dissemination_logs` as `pending` and sets `sms_sent_count/email_sent_count = 0`. The real gateway call (`ExternalDeliveryService.deliverOhDissemination`) is registered as an `afterCommit` synchronization so the `pending` logs are committed and visible before the async sender flips them to sent/failed and writes the true counts. This deliberately removes the source's hardcoded `'sent'` status (the async sender owns the truth).
- **Public SMS is capped** at `MAX_PUBLIC_RECIPIENTS = 100` (`config('services.mgov.max_public_recipients')`). SMS bodies are prefixed verbatim: `"ONE HEALTH ALERT: "` (stakeholder) / `"PMO-DMD ONE HEALTH PUBLIC ALERT: "` (public).
- **Public-track region matching by name.** The local `stakeholders` stub has a `region` TEXT column (no `region_id`); the source's `region_id` filter would 500, so public dissemination matches by the event's region *name* and falls back to all active stakeholders when the event has no region.
- **Directive auto-completion.** On `respond`, after writing the audit row and updating the pivot, the controller marks the directive `completed` if every attached stakeholder is at 100%.
- **Action completion roll-up.** `actions/{id}/progress` recomputes `avg(completion_percentage)` for the event's actions and writes it to `oh_events.completion_percentage`, deriving the action's own status from the percentage.
- **OH-11 / OH-12 / OH-13 fixes.** Close/archive are gated on `OH_APPROVE` (the source gated them on the always-false `canBeEditedBy`, making them unreachable). `respond` requires an explicit `stakeholder_id` ("on behalf of" select) with a per-row attachment guard, fixing the NOT NULL `stakeholder_id` 500. The registry approve flow no longer 500s.
- **Pagination is fixed at 15 rows** across event/directive/dissemination registries, matching Laravel's default; KPI `stats` are global (not filter-scoped), also faithful to the source.

### 9.7 Integration Points

- **Early Warning → One Health (the cross-sector kick).** When a warning is published, `EwWarningLifecycleController.createOhEventFromWarning` (called non-fatally on publish only — Laravel called it on both ingest and publish, producing a duplicate, which this port avoids) auto-creates an `oh_events` row with `event_type='ew_alert'`, `status='submitted'`, the warning's first region-bearing hazard's location, and `source_warning_id` set to the originating `warnings.id`. Idempotency: it first checks for an existing OH event linked to the same `source_warning_id` and reuses it. Area resolution maps hazard names/types to an area code via `OH_NAME_OVERRIDES` (e.g. rabies/anthrax/avian → `ZOONOTIC`, cholera/dengue/malaria → `EPT`, locust/aflatoxin → `FOOD_SAFETY`), defaulting to `CLIMATE_HEALTH`; warning level maps to priority/risk. The reporting stakeholder is resolved to the PMO Disaster Management institution. The event show query joins `warnings` to surface `source_warning_id` as `source_warning_code`; the dashboard reports `ew_alerts_active`.
- **Notification backbone.** Dissemination dispatch uses the shared `ExternalDeliveryService.deliverOhDissemination(dissId, smsPhones, emailAddrs, smsBody, emailSubject, emailHtml)` and `MailService.wrap(...)` from the `notification` package — the single async SMS+SMTP sender. Escalation reminders currently log only (gateway wiring deferred).
- **Reference data shared across modules.** The module reads `regions`, `districts`, `wards`, `hazards`, `warnings`, `users`, `roles`, and `model_has_roles` owned by other modules. `stakeholders` and `wards` are read-model stubs created locally by V15.
- **Frontend.** Angular routes `m/one-health/*` (and the stakeholder-portal alias) proxy `/api` → `:8080`. The Python EW generate-engine (`:8600`) is upstream of the EW publish flow only and does not call this module directly.

### 9.8 Known Gaps, Constraints, and TODOs

- **xlsx recipient parsing is deferred (OH-14).** `storeRecipientFile` parses CSV uploads (Name, Phone, Email, Organization columns) into `uploaded_recipients`; `.xlsx`/`.xls` files are stored as-is and not parsed (needs a spreadsheet library).
- **`oh_event_comments` is unwired.** The table and its indexes exist but no controller exposes threaded event comments.
- **Escalation reminders are not actually sent.** `escalate` logs SMS/email reminders with a "gateway wiring deferred" note rather than calling the delivery service; only the dissemination send/resend path uses the real gateway.
- **Acknowledgement endpoints are inert for PMO sessions** by design (no stakeholder linkage → 403). True stakeholder-session acknowledgement requires a stakeholder-scoped principal, which the local persona filter does not model.
- **No filter-scoped KPI stats.** Registry `stats` blocks are computed globally, matching the source; a filtered dataset still shows global counts.
- **`source_warning_id` duplicate-on-ingest avoided.** The port runs the EW kick on publish only; if EW ingest semantics change, the idempotency guard (lookup by `source_warning_id`) is the safety net.
- **Edit/update are permanently 403.** There is no supported path to amend a submitted event's core fields; corrections must be made through directives, actions, review comments, or closure outcome — an intentional constraint inherited from the source.

---

## 10. Recovery, Disaster Repository & Reports

This section documents three related back-end domains that close the disaster-management lifecycle: **Recovery** (long-term reconstruction programs, strategic projects, relief logging and the lessons-learned knowledge library), the **Sendai Disaster Repository** (the national disaster loss database of validated event cards plus the Sendai Framework analytics), and the cross-cutting **Reports & Analytics** package. For executives: Recovery records what is rebuilt and learned after a disaster; the Repository is the institution's permanent, validated memory of disaster losses in the exact shape Tanzania reports to the UN Sendai Framework Monitor; and Reports turns operational data into the date-ranged management reports leadership reviews. All three are read-heavy, are built on `JdbcTemplate` against the shared `public` schema, and are deliberately wired together so post-disaster recovery and loss accounting reuse the same incidents, resources and warnings the operational modules produced.

### 10.1 Scope and package layout

| Package (under `tz.go.pmo.dmis`) | Domain | Files |
|---|---|---|
| `recovery` | Recovery programs, reconstruction projects, relief distribution, knowledge/lessons repository | `RecoveryProgramController`, `StrategicProjectController`, `ReliefDistributionController`, `KnowledgeRepositoryController` |
| `repository` | Sendai disaster loss database + analytics | `DisasterEventController`, `DisasterEventService`, `SendaiAnalyticsController`, `SendaiAnalyticsService` |
| `reports` | Management/analytical reports | `IncidentReportController`, `ResourceReportController`, `EwManagementController` |

All controllers are thin `@RestController`s. The Recovery and Reports controllers hold their SQL inline (no service layer); the Repository domain alone splits logic into `DisasterEventService` / `SendaiAnalyticsService` because of the multi-table card lifecycle and the analytics aggregation. Every endpoint returns a plain `Map<String, Object>` JSON envelope (registry rows + `stats` + filter option lists) consumed directly by the Angular pages.

> Note on UI placement: although the Sendai repository lives in the `repository` Java package, its Angular screens (`pages/reports/repository-events`, `repository-event-detail`, `sendai-analytics`) sit under **Reports & Analytics** in the frontend, alongside the `reports` package screens. The Recovery screens live under `pages/recovery/*`. Frontend calls `/api/...` and the dev proxy forwards `/api`→`:8080`.

---

### 10.2 Recovery module

**Purpose / responsibilities.** A faithful port of four Laravel recovery sub-modules into Spring controllers, covering the post-response phase: long-term recovery programs, risk-managed reconstruction ("strategic") projects, relief-item distribution logging, and a searchable lessons-learned knowledge library. Each sub-module follows the same shape — a filtered `GET` index returning rows + aggregate `stats` + option lists, a `POST` create, and a status/approval transition — and each write is gated by a Recovery `@PreAuthorize` constant from `common/security/Authz`.

#### Key components

| Sub-module | Controller (file) | Base path | Primary table |
|---|---|---|---|
| Recovery Programs | `recovery/RecoveryProgramController.java` | `/api/v1/recovery/recovery-programs` | `recovery_programs` |
| Strategic / Reconstruction Projects | `recovery/StrategicProjectController.java` | `/api/v1/recovery/strategic-projects` | `strategic_projects` |
| Relief Distribution | `recovery/ReliefDistributionController.java` | `/api/v1/recovery/relief-distributions` | `relief_distributions` |
| Knowledge / Lessons Learned | `recovery/KnowledgeRepositoryController.java` | `/api/v1/recovery/knowledge` | `disaster_knowledge_repositories` |

#### Lifecycles (status enumerations, enforced in-controller)

- **Recovery programs** — `Planning → Ongoing → Completed`, plus `Suspended` / `Cancelled` (constant `STATUSES` in `RecoveryProgramController`). Marking a program `Completed` auto-stamps `actual_completion_date = current_date`.
- **Strategic projects** — `Mobilization → Construction → Operational`, plus `Stopped / Decommissioning / Closure / Other`. Each project is auto-assigned a human code `SP-NNNN` on create.
- **Relief distributions** — `Pending Verification → Confirmed` (DB `CHECK` also allows `Disputed`). Created rows always start `Pending Verification` (hard-coded in the insert); a separate confirm step flips them to `Confirmed`.
- **Knowledge entries** — `Pending → Approved` (column `approval_status`, mirrored to `status`). The 7 content types are constrained in code (`Case Study`, `Best Practice`, `Lesson Learned`, `Research Report`, `Technical Guide`, `Guideline`, `Bulletin`).

#### Authorization (the RECOVERY_MANAGE gate and siblings)

Recovery uses four constants from `Authz.java`, implementing maker/checker separation:

| Constant | Roles | Used by |
|---|---|---|
| `RECOVERY_MANAGE` | Super Admin, Director, Asst. Director, EOCC, MDA Focal | create program, create project, create relief log, set project status |
| `RECOVERY_OVERSIGHT` | Super Admin, Director, Asst. Director, EOCC | set program status, confirm relief distribution (supervisory transitions) |
| `RECOVERY_APPROVE` | Super Admin, Director, Asst. Director, Secretary | approve/publish a knowledge entry |
| `RECOVERY_KNOWLEDGE_SUBMIT` | adds Comms Officer to the MANAGE set | submit a pending knowledge entry |

Read (`index`) endpoints are mixed: `recovery-programs` and `relief-distributions` index are gated `RECOVERY_MANAGE`; `strategic-projects` and `knowledge` index carry **no** `@PreAuthorize` (they rely on the global authenticated-by-default filter — see gap 10.5).

#### Data design (created by `V47__recovery_and_sms_modules.sql`)

`recovery_programs` and `relief_distributions` are created in full by V47. `strategic_projects` and `disaster_knowledge_repositories` were first created minimally by `V13__mitigation_dashboard_read_models.sql` and then **additively extended** by V47 (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) — V47 never recreates them, preserving existing data.

`relief_distributions` (selected columns):

| Column | Type | Notes |
|---|---|---|
| `incident_id`, `damage_assessment_id` | bigint FK | traces relief back to the response record (FK `ON DELETE SET NULL`) |
| `resource_id` | bigint FK → `resources` | the relief item; joins to `resources` for name/category |
| `distributing_agency_id` | bigint FK → `agencies` | who handed it out |
| `quantity_distributed` | numeric(12,2) | must be > 0 (validated in `store`) |
| `beneficiary_name_or_group`, `beneficiary_contact`, `beneficiary_identifier` | varchar | recipient |
| `confirmation_status` | varchar `CHECK (Pending Verification \| Confirmed \| Disputed)` | default `Pending Verification` |

`recovery_programs`: `program_name` is `UNIQUE` (create rejects duplicates with `BusinessRuleException`); `status` has a DB `CHECK`; `total_budget_allocated numeric(16,2)`, `currency` default `TZS`; FKs to `incidents`, `agencies`, `users`.

`strategic_projects` (V13 base + V47 additions): `entry_id` `UNIQUE` (the `SP-NNNN` code); JSON columns `location`, `risk_hazard_names`, `impacts_identified` (the controller serializes/deserializes these via Jackson and unwraps PostgreSQL `PGobject`); `has_management_plan boolean`; `budget numeric(16,2)`.

`disaster_knowledge_repositories` (V13 base + V47 additions): carries **dual** column families — the V13 originals (`content_title`, `content_type`, `visibility_level`) and the Lessons-Learned screen's columns (`title`, `document_type`, `disaster_date`, `date_of_publication`, `uploader_name`, `uploader_institution`, `approval_status`, `approval_date`, `downloads_count`, `version`). The controller `COALESCE`s the two families on read (`coalesce(content_title, title)`, `coalesce(content_type, document_type)`) and writes both on create, so either generation of data renders correctly.

> V47 also creates `sms_logs` (the SMS Management log). That table belongs to the Communication Center domain, not Recovery proper, and is documented there.

#### Recovery API endpoints

| Method | Path | Gate | Purpose |
|---|---|---|---|
| GET | `/api/v1/recovery/recovery-programs` | `RECOVERY_MANAGE` | List programs (filters: status, search) + stats, by-type, agency/incident option lists |
| POST | `/api/v1/recovery/recovery-programs` | `RECOVERY_MANAGE` | Register a recovery program (unique name) |
| POST | `/api/v1/recovery/recovery-programs/{id}/status` | `RECOVERY_OVERSIGHT` | Set program status; `Completed` stamps actual completion date |
| GET | `/api/v1/recovery/strategic-projects` | *(none)* | List projects (filters: status, sector, search) + stats, by-sector |
| POST | `/api/v1/recovery/strategic-projects` | `RECOVERY_MANAGE` | Register a project; auto-assign `SP-NNNN` |
| POST | `/api/v1/recovery/strategic-projects/{id}/status` | `RECOVERY_MANAGE` | Set project lifecycle status |
| GET | `/api/v1/recovery/relief-distributions` | `RECOVERY_MANAGE` | List relief logs (filters: status, search) + stats, by-resource, option lists |
| POST | `/api/v1/recovery/relief-distributions` | `RECOVERY_MANAGE` | Record a relief distribution (qty > 0) |
| POST | `/api/v1/recovery/relief-distributions/{id}/confirm` | `RECOVERY_OVERSIGHT` | Confirm a pending distribution |
| GET | `/api/v1/recovery/knowledge` | *(none)* | List/search knowledge entries (filters: type, approval, search) + stats |
| POST | `/api/v1/recovery/knowledge` | `RECOVERY_KNOWLEDGE_SUBMIT` | Submit a knowledge entry (status Pending) |
| POST | `/api/v1/recovery/knowledge/{id}/approve` | `RECOVERY_APPROVE` | Approve & publish an entry |

#### Integration points

- **Response module** — relief distributions link to `incidents` and `damage_assessments`; recovery programs link to `incidents`; relief items resolve against the shared `resources` catalogue. The relief log is described in-code as "the recovery counterpart of the response dispatch chain."
- **Agencies registry** — programs and relief logs reference `agencies` (lead/distributing agency).
- **Knowledge loop** — the lessons library is the documented mechanism that feeds learnings back into the next mitigation/preparedness cycle.

---

### 10.3 Sendai Disaster Repository

**Purpose / responsibilities.** The national disaster loss database, modelled on the UNDRR **DesInventar-Sendai "event card"** methodology. One `disaster_events` card per disaster carries per-administrative-unit effects (`disaster_event_effects`) with full Sendai disaggregation, and polymorphic links (`disaster_event_links`) binding the card to everything DMIS already knows about that disaster (warnings → incidents → assessments → dispatches). Cards move `Open → Validated → Archived`; **only Validated/Archived figures feed the analytics**, so the national numbers never drift while a card is still being edited. For executives: this is the validated, citable record of "what each disaster cost the country," in the exact form reported to the Sendai Framework Monitor.

#### Key components

- `repository/DisasterEventController.java` — REST surface for the registry, event cards, effects records and links.
- `repository/DisasterEventService.java` — all card logic: registry query, full card assembly, lifecycle transitions, effects upsert, link management, link suggestions, and the "pull from links" pre-fill.
- `repository/SendaiAnalyticsController.java` / `SendaiAnalyticsService.java` — the Sendai dashboard (targets A–G, trends, profiles, the auto-computed insight layer).
- `local/SendaiLocalSeeder.java` (`@Profile("local")`, `@Order(24)`) — seeds the Sendai indicator reference (A-1…G-6), national baselines (2022 census population, GDP), and two real, fully-sourced validated event cards (Hanang landslide 2023; 2023/24 El Niño floods) plus historical cards.

#### Card lifecycle and the validation freeze

`transition(id, action, actor)` in `DisasterEventService` implements the state machine:

- **validate** — only an `Open` card may be validated, and it must have **at least one effects record** (else HTTP 409). Stamps `validated_by` / `validated_at` and moves to `Validated`. This is the point at which figures enter the Sendai analytics.
- **reopen** — clears validation and returns to `Open` (so validated history is *corrected*, never silently overwritten).
- **archive** — only a `Validated` card may be archived.

Edits, effects writes, and deletes are guarded by `requireEditable()`, which throws HTTP 409 unless the card is `Open` ("Card is Validated — reopen it before editing"). Deletes are restricted to `Open` cards. This freeze is the central design decision: the repository is an audit-grade dataset, so once validated, figures are immutable unless explicitly reopened.

#### Polymorphic links and "capture the invisible"

`disaster_event_links` is a single polymorphic table. The set of linkable entity types is a closed map (`LINKABLE`) so there are no dead options — each maps to a real DMIS table:

`incident → incidents`, `early_warning → early_warnings`, `threat → threats`, `alert → alerts`, `damage_assessment → damage_assessments`, `response_activation → response_activations`, `allocated_resource → allocated_resources`, `public_hazard_report → public_hazard_reports`, `oh_event → oh_events`, `past_disaster → past_disasters`, `evacuation_center → evacuation_centers`.

`addLink` validates the target row exists in its real table before inserting, and uses `ON CONFLICT ON CONSTRAINT uq_event_entity DO NOTHING` for idempotency. Two helpers reduce manual work:

- **`linkSuggestions`** — surfaces hazard/time-matched incidents (±14d), early warnings (−30d/+14d), damage assessments (−14d/+60d) and threats inside the event window that are *not yet linked*, so EOCC officers can see what the system already recorded around the disaster.
- **`pullFromLinks`** — aggregates casualty figures from linked incidents and economic loss from linked assessments into a pre-fill payload. The system **never auto-writes Sendai figures**; the officer reviews, assigns to region/district, and saves.

#### Data design

The Repository tables were created by `V38__disaster_repository_sendai.sql`, relocated to the `public` schema by `V39__disaster_repository_public_schema.sql` (V38 had unqualified names that Flyway placed in the `platform` schema), and extended by `V61__disaster_effects_official_report_fields.sql`.

`disaster_events`:

| Column | Type | Notes |
|---|---|---|
| `event_code` | varchar(20) `UNIQUE` | `DE-YYYY-NNNN`, system-assigned |
| `name`, `started_on` | required | minimal create inputs |
| `hazard_id` | bigint FK → `hazards` (`ON DELETE SET NULL`) | |
| `hazard_type` | varchar(100) | denormalized hazard name (survives hazard edits) |
| `glide_number` | varchar(30) | GLIDE id when issued |
| `ended_on`, `primary_region`, `scope` | | `scope` default `District` (Ward/District/Regional/National) |
| `triggering_event`, `data_source` | text/varchar | provenance |
| `status` | varchar(20) default `Open` | Open / Validated / Archived |
| `recorded_by`, `validated_by`, `validated_at` | | audit fields |
| `gov_response_tzs`, `response_actions` | numeric / text (V61) | government relief disbursed + actions narrative (reproduces the official PMO sitrep JEDWALI Na.2) |

`disaster_event_effects` (one row per administrative unit; the Sendai-disaggregated figures):

| Group | Columns |
|---|---|
| Target A — mortality | `deaths_male`, `deaths_female`, `deaths_total`, `missing_total` (sex-disaggregated) |
| Target B — affected | `injured_total`, `directly_affected`, `displaced`, `relocated`, `children_affected`, `pwd_affected`, `houses_destroyed`, `houses_damaged`, `households_affected` (V61, KAYA) |
| Target C — economic loss (TZS, by sector) | `agriculture_loss_tzs`, `livestock_lost`, `crops_destroyed_ha`, `housing_loss_tzs`, `infrastructure_loss_tzs`, `other_loss_tzs`, `total_loss_tzs` (maintained = Σ of sector columns) |
| Target D — infrastructure & services | `schools_damaged`, `health_facilities_damaged`, `roads_km_damaged`, `bridges_damaged`, `water_systems_damaged`, `power_systems_damaged`, `services_disrupted`, `classrooms_damaged` (V61), `religious_facilities_damaged` (V61), `roads_damaged` (V61 count, distinct from km) |
| Provenance | `notes`, `source` |

FK to `disaster_events` is `ON DELETE CASCADE`. The V61 additions exist so the repository can reproduce the official PMO loss sheet (JEDWALI Na.1, "TAARIFA YA MAAFA MBALIMBALI") 1:1.

`disaster_event_links`: `event_id` (FK CASCADE), `entity_type` varchar(40), `entity_id`, `note`, `linked_by`, with `CONSTRAINT uq_event_entity UNIQUE (event_id, entity_type, entity_id)`.

`sendai_indicators`: reference list `code` (`A-1`…`G-6`) `UNIQUE`, `target_letter`, `title`, `unit`, `computed_from` — seeded by `SendaiLocalSeeder`, used to label every chart with its official Monitor indicator.

`sendai_baselines`: key-value normalization denominators — `metric` (`population`, `gdp_tzs`, `usd_rate`), `year`, `value`, `source`, with `UNIQUE (metric, year)`. Editable per-year without schema changes.

#### Notable correctness fixes encoded in the service (design decisions)

- **Gap-safe event code generation** — the create path computes the next `DE-YYYY-NNNN` suffix from `MAX(numeric suffix)+1` of *this year's* codes, **not** `count(*)+1`. Using count left a permanent gap after any delete and caused every later create to collide on the `UNIQUE` code.
- **ISO-date validation before use** — `startedOn`/`endedOn` are parsed with `LocalDate.parse` and rejected with HTTP 400 if malformed. A range/garbage date (e.g. `2025-12-24/25-26`, or a bare year) previously blew up as a 500 or a misleading 409.

These correspond to recurring failure patterns the team tracks (the `count(*)+1` collision and range-date 500s).

#### Repository API endpoints

| Method | Path | Gate | Purpose |
|---|---|---|---|
| GET | `/api/v1/repository/events` | `isAuthenticated()` | Event registry (filters: hazard, region, year, status) + repository stats |
| GET | `/api/v1/repository/events/{id}` | `isAuthenticated()` | Full event card: effects, linked records, summed totals, response investment |
| POST | `/api/v1/repository/events` | `REPOSITORY_WRITE` | Register an event card (status Open); returns generated `DE-YYYY-NNNN` |
| PUT | `/api/v1/repository/events/{id}` | `REPOSITORY_WRITE` | Edit an Open card (409 if not Open) |
| POST | `/api/v1/repository/events/{id}/transition` | `REPOSITORY_WRITE` | validate / reopen / archive |
| DELETE | `/api/v1/repository/events/{id}` | `REPOSITORY_WRITE` | Delete an Open card (validated history is corrected, not deleted) |
| POST | `/api/v1/repository/events/{id}/effects` | `REPOSITORY_WRITE` | Add/update a per-region effects record |
| DELETE | `/api/v1/repository/events/{id}/effects/{effectsId}` | `REPOSITORY_WRITE` | Remove an effects record |
| GET | `/api/v1/repository/events/{id}/pull` | `REPOSITORY_WRITE` | Aggregate casualty/loss from linked records (pre-fill, never auto-saved) |
| GET | `/api/v1/repository/events/{id}/link-suggestions` | `isAuthenticated()` | Unlinked incidents/warnings/assessments inside the event window |
| POST | `/api/v1/repository/events/{id}/links` | `REPOSITORY_WRITE` | Link a system record to the event |
| DELETE | `/api/v1/repository/events/{id}/links/{linkId}` | `REPOSITORY_WRITE` | Unlink a record |
| GET | `/api/v1/repository/analytics` | `isAuthenticated()` | Sendai dashboard (optional `year`) |

`REPOSITORY_WRITE` = `hasAnyRole(EOCC, Super Admin, ICT Admin, Director, Asst. Director)` — data entry is the EOCC's duty per the SRS role model, with management roles able to step in. Reads are open to any signed-in officer (the repository is the institution's memory).

---

### 10.4 SendaiAnalyticsService

**Purpose / responsibilities.** Turns the validated repository into the figures the Sendai Framework Monitor requires (targets A–G), plus an auto-computed **insight layer** that demonstrates DMD intervention value to leadership and partners. Everything is derived live (no materialized snapshot); only `Validated`/`Archived` cards are counted (constant `COUNTED = "('Validated','Archived')"`).

The single dashboard payload (`GET /api/v1/repository/analytics?year=`) assembles:

- **`year` / `years`** — the requested year (defaulting to the latest year with counted data, `currentDataYear()`) and the list of years with data.
- **`targets`** — one panel per Sendai global target, each with a raw value, a normalized value, and the indicator codes it satisfies. Critically, **each target is traceable to a specific module**:
  - **A** (mortality) and **B** (affected) — summed from `disaster_event_effects`, normalized per-100,000 against the `population` baseline.
  - **C** (economic loss) — `total_loss_tzs`, normalized as a % of the `gdp_tzs` baseline, with an agriculture/housing/infrastructure breakdown.
  - **D** (infrastructure) — facilities damaged + roads-km.
  - **E** (DRR strategies) — `count` from `disaster_risk_frameworks` (Plans/Strategies/Policies/DRR Guidelines).
  - **F** (international cooperation) — `stakeholders` + `ndmf_donations` counts.
  - **G** (early warning) — warnings issued this year + people-at-risk + alert subscribers, from `early_warnings` / `alert_subscriptions`.
- **`yearlySeries`**, **`hazardProfile`**, **`regionRanking`** — the trend chart, the "which hazards actually hurt Tanzania" profile, and regions ranked by impact.
- **`insights`** — up to six narrative findings computed live with stated evidence (dominant hazard; early-warning coverage of recorded disasters = Target G evidence; DMD response value dispatched vs recorded loss; geographic loss concentration; the citizen-reporting pipeline; and a Sendai A-1 headline). Each is designed to be quotable to ministers/donors without further analysis.
- **`dataQuality`** — validation-pipeline health (total vs counted vs awaiting, link and effects-record counts).
- **`indicators`** — the `sendai_indicators` reference list.

**Normalization** uses `sendai_baselines` (latest baseline at or before the requested year, with national fallbacks of population 61,741,120 and GDP 196T TZS if no baseline row exists).

**Integration points (analytics traverses other modules' tables read-only):** `disaster_risk_frameworks` (Target E), `stakeholders` + `ndmf_donations` (Target F), `early_warnings` + `alert_subscriptions` (Target G), `allocated_resources` × `resources.unit_cost` (response-investment insight), `public_hazard_reports` + `disaster_event_links` (citizen-pipeline insight). The response-investment figure — `Σ quantity_allocated × unit_cost` for allocations tied to linked incidents — is also computed per-card in `DisasterEventService.responseInvestment`.

---

### 10.5 Reports & Analytics package

**Purpose / responsibilities.** The analytical, date-ranged management reports surfaced under Reports & Analytics, distinct from the operational registries in Response/EW. All three are **read-only** (`JdbcTemplate` queries, no mutations) and return summary tiles + breakdown lists + a records table.

#### Components & endpoints

| Method | Path | Gate | Purpose |
|---|---|---|---|
| GET | `/api/v1/reports/incidents` | *(none)* | Date-ranged incident analytics: summary + human-loss totals; by status/severity/type/region/month; records table |
| GET | `/api/v1/reports/resource-allocations` | *(none)* | Date-ranged resource-allocation report: 4 tiles (total/approved/rejected/deployed), total allocated value, records, by status/category |
| GET | `/api/v1/reports/early-warnings` | *(none)* | Early-warning effectiveness analysis (read-only correlation; no mutation) |

- **`IncidentReportController`** (`reports/IncidentReportController.java`) — filters `start_date`/`end_date`/`status`/`severity`/`region`; defaults to the last 12 months. Counts **real incidents only** (`coalesce(is_simulation,false) = false`) so drills never distort the national picture — the same simulation-isolation contract as the Executive Watch. Validates that start ≤ end and rejects malformed dates with a `BusinessRuleException`.
- **`ResourceReportController`** (`reports/ResourceReportController.java`) — a faithful port of the Laravel `ResourceAllocationController@generateReport`. Default window is previous month → today. Total allocated value = `Σ quantity_allocated × unit_cost` over `allocated_resources` joined to `resources`.
- **`EwManagementController`** (`reports/EwManagementController.java`) — the most analytical report: correlates each issued warning (`warning_hazards` × `warnings`, filtered to `approved`/`published`, the per-area validity-window source of truth) against incidents in the warned **area + time window** to classify early-warning effectiveness into four classes:
  1. **warned → incident** (true positive, with computed lead-time hours),
  2. **warning → no incident** (forecast that did not materialise),
  3. **unwarned incident** (a hazard struck with no covering warning — the gap),
  4. **preparedness during warning** (an anticipatory plan/training active in the warned window).

  It also surfaces a DRR-in-EW metric: the % of `Validated`/`Archived` `disaster_events` linked to an `early_warning` (querying `disaster_event_links`), and a `native_bus_submissions` count from `ew_agency_submissions`. The match key is **warned area (region_id or region name) + time (incident `reported_at` within the validity window with a short tail)**; hazard is contextual. The DRR block is wrapped in a try/catch that degrades to zeros if the repository tables are unavailable.

#### Integration points

- **Response** — incident and resource-allocation reports read `incidents`, `incident_types`, `allocated_resources`, `resources`.
- **Early Warning** — the EW management report reads `warnings`, `warning_hazards`, `hazards`, `regions`, `ew_agency_submissions`.
- **Preparedness** — the EW report joins `anticipatory_action_plans` and `training_plans` to find active preparedness in a warned window.
- **Repository** — the EW report's DRR coverage metric reads `disaster_events` + `disaster_event_links`, tying the reporting layer back to the validated loss database.

---

### 10.6 Known gaps, constraints and TODOs

- **Uneven read-side authorization.** Several `index`/report `GET` endpoints carry **no explicit `@PreAuthorize`** — `recovery/strategic-projects`, `recovery/knowledge`, and all three `reports/*` endpoints. They depend entirely on the security filter chain treating them as authenticated-by-default; they are not consistent with the explicitly-gated reads elsewhere (e.g. `recovery-programs` index uses `RECOVERY_MANAGE`, repository reads use `isAuthenticated()`). This should be normalized.
- **No update/delete for recovery records.** Programs, projects and relief logs support create + a status transition only; there is no edit or delete endpoint. Corrections require direct DB intervention.
- **No real document storage for knowledge entries.** `disaster_knowledge_repositories` carries metadata (`downloads_count`, `version`, `visibility_level`) but the controller exposes no file upload/download; `downloads_count` is never incremented by any endpoint.
- **JdbcTemplate / inline SQL, no JPA entities.** None of these domains define JPA entities or repositories — all persistence is raw SQL with `Map`-based DTOs. This is intentional (read-model performance, faithful Laravel port) but means there is no compile-time schema binding; column drift is caught only at runtime. Bean/wiring changes here should still be verified by booting the Spring context.
- **Dual-column legacy in knowledge & strategic-project tables.** The `COALESCE(content_title, title)` / `COALESCE(content_type, document_type)` pattern is a compatibility shim over the V13→V47 column split; new data writes both families, but the redundancy is a maintenance hazard until the legacy V13 columns are retired.
- **Sendai analytics are computed live, not snapshotted.** Every dashboard request re-aggregates the full validated set across multiple modules. This is fine at current data volumes but has no caching; the `year`-less default scans for the latest data year on every call.
- **Statutory authority roles still interim elsewhere.** Recovery/Repository gates use only the seeded operational roles; this is consistent with the platform-wide note in `Authz` that the statutory declaration authorities are not yet fully seeded, but it means some `Authz` gates (outside this section) remain interim.

---

