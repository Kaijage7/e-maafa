-- Monitoring & Evaluation module.
-- Adds a matrix-controlled dashboard permission now, plus a manage switch for the next indicator-catalogue
-- and data-entry expansion. Default grants are internal/government coordination roles only; partners are
-- intentionally not granted M&E unless Super Admin enables it in System Settings -> Roles & Permissions.

insert into public.permissions(name, module, action, label, guard_name, created_at, updated_at)
values
  ('monitoring_evaluation.view', 'Monitoring & Evaluation', 'view',
   'View Monitoring & Evaluation dashboard', 'web', now(), now()),
  ('monitoring_evaluation.manage', 'Monitoring & Evaluation', 'manage',
   'Manage Monitoring & Evaluation indicators', 'web', now(), now())
on conflict (name) do update
set module = excluded.module,
    action = excluded.action,
    label = excluded.label,
    updated_at = now();

with grants(permission_name, role_name) as (
  values
    ('monitoring_evaluation.view', 'Super Admin'),
    ('monitoring_evaluation.view', 'ICT Admin'),
    ('monitoring_evaluation.view', 'Secretary'),
    ('monitoring_evaluation.view', 'Director'),
    ('monitoring_evaluation.view', 'Asst. Director'),
    ('monitoring_evaluation.view', 'EOCC'),
    ('monitoring_evaluation.view', 'Comms Officer'),
    ('monitoring_evaluation.view', 'Reg DC'),
    ('monitoring_evaluation.view', 'RAS'),
    ('monitoring_evaluation.view', 'RC'),
    ('monitoring_evaluation.view', 'Regional Planning Officer'),
    ('monitoring_evaluation.view', 'Regional Logistic Officer'),
    ('monitoring_evaluation.view', 'Dist DC'),
    ('monitoring_evaluation.view', 'DED'),
    ('monitoring_evaluation.view', 'DAS'),
    ('monitoring_evaluation.view', 'District Commissioner'),
    ('monitoring_evaluation.view', 'District Planning Officer'),
    ('monitoring_evaluation.view', 'District Logistic Officer'),
    ('monitoring_evaluation.view', 'MDA Focal'),
    ('monitoring_evaluation.manage', 'Super Admin'),
    ('monitoring_evaluation.manage', 'ICT Admin'),
    ('monitoring_evaluation.manage', 'Director'),
    ('monitoring_evaluation.manage', 'Asst. Director'),
    ('monitoring_evaluation.manage', 'EOCC')
)
insert into public.role_has_permissions(permission_id, role_id)
select p.id, r.id
from grants g
join public.permissions p on p.name = g.permission_name
join public.roles r on r.name = g.role_name
on conflict do nothing;
