-- Area officers receive official warnings through the operational issued-alerts surface, not the
-- Preparedness Early Warning Systems workbench/API. V144 removed EW authoring/approval/dissemination;
-- this follow-up removes the remaining EW read gate from the area-role family after the live role smoke
-- proved RAS/Reg DC/DED/RC could still open the EW hub with early_warning.view.

delete from public.role_has_permissions rhp
using public.roles r, public.permissions p
where r.id = rhp.role_id
  and p.id = rhp.permission_id
  and r.name in (
      'RAS',
      'RC',
      'Reg DC',
      'DED',
      'DAS',
      'Dist DC',
      'District Commissioner',
      'Regional Planning Officer',
      'Regional Logistic Officer',
      'District Planning Officer',
      'District Logistic Officer'
  )
  and p.name = 'early_warning.view';
