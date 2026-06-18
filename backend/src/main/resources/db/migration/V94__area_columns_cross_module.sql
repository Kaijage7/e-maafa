-- Area (region/district) scoping for stakeholders, permanent warehouses and physical stock
-- (agency_resources). Temporary warehouses already carry region_id/district_id/council_id.
--
-- Nullable region_id / district_id FK columns so a region/district officer sees only their own area while
-- the national tier sees all. NULL means national/shared (visible to everyone): existing and unassigned
-- rows stay visible until an area is set. The resources table is not touched (national catalogue of resource
-- types); area applies to the stock (agency_resources) and allocations. Plans remain national.
-- Idempotent: ADD COLUMN IF NOT EXISTS + guarded FK/index creation.

-- 1) Add the columns ----------------------------------------------------------------------------------
alter table public.warehouses       add column if not exists region_id   bigint;
alter table public.warehouses       add column if not exists district_id bigint;
alter table public.agency_resources add column if not exists region_id   bigint;
alter table public.agency_resources add column if not exists district_id bigint;
alter table public.stakeholders     add column if not exists region_id   bigint;
alter table public.stakeholders     add column if not exists district_id bigint;

-- 2) Foreign keys + indexes (guarded so re-runs / partial applies don't error) -----------------------
do $$
declare
    t    text;
    tbls text[] := array['warehouses','agency_resources','stakeholders'];
begin
    foreach t in array tbls loop
        if not exists (select 1 from pg_constraint where conname = t || '_region_id_fkey') then
            execute format('alter table public.%I add constraint %I foreign key (region_id) '
                        || 'references public.regions(id) on delete set null', t, t || '_region_id_fkey');
        end if;
        if not exists (select 1 from pg_constraint where conname = t || '_district_id_fkey') then
            execute format('alter table public.%I add constraint %I foreign key (district_id) '
                        || 'references public.districts(id) on delete set null', t, t || '_district_id_fkey');
        end if;
        execute format('create index if not exists %I on public.%I (region_id)',   'idx_' || t || '_region_id',   t);
        execute format('create index if not exists %I on public.%I (district_id)', 'idx_' || t || '_district_id', t);
    end loop;
end $$;

-- 3) Backfill stakeholders from their existing free-text region / district names ---------------------
update public.stakeholders s
   set region_id = r.id
  from public.regions r
 where s.region_id is null
   and coalesce(s.region,'') <> ''
   and lower(r.name) = lower(s.region);

update public.stakeholders s
   set district_id = d.id
  from public.districts d
 where s.district_id is null
   and coalesce(s.district,'') <> ''
   and lower(d.name) = lower(s.district);
