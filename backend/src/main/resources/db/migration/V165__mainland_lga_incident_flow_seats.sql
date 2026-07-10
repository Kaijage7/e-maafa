-- Mainland LGA incident-flow seats and explicit Tanzania/Zanzibar geography classification.
--
-- V68 seeds the authoritative geography as:
--   regions  = 31 total (26 Tanzania Mainland + 5 Zanzibar)
--   districts = administrative districts
--   councils = 195 LGAs/councils (184 Mainland + 11 Zanzibar)
--
-- Incident-flow district leadership is operationally attached to the council/LGA level. Keep the
-- generic roles configurable in System Settings, but seed the official seats against each Mainland
-- council so DDMC/DED/DC coverage is 184, not the 154 administrative-district count.

alter table public.regions add column if not exists country_part varchar(20) not null default 'mainland';
alter table public.districts add column if not exists country_part varchar(20) not null default 'mainland';
alter table public.councils add column if not exists country_part varchar(20) not null default 'mainland';

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'regions_country_part_ck') then
        alter table public.regions add constraint regions_country_part_ck
            check (country_part in ('mainland', 'zanzibar'));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'districts_country_part_ck') then
        alter table public.districts add constraint districts_country_part_ck
            check (country_part in ('mainland', 'zanzibar'));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'councils_country_part_ck') then
        alter table public.councils add constraint councils_country_part_ck
            check (country_part in ('mainland', 'zanzibar'));
    end if;
end $$;

update public.regions
set country_part = case
    when region_code in ('70895', '70898', '70896', '70838', '70897') then 'zanzibar'
    else 'mainland'
end;

update public.districts d
set country_part = r.country_part
from public.regions r
where r.id = d.region_id;

update public.councils c
set country_part = r.country_part
from public.regions r
where r.id = c.region_id;

alter table public.users add column if not exists council_id bigint;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'users_council_id_fkey') then
        alter table public.users
            add constraint users_council_id_fkey
            foreign key (council_id) references public.councils(id) on delete set null;
    end if;
end $$;

create index if not exists users_council_id_idx on public.users(council_id);

comment on column public.regions.country_part is 'mainland or zanzibar; supports Tanzania Mainland and Zanzibar administrative coverage counts.';
comment on column public.districts.country_part is 'Inherited from region.country_part.';
comment on column public.councils.country_part is 'Inherited from region.country_part; Mainland councils/LGAs drive DDMC/DED/DC incident-flow seats.';
comment on column public.users.council_id is 'Operational LGA/council attachment for district-level officer seats; district_id remains the parent administrative district.';

update public.roles
set assignment_hint = case name
        when 'Dist DC' then 'Requires region, district and council/LGA attachment; owns the DDMC entry gate for that Mainland council/LGA.'
        when 'DED' then 'Requires region, district and council/LGA attachment; owns the DED approval stage for that Mainland council/LGA.'
        when 'DAS' then 'Requires region, district and council/LGA attachment; district leadership notifications and support for that Mainland council/LGA.'
        when 'District Commissioner' then 'Requires region, district and council/LGA attachment; district incident oversight for that Mainland council/LGA.'
        else assignment_hint
    end,
    updated_at = now()
where name in ('Dist DC', 'DED', 'DAS', 'District Commissioner');

-- Remove only generated old district seats from V163. Named user accounts and manually managed roles remain.
with old_seats as (
    select distinct u.id
    from public.users u
    join public.model_has_roles mhr on mhr.model_id = u.id and mhr.model_type = 'App\Models\User'
    join public.roles r on r.id = mhr.role_id
    where coalesce(u.seeded_officer, false) = true
      and u.position_key like 'district:%'
      and r.name in ('Dist DC', 'DED', 'DAS', 'District Commissioner')
)
delete from public.model_has_roles mhr
using old_seats os
where mhr.model_id = os.id
  and mhr.model_type = 'App\Models\User';

with old_seats as (
    select distinct u.id
    from public.users u
    where coalesce(u.seeded_officer, false) = true
      and u.position_key like 'district:%'
)
delete from public.users u
using old_seats os
where u.id = os.id;

-- Regional seats for the Mainland incident chain only: RDMC/Reg DC, RAS and RC for all 26 Mainland regions.
with zanzibar_region_seats as (
    select distinct u.id
    from public.users u
    join public.regions rg on rg.id = u.region_id
    join public.model_has_roles mhr on mhr.model_id = u.id and mhr.model_type = 'App\Models\User'
    join public.roles r on r.id = mhr.role_id
    where coalesce(u.seeded_officer, false) = true
      and u.position_key like 'region:%'
      and rg.country_part = 'zanzibar'
      and r.name in ('Reg DC', 'RAS', 'RC')
)
delete from public.model_has_roles mhr
using zanzibar_region_seats zs
where mhr.model_id = zs.id
  and mhr.model_type = 'App\Models\User';

