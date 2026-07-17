# e-MAAFA go-live document set

**System:** e-MAAFA (DMIS)  
**Owner:** PMO Disaster Management Department  
**Audience:** PMO ICT, operations, architecture review, auditors  
**Date:** 2026-07-14  
**Status:** Ready for careful cutover review (not a signed production certificate)

## How to read this set

Read in order. Each document has one job. Details live in the source tree when code and prose disagree; code wins.

| # | Document | Purpose |
|---|----------|---------|
| 1 | [SRS](./01-SRS.md) | What the system must do at go-live |
| 2 | [SDD](./02-SDD.md) | How it is built (architecture, not a feature catalogue) |
| 3 | [Go-live plan](./03-GO-LIVE-PLAN.md) | Cutover steps, gates, roles |
| 4 | [Acceptance](./04-ACCEPTANCE.md) | Pass/fail checks for release |
| 5 | [Ops and honesty](./05-OPS-AND-HONESTY.md) | What is live, planned, or deferred |
| 6 | [Deferred vs must-close](./06-DEFERRED-VS-MUST-CLOSE.md) | Cutover blockers vs accepted F105/F114/F116 gaps |
| 7 | [Docker deploy](./DOCKER-DEPLOY.md) | Compose, PDF, TLS edge, image tags, secrets |
| 8 | [Docker fix plan](./DOCKER-FIX-PLAN.md) | Challenges + ordered fixes (one at a time) |

**Easy deploy (start here for standing the stack up):** [../DEPLOYMENT.md](../DEPLOYMENT.md)  
Helper: `scripts/deploy-quickstart.sh` (laptop Path A / TLS-local Path B).  
Secrets: `scripts/check-deploy-secrets.sh` (use `--enforce` before shared/public hosts).  
Docker fix plan (A–F closed): [DOCKER-FIX-PLAN.md](./DOCKER-FIX-PLAN.md).
## Related operational files (existing)

| File | Use |
|------|-----|
| `docs/DEPLOYMENT.md` | **Primary deploy guide** — Paths A/B/C, smoke, day-2, troubleshooting |
| `docs/GO-LIVE-RUNBOOK.md` | Detailed env vars and residual flags |
| `docs/env.prod.example` | Production environment template |
| `docs/LOCAL-TEST-PASSWORD.md` | Local seed password only; revoke on prod |
| `scripts/deploy-quickstart.sh` | One-command laptop / staging TLS start |
| `scripts/go-live-smoke.sh` | Automated smoke after deploy |

## Local stack (developer machine)

| Service | URL | Notes |
|---------|-----|--------|
| UI | http://localhost:4200 | Angular; proxies `/api` and `/ew-api` |
| API | http://localhost:8080/api | Spring Boot, profile `local` only |
| EW PDF | http://127.0.0.1:8600 | Bulletin PDF generator |
| Database | localhost:5440 | Postgres container `dmis-pg` |

Start all local services:

```bash
cd /path/to/maafa/dmis-platform
./start-all.sh
```

If the browser shows connection refused, the UI process on port 4200 is usually down. API on 8080 and Postgres on 5440 can still be up.

## Writing rules for this pack

- Plain technical English.
- No claim of live NIDA, LATRA, NAPA, or full satellite exposure.
- No AI product claims.
- No feature dump: go-live scope only.
