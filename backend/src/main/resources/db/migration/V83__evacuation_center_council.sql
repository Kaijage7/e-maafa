-- Capture the LGA/council level on evacuation centers so the full Tanzania administrative hierarchy
-- (region -> district -> council; 195 councils = 184 mainland + 11 Zanzibar) is recordable, not just
-- region/district. Additive / nullable; populated by the new region->district->council cascade picker.
alter table public.evacuation_centers add column if not exists council varchar(120);
comment on column public.evacuation_centers.council is 'LGA/council name (region->district->council cascade from public.councils).';
