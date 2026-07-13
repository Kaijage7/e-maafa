-- V202: District coordinators must see area-scoped warehouses and resource requests.
-- Incidents + EW already scoped; Dist DC lacked warehouse_and_stock.* and resource_allocation.*
-- so module guard returned 403 and area stock/dispatch was invisible to the district entry gate.
-- Grants are VIEW/REQUEST only for Dist DC (not national). JurisdictionScope still filters rows.

insert into public.role_has_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name = 'Dist DC'
  and p.name in (
    'warehouse_and_stock.view',
    'resource_allocation.view',
    'resource_allocation.request'
  )
  and not exists (
    select 1 from public.role_has_permissions x
    where x.role_id = r.id and x.permission_id = p.id
  );

-- DAS already had resource_allocation.*; ensure warehouse view for district leadership awareness
insert into public.role_has_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name = 'DAS'
  and p.name in ('warehouse_and_stock.view')
  and not exists (
    select 1 from public.role_has_permissions x
    where x.role_id = r.id and x.permission_id = p.id
  );

-- DED: ensure warehouse view for district executive oversight of stock
insert into public.role_has_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name = 'DED'
  and p.name in ('warehouse_and_stock.view')
  and not exists (
    select 1 from public.role_has_permissions x
    where x.role_id = r.id and x.permission_id = p.id
  );
