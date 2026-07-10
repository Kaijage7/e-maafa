-- Countrywide incident-flow staffing and role grouping.
-- Roles stay generic (for example "Dist DC"), while users are linked to their region/district.
-- This keeps authorization configurable in System Settings without creating hundreds of role names.

alter table public.roles add column if not exists category varchar(80);
alter table public.roles add column if not exists scope_level varchar(24);
alter table public.roles add column if not exists sort_order integer not null default 500;
alter table public.roles add column if not exists incident_stage varchar(80);
alter table public.roles add column if not exists assignment_hint text;
alter table public.roles add column if not exists is_incident_flow boolean not null default false;
alter table public.roles add column if not exists is_area_scoped boolean not null default false;

alter table public.users add column if not exists officer_position varchar(160);
alter table public.users add column if not exists position_key varchar(190);
alter table public.users add column if not exists seeded_officer boolean not null default false;

create unique index if not exists users_position_key_uq
    on public.users(position_key)
    where position_key is not null;

with meta(name, category, scope_level, sort_order, incident_stage, is_incident_flow, is_area_scoped, assignment_hint) as (
    values
        ('Super Admin', 'System Administration', 'system', 10, null, false, false, 'Full platform administration and break-glass access.'),
        ('ICT Admin', 'System Administration', 'system', 20, null, false, false, 'System setup, users, roles, settings and technical administration.'),

        ('Secretary', 'National Command', 'national', 100, 'waiting_ps', true, false, 'Permanent Secretary stage of the national incident approval chain.'),
        ('Director', 'National Command', 'national', 110, 'waiting_director', true, false, 'Director DMD stage of the national incident approval chain.'),
        ('Asst. Director', 'National Command', 'national', 120, null, true, false, 'National operations and oversight support.'),
        ('Minister', 'National Command', 'national', 130, null, false, false, 'Statutory disaster-area declaration authority.'),
        ('President', 'National Command', 'national', 140, null, false, false, 'Statutory state-of-emergency declaration authority.'),
        ('National Technical Committee', 'National Command', 'national', 150, null, false, false, 'Statutory technical review of declarations.'),
        ('National Steering Committee', 'National Command', 'national', 160, null, false, false, 'Statutory steering endorsement of declarations.'),

        ('EOCC', 'National Operations', 'national', 200, 'waiting_eocc', true, false, 'National operations desk for incident escalation and coordination.'),
        ('Comms Officer', 'National Operations', 'national', 210, null, false, false, 'Public communications, alerts, translations and outreach.'),

        ('Reg DC', 'Regional Incident Flow', 'regional', 300, 'waiting_rdmc', true, true, 'Requires a region attachment; owns the RDMC incident stage for that region.'),
        ('RAS', 'Regional Incident Flow', 'regional', 310, 'waiting_ras', true, true, 'Requires a region attachment; owns the RAS incident stage for that region.'),
        ('RC', 'Regional Incident Flow', 'regional', 320, null, true, true, 'Requires a region attachment; regional incident oversight and advisory view.'),
        ('Regional Planning Officer', 'Regional Incident Flow', 'regional', 330, null, true, true, 'Requires a region attachment; advisory planning role for regional incidents.'),
        ('Regional Logistic Officer', 'Regional Incident Flow', 'regional', 340, null, true, true, 'Requires a region attachment; regional logistics and dispatch support.'),

        ('Dist DC', 'District Incident Flow', 'district', 400, 'waiting_ddmc', true, true, 'Requires a district attachment; owns the DDMC district entry gate.'),
        ('DED', 'District Incident Flow', 'district', 410, 'waiting_ded', true, true, 'Requires a district attachment; owns the DED district approval stage.'),
        ('DAS', 'District Incident Flow', 'district', 420, null, true, true, 'Requires a district attachment; district leadership notifications and support.'),
        ('District Commissioner', 'District Incident Flow', 'district', 430, null, true, true, 'Requires a district attachment; district incident oversight and advisory view.'),
        ('District Planning Officer', 'District Incident Flow', 'district', 440, null, true, true, 'Requires a district attachment; advisory planning role for district incidents.'),
        ('District Logistic Officer', 'District Incident Flow', 'district', 450, null, true, true, 'Requires a district attachment; district logistics and dispatch support.'),

        ('MDA Focal', 'Sector / Agency', 'sector', 500, null, false, false, 'Requires an agency attachment; sector data entry and response contribution.'),
        ('Partners', 'Stakeholder / Partner', 'stakeholder', 600, null, false, false, 'Requires a linked stakeholder organisation for partner self-service.')
)
update public.roles r
set category = meta.category,
    scope_level = meta.scope_level,
    sort_order = meta.sort_order,
    incident_stage = meta.incident_stage,
    is_incident_flow = meta.is_incident_flow,
    is_area_scoped = meta.is_area_scoped,
    assignment_hint = meta.assignment_hint,
    updated_at = now()
