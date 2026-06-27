-- Anticipatory action plans carried no area FK — only a free-text `district_council` — so the list, by-id
-- read, create and update could not be jurisdiction-scoped (a district officer could read/edit/submit any
-- council's plan nationwide). Add numeric region_id/district_id and backfill from the councils registry,
-- falling back to a region-name prefix match for council strings with no exact councils row.
alter table public.anticipatory_action_plans add column if not exists region_id bigint;
alter table public.anticipatory_action_plans add column if not exists district_id bigint;

-- Primary: exact council-name match -> authoritative region_id + district_id.
update public.anticipatory_action_plans a
set region_id = c.region_id, district_id = c.district_id
from public.councils c
where lower(c.name) = lower(a.district_council)
  and a.region_id is null;

-- Fallback 1: a district whose name prefixes the council string (e.g. 'Same District Council' -> Same).
update public.anticipatory_action_plans a
set district_id = d.id, region_id = d.region_id
from public.districts d
where a.region_id is null
  and lower(a.district_council) like lower(d.name) || ' %';

-- Fallback 2: a region whose name prefixes the council string (e.g. 'Mbeya City Council' -> Mbeya);
-- leaves region/district NULL (national/shared) only for strings that match nothing.
update public.anticipatory_action_plans a
set region_id = r.id
from public.regions r
where a.region_id is null
  and (lower(a.district_council) like lower(r.name) || '%' or lower(a.district_council) = lower(r.name));
