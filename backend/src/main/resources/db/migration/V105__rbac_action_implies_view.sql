-- Systemic de-cheating: "action-without-view" dead grants. The ModuleGuardFilter requires <module>.view
-- to enter a guarded module, so a role granted an ACTION (e.g. one_health.manage, resource_allocation.dispatch,
-- damage_assessment.create) but MISSING that module's .view is silently blocked at the module boundary —
-- the grant is dead and the matrix shows a capability the user cannot exercise. Root cause: the seeder's
-- seed-only-if-empty never backfilled newly-added .view perms onto already-seeded roles.
--
-- Fix the invariant "you can act on a module only if you can view it" by granting <module>.view to every
-- role that already holds ANY permission in that guarded module. Purely additive (revokes nothing); it only
-- makes already-granted, intended capabilities actually reachable so enforcement matches the matrix.
insert into public.role_has_permissions(permission_id, role_id)
select vp.id, r.id
from public.roles r
join public.role_has_permissions rhp on rhp.role_id = r.id
join public.permissions p on p.id = rhp.permission_id
join (values
  ('incidents'),('one_health'),('contingency_plans'),('disaster_declarations'),('damage_assessment'),
  ('command_post'),('anticipatory_action_plans'),('resource_allocation'),('early_warning'),
  ('warehouse_and_stock'),('recovery'),('content_management'),('preparedness'),
  ('prevention_and_mitigation'),('reports_and_analytics')
) as g(modpref) on g.modpref = split_part(p.name, '.', 1)
join public.permissions vp on vp.name = g.modpref || '.view'
on conflict do nothing;
