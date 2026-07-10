-- Restore the actual partner-facing Stakeholder Portal to the Partners baseline.
-- V157 intentionally narrowed Partners away from internal PMO operations, but the allow-list
-- accidentally omitted the core portal shell introduced in V143.

insert into public.permissions(name, module, action, label, guard_name, created_at, updated_at)
values ('stakeholder_portal.view', 'Stakeholder Portal', 'view',
        'Access Stakeholder Portal', 'web', now(), now())
on conflict (name) do update
set module = 'Stakeholder Portal',
    action = 'view',
    label = 'Access Stakeholder Portal',
    updated_at = now();

insert into public.role_has_permissions(permission_id, role_id)
select p.id, r.id
from public.permissions p
join public.roles r on r.name = 'Partners'
where p.name = 'stakeholder_portal.view'
on conflict do nothing;
