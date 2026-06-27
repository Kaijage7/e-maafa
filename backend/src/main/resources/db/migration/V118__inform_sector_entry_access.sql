-- Position INFORM data entry for the actual data providers (the sectors/ministries/institutions).
-- A sector officer keys + submits, with PMO approving. In DMIS the
-- sector/MDA role is "MDA Focal" (the EW-agency / sectoral focal point: TMA, GST, MoA, MoH, MoW…), which
-- previously could not even reach the INFORM module. Grant it:
--   • prevention_and_mitigation.view  → reach the INFORM Risk Index section (its module gate)
--   • risk_index.create               → key/submit indicator values (lands PENDING for PMO approval)
-- Approval (risk_index.approve) stays with Director / Super Admin (the "PMO" side). Direct grants, because
-- PermissionLocalSeeder skips roles that already hold permissions. Idempotent.
insert into public.role_has_permissions (permission_id, role_id)
select p.id, r.id
from public.permissions p
join public.roles r on r.name = 'MDA Focal'
where p.name in ('prevention_and_mitigation.view', 'risk_index.create')
  and not exists (
        select 1 from public.role_has_permissions x
        where x.permission_id = p.id and x.role_id = r.id
  );
