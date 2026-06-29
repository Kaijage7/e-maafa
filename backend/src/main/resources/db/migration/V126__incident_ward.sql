-- I6 (national stakeholders feedback): allow incidents to be located at the WARD (and council) level,
-- not just region/district. Additive + nullable; existing rows keep their region_id/district_id only.
alter table public.incidents add column if not exists council_id bigint;
alter table public.incidents add column if not exists ward_id    bigint;

comment on column public.incidents.council_id is 'Council (LGA) of the incident — finer than district. Nullable.';
comment on column public.incidents.ward_id   is 'Ward of the incident — the lowest admin level. Nullable.';
