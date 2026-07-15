# e-MAAFA / DMIS — Production Go-Live Runbook

> **Source of truth for go-live ops:** `space02.md` §3, §7.2 (GL-01…GL-10), §8.  
> **Honesty:** This runbook configures and proves a careful production cutover. It does **not** claim NIDA/LATRA/NAPA/IFMIS live integration, AI productisation, or empty-DB-from-V1 installs.  
> **No fakes:** Do not mark integration endpoints `live` without dual-proof; do not invent casualty/EC gazette data; do not enable `local` profile or residual-accept flags without written sign-off.

**Assessment baseline:** 2026-07-10 space02 pre-deploy (local dual-proof: smoke **12/12**; persona JWT fail=0; Flyway through **V195**; integrity residuals 0 including poly links; geo↔INFORM 156/156; `space02IssueRegister` on readiness board; **openCode=0**).

**2026-07-15 mobile/web verification evidence:** before the final JWT-lifetime hardening, an isolated
Java 21/PostgreSQL 16.13 run executed **40 suites / 186 tests with 0 failures, 0 errors and 0 skips**.
Flyway validated **197 schema-history entries**: the baseline marker plus **196 versioned SQL files
through V212**. The later GraphQL session hardening and V213 device-registration slice added eight
tests. On the final source, the focused GraphQL/WebSocket/relay gate passed **25/25**, and a restricted
full rerun compiled the application and passed all **104** non-database tests; its **90** database tests
were skipped because the sandbox denied the Docker socket. Therefore a single Docker-backed
**194/194** final-source run remains mandatory; it must also apply and validate V213, and
the restricted exit code must not be treated as a release green. The Angular 21 production build
passes on the final tree; the build still warns that the 521.56 kB initial bundle exceeds the 500 kB
warning budget by 21.56 kB. An earlier **5/5** browser run passed, but it predates a late warehouse UI
delta and the final-tree rerun could not bind Karma port 9876 in this sandbox (`EPERM`), so repeat it
in the release environment. Earlier `npm audit` (**0** vulnerabilities)
and OWASP Dependency-Check 12.2.2 (**0** vulnerable dependencies across 81 release dependencies)
are the latest completed dependency evidence, but the OWASP scan predates the newly added WebSocket
starter and must be refreshed on the final POM. This is build/security evidence, not a substitute
for the live persona, provider, proxy/SSE/WebSocket, browser, load, and physical-device smoke required below.

---

## 0. Non-negotiables

| Rule | Why |
|------|-----|
| Use **`prod` (or non-`local`) Spring profile** | Local god-mode / persona headers must not exist on the public edge |
| Database = **baseline @ V122 + Flyway forward**, or certified migrate | Fresh V1 on empty schema is **unsafe** |
| **No baseline demo users/passwords** in prod | Baseline dump may contain demo hashes |
| Expand-only migrations during freeze | No mid-go-live baseline rewrite |
| Self-issued HS256 JWT is SoR | Keycloak realm JSON is **not** live SSO unless separately engineered |
| EW multi-agency = **one bus** (`ew_agency_submissions`) | No parallel theatre channels |
| External systems = **adapter + integration tables** | Never dual-write into core tables without validation |

---

## 1. Pre-cutover checklist (GL-01…GL-06)

### GL-01 — Secrets & profile

