-- The existing app's 2025_09_18_113045_add_detailed_fields_to_hazards_table migration, mirrored for the
-- local read model. ADD COLUMN IF NOT EXISTS keeps production (where Laravel already added them) untouched.
ALTER TABLE public.hazards ADD COLUMN IF NOT EXISTS category VARCHAR(255);
ALTER TABLE public.hazards ADD COLUMN IF NOT EXISTS severity VARCHAR(255);
ALTER TABLE public.hazards ADD COLUMN IF NOT EXISTS frequency VARCHAR(255);
ALTER TABLE public.hazards ADD COLUMN IF NOT EXISTS warning_signs JSON;
ALTER TABLE public.hazards ADD COLUMN IF NOT EXISTS impact_areas JSON;
ALTER TABLE public.hazards ADD COLUMN IF NOT EXISTS typical_duration VARCHAR(255);
ALTER TABLE public.hazards ADD COLUMN IF NOT EXISTS seasonal_pattern VARCHAR(255);
ALTER TABLE public.hazards ADD COLUMN IF NOT EXISTS response_required JSON;
ALTER TABLE public.hazards ADD COLUMN IF NOT EXISTS prevention_measures JSON;
ALTER TABLE public.hazards ADD COLUMN IF NOT EXISTS historical_incidents JSON;
ALTER TABLE public.hazards ADD COLUMN IF NOT EXISTS affected_sectors JSON;
ALTER TABLE public.hazards ADD COLUMN IF NOT EXISTS vulnerability_factors JSON;
ALTER TABLE public.hazards ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
