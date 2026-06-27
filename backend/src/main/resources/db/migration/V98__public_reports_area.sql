-- Citizen hazard reports currently carry only free-text location + lat/long. Add nullable area FKs so the
-- DDMC triage queue can be district-scoped (shared-or-own: a NULL area is an untagged report visible to all
-- coordinators until one assigns it on convert). The public "Report Hazard" wizard can populate these later;
-- existing rows stay NULL (shared pool).
alter table public.public_hazard_reports add column if not exists region_id   bigint;
alter table public.public_hazard_reports add column if not exists district_id bigint;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'public_hazard_reports_region_fk') then
    alter table public.public_hazard_reports
      add constraint public_hazard_reports_region_fk foreign key (region_id) references public.regions(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'public_hazard_reports_district_fk') then
    alter table public.public_hazard_reports
      add constraint public_hazard_reports_district_fk foreign key (district_id) references public.districts(id);
  end if;
end $$;

create index if not exists idx_public_hazard_reports_district on public.public_hazard_reports(district_id);
