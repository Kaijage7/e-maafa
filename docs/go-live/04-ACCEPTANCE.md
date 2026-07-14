# Go-live acceptance checklist

**Product:** e-MAAFA / DMIS  
**Use:** Sign-off sheet for cutover  
**Rule:** Every row needs a result (Pass / Fail / N/A) and initials

## 1. Infrastructure

| # | Check | Result | Initials |
|---|-------|--------|----------|
| A1 | TLS certificate valid on public host | | |
| A2 | Reverse proxy routes `/api` to backend | | |
| A3 | SPA loads without console hard error | | |
| A4 | Postgres backup taken before cutover | | |
| A5 | Flyway version matches approved release | | |

## 2. Security

| # | Check | Result | Initials |
|---|-------|--------|----------|
| S1 | Profile is `prod` (not `local`) | | |
| S2 | Login succeeds for real admin account | | |
| S3 | API without token returns 401 on protected route | | |
| S4 | Local test password not usable on production users | | |
| S5 | CORS only allows known SPA origins | | |

## 3. Early warning

| # | Check | Result | Initials |
|---|-------|--------|----------|
| E1 | Agency latest / consolidated returns 200 for authorised user | | |
| E2 | PDF service `/health` returns ok | | |
| E3 | Generate one bulletin PDF (any approved kind) succeeds | | |
| E4 | Stored product PDF opens under `/api/storage/...` | | |
| E5 | Publish to map shows bulletin on public portal | | |

## 4. Response

| # | Check | Result | Initials |
|---|-------|--------|----------|
| R1 | Incident list loads under area scope | | |
| R2 | Open incident show page loads | | |
| R3 | Allocation or stock read works for authorised role | | |

## 5. Public portal

| # | Check | Result | Initials |
|---|-------|--------|----------|
| P1 | `/` or landing API returns 200 unauthenticated | | |
| P2 | Live portal shows national situation line or published bulletins when data exists | | |
| P3 | Publications list returns 200 | | |
| P4 | Hazard report submit validates required fields | | |

## 6. Ops honesty

| # | Check | Result | Initials |
|---|-------|--------|----------|
| O1 | Go-live readiness board loads for admin | | |
| O2 | Integration registry shows endpoints; none marked live without proof | | |
| O3 | Integrity summary loads (or documents missing view if not deployed) | | |

## 7. Explicit non-claims (confirm not advertised)

| # | Statement confirmed for release notes / training | Initials |
|---|--------------------------------------------------|----------|
| N1 | No claim that NIDA/NBS/LATRA/NAPA registry feeds are live | |
| N2 | No claim of full satellite people-under-footprint exposure | |
| N3 | No AI prediction product claim | |

## 8. Sign-off

| Role | Name | Date | Decision |
|------|------|------|----------|
| Cutover lead | | | Go / No-go |
| Business (DMD/EOCC) | | | Go / No-go |
| ICT security | | | Go / No-go |
| DBA | | | Go / No-go |

**Notes / exceptions:**

```
(write free text; residual accepts must reference flag name and date)
```
