-- Follow-through on the area-role least-privilege directive (V142; user retest 2026-07-06: a RAS
-- still saw One Health and the partner-facing Stakeholder Portal on the hub).
--
-- 1) The Stakeholder Portal module had NO permission of its own — the UI gated it on
--    resource_allocation.view, which every area officer legitimately holds for their incident
--    chain, so the partner-facing module leaked onto every area officer's menu. Give the module
--    a real permission (matrix-manageable) and grant it to the roles that actually operate it:
--    partners themselves plus the national coordination tier.
--
-- 2) One Health is specialist ministry/OH-desk territory; area coordinator roles keep NO grants
--    there (was: view + acknowledge). Reversible in Settings → Roles & Permissions.

insert into public.permissions (name, module, action, label)
select 'stakeholder_portal.view', 'stakeholder_portal', 'view', 'Stakeholder Portal — access the partner portal'
where not exists (select 1 from public.permissions where name = 'stakeholder_portal.view');

insert into public.role_has_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.name = 'stakeholder_portal.view'
where r.name in ('Partners', 'Super Admin', 'ICT Admin', 'EOCC', 'Director', 'Asst. Director')
  and not exists (select 1 from public.role_has_permissions x
                   where x.role_id = r.id and x.permission_id = p.id);

delete from public.role_has_permissions rhp
using public.roles r, public.permissions p
where r.id = rhp.role_id
  and p.id = rhp.permission_id
  and r.name in ('RAS', 'Reg DC', 'DED', 'DAS')
  and p.name in ('one_health.view', 'one_health.acknowledge');
