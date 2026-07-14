# Go-live plan

**Product:** e-MAAFA / DMIS  
**Type:** Careful cutover plan  
**Owner:** PMO ICT with PMO-DMD business sign-off

## 1. Objective

Place the e-MAAFA platform on the production edge under profile `prod`, with known gates, known residuals, and no false claims about external national systems.

## 2. Roles

| Role | Responsibility |
|------|----------------|
| Cutover lead | Timeline, go/no-go |
| DBA | Database restore/migrate, backup |
| Backend owner | Deploy API jar, Flyway, secrets |
| Frontend owner | Build and publish SPA |
| EOCC / DMD business | Functional sign-off |
| Security | JWT, CORS, TLS, account hygiene |

## 3. Pre-conditions

1. Production database restored from approved baseline (or certified migrate path).  
2. Flyway reaches current approved version on a staging clone first.  
3. Secrets generated (JWT ≥ 32 bytes, DB password, CORS origins).  
4. Reverse proxy ready with TLS.  
5. Staging smoke passed (`scripts/go-live-smoke.sh` or equivalent).  
6. Local test passwords revoked on production data (see `LOCAL-TEST-PASSWORD.md`).  

## 4. Timeline (recommended)

| Phase | Activity |
|-------|----------|
| T-7 days | Freeze expand-only migrations; freeze feature merge |
| T-3 days | Staging full migrate + smoke + readiness board review |
| T-1 day | Backup prod DB; confirm DNS and certs |
| T-0 | Deploy API, SPA, PDF sidecar; smoke; open traffic |
| T+1 day | Review logs, SMS/email residuals, integrity board |

## 5. Deploy steps (T-0)

### 5.1 Database

1. Take a backup.  
2. Apply Flyway with the production app user.  
3. Confirm version in schema history.  
4. Confirm no demo accounts left with shared test password.  

### 5.2 Backend

1. Set `SPRING_PROFILES_ACTIVE=prod`.  
2. Load secrets from the secret store (not from git).  
3. Start the jar or container.  
4. Confirm `/api/actuator/health` (or agreed health path) is healthy.  
5. Confirm `GET /api/v1/ops/go-live-readiness` with an admin token.  

### 5.3 Frontend

1. Production build (`ng build` with production config).  
2. Publish static assets behind the proxy.  
3. Proxy `/api` to the backend.  
4. Proxy `/ew-api` to the PDF service if bulletins are generated on the same host pattern.  

### 5.4 EW PDF sidecar

1. Start `pdf_service.py` bound to localhost only.  
2. Confirm `GET /health` returns kinds list.  
3. Generate one sample PDF from staging data or a controlled test bulletin.  

### 5.5 Open traffic

1. Switch reverse proxy to the new origin (or DNS cut).  
2. Run acceptance checks in `04-ACCEPTANCE.md`.  
3. Record go/no-go decision.  

## 6. Go / no-go gates

| Gate | Pass condition |
|------|----------------|
| Profile | `prod` only on edge |
| Secrets | JWT and CORS fail-fast not tripping |
| Auth | Login works; protected API returns 401 without token |
| Portal | Landing 200 with real aggregates |
| EW | Consolidated 200; PDF health ok |
| Integrity | No unexpected residual spikes on board |
| Accounts | No shared local test password active |

## 7. Rollback

1. Point proxy back to previous static/API revision.  
2. Restore DB only if a migration caused damage (prefer forward fix).  
3. Keep the failed build artifacts and logs for post-mortem.  

## 8. Residual accept (optional, signed)

If SMS or email is not ready, set the matching residual flag only with written sign-off:

- `DMIS_GO_LIVE_ACCEPT_SMS_DEFERRED`
- `DMIS_GO_LIVE_ACCEPT_EMAIL_DEFERRED`
- related flags in `env.prod.example`

Do not use residual flags to hide broken core auth or data integrity.

## 9. Communication

| Audience | Message |
|----------|---------|
| Operators | New URL, login policy, support contact |
| Agencies | How to submit EW updates after cutover |
| Public | Portal URL only; no claim of new satellite products |

## 10. After cutover

1. Watch readiness board daily for one week.  
2. Clear residual SMS/email when keys are dual-proved.  
3. Keep integration endpoints at planned/configured until MoU proofs land.  