with zanzibar_region_seats as (
    select distinct u.id
    from public.users u
    join public.regions rg on rg.id = u.region_id
    where coalesce(u.seeded_officer, false) = true
      and u.position_key like 'region:%'
      and rg.country_part = 'zanzibar'
)
delete from public.users u
using zanzibar_region_seats zs
where u.id = zs.id;

with seats(role_name, email_prefix, position, label) as (
    values
        ('Reg DC', 'rdmc', 'Regional Disaster Coordinator', 'RDMC'),
        ('RAS', 'ras', 'Regional Administrative Secretary', 'RAS'),
        ('RC', 'rc', 'Regional Commissioner', 'RC')
),
targets as (
    select s.role_name,
           s.position,
           s.label || ' - ' || r.name as display_name,
           lower(s.email_prefix || '.' || regexp_replace(coalesce(r.region_code, r.id::text), '[^A-Za-z0-9]+', '-', 'g') || '@positions.dmis.local') as email,
           r.id as region_id,
           'region:' || r.id || ':' || lower(replace(s.role_name, ' ', '_')) as position_key
    from public.regions r
    cross join seats s
    where r.country_part = 'mainland'
      and exists (select 1 from public.roles rr where rr.name = s.role_name)
      and not exists (
          select 1 from public.users u
          where u.position_key = 'region:' || r.id || ':' || lower(replace(s.role_name, ' ', '_'))
      )
)
insert into public.users(name, email, password, email_verified_at, region_id, district_id, council_id,
                         officer_position, position_key, seeded_officer,
                         notify_in_app, notify_email, notify_sms, created_at, updated_at)
select display_name, email, null, null, region_id, null, null,
       position, position_key, true, true, false, false, now(), now()
from targets
on conflict (email) do nothing;

with seats(role_name) as (
    values ('Reg DC'), ('RAS'), ('RC')
),
targets as (
    select s.role_name,
           'region:' || r.id || ':' || lower(replace(s.role_name, ' ', '_')) as position_key
    from public.regions r
    cross join seats s
    where r.country_part = 'mainland'
)
insert into public.model_has_roles(role_id, model_type, model_id)
select rr.id, 'App\Models\User', u.id
from targets t
join public.users u on u.position_key = t.position_key
join public.roles rr on rr.name = t.role_name
where not exists (
    select 1 from public.model_has_roles mhr
    where mhr.role_id = rr.id
      and mhr.model_id = u.id
      and mhr.model_type = 'App\Models\User'
);

-- Mainland council/LGA seats: DDMC/Dist DC, DED, DAS and DC for all 184 Mainland councils/LGAs.
with seats(role_name, email_prefix, position, label) as (
    values
        ('Dist DC', 'ddmc', 'District Disaster Coordinator', 'DDMC'),
        ('DED', 'ded', 'District Executive Director', 'DED'),
        ('DAS', 'das', 'District Administrative Secretary', 'DAS'),
        ('District Commissioner', 'dc', 'District Commissioner', 'DC')
),
targets as (
    select s.role_name,
           s.position,
           s.label || ' - ' || c.name || ', ' || r.name as display_name,
           lower(s.email_prefix || '.' || regexp_replace(coalesce(c.council_code, c.id::text), '[^A-Za-z0-9]+', '-', 'g') || '@positions.dmis.local') as email,
           r.id as region_id,
           c.district_id,
           c.id as council_id,
           'council:' || c.id || ':' || lower(replace(s.role_name, ' ', '_')) as position_key
    from public.councils c
    join public.regions r on r.id = c.region_id
    cross join seats s
    where c.country_part = 'mainland'
      and coalesce(c.is_active, true) = true
      and exists (select 1 from public.roles rr where rr.name = s.role_name)
      and not exists (
          select 1 from public.users u
          where u.position_key = 'council:' || c.id || ':' || lower(replace(s.role_name, ' ', '_'))
      )
)
insert into public.users(name, email, password, email_verified_at, region_id, district_id, council_id,
                         officer_position, position_key, seeded_officer,
                         notify_in_app, notify_email, notify_sms, created_at, updated_at)
select display_name, email, null, null, region_id, district_id, council_id,
       position, position_key, true, true, false, false, now(), now()
from targets
on conflict (email) do nothing;

