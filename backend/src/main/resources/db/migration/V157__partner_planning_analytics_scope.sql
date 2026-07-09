-- Stakeholder/partner scope correction (2026-07-09).
--
-- Partners should view only the planning and public-analytics surfaces approved for stakeholder
-- collaboration:
--   * Anticipatory Action Plans (view)
--   * Contingency Plans (view)
--   * Reports & Analytics (view) for Sendai Analytics and GIS Map
--
-- Everything else remains controlled through the normal Roles & Permissions matrix, but the seeded
-- Partners role must not carry internal PMO operations/admin permissions by default.

insert into public.permissions(name, module, action, label, guard_name, created_at, updated_at)
values
    ('anticipatory_action_plans.view', 'Anticipatory Action Plans', 'view',
     'View - Anticipatory Action Plans', 'web', now(), now()),
    ('contingency_plans.view', 'Contingency Plans', 'view',
     'View - Contingency Plans', 'web', now(), now()),
    ('reports_and_analytics.view', 'Reports & Analytics', 'view',
     'View - Reports & Analytics', 'web', now(), now()),
    ('disaster_repository.enter', 'Disaster Repository', 'enter',
     'Enter - Disaster Repository', 'web', now(), now())
on conflict (name) do nothing;

with partner_role as (
    select id from public.roles where name = 'Partners'
),
allowed(permission_name) as (
    values
        ('anticipatory_action_plans.view'),
        ('contingency_plans.view'),
        ('reports_and_analytics.view')
)
delete from public.role_has_permissions rhp
using partner_role pr, public.permissions p
where rhp.role_id = pr.id
  and rhp.permission_id = p.id
  and not exists (
      select 1 from allowed a where a.permission_name = p.name
  );

with allowed(permission_name) as (
    values
        ('anticipatory_action_plans.view'),
        ('contingency_plans.view'),
        ('reports_and_analytics.view')
)
insert into public.role_has_permissions(permission_id, role_id)
select p.id, r.id
from allowed a
join public.permissions p on p.name = a.permission_name
join public.roles r on r.name = 'Partners'
on conflict do nothing;
