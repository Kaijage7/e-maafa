-- Make System Settings -> Roles & Permissions self-explanatory for the newer RBAC surfaces.
-- The permission grants remain the source of truth; these labels help admins control policy from
-- the matrix without reading route/controller code.

update public.permissions p
set label = v.label,
    updated_at = now()
from (values
    ('anticipatory_action_plans.view', 'View stakeholder-facing anticipatory plans'),
    ('anticipatory_action_plans.create', 'Create or edit anticipatory plans'),
    ('anticipatory_action_plans.approve', 'Approve anticipatory plans'),
    ('contingency_plans.view', 'View stakeholder-facing contingency plans'),
    ('contingency_plans.manage', 'Create or edit contingency plans'),
    ('contingency_plans.approve', 'Approve contingency plans'),
    ('reports_and_analytics.view', 'View Sendai Analytics and GIS Map'),
    ('disaster_repository.enter', 'Enter Disaster Repository event cards'),
    ('incidents.view', 'View incidents and incident reports'),
    ('resource_allocation.view', 'View resource allocation and reports'),
    ('damage_assessment.view', 'View DLNA registry and generated reports'),
    ('damage_assessment.key_section', 'Key assigned sector DLNA sections'),
    ('early_warning.view', 'View issued alerts and EW reports'),
    ('content_management.view', 'View public portal, news and QR controls'),
    ('content_management.manage', 'Manage public portal, news and QR outreach'),
    ('one_health.disseminate', 'Manage One Health disseminations'),
    ('one_health.approve', 'Approve One Health disseminations'),
    ('one_health.manage', 'Administer One Health PMO desk'),
    ('one_health.acknowledge', 'Acknowledge assigned One Health dissemination')
) as v(name, label)
where p.name = v.name;
