-- Fine-grained sector contribution and PMO-only One Health dissemination desk.
-- MDA/sector users may feed their own DLNA section and acknowledge received One Health notices;
-- drafting, approving, managing, and resending One Health disseminations stay with PMO/national roles.

insert into public.permissions(name, module, action, label, guard_name, created_at, updated_at)
values ('damage_assessment.key_section', 'Damage Assessment', 'key_section',
        'Key sector section - Damage Assessment', 'web', now(), now())
on conflict (name) do nothing;

delete from public.role_has_permissions rhp
using public.roles r, public.permissions p
where rhp.role_id = r.id
  and rhp.permission_id = p.id
  and r.name = 'MDA Focal'
  and p.name in ('one_health.manage', 'one_health.disseminate', 'one_health.approve');

with grants(permission_name, role_name) as (
    values
        ('damage_assessment.view', 'MDA Focal'),
        ('damage_assessment.key_section', 'MDA Focal'),
        ('one_health.view', 'MDA Focal'),
        ('one_health.acknowledge', 'MDA Focal'),

        ('one_health.view', 'Super Admin'),
        ('one_health.view', 'ICT Admin'),
        ('one_health.view', 'EOCC'),
        ('one_health.view', 'Director'),
        ('one_health.view', 'Asst. Director'),
        ('one_health.view', 'Comms Officer'),

        ('one_health.disseminate', 'Super Admin'),
        ('one_health.disseminate', 'ICT Admin'),
        ('one_health.disseminate', 'EOCC'),
        ('one_health.disseminate', 'Director'),
        ('one_health.disseminate', 'Asst. Director'),
        ('one_health.disseminate', 'Comms Officer'),

        ('one_health.approve', 'Super Admin'),
        ('one_health.approve', 'EOCC'),
        ('one_health.approve', 'Director'),
        ('one_health.approve', 'Asst. Director'),

        ('one_health.manage', 'Super Admin'),
        ('one_health.manage', 'ICT Admin'),
        ('one_health.manage', 'EOCC'),
        ('one_health.manage', 'Director'),
        ('one_health.manage', 'Asst. Director')
)
insert into public.role_has_permissions(permission_id, role_id)
select p.id, r.id
from grants g
join public.permissions p on p.name = g.permission_name
join public.roles r on r.name = g.role_name
on conflict do nothing;
