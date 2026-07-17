# LIVE-ISSUE-TRACKER

> **Updated:** 2026-07-17 · **`main` / `clean2` @ `c73bb2f`** · Flyway through **V214**  
> **Honesty:** Scoreboard for operators and agents. **Not** a signed production certificate.  
> **Cutover decision page:** [go-live/06-DEFERRED-VS-MUST-CLOSE.md](./go-live/06-DEFERRED-VS-MUST-CLOSE.md)

## Scoreboard (honest)

| Bucket | Count | Notes |
|--------|------:|-------|
| **F01–F116 ledger** | 116 | `DMIS-AUDIT-FIX-LOG.md` |
| **Documented resolved** | **113** | FIXED/CLOSED in fix-log |
| **Official open F-items** | **3** | **F105** AI · **F114** EO/exposure · **F116** linkage/capacity (incident hybrid partial) |
| **Git** | Aligned | `origin/main` = `origin/clean2` = `c73bb2f` |
| **Ops gates** | Edge | See **must-close** list in `06-DEFERRED-VS-MUST-CLOSE.md` |

**Authoritative product status:** `DMIS-AUDIT-FIX-LOG.md`.  
**Hybrid contract:** `docs/MOBILE-WEB-HYBRID-API.md`.

---

## Gaps in plain language

| Kind | What |
|------|------|
| **Must-close (ops)** | Prod profile, JWT/CORS/TLS, no demo passwords, Flyway ≥ V214, health + unauth 401, PDF if bulletins in scope |
| **Configure or defer** | SMS, email, sparse phones, NIDA/LATRA/NAPA/IFMIS live, Keycloak SSO |
| **Accepted deferred product** | F105 AI · F114 satellite impact SoR · F116 full mobile/offline/scale (hybrid foundation only) |

---

## Integrity / publish note (2026-07-17)

- ModuleGuard + Response Settings dual-layer + notification auth  
- **V214** shared JWT denylist (multi-node logout)  
- Pushed to **GitHub `main` and `clean2`**  
- Live dual-proof on laptop: suite green, go-live smoke 12/12, persona JWT fail=0  

**Still not a host certificate** until Section A of `06-DEFERRED-VS-MUST-CLOSE.md` is green on the **target** environment.

---

## Production deploy (reminder)

`prod` · real JWT ≥32 bytes · force-2FA · CORS origins · no `local` · **rotate demo passwords** · Flyway through **V214**.
