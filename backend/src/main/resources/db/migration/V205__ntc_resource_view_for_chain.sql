-- V205: National Technical Committee is the final resource-allocation chain step
-- (configured as "Permanent Secretary") but lacked resource_allocation.view.
-- ModuleGuard blocks /v1/response/approvals without view even when approve is held.
-- Grant view so the last seat can realistically complete the national chain.

insert into public.role_has_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name = 'National Technical Committee'
  and p.name = 'resource_allocation.view'
  and not exists (
      select 1 from public.role_has_permissions rhp
      where rhp.role_id = r.id and rhp.permission_id = p.id
  );
