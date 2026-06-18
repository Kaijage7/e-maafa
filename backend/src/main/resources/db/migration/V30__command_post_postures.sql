-- R11b Command Post doctrine (NDPRP 2022 + Disaster Management Act 2022):
-- an activation has a POSTURE that walks the ladder
--   monitoring  → forecast received, DMD watching, DRFs on call
--   emergency   → impact imminent/localised, preparedness plans executing
--   disaster    → declared disaster event, full response coordination
-- (is_simulation from V29 stays orthogonal — any posture can be drilled.)
-- Anticipatory activations start from a FORECAST, before any incident exists.
alter table public.response_activations
    add column if not exists posture varchar(20) not null default 'disaster'
        check (posture in ('monitoring','emergency','disaster')),
    add column if not exists trigger_type varchar(20) not null default 'incident'
        check (trigger_type in ('incident','forecast')),
    add column if not exists hazard_description varchar(255),
    add column if not exists affected_areas json,          -- forecast impact areas (regions/coastal zones)
    add column if not exists expected_impact_at timestamptz, -- e.g. cyclone landfall ETA
    add column if not exists forecast_track json;          -- [[lat,lng,ts],...] for the storm animation
alter table public.response_activations alter column incident_id drop not null;
create index if not exists idx_activations_posture on public.response_activations(posture, status);
