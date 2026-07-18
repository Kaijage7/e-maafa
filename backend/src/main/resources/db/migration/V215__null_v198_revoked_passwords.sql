-- F117: V198 revoked demo/seeded credentials by setting one FIXED literal bcrypt hash on every
-- affected account. One shared literal across all revoked accounts is a single point of failure
-- (one preimage opens them all), and its "generated once; not a known secret" claim is
-- unverifiable. Replace it with NULL: AuthServiceImpl compares NULL hashes against a per-boot
-- decoy hash, so login on a NULL password fails with a timing-safe 401 by construction.
-- Idempotent; touches ONLY rows still carrying the exact V198 literal. On local-profile hosts the
-- LocalTestPasswordSeeder continues to (re)issue dev credentials for its cover list after boot,
-- so local testing is unaffected.

UPDATE public.users
SET password = NULL,
    updated_at = now()
WHERE password = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZRGdjGj/n3.rOqP9nKzY5xqH0YvSi';
