-- `stakeholders.view` was a DEAD permission: the stakeholder directory (GET /v1/stakeholders) was gated only
-- by isAuthenticated(), so ANY logged-in account — including external Partner accounts — could list every
-- stakeholder (org names + contacts). The directory is now gated on stakeholders.view in the controller; this
-- migration makes that permission REAL by granting it to every STAFF role (all roles except the external
-- 'Partners' role), preserving existing staff access while excluding partners. Partners coordinate through
-- their own stakeholder-scoped portals (bidding / donor pledges), never the staff directory.
insert into public.role_has_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.name = 'stakeholders.view'
  and r.name <> 'Partners'
  and not exists (
      select 1 from public.role_has_permissions x where x.role_id = r.id and x.permission_id = p.id);
