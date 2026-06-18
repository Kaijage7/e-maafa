-- The public "Register as Stakeholder" form captures Country (and, when Tanzania, region -> district).
-- The shared public.stakeholders table already has region + district (V15) but no country column.
-- Additive + idempotent (region/district untouched). Assessor-claimed block V81 (V61-80 exhausted at V80).
ALTER TABLE public.stakeholders ADD COLUMN IF NOT EXISTS country VARCHAR(255);
