-- V197: M&E organization↔indicator assignments + auto value capture metadata.
-- Honesty: does not invent national APIs; auto-capture only from in-platform tables
-- when me_indicator_catalog.source_module is set.

CREATE TABLE IF NOT EXISTS public.me_organization_indicators (
    id              BIGSERIAL PRIMARY KEY,
    agency_id       BIGINT REFERENCES public.agencies(id) ON DELETE CASCADE,
    stakeholder_id  BIGINT REFERENCES public.stakeholders(id) ON DELETE CASCADE,
    indicator_id    BIGINT NOT NULL REFERENCES public.me_indicator_catalog(id) ON DELETE CASCADE,
    auto_capture    BOOLEAN NOT NULL DEFAULT true,
    active          BOOLEAN NOT NULL DEFAULT true,
    assigned_by     BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT me_org_ind_one_owner_ck CHECK (
        (agency_id IS NOT NULL AND stakeholder_id IS NULL)
        OR (agency_id IS NULL AND stakeholder_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_me_org_ind_agency
    ON public.me_organization_indicators (agency_id, indicator_id)
    WHERE agency_id IS NOT NULL AND active;

CREATE UNIQUE INDEX IF NOT EXISTS ux_me_org_ind_stakeholder
    ON public.me_organization_indicators (stakeholder_id, indicator_id)
    WHERE stakeholder_id IS NOT NULL AND active;

CREATE INDEX IF NOT EXISTS ix_me_org_ind_indicator
    ON public.me_organization_indicators (indicator_id)
    WHERE active;

COMMENT ON TABLE public.me_organization_indicators IS
  'Which M&E indicators an agency/stakeholder must report. Values still live in me_indicator_values; auto_capture seeds from source_module when possible.';
