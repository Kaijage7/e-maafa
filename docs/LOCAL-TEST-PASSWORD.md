# Local test password — seed and production revoke

## Local / testing only

| Item | Value |
|------|--------|
| **Constant password** | `Password@2026` |
| **Where it is set** | Spring profile **`local` only** (`LocalTestPasswordSeeder`, first-boot seeders) |
| **Primary login** | `admin@example.com` / `Password@2026` |
| **Also applied to** | `eocc@pmo.go.tz`, `director@pmo.go.tz`, `dc@test.com`, `tma@meteo.go.tz`, `@example.com` / `@example.dev` / `@test.com`, `seeded_officer` accounts, and local incident-flow role holders listed below |

On every local API start, `LocalTestPasswordSeeder`:

1. BCrypt-hashes `Password@2026` and writes it to those accounts.
2. Clears `must_change_password` so V196 cutover hygiene does not block local login.

For maximum local incident testing, the same local-only reset covers the operational ladder and its
advisory/logistics personas: `Dist DC`, `DED`, `DAS`, `District Commissioner`, `District Planning Officer`,
`District Logistic Officer`, `Reg DC`, `RAS`, `RC`, `Regional Planning Officer`, `Regional Logistic Officer`,
`EOCC`, `Director`, and `Secretary`. Generate the current database-backed workbook with:

```bash
python3 scripts/export-local-incident-credentials.py
```

The generated workbook and CSV files are written under `test-data/local/` and intentionally ignored by Git.
They contain local test credentials and must not be attached to a production deployment package.

Before a bulk automated lifecycle run, isolate background/external work while leaving the normal production
defaults unchanged:

```bash
export DMIS_SCANNER_SCHEDULED_ENABLED=false
export DMIS_SCENARIO_INJECTS_ENABLED=false
export DMIS_DELIVERY_RETRY_ENABLED=false
export DMIS_SECURITY_RATELIMIT_LOGIN_ENABLED=false
export DMIS_SECURITY_RATELIMIT_WRITE_ENABLED=false
export MAIL_HOST= MAIL_USERNAME= MAIL_PASSWORD=
export MGOV_API_KEY= MGOV_SYSTEM_ID= MGOV_MOBILE_SERVICE_ID=
```

`dmis.scanner.scheduled-enabled=false` stops only the background internet sweep; the authenticated manual
scanner endpoint remains available for a separate controlled test.

UI: http://localhost:4200/login  

```text
Email:    admin@example.com
Password: Password@2026
```

> **Honesty:** This string is intentionally blocked by production password policy (base word `password` + common-password list entry). Seeders set the hash directly and bypass the policy; self-service **change/reset cannot re-select it**.

---

## Going to production — how to revoke

### 1. Never run `local` on the public edge

```bash
# Required
export SPRING_PROFILES_ACTIVE=prod   # or country non-local profile — never "local"
```

`LocalTestPasswordSeeder` and other `@Profile("local")` beans **do not load** under `prod`.

### 2. Flyway V198 (automatic on first prod start with this release)

Migration `V198__revoke_local_test_password_on_cutover.sql`:

- Sets `must_change_password = true` on demo-pattern emails / seeded officers.
- Replaces their password hashes with an **unusable** bcrypt (login fails).
- Operators must **create real accounts** or use admin set-password / forgot-password with live SMTP.

Verify after deploy:

```sql
-- Demo-pattern accounts must not login with Password@2026
SELECT email, must_change_password, left(password, 7) AS hash_prefix
FROM public.users
WHERE email ILIKE '%@example.com'
   OR email ILIKE '%@example.dev'
   OR email ILIKE '%@test.com'
   OR coalesce(seeded_officer, false);

-- Expect: must_change_password = true, hash not matching a live local seed
```

### 3. Manual revoke (if migrating a DB that already has the test password)

Run as DBA **before** opening the public edge (or after V198 if you need a one-off):

```sql
-- Force change + kill known test sessions' credentials
UPDATE public.users
SET must_change_password = true,
    password = crypt(gen_random_uuid()::text, gen_salt('bf', 10)),  -- needs pgcrypto
    updated_at = now()
WHERE email ILIKE '%@example.com'
   OR email ILIKE '%@example.dev'
   OR email ILIKE '%@test.com'
   OR lower(email) IN (
        'admin@example.com', 'eocc@pmo.go.tz', 'director@pmo.go.tz',
        'dc@test.com', 'tma@meteo.go.tz'
      )
   OR coalesce(seeded_officer, false) = true;

-- Optional: disable demo Super Admin entirely if real ICT admin already exists
-- DELETE FROM public.model_has_roles WHERE model_id = (SELECT id FROM public.users WHERE email = 'admin@example.com');
-- Or soft-block by renaming email:
-- UPDATE public.users SET email = 'admin.revoked@invalid.local' WHERE email = 'admin@example.com';
```

If `pgcrypto` is unavailable, set any random BCrypt from the app host:

```bash
# On a secure workstation — generate one-time hash, then:
# UPDATE public.users SET password = '<bcrypt>', must_change_password = true WHERE ...
```

### 4. Provision real production admins

1. ICT creates Super Admin / ICT Admin with **unique** policy-compliant passwords (not shared).
2. Enable `DMIS_AUTH_FORCE_2FA_ROLES` for privileged roles.
3. Prefer invite + forgot-password email over shared secrets.
4. Confirm login with `Password@2026` **fails** for every demo email.

### 5. Dual-proof checklist (sign-off)

| Check | Pass criteria |
|--------|----------------|
| `SPRING_PROFILES_ACTIVE` ≠ `local` | Config review |
| `POST /api/v1/auth/login` with `admin@example.com` / `Password@2026` | **401 / credentials do not match** |
| Real Super Admin login | **200** + JWT; 2FA if forced |
| Password policy rejects `Password@2026` on change/reset | **400** |
| No `LocalTestPasswordSeeder` in prod logs | Log review |

### 6. What does **not** need manual delete

- Source constant `LocalTestCredentials.PASSWORD` in the jar under `tz.go.pmo.dmis.local` — only loaded with `@Profile("local")`.
- Keeping the string in docs for developers is fine; **never** put it in `docs/env.prod.example` as a live secret.

---

## Scripts / smoke

Local:

```bash
LOGIN_EMAIL=admin@example.com LOGIN_PASSWORD='Password@2026' ./scripts/go-live-smoke.sh
```

Production smoke must use **real** operator credentials, never this constant.