with seats(role_name) as (
    values ('Dist DC'), ('DED'), ('DAS'), ('District Commissioner')
),
targets as (
    select s.role_name,
           'council:' || c.id || ':' || lower(replace(s.role_name, ' ', '_')) as position_key
    from public.councils c
    cross join seats s
    where c.country_part = 'mainland'
      and coalesce(c.is_active, true) = true
)
insert into public.model_has_roles(role_id, model_type, model_id)
select rr.id, 'App\Models\User', u.id
from targets t
join public.users u on u.position_key = t.position_key
join public.roles rr on rr.name = t.role_name
where not exists (
    select 1 from public.model_has_roles mhr
    where mhr.role_id = rr.id
      and mhr.model_id = u.id
      and mhr.model_type = 'App\Models\User'
);

do $$
declare
    n integer;
begin
    select count(*) into n from public.regions where country_part = 'mainland';
    if n <> 26 then
        raise exception 'Expected 26 Mainland regions, found %', n;
    end if;

    select count(*) into n from public.regions;
    if n <> 31 then
        raise exception 'Expected 31 total Tanzania regions including Zanzibar, found %', n;
    end if;

    select count(*) into n from public.councils where country_part = 'mainland';
    if n <> 184 then
        raise exception 'Expected 184 Mainland councils/LGAs, found %', n;
    end if;

    select count(*) into n from public.councils;
    if n <> 195 then
        raise exception 'Expected 195 total councils/LGAs including Zanzibar, found %', n;
    end if;

    select count(distinct u.id) into n
    from public.users u
    join public.model_has_roles mhr on mhr.model_id = u.id and mhr.model_type = 'App\Models\User'
    join public.roles r on r.id = mhr.role_id
    join public.regions rg on rg.id = u.region_id
    where coalesce(u.seeded_officer, false) = true
      and u.position_key like 'region:%'
      and rg.country_part = 'mainland'
      and r.name = 'Reg DC';
    if n <> 26 then
        raise exception 'Expected 26 Mainland RDMC/Reg DC seats, found %', n;
    end if;

    select count(distinct u.id) into n
    from public.users u
    join public.model_has_roles mhr on mhr.model_id = u.id and mhr.model_type = 'App\Models\User'
    join public.roles r on r.id = mhr.role_id
    join public.regions rg on rg.id = u.region_id
    where coalesce(u.seeded_officer, false) = true
      and u.position_key like 'region:%'
      and rg.country_part = 'mainland'
      and r.name = 'RAS';
    if n <> 26 then
        raise exception 'Expected 26 Mainland RAS seats, found %', n;
    end if;

    select count(distinct u.id) into n
    from public.users u
    join public.model_has_roles mhr on mhr.model_id = u.id and mhr.model_type = 'App\Models\User'
    join public.roles r on r.id = mhr.role_id
    join public.regions rg on rg.id = u.region_id
    where coalesce(u.seeded_officer, false) = true
      and u.position_key like 'region:%'
      and rg.country_part = 'mainland'
      and r.name = 'RC';
    if n <> 26 then
        raise exception 'Expected 26 Mainland RC seats, found %', n;
    end if;

    select count(distinct u.id) into n
    from public.users u
    join public.model_has_roles mhr on mhr.model_id = u.id and mhr.model_type = 'App\Models\User'
    join public.roles r on r.id = mhr.role_id
    join public.councils c on c.id = u.council_id
    where coalesce(u.seeded_officer, false) = true
      and u.position_key like 'council:%'
      and c.country_part = 'mainland'
      and r.name = 'Dist DC';
    if n <> 184 then
        raise exception 'Expected 184 Mainland DDMC/Dist DC seats, found %', n;
    end if;

    select count(distinct u.id) into n
    from public.users u
    join public.model_has_roles mhr on mhr.model_id = u.id and mhr.model_type = 'App\Models\User'
    join public.roles r on r.id = mhr.role_id
    join public.councils c on c.id = u.council_id
    where coalesce(u.seeded_officer, false) = true
      and u.position_key like 'council:%'
      and c.country_part = 'mainland'
      and r.name = 'DED';
    if n <> 184 then
        raise exception 'Expected 184 Mainland DED seats, found %', n;
    end if;

    select count(distinct u.id) into n
    from public.users u
    join public.model_has_roles mhr on mhr.model_id = u.id and mhr.model_type = 'App\Models\User'
    join public.roles r on r.id = mhr.role_id
    join public.councils c on c.id = u.council_id
    where coalesce(u.seeded_officer, false) = true
      and u.position_key like 'council:%'
      and c.country_part = 'mainland'
      and r.name = 'District Commissioner';
    if n <> 184 then
        raise exception 'Expected 184 Mainland DC seats, found %', n;
    end if;
end $$;
