-- Editable Action Guide Book rows for Content Management (PMO statement library).
-- Seeded from the packaged ACTION_GUIDE_BOOK catalog on first deploy; admins edit without redeploying JSON.
CREATE TABLE IF NOT EXISTS public.ew_action_guide_statements (
    id              BIGSERIAL PRIMARY KEY,
    hazard_id       VARCHAR(80)  NOT NULL,
    hazard_name     VARCHAR(120) NOT NULL,
    impact_level    VARCHAR(32)  NOT NULL,  -- ADVISORY | WARNING | MAJOR_WARNING
    sort_order      INT          NOT NULL DEFAULT 0,
    impact_en       TEXT,
    impact_sw       TEXT,
    action_en       TEXT,
    action_sw       TEXT,
    active          BOOLEAN      NOT NULL DEFAULT TRUE,
    updated_by      BIGINT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_ew_action_guide_hazard_level
    ON public.ew_action_guide_statements (hazard_id, impact_level, sort_order);

CREATE TABLE IF NOT EXISTS public.ew_action_guide_common (
    id              SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    statement_en    TEXT,
    statement_sw    TEXT,
    updated_by      BIGINT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.ew_action_guide_common (id, statement_en, statement_sw)
VALUES (
    1,
    'Regional, District, Ward and Village Disaster Management Committees are required to take appropriate measures to prepare for and respond to disasters in order to reduce the impacts of disasters.',
    'Kamati za Usimamizi wa Maafa za Mikoa, Wilaya, Kata na Vijiji zinatakiwa kuchukua hatua stahiki za kujiandaa na kukabiliana na maafa ili kupunguza athari za majanga.'
)
ON CONFLICT (id) DO NOTHING;
