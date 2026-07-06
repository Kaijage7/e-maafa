-- Data repair (audit F24): citizen-report conversions (PublicReportsController.convert, fixed alongside
-- this migration) inserted district_id/region_id but never the denormalized district_name/region_name.
-- The DED/RAS queues, the stage notifications and the incident map's no-coordinates region-centroid
-- fallback all read those name columns, so portal-origin incidents showed a blank area and their
-- notifications rendered "(null)". Backfill the names from the authoritative districts/regions rows
-- wherever the id is set but the name is missing. Officer-created incidents (names already present,
-- possibly hand-typed) are untouched. Idempotent.

update public.incidents i
set district_name = d.name, updated_at = now()
from public.districts d
where d.id = i.district_id
  and (i.district_name is null or i.district_name = '');

update public.incidents i
set region_name = r.name, updated_at = now()
from public.regions r
where r.id = i.region_id
  and (i.region_name is null or i.region_name = '');

-- Some conversions were tagged with a district only; a district belongs to exactly one region, so the
-- region id + name can be derived from it (same rule the incident form applies via regionOfDistrict).
update public.incidents i
set region_id = d.region_id, region_name = r.name, updated_at = now()
from public.districts d
join public.regions r on r.id = d.region_id
where d.id = i.district_id
  and i.region_id is null;
