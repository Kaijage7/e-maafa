-- F: Stakeholders (Partners) may enter/view M&E for THEIR own organisation only.
-- Backend clamps level=stakeholder + stakeholder_id; Partners never get manage (national registry).

insert into public.permissions(name, module, action, label, guard_name, created_at, updated_at)
values
  ('monitoring_evaluation.view', 'Monitoring & Evaluation', 'view',
   'View Monitoring & Evaluation dashboard', 'web', now(), now()),
  ('monitoring_evaluation.enter', 'Monitoring & Evaluation', 'enter',
   'Enter Monitoring & Evaluation indicator values', 'web', now(), now())
on conflict (name) do update
set module = excluded.module,
    action = excluded.action,
    label = excluded.label,
    updated_at = now();

insert into public.role_has_permissions(permission_id, role_id)
select p.id, r.id
from public.permissions p
cross join public.roles r
where r.name = 'Partners'
  and p.name in ('monitoring_evaluation.view', 'monitoring_evaluation.enter')
on conflict do nothing;
