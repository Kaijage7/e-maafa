-- V203: District-scoped officers need region_id for honest dual-id filters (EW, warehouses).
-- Idempotent: only fills users.region_id when district is set and region is still null.

update public.users u
set region_id = d.region_id,
    updated_at = now()
from public.districts d
where u.district_id = d.id
  and u.region_id is null
  and u.district_id is not null;
