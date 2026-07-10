-- Follow-up permission labels for role-matrix clarity.
-- Earlier V158/V160 files may already be applied in local/prod databases; keep those immutable
-- and place new wording here so Flyway validation remains stable.

update public.permissions p
set label = v.label,
    updated_at = now()
from (values
    ('user_management.view', 'View users and partner agency registry'),
    ('user_management.manage', 'Manage users and partner agencies'),
    ('translations.view', 'View bilingual translations'),
    ('translations.manage', 'Manage bilingual translations'),
    ('communication_and_alerts.view', 'View Communication Center overview, audiences and delivery logs'),
    ('communication_and_alerts.send', 'Send SMS/email alerts through Communication Center'),
    ('hazards.view', 'View hazard registry and Hazard Monitor'),
    ('hazards.manage', 'Manage hazard registry and Hazard Monitor')
) as v(name, label)
where p.name = v.name;
