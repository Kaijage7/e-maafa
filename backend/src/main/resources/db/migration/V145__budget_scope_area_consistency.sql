-- F110: Budget approval ceilings depend on disaster_budgets.scope_level, so the row's tier and area ids
-- must be coherent even if data is imported outside BudgetController.

-- Fill/correct district regions where legacy/manual rows carried only district_id or carried
-- a region that does not belong to the selected district.
update public.disaster_budgets db
   set region_id = d.region_id,
       updated_at = now()
  from public.districts d
 where db.district_id = d.id
   and (db.region_id is null or db.region_id <> d.region_id);

-- Normalize existing rows by the strongest area id present before adding the invariant.
update public.disaster_budgets
   set scope_level = case
           when district_id is not null then 'district'
           when region_id is not null then 'region'
           else 'national'
       end,
       updated_at = now()
 where scope_level is null
    or scope_level not in ('national', 'region', 'district')
    or (scope_level = 'national' and (region_id is not null or district_id is not null))
    or (scope_level = 'region' and (region_id is null or district_id is not null))
    or (scope_level = 'district' and district_id is null);

alter table public.disaster_budgets
    drop constraint if exists disaster_budgets_scope_area_chk;

alter table public.disaster_budgets
    add constraint disaster_budgets_scope_area_chk check (
        (scope_level = 'national' and region_id is null and district_id is null)
        or (scope_level = 'region' and region_id is not null and district_id is null)
        or (scope_level = 'district' and region_id is not null and district_id is not null)
    );

alter table public.districts
    drop constraint if exists districts_id_region_unique;

alter table public.districts
    add constraint districts_id_region_unique unique (id, region_id);

alter table public.disaster_budgets
    drop constraint if exists disaster_budgets_district_region_fk;

alter table public.disaster_budgets
    add constraint disaster_budgets_district_region_fk
    foreign key (district_id, region_id) references public.districts(id, region_id);
