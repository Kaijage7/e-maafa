-- V196: Careful cutover hygiene — no invented geography/phones/integrations.
-- Force password rotation on known demo / local-dev accounts so they cannot
-- ship to a public edge with baseline passwords. Idempotent.

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

-- Keep simulation / cancelled demo incidents out of operational non-sim views
-- (already soft-sim from earlier migrations; reaffirm title noise only).
UPDATE public.incidents
SET is_simulation = true,
    updated_at = now()
WHERE coalesce(is_simulation, false) = false
  AND (
    title ILIKE '%test site%'
    OR title ILIKE '%ui test%'
    OR title ILIKE '%5G rollout%'
  );

-- UI-test hazards must stay inactive
UPDATE public.hazards
SET is_active = false,
    updated_at = now()
WHERE (name ILIKE 'UI Test Hazard%' OR name ILIKE '%[staging exclude]%')
  AND coalesce(is_active, true) = true;
