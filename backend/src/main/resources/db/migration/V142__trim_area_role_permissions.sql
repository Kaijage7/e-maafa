-- Least-privilege trim for AREA coordinator roles (user directive 2026-07-06: "in RAS I see a lot,
-- i.e. Preparedness, Early Warnings etc." — the matrix granted area officers authoring/command-tier
-- permissions the design never intended; the route map's own comment says field/area approvers get
-- Command Post but NOT the command dashboards).
--
-- Doctrine (standing user direction): area officers = their incident chain + warehouse + RECEIVING
-- warnings. This migration revokes AUTHORITY permissions only; every *.view (visibility) and the
-- incident/warehouse/planning capabilities stay. Reversible at any time in Settings → User
-- Management → Roles & Permissions.
--
--   early_warning.create      authoring belongs to the 7 EW entities / PMO / EOCC
--   one_health.manage         One Health desk authority
--   one_health.disseminate    One Health dissemination authority
--   preparedness.manage       national preparedness administration
--   command_post.activate     EOCC command tier (Emergency Protocol activation)
--   command_post.posture      EOCC command tier (Executive Watch / TEPRP posture)
--   budget_and_finance.manage budget administration (tier APPROVAL rights are kept)

delete from public.role_has_permissions rhp
using public.roles r, public.permissions p
where r.id = rhp.role_id
  and p.id = rhp.permission_id
  and r.name in ('RAS', 'Reg DC', 'DED', 'DAS')
  and p.name in ('early_warning.create',
                 'one_health.manage',
                 'one_health.disseminate',
                 'preparedness.manage',
                 'command_post.activate',
                 'command_post.posture',
                 'budget_and_finance.manage');