from meta
where r.name = meta.name;

update public.roles
set category = coalesce(category, 'Other'),
    scope_level = coalesce(scope_level, 'system'),
    sort_order = coalesce(sort_order, 500),
    is_incident_flow = coalesce(is_incident_flow, false),
    is_area_scoped = coalesce(is_area_scoped, false)
where category is null
   or scope_level is null
   or sort_order is null
   or is_incident_flow is null
   or is_area_scoped is null;

select setval(pg_get_serial_sequence('public.users','id'),
              greatest(coalesce((select max(id) from public.users), 1), 1));

-- Regional position seats: RDMC/Reg DC, RAS and RC for every region.
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
           null::bigint as district_id,
           'region:' || r.id || ':' || lower(replace(s.role_name, ' ', '_')) as position_key
    from public.regions r
    cross join seats s
    where exists (select 1 from public.roles rr where rr.name = s.role_name)
      and not exists (
          select 1
          from public.users u
          join public.model_has_roles mhr on mhr.model_id = u.id
          join public.roles rr on rr.id = mhr.role_id
          where rr.name = s.role_name
            and u.region_id = r.id
            and u.district_id is null
      )
      and not exists (
          select 1 from public.users u
          where u.position_key = 'region:' || r.id || ':' || lower(replace(s.role_name, ' ', '_'))
      )
)
insert into public.users(name, email, password, email_verified_at, region_id, district_id,
                         officer_position, position_key, seeded_officer,
                         notify_in_app, notify_email, notify_sms, created_at, updated_at)
select display_name, email, null, null, region_id, district_id,
       position, position_key, true, true, false, false, now(), now()
from targets
on conflict (email) do nothing;

with seats(role_name, email_prefix, position) as (
    values
        ('Reg DC', 'rdmc', 'Regional Disaster Coordinator'),
        ('RAS', 'ras', 'Regional Administrative Secretary'),
        ('RC', 'rc', 'Regional Commissioner')
),
targets as (
    select s.role_name,
           'region:' || r.id || ':' || lower(replace(s.role_name, ' ', '_')) as position_key
    from public.regions r
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

-- District position seats: DDMC/Dist DC, DED, DAS and District Commissioner for every district.
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
           lower(s.email_prefix || '.' || regexp_replace(coalesce(d.district_code, d.id::text), '[^A-Za-z0-9]+', '-', 'g') || '@positions.dmis.local') as email,
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
                         notify_in_app, notify_email, notify_sms, created_at, updated_at)
select display_name, email, null, null, region_id, district_id,
       position, position_key, true, true, false, false, now(), now()
from targets
on conflict (email) do nothing;

with seats(role_name, email_prefix, position) as (
    values
        ('Dist DC', 'ddmc', 'District Disaster Coordinator'),
        ('DED', 'ded', 'District Executive Director'),
        ('DAS', 'das', 'District Administrative Secretary'),
        ('District Commissioner', 'dc', 'District Commissioner')
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

-- National fallback desks, only where a workflow role has no user at all.
with seats(role_name, email_prefix, position, display_name) as (
    values
        ('EOCC', 'eocc', 'National Operations Desk', 'EOCC National Desk'),
        ('Director', 'director', 'Director DMD', 'Director DMD Desk'),
        ('Secretary', 'ps', 'Permanent Secretary', 'Permanent Secretary Desk')
),
targets as (
    select s.role_name,
           s.display_name,
           lower(s.email_prefix || '.national@positions.dmis.local') as email,
           s.position,
           'national:' || lower(replace(s.role_name, ' ', '_')) as position_key
    from seats s
    where exists (select 1 from public.roles rr where rr.name = s.role_name)
      and not exists (
          select 1
          from public.users u
          join public.model_has_roles mhr on mhr.model_id = u.id
          join public.roles rr on rr.id = mhr.role_id
          where rr.name = s.role_name
      )
      and not exists (
          select 1 from public.users u
          where u.position_key = 'national:' || lower(replace(s.role_name, ' ', '_'))
      )
)
insert into public.users(name, email, password, email_verified_at,
                         officer_position, position_key, seeded_officer,
                         notify_in_app, notify_email, notify_sms, created_at, updated_at)
select display_name, email, null, null,
       position, position_key, true, true, false, false, now(), now()
from targets
on conflict (email) do nothing;

with seats(role_name) as (
    values ('EOCC'), ('Director'), ('Secretary')
),
targets as (
    select role_name, 'national:' || lower(replace(role_name, ' ', '_')) as position_key
    from seats
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
