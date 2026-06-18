-- THREAT MONITORING — national-level threats under DMD watch (e.g. Super El Niño/TMA,
-- Ebola/MoH), shown beside LIVE MONITORING on the public front. Each threat carries:
--   * its source agency + global-trend label + a changeable graphic,
--   * a TIMELINE of DMD interventions/updates (status NEW → ONGOING → COMPLETED),
--   * stakeholder PLAN SUBMISSIONS (sector/LGA/RAS…) with geo info — visible on the map
--     and tracked into the disaster repository.
-- All content is managed in Content Management; the public site only reads.

CREATE TABLE IF NOT EXISTS public.threats (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(150),                 -- e.g. 'Super El Niño'
    source_agency VARCHAR(150),        -- e.g. 'TMA', 'Ministry of Health'
    trend_label VARCHAR(255),          -- e.g. 'Trending from global centers'
    severity VARCHAR(30) DEFAULT 'Watch',   -- Watch | Warning | Emergency (MeteoAlarm-aligned)
    graphic_path VARCHAR(255),         -- changeable graphic (public storage or asset path)
    description_en TEXT,
    description_sw TEXT,
    -- Past impacts to Tanzania (loss & damage per the National Disaster Risk Financing and
    -- Implementation Plan 2025/26–2030/31) — rendered in Elimu's threat reflection.
    past_impacts_en TEXT,
    past_impacts_sw TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- DMD intervention/update timeline per threat ("NEW: development of draft contingency plan
-- for El Niño, 15–19 June 2026" → later "ONGOING" → "COMPLETED").
CREATE TABLE IF NOT EXISTS public.threat_updates (
    id BIGSERIAL PRIMARY KEY,
    threat_id BIGINT REFERENCES public.threats(id) ON DELETE CASCADE,
    title VARCHAR(255),                -- e.g. 'Development of draft contingency plan'
    detail TEXT,
    status VARCHAR(20) DEFAULT 'NEW',  -- NEW | ONGOING | COMPLETED
    starts_on DATE,
    ends_on DATE,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- Stakeholder plan submissions under a threat (sector / regional / LGA contingency plans
-- sent to PMO). Geo + stakeholder info → plotted on the threat map; every submission is
-- repository-tracked.
CREATE TABLE IF NOT EXISTS public.threat_plans (
    id BIGSERIAL PRIMARY KEY,
    threat_id BIGINT REFERENCES public.threats(id) ON DELETE CASCADE,
    plan_title VARCHAR(255),
    stakeholder_type VARCHAR(50),      -- sector | region | lga | ras | partner …
    stakeholder_name VARCHAR(255),     -- e.g. 'Ministry of Agriculture', 'Mwanza Region'
    region VARCHAR(100),
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    file_path VARCHAR(255),            -- uploaded plan document (public storage)
    status VARCHAR(30) DEFAULT 'Submitted',  -- Submitted | Under review | Approved
    submitted_by VARCHAR(255),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_threat_plans_threat ON public.threat_plans(threat_id);
