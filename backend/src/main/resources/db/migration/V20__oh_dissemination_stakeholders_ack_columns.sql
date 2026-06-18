-- Source migration 2026_03_26_000002_add_acknowledgement_to_dissemination_stakeholders was
-- missed in the V15 read-model stub. Additive; IF NOT EXISTS keeps production untouched.
ALTER TABLE public.oh_dissemination_stakeholders
    ADD COLUMN IF NOT EXISTS acknowledgement_status VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE public.oh_dissemination_stakeholders
    ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;
ALTER TABLE public.oh_dissemination_stakeholders
    ADD COLUMN IF NOT EXISTS acknowledged_by BIGINT;
