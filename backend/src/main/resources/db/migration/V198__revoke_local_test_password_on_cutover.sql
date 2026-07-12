-- V198: Production cutover — revoke local/demo test credentials.
-- Does NOT set Password@2026 (that constant exists only in local-profile Java seeders).
-- Forces password change on demo-pattern accounts and invalidates any remaining baseline
-- demo hashes by replacing them with a random unusable bcrypt (login fails until ICT
-- issues a real invite / admin set-password).
--
-- Safe and idempotent on clean prod DBs that have no demo emails (UPDATE affects 0 rows).

-- 1) Force rotation flag on known local/demo patterns (extends V196).
UPDATE public.users
SET must_change_password = true,
    updated_at = now()
WHERE (
    email ILIKE '%@example.com'
    OR email ILIKE '%@example.dev'
    OR email ILIKE '%@test.com'
    OR email ILIKE '%.example.%'
    OR lower(email) IN (
      'admin@example.com',
      'eocc@pmo.go.tz',
      'director@pmo.go.tz',
      'dc@test.com',
      'tma@meteo.go.tz',
      'ded.dodoma@example.dev',
      'rc.dodoma@example.dev'
    )
    OR coalesce(seeded_officer, false) = true
  );

-- 2) Invalidate passwords for the same set so the local constant (or old "admin"/"password")
-- cannot open a session even if must_change were bypassed. Operators must use admin
-- set-password or forgot-password with real SMTP after cutover.
-- bcrypt of a random 32-byte value (generated once for this migration; not a known secret).
UPDATE public.users
SET password = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZRGdjGj/n3.rOqP9nKzY5xqH0YvSi',
    updated_at = now()
WHERE (
    email ILIKE '%@example.com'
    OR email ILIKE '%@example.dev'
    OR email ILIKE '%@test.com'
    OR email ILIKE '%.example.%'
    OR lower(email) IN (
      'admin@example.com',
      'eocc@pmo.go.tz',
      'director@pmo.go.tz',
      'dc@test.com',
      'tma@meteo.go.tz',
      'ded.dodoma@example.dev',
      'rc.dodoma@example.dev'
    )
    OR coalesce(seeded_officer, false) = true
  );

COMMENT ON COLUMN public.users.must_change_password IS
  'When true, login returns PASSWORD_CHANGE_REQUIRED until the user sets a policy-compliant password. V198 invalidates demo hashes at cutover.';
