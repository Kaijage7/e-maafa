# Operations and honesty boundary

**Product:** e-MAAFA / DMIS  
**Purpose:** One page for operators and reviewers on what the system really is at cutover

## 1. Live capabilities (platform)

These work as product features when the stack is deployed correctly:

- Operator login and RBAC
- Early warning agency bus and PMO consolidation
- Bulletin PDF generation (when PDF sidecar is running)
- Incident response and resource flows under permissions
- Public portal with published content and public-safe ops picture
- INFORM structural risk
- In-app notifications
- Integration handoff packages and registry (not live national APIs)

## 2. Configured when secrets exist

| Capability | Condition |
|------------|-----------|
| SMS (M-Gov) | Keys, sender ID, DLR registration |
| Email | SMTP host and credentials |
| PDF on ops board green | Sidecar health reachable from API host |

## 3. Planned (adapters only)

| System | Present as | Not present as |
|--------|------------|----------------|
| NBS | Population request package | Live census API |
| NIDA | Verify request (hash only) | Citizen dump or people count |
| LATRA | Logistics snapshot export | Live corridor feed |
| NAPA | Programme map export | Live ERP |
| IFMIS | Commitment export | Live finance post |

Mark registry status `live` only after MoU and dual-proved round trip.

## 4. Deferred

| Item | Code / note |
|------|-------------|
| Full satellite scene SoR / people under flood footprint | F114 |
| AI registry and prediction | F105 |
| Full multi-domain offline / native push / capacity SLOs | F116 (incident hybrid only so far) |
| Keycloak live SSO | Optional later; JWT is SoR now |

**Cutover checklist (must-close vs accepted deferred):** [06-DEFERRED-VS-MUST-CLOSE.md](./06-DEFERRED-VS-MUST-CLOSE.md).

## 5. Data honesty on the public portal

| Shown | Basis |
|-------|-------|
| Published bulletins and PDFs | Operator publish action |
| Warning pins | Map-enabled early warnings or published products |
| Response incidents | Pinned or Active Response / Escalated with coordinates |
| National totals by region | Live incident counts (public-safe) |

| Not shown as fact | Reason |
|-------------------|--------|
| People under a satellite flood polygon | Not implemented end to end |
| Live NBS ward population | Feed not connected |
| Unpinned draft incidents | Workbench only |

## 6. Daily ops after cutover

1. Open readiness board.  
2. Check PDF sidecar health if EOCC generates bulletins.  
3. Review failed SMS/email logs if channels are live.  
4. Review integrity summary weekly.  
5. Do not invent external “live” status in training materials.  

## 7. Local development reminder

| Port | Service |
|------|---------|
| 4200 | UI |
| 8080 | API |
| 8600 | PDF |
| 5440 | Postgres |

If the browser says connection refused on localhost, start the missing process. Most often the UI (`ng serve` on 4200) was not started. Backend and database can still be healthy.

```bash
./start-all.sh
# or start pieces:
# java -jar dmis-run.jar --spring.profiles.active=local
# npm exec ng serve -- --port 4200 --proxy-config proxy.conf.json
# EWS_PDF_PORT=8600 python pdf_service.py
```
