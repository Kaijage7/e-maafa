-- Area location for users, so area-targeted dissemination (an EW bulletin pushed for specific districts)
-- can reach the field/area coordinators (RAS/Reg DC by region, DAS/Dist DC by district) registered there.
-- Nullable + ON DELETE SET NULL: existing users are unaffected; coordinators become reachable by area only
-- once these are seeded. Idempotent so a re-run / out-of-band apply is safe.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS region_id BIGINT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS district_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_region_id_fkey') THEN
        ALTER TABLE public.users
            ADD CONSTRAINT users_region_id_fkey FOREIGN KEY (region_id)
            REFERENCES public.regions(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_district_id_fkey') THEN
        ALTER TABLE public.users
            ADD CONSTRAINT users_district_id_fkey FOREIGN KEY (district_id)
            REFERENCES public.districts(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_region_id ON public.users(region_id);
CREATE INDEX IF NOT EXISTS idx_users_district_id ON public.users(district_id);