| Variable | Required | Notes |
|----------|----------|--------|
| `SPRING_PROFILES_ACTIVE` | **Yes** | `prod` (never `local` on public edge) |
| `DMIS_AUTH_JWT_SECRET` | **Yes** | ≥ 32 random bytes; **fail-fast** if missing/dev-default in non-local |
| `DMIS_SECURITY_CORS_ALLOWED_ORIGINS` | **Yes** | Comma-separated SPA origins; **fail-fast** if empty in non-local |
| `DMIS_AUTH_JWT_TTL_MINUTES` | Recommended | Default 30 |
| `DMIS_AUTH_FORCE_2FA_ROLES` | Recommended | Prod defaults Super Admin, Director, Asst. Director, Secretary, EOCC, ICT Admin → login returns `MFA_ENROLL_REQUIRED` until TOTP enrolled |
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USERNAME` `DB_PASSWORD` | **Yes** | App user **not** superuser |
| `DB_POOL_MAX` / `DB_POOL_MIN` | Recommended | Defaults 20 / 5 |
| `DMIS_IDEMPOTENCY_RETENTION` | **Yes for mobile support** | Default `90d`; must be at least the longest supported offline-command retry queue |
| `DMIS_IDEMPOTENCY_CLEANUP_CRON` / `DMIS_IDEMPOTENCY_CLEANUP_BATCH_SIZE` | Recommended | Defaults hourly at minute 17 / 10,000; keep batch 1–100,000 and monitor expired-row backlog |
| `DMIS_SYNC_RETENTION` | **Yes for incident offline support** | Default `90d`; must exceed the maximum supported incident-cache offline window |
| `DMIS_SYNC_CLEANUP_CRON` / `DMIS_SYNC_CLEANUP_BATCH_SIZE` | Recommended | Defaults hourly at minute 29 / 10,000; monitor prune lag and HTTP 410 rebuild rate |
| `DMIS_SYNC_RELAY_POLL_MS` / `DMIS_SYNC_SSE_HEARTBEAT_MS` / `DMIS_SYNC_SSE_TIMEOUT` | Recommended | Defaults 500 ms / 15 s / 10 min; align load balancer idle timeout above the forced reconnect |
| `DMIS_SYNC_GRAPHQL_SUBSCRIPTION_TIMEOUT` | Recommended | Default 10 min; completes subscriptions and prevents new operations on an older socket so a fresh upgrade re-authenticates |
| `DMIS_SYNC_SSE_MAX_CONNECTIONS` / `DMIS_SYNC_SSE_MAX_CONNECTIONS_PER_ACTOR` | **Yes after load test** | Defaults 5,000 per node / 5 per actor; size below proven servlet, proxy, DB and file-descriptor capacity |
| `DMIS_GRAPHQL_WEBSOCKET_MAX_OPERATIONS` / `DMIS_GRAPHQL_WEBSOCKET_OPERATION_WINDOW_SECONDS` | **Yes after load test** | Defaults 300 operations per authenticated actor per node per 60 seconds; enforce a cluster-wide limit at ingress |
| `DMIS_GRAPHQL_WEBSOCKET_REVOCATION_CHECK` | Recommended | Default 5 s; bounds how long an active subscription can remain after its token is revoked |
| CORS / reverse proxy | **Yes** | TLS terminate at nginx/LB; strip client `X-Forwarded-*` then set `X-Forwarded-Proto` |
| `DMIS_RATELIMIT_TRUSTED_PROXIES` | When proxy client IPs are used | Exact direct proxy addresses only; never trust arbitrary client `X-Forwarded-For` |

**Env template:** `docs/env.prod.example`

**Verify after deploy:**

```bash
curl -sS https://<host>/api/actuator/health   # expect {"status":"UP"} or UP
curl -sS -o /dev/null -w "%{http_code}\n" https://<host>/api/v1/settings/users
# expect 401 without Authorization
curl -sSI https://<host>/ | grep -i '^content-security-policy:'
# expect enforced CSP with script-src 'self' and object-src 'none'
```

For multiple backend replicas, configure shared ingress limits for GraphQL HTTP requests, WebSocket
upgrades/connections, and messages; the application limiters are bounded defense in depth, not a
cluster-wide quota. Keep GraphQL introspection off in production
(`DMIS_GRAPHQL_INTROSPECTION_ENABLED=false`).

### GL-01A — International mobile/web release boundary

- `/api/graphql` is an authenticated no-mutation API: HTTP provides the bounded `mobileHome`
  composite and WebSocket provides only the content-free `mobileSync` foreground wake-up. REST
  remains the command/upload/callback and durable cursor-recovery authority.
- `POST /api/v1/mobile/incidents` is the first file-free mobile REST command. It requires
  `Idempotency-Key`, an authenticated numeric actor with `incidents.create` plus module access,
  and an RFC 3339 `reported_at` with an explicit offset. It forces `Reported` / `draft` / `Mobile App
  Report` and reuses the authoritative incident jurisdiction/workflow service.
- V210 persists the first incident-create response by actor + operation + key for 90 days by default.
  Repeating the same payload returns the same incident id; key reuse with changed content is rejected.
  Do not shorten retention below the native client's maximum offline queue age. Alert when expired
  receipts accumulate faster than the bounded hourly cleanup.
- The web incident-create form also sends a generated idempotency key. Mobile attachments are not
  part of the typed JSON command; do not queue attachment uploads until a separate retry-safe upload
  contract has been designed and tested.
- `PUT`/`DELETE /api/v1/mobile/devices/current` stores or revokes only the authenticated numeric
  user's installation in V213. Responses never echo the provider token, per-user count/upsert is
  serialized and capped at 20, and the schema requires a token for FCM/APNs. This is addressing only:
  no provider sender exists. Before enabling delivery, require shared abuse limits, strict DB/backup
  access, token encryption and redaction proof, invalid-token cleanup, provider credentials, and
  content-free payload tests.
- Existing web incident media has generated filenames, byte-signature checks, size limits and
  rollback cleanup, but no antivirus/CDR or quarantine provider. Treat hostile-file scanning and
  operational handling as a release gate; do not mistake extension/signature checks for malware proof.
- `GET /api/v1/notifications/changes?after_sequence=<cursor>&limit=<1..100>` provides an actor-scoped,
  transaction-serialized per-user cursor for newly inserted notification deliveries. Commit the page
  to local storage before advancing to `next_after_sequence`. V212 deliberately avoids using the
  pre-commit BIGSERIAL id as a cursor. It rejects a restored-server cursor that is ahead and advances
  across deleted-row gaps rather than polling forever. This is not a general domain delta log and does
  not carry mark-read, dismiss, incident-update, or deletion tombstones.
- The GraphQL `mobileHome` snapshot returns `syncCursor` + `syncScopeKey`. Incident clients recover via
  `GET /api/v1/sync/changes?after_sequence=...&scope_key=...&limit=...`. V211 captures insert/update/delete
  in the incident transaction, serializes cursor assignment until commit, emits an old-jurisdiction
  tombstone on moves, rejects changed actor/permission/area scope with 409, and returns 410 when the
  cursor predates the retained history. Persist a page and its row effects atomically before advancing
  `next_after_sequence`; on 409/410, discard the incident cache and take a new GraphQL snapshot.
- `GET /api/v1/sync/stream?after_sequence=...` is an authenticated, `incidents.view`-gated REST/SSE
  incident wake-up. It transports no domain row and cannot replace cursor catch-up. The Angular incident
  registry reloads on a signal; nginx/Caddy disable buffering for the exact stream path. Confirm the
  deployed edge preserves `text/event-stream`, heartbeats arrive, a 10-minute reconnect re-authenticates,
  and 401/403/409 paths do not reconnect in a tight loop. The current global cursor reveals aggregate
  incident activity timing and approximate volume to any authorized incident viewer. Before international
  launch, security must explicitly accept that bounded metadata disclosure or replace the stream with
  jurisdiction-scoped opaque wake-ups and re-run authorization, reconnect and load proof.
- Foreground native clients may use the GraphQL `mobileSync(afterSequence)` subscription over
  `graphql-transport-ws`. It shares the same relay/capacity budget and carries the same global cursor
  only. Each operation rechecks JWT expiry and the logout denylist; active subscriptions cannot
  outlive JWT expiry and poll revocation every 5 seconds by default. The socket authentication window
  ends after 10 minutes, and frames/operations are bounded. Multi-node deployment requires a shared
  denylist; the current in-memory denylist is node-local. Prove the real TLS proxy upgrade with a
  native client and verify expiration, logout, rate-limit, reconnect, and database-restore behavior;
  resolver/unit tests are not a production handshake certificate.
- Before applying V211/V212 to a populated production database, rehearse them on a production-size copy.
  V211 creates three platform structures, indexes the new event table, and briefly adds an incident
  trigger. V212 adds/backfills `resource_notifications.sync_sequence`, makes it non-null, and creates a
  unique index, so its table scan/update and DDL lock duration must fit the maintenance window. Record
  row counts, lock waits, WAL growth, replica lag, migration duration and rollback/restore decision.
- Native credentials must be proven in OS secure storage. Do not store tokens in ordinary mobile
  preferences, SQLite, logs, analytics, or crash reports.
- The current web SPA persists a 30-minute bearer token in `localStorage`. Security sign-off must
  either accept that bounded residual with the enforced CSP and completed penetration test, or land
  and prove a cookie/in-memory session redesign with CSRF protection before public launch.
- A successful mobile incident command is visible to the next authorized web read because both use the
  same application services/database; V211 + REST/SSE now wake and reconcile the web incident registry,
  while foreground native clients may receive the same cursor through GraphQL.
  This is incident-only and best-effort for latency. Separate gates remain: native mobile push/background
  execution, broader domain deltas/tombstones, a real outbox/broker for external delivery, optimistic
  update conflicts, and idempotency coverage for every other supported offline command.
- This repository currently contains no native Android/iOS/Flutter/React-Native client. Do not sign
  off an “international mobile product” until the client, device matrix, offline/reconnect behavior,
  store privacy declarations, and push-provider tests exist.
- Generate an SBOM and scan the final backend, frontend, edge, database, and EW-PDF image digests.
  The EW-PDF build still resolves several Python `>=` requirements and the source Dockerfiles use
  moving base-image tags; pin tested dependency hashes/base digests before promoting a public image.

### GL-01B — Repeatable source dependency gate

Run from the repository root immediately before producing the release images:

```bash
./ci.sh audit
jq '[.dependencies[] | select((.vulnerabilities // []) | length > 0)] | length' \
  backend/target/dependency-check-report.json
