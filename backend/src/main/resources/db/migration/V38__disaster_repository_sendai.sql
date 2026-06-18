-- =====================================================================================
-- DISASTER REPOSITORY — the national disaster loss database (Sendai Framework support)
--
-- Modeled on the UNDRR DesInventar-Sendai "event card" methodology so DMD can collect,
-- validate and archive disaster loss data in the shape the Sendai Framework Monitor
-- (sendaimonitor.undrr.org) requires for targets A–D and G:
--
--   * disaster_events          — one card per disaster event (the repository spine)
--   * disaster_event_effects   — effects per administrative unit, with the Sendai
--                                disaggregation (sex for human impacts; sector for
--                                economic loss; facilities for target D)
--   * disaster_event_links     — polymorphic links binding the event to everything that
--                                "goes around it" in the system: incidents, warnings,
--                                threats, alerts, damage assessments, response
--                                activations, resource allocations, hazard reports …
--   * sendai_indicators        — reference list of the Sendai global indicators each
--                                effects field feeds (drives the analytics module)
--
-- Data entry/validation is the EOCC officers' duty (enforced in the controllers).
-- =====================================================================================

CREATE TABLE IF NOT EXISTS disaster_events (
    id              BIGSERIAL PRIMARY KEY,
    event_code      VARCHAR(20) NOT NULL UNIQUE,      -- DE-YYYY-NNNN (assigned by the system)
    name            VARCHAR(255) NOT NULL,
    hazard_id       BIGINT REFERENCES hazards(id) ON DELETE SET NULL,
    hazard_type     VARCHAR(100),                     -- denormalized hazard name (survives hazard edits)
    glide_number    VARCHAR(30),                      -- GLIDE id when issued (glidenumber.net)
    started_on      DATE NOT NULL,
    ended_on        DATE,
    primary_region  VARCHAR(100),
    scope           VARCHAR(30) DEFAULT 'District',   -- Ward | District | Regional | National
    description     TEXT,
    triggering_event TEXT,                            -- e.g. "El Niño enhanced rainfall, TMA bulletin 14/2026"
    data_source     VARCHAR(255),                     -- where the figures came from (sitreps, assessments…)
    status          VARCHAR(20) DEFAULT 'Open',       -- Open | Validated | Archived
    recorded_by     VARCHAR(150),                     -- EOCC officer entering the card
    validated_by    VARCHAR(150),
    validated_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_de_started ON disaster_events(started_on);
CREATE INDEX IF NOT EXISTS idx_de_hazard ON disaster_events(hazard_id);
CREATE INDEX IF NOT EXISTS idx_de_status ON disaster_events(status);

-- Effects per administrative unit (one event usually has several district records).
-- Field set follows DesInventar-Sendai so every Sendai indicator can be computed:
--   Target A: deaths + missing      Target B: affected (direct), displaced/relocated
--   Target C: economic loss by sector            Target D: facilities + services
CREATE TABLE IF NOT EXISTS disaster_event_effects (
    id                    BIGSERIAL PRIMARY KEY,
    event_id              BIGINT NOT NULL REFERENCES disaster_events(id) ON DELETE CASCADE,
    region                VARCHAR(100) NOT NULL,
    district              VARCHAR(100),
    -- Target A (mortality) — sex-disaggregated as the Monitor requests
    deaths_male           INT DEFAULT 0,
    deaths_female         INT DEFAULT 0,
    deaths_total          INT DEFAULT 0,
    missing_total         INT DEFAULT 0,
    -- Target B (affected people)
    injured_total         INT DEFAULT 0,
    directly_affected     INT DEFAULT 0,             -- B-2: people whose livelihoods/assets were hit
    displaced             INT DEFAULT 0,
    relocated             INT DEFAULT 0,
    children_affected     INT DEFAULT 0,
    pwd_affected          INT DEFAULT 0,             -- persons with disabilities (disaggregation)
    houses_destroyed      INT DEFAULT 0,             -- B-3/B-4 proxies
    houses_damaged        INT DEFAULT 0,
    -- Target C (direct economic loss, TZS) — by sector as C-2..C-6 require
    agriculture_loss_tzs  NUMERIC(18,2) DEFAULT 0,   -- C-2 (incl. crops; livestock counted below)
    livestock_lost        INT DEFAULT 0,
    crops_destroyed_ha    NUMERIC(12,2) DEFAULT 0,
    housing_loss_tzs      NUMERIC(18,2) DEFAULT 0,   -- C-4
    infrastructure_loss_tzs NUMERIC(18,2) DEFAULT 0, -- C-5 (roads, bridges, power, water)
    other_loss_tzs        NUMERIC(18,2) DEFAULT 0,   -- C-3/C-6 and uncategorized
    total_loss_tzs        NUMERIC(18,2) DEFAULT 0,   -- maintained = sum of the sector columns
    -- Target D (critical infrastructure + basic services)
    schools_damaged       INT DEFAULT 0,             -- D-2 (educational facilities)
    health_facilities_damaged INT DEFAULT 0,         -- D-3
    roads_km_damaged      NUMERIC(10,2) DEFAULT 0,   -- D-1 proxy
    bridges_damaged       INT DEFAULT 0,
    water_systems_damaged INT DEFAULT 0,
    power_systems_damaged INT DEFAULT 0,
    services_disrupted    TEXT,                      -- D-5..D-8: JSON array, e.g. ["Education","Health"]
    notes                 TEXT,
    source                VARCHAR(255),              -- per-record provenance (sitrep no., assessment id)
    created_at            TIMESTAMPTZ DEFAULT now(),
    updated_at            TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dee_event ON disaster_event_effects(event_id);
CREATE INDEX IF NOT EXISTS idx_dee_region ON disaster_event_effects(region);

-- The connective tissue: one row per system record tied to the event. The repository page
-- renders these as the event's operational timeline (warning issued → incident reported →
-- assessment filed → resources dispatched) and analytics traverses them for insights.
CREATE TABLE IF NOT EXISTS disaster_event_links (
    id           BIGSERIAL PRIMARY KEY,
    event_id     BIGINT NOT NULL REFERENCES disaster_events(id) ON DELETE CASCADE,
    entity_type  VARCHAR(40) NOT NULL,   -- incident | early_warning | threat | alert | damage_assessment
                                         -- | response_activation | allocated_resource | public_hazard_report
                                         -- | oh_event | past_disaster | evacuation_center
    entity_id    BIGINT NOT NULL,
    note         VARCHAR(255),
    linked_by    VARCHAR(150),
    created_at   TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_event_entity UNIQUE (event_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_del_event ON disaster_event_links(event_id);
CREATE INDEX IF NOT EXISTS idx_del_entity ON disaster_event_links(entity_type, entity_id);

-- Sendai global indicator reference (seeded by the application; drives the analytics UI
-- so every chart can say exactly which official indicator it reports).
CREATE TABLE IF NOT EXISTS sendai_indicators (
    id          BIGSERIAL PRIMARY KEY,
    code        VARCHAR(10) NOT NULL UNIQUE,   -- A-1 … G-6
    target_letter CHAR(1) NOT NULL,            -- A..G
    title       TEXT NOT NULL,
    unit        VARCHAR(60),                   -- "per 100,000 population", "USD", "count" …
    computed_from TEXT                         -- which repository fields/modules feed it (display hint)
);

-- Baselines used to normalize indicators (per-100,000, % of GDP). Key-value so EOCC/admin
-- can maintain them per year without schema changes.
CREATE TABLE IF NOT EXISTS sendai_baselines (
    id         BIGSERIAL PRIMARY KEY,
    metric     VARCHAR(40) NOT NULL,           -- population | gdp_tzs | usd_rate
    year       INT NOT NULL,
    value      NUMERIC(20,2) NOT NULL,
    source     VARCHAR(255),
    CONSTRAINT uq_baseline UNIQUE (metric, year)
);
