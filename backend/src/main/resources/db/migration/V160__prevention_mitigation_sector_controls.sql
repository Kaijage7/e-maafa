-- Split Prevention & Mitigation into sub-page controls.
-- Sector/MDA users keep the INFORM data-entry lane, while PMO/national roles receive the
-- registry, mapping, authoring and approval controls through System Settings.

with perms(name, module, action, label) as (
  values
    ('prevention_dashboard.view', 'Prevention Dashboard', 'view', 'View prevention dashboard'),
    ('hazards.view', 'Hazards', 'view', 'View hazard registry'),
    ('hazards.manage', 'Hazards', 'manage', 'Manage hazard registry'),
    ('mitigation_measures.view', 'Mitigation Measures', 'view', 'View mitigation measures'),
    ('mitigation_measures.manage', 'Mitigation Measures', 'manage', 'Manage mitigation measures'),
    ('risk_assessment.view', 'Risk Assessment', 'view', 'View risk assessments'),
    ('risk_assessment.create', 'Risk Assessment', 'create', 'Create or edit risk assessments'),
    ('risk_assessment.approve', 'Risk Assessment', 'approve', 'Approve or publish risk assessments'),
    ('strategic_infrastructure.view', 'Strategic Infrastructure', 'view', 'View strategic infrastructure'),
    ('strategic_infrastructure.manage', 'Strategic Infrastructure', 'manage', 'Manage strategic infrastructure'),
    ('disaster_repository.view', 'Disaster Repository', 'view', 'View disaster repository records'),
    ('disaster_repository.enter', 'Disaster Repository', 'enter', 'Enter Disaster Repository event cards'),
    ('risk_mapping.view', 'Risk Mapping', 'view', 'View risk mapping and GIS layers'),
    ('risk_index.view', 'Risk Index', 'view', 'View INFORM Risk Index'),
    ('risk_index.create', 'Risk Index', 'create', 'Submit sector INFORM values'),
    ('risk_index.approve', 'Risk Index', 'approve', 'Approve INFORM values')
)
insert into public.permissions(name, module, action, label, guard_name, created_at, updated_at)
select name, module, action, label, 'web', now(), now()
from perms
on conflict (name) do update
set module = excluded.module,
    action = excluded.action,
    label = excluded.label,
    updated_at = now();

-- MDA Focal logins are agency-bound sector contributors. Keep them out of national P&M registries and
-- approvals unless an admin deliberately grants those switches later in System Settings.
delete from public.role_has_permissions rhp
using public.roles r, public.permissions p
where rhp.role_id = r.id
  and rhp.permission_id = p.id
  and r.name = 'MDA Focal'
  and p.name in (
    'prevention_dashboard.view',
    'hazards.view',
    'hazards.manage',
    'mitigation_measures.view',
    'mitigation_measures.manage',
    'risk_assessment.view',
    'risk_assessment.create',
    'risk_assessment.approve',
    'strategic_infrastructure.view',
    'strategic_infrastructure.manage',
    'disaster_repository.view',
    'disaster_repository.enter',
    'risk_mapping.view',
    'risk_index.approve'
  );

with grants(permission_name, role_name) as (
  values
    ('prevention_dashboard.view', 'Super Admin'),
    ('prevention_dashboard.view', 'ICT Admin'),
    ('prevention_dashboard.view', 'Secretary'),
    ('prevention_dashboard.view', 'Director'),
    ('prevention_dashboard.view', 'Asst. Director'),
    ('prevention_dashboard.view', 'EOCC'),
    ('hazards.view', 'Super Admin'),
    ('hazards.view', 'ICT Admin'),
    ('hazards.view', 'Secretary'),
    ('hazards.view', 'Director'),
    ('hazards.view', 'Asst. Director'),
    ('hazards.view', 'EOCC'),
    ('mitigation_measures.view', 'Super Admin'),
    ('mitigation_measures.view', 'ICT Admin'),
    ('mitigation_measures.view', 'Secretary'),
    ('mitigation_measures.view', 'Director'),
    ('mitigation_measures.view', 'Asst. Director'),
    ('mitigation_measures.view', 'EOCC'),
    ('risk_assessment.view', 'Super Admin'),
    ('risk_assessment.view', 'ICT Admin'),
    ('risk_assessment.view', 'Secretary'),
    ('risk_assessment.view', 'Director'),
    ('risk_assessment.view', 'Asst. Director'),
    ('risk_assessment.view', 'EOCC'),
    ('strategic_infrastructure.view', 'Super Admin'),
    ('strategic_infrastructure.view', 'ICT Admin'),
    ('strategic_infrastructure.view', 'Secretary'),
    ('strategic_infrastructure.view', 'Director'),
    ('strategic_infrastructure.view', 'Asst. Director'),
    ('strategic_infrastructure.view', 'EOCC'),
    ('disaster_repository.view', 'Super Admin'),
    ('disaster_repository.view', 'ICT Admin'),
    ('disaster_repository.view', 'Secretary'),
    ('disaster_repository.view', 'Director'),
    ('disaster_repository.view', 'Asst. Director'),
    ('disaster_repository.view', 'EOCC'),
    ('risk_mapping.view', 'Super Admin'),
    ('risk_mapping.view', 'ICT Admin'),
    ('risk_mapping.view', 'Secretary'),
    ('risk_mapping.view', 'Director'),
    ('risk_mapping.view', 'Asst. Director'),
    ('risk_mapping.view', 'EOCC'),
    ('risk_index.view', 'Super Admin'),
    ('risk_index.view', 'ICT Admin'),
    ('risk_index.view', 'Secretary'),
    ('risk_index.view', 'Director'),
    ('risk_index.view', 'Asst. Director'),
    ('risk_index.view', 'EOCC'),
    ('risk_index.view', 'MDA Focal'),

    ('hazards.manage', 'Super Admin'),
    ('hazards.manage', 'Director'),
    ('hazards.manage', 'Asst. Director'),
    ('hazards.manage', 'EOCC'),
    ('mitigation_measures.manage', 'Super Admin'),
    ('mitigation_measures.manage', 'Director'),
    ('mitigation_measures.manage', 'Asst. Director'),
    ('mitigation_measures.manage', 'EOCC'),
    ('risk_assessment.create', 'Super Admin'),
    ('risk_assessment.create', 'Director'),
    ('risk_assessment.create', 'Asst. Director'),
    ('risk_assessment.create', 'EOCC'),
    ('risk_assessment.approve', 'Super Admin'),
    ('risk_assessment.approve', 'Director'),
    ('risk_assessment.approve', 'Asst. Director'),
    ('risk_assessment.approve', 'EOCC'),
    ('strategic_infrastructure.manage', 'Super Admin'),
    ('strategic_infrastructure.manage', 'Director'),
    ('strategic_infrastructure.manage', 'Asst. Director'),
    ('strategic_infrastructure.manage', 'EOCC'),
    ('disaster_repository.enter', 'Super Admin'),
    ('disaster_repository.enter', 'Director'),
    ('disaster_repository.enter', 'Asst. Director'),
    ('disaster_repository.enter', 'EOCC'),
    ('risk_index.create', 'Super Admin'),
    ('risk_index.create', 'EOCC'),
    ('risk_index.create', 'MDA Focal'),
    ('risk_index.approve', 'Super Admin'),
    ('risk_index.approve', 'Director')
)
insert into public.role_has_permissions(permission_id, role_id)
select p.id, r.id
from grants g
join public.permissions p on p.name = g.permission_name
join public.roles r on r.name = g.role_name
on conflict do nothing;
