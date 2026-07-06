-- NDRF 2026 (Draft, May 2026) Annex 1 — Damage, Loss and Needs Assessment tool — and
-- Annex 2 — Disaster Recovery Implementation Plan — as per-incident instruments.
-- Annex 1 is keyed section-by-section by the assigned sectors (NDRF Table 1 leads);
-- section answers are stored as JSON keyed by the frontend schema (the instrument is a
-- checklist, not analytics — extraction to typed columns can follow when analytics need it).
-- The system generates the official annex documents back out from what was keyed.

create table if not exists public.dlna_assessments (
    id              bigserial primary key,
    ref_no          varchar(32) unique,
    incident_id     bigint not null references public.incidents (id),
    status          varchar(24) not null default 'In Progress', -- In Progress -> Final
    date_of_visit   date,
    region          varchar(120),
    district        varchar(120),
    ward            varchar(120),
    village         varchar(160),
    gps_coordinates varchar(120),
    disaster_type   varchar(60),
    disaster_type_other varchar(160),
    affected_villages   text,
    team_members    jsonb not null default '[]', -- [{name, organization}]
    interviewees    jsonb not null default '[]', -- [{name, position}]
    created_by      bigint,
    finalized_by    bigint,
    finalized_at    timestamp,
    created_at      timestamp not null default now(),
    updated_at      timestamp not null default now()
);

create index if not exists idx_dlna_assessments_incident on public.dlna_assessments (incident_id);

create table if not exists public.dlna_sections (
    id            bigserial primary key,
    assessment_id bigint not null references public.dlna_assessments (id) on delete cascade,
    section_key   varchar(32) not null,  -- people,nfi,wash,health,food,education,protection,infrastructure,environment,rcce,assistance
    sector_lead   varchar(160),          -- responsible sector per NDRF Table 1 (display attribution)
    data          jsonb not null default '{}',
    status        varchar(16) not null default 'Pending', -- Pending -> Submitted
    filled_by     bigint,
    filled_at     timestamp,
    unique (assessment_id, section_key)
);

-- Annex 2: one Recovery Implementation Plan per incident, chapters as structured JSON
-- (narratives + indicator/budget/matrix rows), pre-seeded from the finalized DLNA.
create table if not exists public.recovery_plans (
    id          bigserial primary key,
    incident_id bigint not null unique references public.incidents (id),
    dlna_id     bigint references public.dlna_assessments (id),
    status      varchar(24) not null default 'Draft', -- Draft -> Final
    chapters    jsonb not null default '{}',
    created_by  bigint,
    updated_by  bigint,
    created_at  timestamp not null default now(),
    updated_at  timestamp not null default now()
);
