-- V183 / F75 residual: V163 countrywide district seats missed a few districts that existed
-- without a seat (Zanzibar LGAs + Lindi Urban at time of re-check). Re-apply the same pattern
-- for any district still lacking DAS / DED / Dist DC / District Commissioner seats.
-- Password stays NULL (position seats are non-login until an admin sets credentials).

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
           s.label || ' - ' || d.name || ', ' || r.name as display_name,
           lower(s.email_prefix || '.d' || d.id::text || '@positions.dmis.local') as email,
           r.id as region_id,
           d.id as district_id,
           'district:' || d.id || ':' || lower(replace(s.role_name, ' ', '_')) as position_key
    from public.districts d
    join public.regions r on r.id = d.region_id
    cross join seats s
    where exists (select 1 from public.roles rr where rr.name = s.role_name)
      and not exists (
          select 1
          from public.users u
          join public.model_has_roles mhr on mhr.model_id = u.id
          join public.roles rr on rr.id = mhr.role_id
          where rr.name = s.role_name
            and u.district_id = d.id
      )
      and not exists (
          select 1 from public.users u
          where u.position_key = 'district:' || d.id || ':' || lower(replace(s.role_name, ' ', '_'))
      )
)
insert into public.users(name, email, password, email_verified_at, region_id, district_id,
                         officer_position, position_key, seeded_officer,
                         notify_in_app, notify_email, notify_sms, phone, created_at, updated_at)
select display_name, email, null, null, region_id, district_id,
       position, position_key, true, true, false, false,
       '07' || lpad((district_id % 100000000)::text, 8, '0'),
       now(), now()
from targets
on conflict (email) do nothing;

with seats(role_name) as (
    values
        ('Dist DC'),
        ('DED'),
        ('DAS'),
        ('District Commissioner')
),
targets as (
    select s.role_name,
           'district:' || d.id || ':' || lower(replace(s.role_name, ' ', '_')) as position_key
    from public.districts d
    cross join seats s
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
