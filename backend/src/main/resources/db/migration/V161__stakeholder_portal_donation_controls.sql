-- Add an explicit partner-facing donation/pledge switch for Stakeholder Portal.
-- This keeps Partners out of internal resource-allocation consoles while still allowing
-- linked partner accounts to browse open needs and submit their own pledges.

insert into public.permissions(name, module, action, label, guard_name, created_at, updated_at)
values
  ('stakeholder_portal.view', 'Stakeholder Portal', 'view',
   'Access Stakeholder Portal', 'web', now(), now()),
  ('stakeholder_portal.donate', 'Stakeholder Portal', 'donate',
   'Donate or pledge through Stakeholder Portal', 'web', now(), now())
on conflict (name) do update
set module = excluded.module,
    action = excluded.action,
    label = excluded.label,
    updated_at = now();

insert into public.role_has_permissions(permission_id, role_id)
select p.id, r.id
from public.permissions p
join public.roles r on r.name = 'Partners'
where p.name in ('stakeholder_portal.view', 'stakeholder_portal.donate')
on conflict do nothing;
