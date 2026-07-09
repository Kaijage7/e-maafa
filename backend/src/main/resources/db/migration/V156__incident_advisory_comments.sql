-- Restore the V96 advisory role doctrine with a real enforced endpoint.
-- DC/RC/planning viewers can add audit comments only in their own jurisdiction; approval remains
-- owned by the incident workflow stage service (DDMC -> DED -> RDMC -> RAS -> national).

insert into public.permissions(name, module, action, label, guard_name, created_at, updated_at)
values ('incidents.comment', 'Incidents', 'comment', 'Comment - Incidents', 'web', now(), now())
on conflict (name) do nothing;

alter table public.incident_workflow_histories
    drop constraint if exists incident_workflow_histories_action_check;

alter table public.incident_workflow_histories
    add constraint incident_workflow_histories_action_check
    check (action in (
        'created', 'submitted', 'approved', 'rejected', 'rolled_back', 'edited',
        'resubmitted', 'assigned', 'completed', 'auto_advanced', 'commented'
    ));

with grants(permission_name, role_name) as (
    values
        ('incidents.comment', 'Dist DC'),
        ('incidents.comment', 'DED'),
        ('incidents.comment', 'Reg DC'),
        ('incidents.comment', 'RAS'),
        ('incidents.comment', 'Super Admin'),
        ('incidents.comment', 'EOCC'),
        ('incidents.comment', 'Director'),
        ('incidents.comment', 'Asst. Director'),
        ('incidents.comment', 'Secretary'),
        ('incidents.comment', 'District Commissioner'),
        ('incidents.comment', 'District Planning Officer'),
        ('incidents.comment', 'RC'),
        ('incidents.comment', 'Regional Planning Officer'),

        ('incidents.view', 'District Commissioner'),
        ('incidents.view', 'District Planning Officer'),
        ('incidents.view', 'RC'),
        ('incidents.view', 'Regional Planning Officer'),

        ('incidents.approve', 'Dist DC'),
        ('incidents.approve', 'DED'),
        ('incidents.approve', 'Reg DC'),
        ('incidents.approve', 'RAS')
)
insert into public.role_has_permissions(permission_id, role_id)
select p.id, r.id
from grants g
join public.permissions p on p.name = g.permission_name
join public.roles r on r.name = g.role_name
on conflict do nothing;

-- Advisory roles are view + comment only for incidents; this keeps accidental historical grants honest.
delete from public.role_has_permissions rhp
using public.roles r, public.permissions p
where rhp.role_id = r.id
  and rhp.permission_id = p.id
  and r.name in ('District Commissioner', 'District Planning Officer', 'RC', 'Regional Planning Officer')
  and p.name in ('incidents.create', 'incidents.update', 'incidents.approve', 'incidents.close', 'incidents.publish');
