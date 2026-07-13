-- V201: Align incident-role permissions with the modern ladder (Dist DC → DED → Reg DC → RAS → …)
-- and fill empty advisory/logistics seats so System Settings roles can actually log in.
--
-- Doctrine (V96 / IncidentWorkflowService STAGE_ROLES):
--   Stage owners approve: Dist DC, DED, Reg DC, RAS, EOCC, Director, Secretary.
--   Advisers view+comment only: DAS, District Commissioner, RC, District/Regional Planning Officers.
--   Logistics: District/Regional Logistic Officers — stock/dispatch (not incident approve).
--
-- DAS previously held incidents.approve without owning any stage (misleading UI + engine reject).
-- Planning/logistic roles existed with zero users — documented seats with no login.

-- ── 1) DAS: remove false incident approve/close; grant comment ──
delete from public.role_has_permissions rhp
using public.roles r, public.permissions p
where rhp.role_id = r.id
  and rhp.permission_id = p.id
  and r.name = 'DAS'
  and p.name in ('incidents.approve', 'incidents.close');

insert into public.role_has_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name = 'DAS'
  and p.name in ('incidents.view', 'incidents.comment')
  and not exists (
      select 1 from public.role_has_permissions x
      where x.role_id = r.id and x.permission_id = p.id
  );

-- DED is waiting_ded stage owner — ensure approve + comment (idempotent)
insert into public.role_has_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name = 'DED'
  and p.name in ('incidents.view', 'incidents.approve', 'incidents.comment')
  and not exists (
      select 1 from public.role_has_permissions x
      where x.role_id = r.id and x.permission_id = p.id
  );

-- Advisers: ensure view + comment
insert into public.role_has_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name in (
    'District Commissioner', 'RC',
    'District Planning Officer', 'Regional Planning Officer'
  )
  and p.name in ('incidents.view', 'incidents.comment')
  and not exists (
      select 1 from public.role_has_permissions x
      where x.role_id = r.id and x.permission_id = p.id
  );

-- Logistic officers: view + warehouse/dispatch (no incident approve)
insert into public.role_has_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name in ('District Logistic Officer', 'Regional Logistic Officer')
  and p.name in (
    'incidents.view',
    'resource_allocation.view', 'resource_allocation.dispatch',
    'warehouse_and_stock.view', 'warehouse_and_stock.manage'
  )
  and not exists (
      select 1 from public.role_has_permissions x
      where x.role_id = r.id and x.permission_id = p.id
  );

-- ── 2) Orphan public reports: "converted" without an incident link cannot stay converted ──
update public.public_hazard_reports
set status = 'reviewing',
    updated_at = now()
where status = 'converted'
  and linked_incident_id is null;

-- ── 3) Seed advisory/logistics seats (password NULL until admin sets credentials) ──
-- District-level: planning + logistic (one per district)
with seats(role_name, email_prefix, position, label) as (
    values
        ('District Planning Officer', 'dpo', 'District Planning Officer', 'DPO'),
        ('District Logistic Officer', 'dlo', 'District Logistic Officer', 'DLO')
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

with seats(role_name) as (
    values ('District Planning Officer'), ('District Logistic Officer')
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

-- Regional-level: planning + logistic (mainland regions)
with seats(role_name, email_prefix, position, label) as (
    values
        ('Regional Planning Officer', 'rpo', 'Regional Planning Officer', 'RPO'),
        ('Regional Logistic Officer', 'rlo', 'Regional Logistic Officer', 'RLO')
),
targets as (
    select s.role_name,
           s.position,
           s.label || ' - ' || r.name as display_name,
           lower(s.email_prefix || '.' || regexp_replace(coalesce(r.region_code, r.id::text), '[^A-Za-z0-9]+', '-', 'g')
                 || '@positions.dmis.local') as email,
           r.id as region_id,
           'region:' || r.id || ':' || lower(replace(s.role_name, ' ', '_')) as position_key
    from public.regions r
    cross join seats s
    where coalesce(r.country_part, 'mainland') = 'mainland'
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
    values ('Regional Planning Officer'), ('Regional Logistic Officer')
),
targets as (
    select s.role_name,
           'region:' || r.id || ':' || lower(replace(s.role_name, ' ', '_')) as position_key
    from public.regions r
    cross join seats s
    where coalesce(r.country_part, 'mainland') = 'mainland'
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
