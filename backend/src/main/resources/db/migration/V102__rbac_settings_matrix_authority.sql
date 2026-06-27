-- Make the permission matrix authoritative for the settings/admin WRITE controllers, removing the
-- "cheating" where role_has_permissions (what User Management shows) disagreed with the role-composite
-- @PreAuthorize the code actually enforced. The controllers move to hasAuthority(<perm>); these grants
-- set the matrix to EXACTLY the roles each composite allowed today (behavior-preserving):
--   RolePermission         SYS_ADMIN            -> roles_and_permissions.manage  {Super, ICT}
--   Location               LOCATION_WRITE       -> location_management.manage    {Super, ICT, Director}
--   ApprovalWorkflowConfig APPROVAL_CONFIG_WRITE-> approval_workflows.manage     {Super, ICT, Director, Secretary}
--   DisasterEvent          REPOSITORY_WRITE     -> disaster_repository.enter      {EOCC, Super, ICT, Director, Asst. Director}
--   ResourceCatalogue      CATALOGUE_WRITE      -> resource_catalogue.manage     (already aligned)
--   UserManagement         SYS_ADMIN            -> user_management.manage         (already aligned)
--   Translation            TRANSLATION_WRITE    -> translations.manage           {Super, ICT, Comms}  (perm is new)

-- Translations module had no permission at all — create it so the matrix can express it.
insert into public.permissions(name, module, action, label, guard_name, created_at, updated_at) values
  ('translations.view',   'Translations', 'view',   'View — Translations',   'web', now(), now()),
  ('translations.manage', 'Translations', 'manage', 'Manage — Translations', 'web', now(), now())
on conflict (name) do nothing;

-- Remove grants the code never honoured (matrix showed access the role-gate blocked).
delete from public.role_has_permissions rhp using public.permissions p, public.roles r
 where rhp.permission_id = p.id and rhp.role_id = r.id
   and p.name in ('roles_and_permissions.manage','location_management.manage','approval_workflows.manage')
   and r.name = 'EOCC';

-- Add grants the code DID honour but the matrix omitted, + the new translations grants.
insert into public.role_has_permissions(permission_id, role_id)
select p.id, r.id from (values
  ('location_management.manage','Director'),
  ('disaster_repository.enter','ICT Admin'),
  ('disaster_repository.enter','Director'),
  ('disaster_repository.enter','Asst. Director'),
  ('translations.view','Super Admin'),  ('translations.manage','Super Admin'),
  ('translations.view','ICT Admin'),    ('translations.manage','ICT Admin'),
  ('translations.view','Comms Officer'),('translations.manage','Comms Officer')
) as g(pname, rname)
join public.permissions p on p.name = g.pname
join public.roles r on r.name = g.rname
on conflict do nothing;
