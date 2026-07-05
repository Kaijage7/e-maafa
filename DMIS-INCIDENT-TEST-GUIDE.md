# Incident Flow — Test Credentials & Walkthrough

Generated 2026-07-03 from the LIVE local database + `IncidentWorkflowService`. All logins below were
verified against `POST /api/v1/auth/login` (HTTP 200). Login page: **http://localhost:4200/login**.

> **Password rule:** every seeded account uses **`password`** EXCEPT the four noted (`director`,
> `eocc`, `dc`, `admin`). BCrypt salts differ per row, so identical passwords show different hashes —
> that's normal.

## The escalation ladder (from IncidentWorkflowService)

```
report → waiting_ddmc (Dist DC, district entry gate)
  ├─ district scope: → waiting_ded  (DED)                                        → approved
  ├─ region  scope:  → waiting_rdmc (Reg DC) → waiting_ras (RAS)                  → approved
  └─ national scope: → waiting_eocc (EOCC) → waiting_director (Director, DMD)
                        → waiting_ps (PS / Permanent Secretary)                   → approved
```
- Each approver **above the DDMC** can **roll back one level** (logged, `rollback_count++`).
- The **DDMC** can instead **close as rumour** → `closed_rumor` (notifies DED + DAS).
- Area stages are **jurisdiction-scoped**: a DED/RAS only acts on incidents in their OWN district/region.
  National tiers (Asst. Director / Director / PS) act across all areas. Super Admin overrides everything.

## ✅ Fully-staffed end-to-end chain — use **Dodoma** (only region with the DDMC + RDMC gate accounts)

| Stage | Role | Login | Password | Area |
|---|---|---|---|---|
| Entry gate | Dist DC (DDMC) | `dc@test.com` | **dc** | Dodoma Urban |
| District approve | DED | `ded.dodoma@example.dev` | password | Dodoma Urban |
| District admin | DAS | `das@pmo.go.tz` | password | Dodoma Urban |
| Region gate | Reg DC (RDMC) | `regdc@pmo.go.tz` | password | Dodoma |
| Region approve | RAS | `ras@pmo.go.tz` | password | Dodoma |
| Region head | RC | `rc.dodoma@example.dev` | password | Dodoma |
| National ops | EOCC | `eocc@pmo.go.tz` | **eocc** | national |
| National | Asst. Director | `asst.director@pmo.go.tz` | password | national |
| National | Director (DMD) | `director@pmo.go.tz` | **director** | national |
| National sign-off | PS / Secretary | `secretary@pmo.go.tz` | password | national |
| Break-glass | Super Admin | `admin@example.com` | **admin** | all |

> **Deep-catch note:** Dodoma is the ONLY region that has its own **Dist DC** and **Reg DC**. The other
> staffed regions below have DED/DAS/RAS/RC but **no DDMC/RDMC** — so on a district/region-scoped
> incident there, the `waiting_ddmc`/`waiting_rdmc` gate has no matching officer and only Super Admin
> can advance it. That asymmetry is worth probing.

## Other staffed regions (DED + DAS + RAS + RC only — national scope reaches EOCC/Director/PS)

| Region | DED (district) | DAS | RAS | RC |
|---|---|---|---|---|
| Dar es Salaam | `ded.dar@pmo.go.tz` (Ilala) | `das.dar@pmo.go.tz` | `ras.dar@pmo.go.tz` | `rc.dar-es-salaam@pmo.go.tz` |
| Mwanza | `ded.mwanza@pmo.go.tz` (Ilemela) | `das.mwanza@pmo.go.tz` | `ras.mwanza@pmo.go.tz` | `rc.mwanza@pmo.go.tz` |
| Arusha | `ded.arusha@pmo.go.tz` (Arumeru) | `das.arusha@pmo.go.tz` | `ras.arusha@pmo.go.tz` | `rc.arusha@pmo.go.tz` |
| Mbeya | `ded.mbeya@pmo.go.tz` (Chunya) | `das.mbeya@pmo.go.tz` | `ras.mbeya@pmo.go.tz` | `rc.mbeya@pmo.go.tz` |

All 31 regions have an **RAS** (`ras.<region-slug>@pmo.go.tz`) and **RC** (`rc.<region-slug>@pmo.go.tz`),
password `password` — e.g. `ras.mtwara@pmo.go.tz`, `ras.kigoma@pmo.go.tz`, `ras.kilimanjaro@pmo.go.tz`.
Region slug = lowercase region name with spaces → hyphens (`Dar es Salaam` → `dar` for RAS but
`dar-es-salaam` for RC — note the inconsistency, itself a catch).

## Reporting an incident (three entry points)
1. **Public** (no login): landing page → **Report Hazard** wizard. A public report enters at
   `waiting_ded` for the chosen district.
2. **Official / institution** (public wizard, "Reporting as… Institution/Sector/Ministry/Region"):
   skips district/region triage → straight to `waiting_eocc` (EOCC still reviews).
3. **Internal**: log in as an area officer → **Response → Incidents → New Incident**.

## Resource dispatch (after an incident is active)
Roles holding dispatch permissions: **DED, DAS, RAS, Reg DC, EOCC, Asst. Director, Director, Secretary,
District/Regional Logistic Officer, Partners, Super Admin.**
- **Response → Resource Allocations** — `request` (raise a need), `approve` (authorise), `dispatch` (send).
- **Response → Dispatch Console** — allocate from warehouses; **Response → Warehouse Ops** for stock.
- Published unmet needs surface to partners in **Stakeholder Portal → Open Needs** (donate/pledge).

## Suggested end-to-end test (Dodoma, district scope)
1. Public **Report Hazard** in a Dodoma Urban location → note the reference code.
2. `dc@test.com` (**dc**) → Incidents: incident sits at `waiting_ddmc` → **escalate** (or close-as-rumour).
3. `ded.dodoma@example.dev` → approve at `waiting_ded`.
4. Try approving that same incident as `ded.dar@pmo.go.tz` FIRST — it must be **blocked** (wrong district). ← jurisdiction catch
5. For a **region**-scoped incident: `regdc@pmo.go.tz` → `ras@pmo.go.tz`.
6. For a **national**-scoped incident: `eocc@pmo.go.tz` (**eocc**) → `director@pmo.go.tz` (**director**) → `secretary@pmo.go.tz`.
7. Dispatch: as RAS or EOCC, **Resource Allocations** → request → approve → dispatch; check **Open Needs** as `redcross@partner.tz` (password `password`).
8. Roll-back probe: at any national stage, roll back one level and confirm history + `rollback_count`.
