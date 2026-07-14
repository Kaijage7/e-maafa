# Software Requirements Specification (SRS)

**Product:** e-MAAFA / DMIS  
**Version:** Go-live scope 2026-07  
**Classification:** Internal technical

## 1. Purpose

This SRS states the minimum requirements that must hold for a careful production cutover of e-MAAFA. It is not a full product backlog.

## 2. Stakeholders

| Role | Interest |
|------|----------|
| PMO-DMD / EOCC | National early warning and incident command |
| Area officers (region, district, council) | Jurisdiction-scoped work |
| Sector agencies (TMA, MoW, GST, MoH, MoA, NEMC, MLF) | EW agency submissions |
| Citizens and partners | Public portal, alerts, publications |
| PMO ICT | Security, deploy, operations |

## 3. Scope at go-live

### 3.1 In scope

1. Authenticated operator application (JWT).
2. Early Warning multi-agency bus, PMO consolidation, product store, PDF generation, publish and disseminate paths.
3. Incident response with area scope and approval chain.
4. Preparedness registers used in response (warehouses, inventory, evacuation centres).
5. Public portal: landing, live map, publications, hazard report, subscriptions.
6. INFORM risk index read/write under RBAC.
7. Notifications (in-app; SMS/email when gateways configured).
8. Ops honesty board (readiness, integrity, integration registry).

### 3.2 Out of scope (explicit)

| Item | Status |
|------|--------|
| Live NIDA identity feed | Planned adapter only |
| Live NBS census API | Planned bulk request only |
| Live LATRA corridor feed | Planned adapter only |
| Live IFMIS posting | Export handoff only |
| Full satellite footprint vs population | Deferred (F114) |
| AI prediction / change detection | Deferred |
| Keycloak as live SSO | Not required; self-issued JWT is SoR |

## 4. Functional requirements

### 4.1 Identity and access

| ID | Requirement |
|----|-------------|
| FR-I-01 | Users authenticate with username/password; system issues signed JWT. |
| FR-I-02 | API endpoints enforce role permissions (not open by authentication alone). |
| FR-I-03 | Area officers only see data in their jurisdiction where scope is defined. |
| FR-I-04 | Production profile refuses weak/default JWT secret and empty CORS origins. |

### 4.2 Early warning

| ID | Requirement |
|----|-------------|
| FR-E-01 | Agencies submit updates on the shared bus (`ew_agency_submissions`). |
| FR-E-02 | PMO-DMD can view consolidated day map and impact-support context. |
| FR-E-03 | System stores generated bulletin PDFs and can publish to map and publications. |
| FR-E-04 | PDF generation is available via the local/sidecar generate service. |
| FR-E-05 | Dissemination uses the notification channels (SMS/email when configured). |

### 4.3 Response

| ID | Requirement |
|----|-------------|
| FR-R-01 | Incidents can be created, progressed, and closed under RBAC. |
| FR-R-02 | Resource allocation and dispatch use live stock registers. |
| FR-R-03 | Public map shows only pinned or active-response/escalated incidents with coordinates (public-safe fields). |

### 4.4 Public portal

| ID | Requirement |
|----|-------------|
| FR-P-01 | Unauthenticated users can open landing and live portal. |
| FR-P-02 | Portal shows published bulletins (with PDF where stored) and national situation aggregates from live data. |
| FR-P-03 | Citizens can submit hazard reports and register for alerts. |
| FR-P-04 | Portal does not claim private ops data or unproved satellite layers. |

### 4.5 Integration honesty

| ID | Requirement |
|----|-------------|
| FR-X-01 | External national systems appear in the integration registry with planned/configured/live status. |
| FR-X-02 | Handoff endpoints (NBS request, NIDA verify package, LATRA snapshot, NAPA map, IFMIS export) record audit messages and do not invent live registry calls. |

## 5. Non-functional requirements

| ID | Requirement |
|----|-------------|
| NFR-01 | API under context path `/api`. |
| NFR-02 | TLS at reverse proxy in production. |
| NFR-03 | Database migrations via Flyway only; expand-forward during freeze. |
| NFR-04 | Logs must not store raw national ID numbers for NIDA flows (hash only). |
| NFR-05 | Local profile tools (god-mode headers) must not run on the public edge. |

## 6. Assumptions and constraints

1. Postgres is provisioned from approved baseline plus Flyway, not empty V1 replay on prod.
2. Sector agencies will use the in-platform bus at cutover; optional official pull APIs come later.
3. SMS and email may start deferred if residual accept is signed; in-app feed still works.

## 7. Traceability

| Requirement area | Primary code areas |
|------------------|--------------------|
| Auth / JWT | `common.security`, `AuthController` |
| EW | `controller/Ew*`, `ew/*`, PDF sidecar |
| Response | `controller/Incident*`, allocation/dispatch |
| Portal | `PortalPublicServiceImpl`, Angular public pages |
| Ops | `GoLiveOpsController`, integration services |

## 8. Acceptance

Go-live acceptance is defined in `04-ACCEPTANCE.md`. This SRS is satisfied only when those checks pass under the production profile.