# expect: 0
```

The backend audit uses the OWASP Dependency-Check project's maintained NVD cache, excludes test
scope, writes the JSON evidence under `backend/target/`, and fails at CVSS 7 or higher. The earlier
2026-07-15 scan returned no findings, but it predates the WebSocket starter added for the GraphQL
subscription and is no longer sufficient release evidence. Refresh this report against the final
dependency lock before promotion. Sonatype OSS Index requires separate credentials and was not part
of that proof; final-image SBOM and container scanning remain mandatory because source dependency
scans do not inspect the operating-system layers or the EW-PDF Python environment.

### GL-02 — SMS (M-Gov)

| Variable | Notes |
|----------|--------|
| `MGOV_SMS_URL` | National gateway URL |
| `MGOV_API_KEY` `MGOV_SYSTEM_ID` `MGOV_MOBILE_SERVICE_ID` | Live credentials |
| `MGOV_SENDER_ID` | Registered sender (default 15200 may need re-registration) |
| `DMIS_MGOV_DLR_SECRET` | **Required in prod** for DLR webhook; blank → DLR disabled (503) |
| DLR URL registered with carrier | Ops residual — platform ready |

### GL-03 — SMTP

| Variable | Notes |
|----------|--------|
| `SPRING_MAIL_*` / host/username/password | Real SMTP |
| `MAIL_FROM_NAME` | Default e-MAAFA DMIS |

### GL-04 — Clean production database

1. Provision PostgreSQL 16.  
2. Restore **certified baseline** (V122) **or** empty schema + load `db/baseline/baseline.sql` then Flyway.  
3. Run app so Flyway advances to current jar max version (includes **V198** demo password revoke).  
4. **Delete / rotate** any demo users from baseline dumps.  
5. Create real Super Admin / ICT Admin with forced password change + 2FA.  
6. Confirm: `select max(version) from flyway_schema_history;` matches release notes.  
7. **Revoke local test password** `Password@2026` — see **`docs/LOCAL-TEST-PASSWORD.md`**. Prove:  
   `POST /api/v1/auth/login` with `admin@example.com` / `Password@2026` **must fail**.  
   Never set `SPRING_PROFILES_ACTIVE=local` on the public edge (that profile re-applies the constant).

### GL-05 — Role walkthrough (minimum)

| Persona | Must prove |
|---------|------------|
| National Super Admin / Director | Full modules; roles matrix; user create |
| RAS / Regional | Area-scoped incidents & warehouses only |
| DAS / District | Own district; cannot bind out-of-area incident allocation |
| TMA / MoW agency user | Agency bus submit + cross-read; no other agency write |
| Partner stakeholder | Portal / donations only; no staff allocation queues |
| Unauthenticated public | Portal + health; **no** `/v1/settings/**` |

### GL-06 — Workflow staffing seats

- Ensure DED / RDMC / EOCC / DAS seats exist where approval ladders require them.  
- Officer phones for SMS notify (sparse phones = weak SMS — data residual GL-08).

---

## 2. Deploy sequence (recommended)

```text
1. Freeze schema (expand-only migrations only)
2. Backup existing (if any) → PITR policy live
3. Provision app + DB network isolation
4. Set secrets; start API with prod profile
5. Confirm Flyway max version + health UP
6. Deploy Angular static assets behind same origin or CORS allowlist
7. Smoke pack (§3)
8. Role walkthrough (§1 GL-05)
9. Enable M-Gov/SMTP only after controlled test send
10. Sign go-live acceptance (below)
```

**PDF sidecar (`:8600` / `/ew-api`):** optional for generation; national warnings SoR is Spring `warnings` + products. Plan HA for sidecar (GL-09 residual).

---

## 3. Production smoke pack (minimum)

**Script (repeatable):** from `dmis-platform/`:

```bash
# Local persona (never on public edge):
./scripts/go-live-smoke.sh

# Login once then smoke with real JWT (preferred; respects login rate-limit):
LOGIN_EMAIL=admin@example.com LOGIN_PASSWORD='…' ./scripts/go-live-smoke.sh

# Prod (Bearer already minted):
BASE_URL=https://<host>/api AUTH_HEADER="Authorization: Bearer $TOKEN" ./scripts/go-live-smoke.sh

# GL-05 area-scope with JWT (local demo accounts only):
./scripts/go-live-persona-jwt.sh
```

Authenticated as Super Admin (real login JWT in prod, not local persona):

| # | Check | Expect |
|---|-------|--------|
| 1 | `GET /api/actuator/health` | UP (mail probe **off** by default — set `MANAGEMENT_HEALTH_MAIL_ENABLED=true` only with live SMTP) |
| 2 | `GET /api/v1/response/incidents` | 200 |
| 3 | `GET /api/v1/response/allocations` | 200 |
| 4 | `GET /api/v1/warehouses` | 200 |
| 5 | `GET /api/v1/ew/dmd/consolidated` | 200 |
| 6 | `GET /api/v1/ew/dmd/impact-support?day=1` | 200 |
| 7 | `GET /api/v1/finance/economics` | 200 |
| 8 | `GET /api/v1/monitoring-evaluation/dashboard` | 200 |
| 9 | `GET /api/v1/settings/roles` | 200 |
| 10 | `GET /api/v1/ops/go-live-readiness` | 200 + honest flags + integrity snapshot |
| 11 | Unauth protected API | **401** |
| 12 | Public portal root / health | 200 |

**Local dual-proof 2026-07-10:**

| Proof | Result |
|-------|--------|
| Smoke (persona header) | **12/12** |
| Smoke (real JWT Super Admin) | **12/12** |
| DAS JWT area | own incident **200** / foreign **404** |
| RAS JWT area | own warehouse **200** / foreign warehouse+incident **404** |
| Partners (header) | staff settings/warehouses/allocations **403** |
| IFMIS export | `success=true` + `integration_messages` audit (not live post) |
| Geo + INFORM | Ilala → `TZ0702` |
| GL-06 seats | **0** districts without DAS; **0** regions without RAS (phones sparse = GL-08) |
| Login rate-limit | **429** after burst (working as designed) |
| Frontend prod build | `npm run build -- --configuration production` → `frontend/dist/dmis-web` **OK** |
| Prod profile **without** JWT secret | **refuse start** (`IllegalStateException` DMIS_AUTH_JWT_SECRET) |
| Prod profile **without** CORS origins | **refuse start** (`IllegalStateException` allowed-origins) |
| Prod profile **with** JWT+CORS | health **UP**; unauth **401**; `X-Local-Roles` **401** (no local god-mode); Super Admin login → `MFA_ENROLL_REQUIRED` (force-2FA) |
| Prod RAS JWT area | own warehouse **200** / foreign **404** (full session; not force-2FA) |
| Cutover snapshot | `./scripts/cutover-snapshot.sh` → `/tmp/dmis-cutover-snapshots/snapshot-*.json` |
| Master verify | `./scripts/cutover-verify-all.sh` (health + smoke + integrity + snapshot) |
| Force-2FA enroll | `MFA_ENROLL_REQUIRED` → limited token → `/2fa/setup` → `/2fa/enable` → full JWT **200** |
| Force-2FA login | `MFA_REQUIRED` + challenge → `/2fa/verify` → full JWT **200** (fixed: verify was missing from public allowlist) |
| Frontend static | `frontend/dist/dmis-web` index **200** via simple static server |

Optional: one controlled SMS + email to known internal address, then confirm `sms_logs` / email logs.

### Bug fixed during cutover dual-proof (2026-07-10)

| Issue | Fix |
|-------|-----|
| `POST /v1/auth/2fa/verify` required JWT but `MFA_REQUIRED` login issues **no** token (only `challengeToken`) → permanent 401 after TOTP enroll | Added path to `SecurityPaths.PUBLIC_PATHS`; rate-limited with login attempts |

> **Demo passwords** (`admin` / `password`) exist only for local dual-proof. **Delete/rotate before public edge.**

---

## 4. What is production-ready vs not

| Ready (platform) | Not ready / not claimed |
|------------------|-------------------------|
| Incident → allocate → dispatch → stock | Live NIDA identity verify |
| EW multi-agency bus + PMO consolidate + Action Guide | Live LATRA/NAPA/IFMIS APIs |
| INFORM + impact-support (deterministic) | Satellite / AI product (F114/F105) |
| Budget / NDMF / Economics formulas | Fresh empty DB from V1 only |
| JWT, RBAC, ModuleGuard, god-mode off | Full Keycloak SSO without extra work |
| SMS/email **code** | Carrier DLR registration & live keys |

---

## 5. Post go-live (space02 §8 parallel tracks)

1. **DBA-1** geo aliases population (EW/GADM/INFORM name dictionary).  
2. **DBA-2** nightly orphan reports from integrity views.  
3. **INT-*** first adapter only after MoU — use `integration_*` tables (V187+).  
4. F114 exposure / F105 AI only after factual snapshots.

---

## 6. Go-live acceptance (sign-off)

| Sign-off | Name / date | Notes |
|----------|-------------|--------|
| Platform owner (PMO-DMD) | | |
| ICT / ops | | Secrets, TLS, backups |
| Security | | 401 unauth, 2FA privileged roles |
| Functional lead | | Role walkthrough complete |
| Residual accepted | | List GL-07…GL-10 / DEFERRED F105 F114 |

### Residual acceptance checklist (print / attach)

| ID | Residual | Accept? (Y/N) | Sign |
|----|----------|---------------|------|
| GL-01 | Deployed with **prod** profile; JWT secret ≥32; no local persona headers on edge | | |
| GL-02 | M-Gov SMS keys + DLR **or** SMS deferred | | |
| GL-03 | SMTP fully configured **or** email deferred | | |
| GL-07 | Demo users/passwords removed from production DB | | |
| GL-08 | Sparse officer phones (SMS notify weak where blank) | | |
| GL-09 | PDF sidecar HA optional | | |
| GL-10 | Clean DB / baseline path certified | | |
| DEF-1 | F105 AI/ML deferred | | |
| DEF-2 | F114 satellite/full exposure deferred | | |
| DEF-3 | NIDA / LATRA / NAPA / live IFMIS not claimed | | |
| DATA-1 | Unscoped free-text drafts — soft-sim or leave unscoped; do not invent areas | | |
| DATA-2 | Past disasters — genuine history bridged (unbridged=0); UI test excluded | | |
| POLY-01 | Soft event links — integrity views + orphan cleanup (V194–V195) | | |
| DEF-INT | NIDA/LATRA/NAPA/live IFMIS not claimed | | |

**Residual accept env (after this table is signed):** set matching `DMIS_GO_LIVE_ACCEPT_*=true` on the host, restart API, re-check `GET /v1/ops/go-live-readiness`. Script: `scripts/resolve-cutover-residuals.sh`.

**Certificate language:** “Careful production cutover completed against space02 scorecard; external national systems not integrated unless separately dual-proved.”

---

## 7. Related APIs added for integrity (platform)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/ops/go-live-readiness` | Authenticated honesty board (profile, flyway, secret presence flags, integration registry counts) |
| `GET /api/v1/ops/integration-registry` | List registered external endpoints (admin) |
| `GET /api/v1/ops/integrity-summary` | Counts from DBA integrity views |
| `POST /api/v1/ops/integrations/ifmis/export-commitments` | INT-FIN-01 commitment export payload + message log (not live IFMIS) |
| `GET /api/v1/ops/geo/resolve?name=` | Resolve district alias → ids / INFORM code |

These **never** invent green lights for missing NIDA/LATRA keys.

---

*End of GO-LIVE-RUNBOOK.md*
