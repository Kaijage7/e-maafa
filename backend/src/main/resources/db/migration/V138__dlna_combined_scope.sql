-- DLNA scope options (NDRF practice — e.g. the 2023–2024 El Niño episode was assessed
-- collectively across floods, landslides and Cyclone Hidaya):
--   SINGLE       — one incident (the default, unchanged behaviour)
--   SAME_HAZARD  — one DLNA covering SEVERAL incidents of the SAME hazard (floods across districts)
--   MULTI_HAZARD — one DLNA covering incidents of DIFFERENT hazards (compound events)
-- The template is IDENTICAL; only the incident coverage widens. dlna_assessments.incident_id
-- stays the LEAD incident (jurisdiction, plan linkage); dlna_incidents holds the full coverage
-- (including the lead) so every covered incident lists the DLNA on its page.

alter table public.dlna_assessments
    add column if not exists scope varchar(20) not null default 'SINGLE';

create table if not exists public.dlna_incidents (
    id            bigserial primary key,
    assessment_id bigint not null references public.dlna_assessments (id) on delete cascade,
    incident_id   bigint not null references public.incidents (id),
    unique (assessment_id, incident_id)
);

create index if not exists idx_dlna_incidents_incident on public.dlna_incidents (incident_id);
