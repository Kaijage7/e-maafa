-- Policy: One Health DIRECTIVES are a PMO function — PMO-DMD issues/manages the directives, the addressed
-- MDAs/sectors acknowledge and respond. Today directive issuance is gated on one_health.manage, which
-- non-PMO roles hold (DED, Dist DC, Partners, RAS, Reg DC) — so they can issue directives. Introduce a
-- dedicated PMO permission and gate issuance/editing on it. PMO command tier = EOCC, Director,
-- Asst. Director, Secretary (+ Super Admin). All already hold one_health.view, so the gate is reachable.
insert into public.permissions(name, module, action, label, guard_name, created_at, updated_at) values
  ('one_health.directive','One Health','directive','Issue directives — One Health','web', now(), now())
on conflict (name) do nothing;

insert into public.role_has_permissions(permission_id, role_id)
select p.id, r.id from (values
  ('one_health.directive','Super Admin'),
  ('one_health.directive','EOCC'),
  ('one_health.directive','Director'),
  ('one_health.directive','Asst. Director'),
  ('one_health.directive','Secretary'),
  -- action ⇒ view invariant (all already hold it, but keep it explicit/idempotent)
  ('one_health.view','Super Admin'),('one_health.view','EOCC'),('one_health.view','Director'),
  ('one_health.view','Asst. Director'),('one_health.view','Secretary')
) as g(pname, rname)
join public.permissions p on p.name = g.pname
join public.roles r on r.name = g.rname
on conflict do nothing;
