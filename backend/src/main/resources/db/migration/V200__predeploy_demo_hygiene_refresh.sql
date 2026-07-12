-- V200: Re-apply demo account password-rotation hygiene (idempotent).
-- LocalTestPasswordSeeder may re-hash demo emails under local profile; cutover still
-- requires must_change_password so baseline passwords never face a public edge.

UPDATE public.users
SET must_change_password = true,
    updated_at = now()
WHERE coalesce(must_change_password, false) = false
  AND (
    email ILIKE '%@example.com'
    OR email ILIKE '%@example.dev'
    OR email ILIKE '%@test.com'
    OR email ILIKE '%.example.%'
    OR lower(email) IN (
      'admin@example.com',
      'dc@test.com',
      'ded.dodoma@example.dev',
      'rc.dodoma@example.dev'
    )
  );
