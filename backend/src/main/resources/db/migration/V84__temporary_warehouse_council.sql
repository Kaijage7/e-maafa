-- Capture the LGA/council level on temporary warehouses (region_id/district_id already exist but were
-- never populated by the create form). Additive / nullable; the region->district->council picker now
-- resolves names to these FK ids so a temporary warehouse records its full administrative location.
alter table public.temporary_warehouses add column if not exists council_id bigint;
comment on column public.temporary_warehouses.council_id is 'FK-ish id into public.councils (region->district->council cascade).';
