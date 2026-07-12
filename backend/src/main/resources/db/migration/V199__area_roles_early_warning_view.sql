-- V199: Area officers must see Early Warnings that affect their region / district.
-- Incidents and resources already use JurisdictionScope; EW list was national-only + DAS lacked early_warning.view.
-- Grant view (not create/approve) to region- and district-scoped operational roles so issued
-- warnings + interventions are visible in-area only (enforced in EwQueryService).

insert into public.role_has_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.name = 'early_warning.view'
  and r.name in (
    'RAS', 'Reg DC', 'RC',
    'Regional Planning Officer', 'Regional Logistic Officer',
    'DED', 'DAS', 'Dist DC',
    'District Commissioner', 'District Planning Officer', 'District Logistic Officer'
  )
  and not exists (
    select 1 from public.role_has_permissions x
    where x.role_id = r.id and x.permission_id = p.id
  );
