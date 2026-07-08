-- Complete the area-role least-privilege trim started in V142/V143.
--
-- V142/V143 closed the verified RAS path but covered only RAS, Reg DC, DED and DAS.
-- Re-open review found Dist DC still retained one_health.acknowledge from V103; because V105
-- grants <module>.view to roles holding any action in the module, that action can keep One Health
-- reachable at the module gate. Treat the full area-role family consistently here.
--
-- Doctrine:
--   * Area officers receive warnings and work their incident/warehouse/area workflows.
--   * EW authoring/approval/dissemination belongs to EW entities, PMO/EOCC and communications roles.
--   * One Health is specialist MDA/OH-desk/national command territory, not area coordination.
--   * EOCC command-tier dashboards require command_post.activate/posture, not field area roles.
--   * Stakeholder Portal is partner-facing plus national coordination, not area-officer menu space.
--
-- Budget planning/logistic officer permissions are intentionally not trimmed here; those are real
-- finance workflows and are governed by F110/F111 scope/simulation-control fixes.

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
  and (
      p.name like 'one_health.%'
      or p.name in (
          'early_warning.create',
          'early_warning.disseminate',
          'early_warning.approve',
          'preparedness.manage',
          'command_post.activate',
          'command_post.posture',
          'stakeholder_portal.view'
      )
  );

-- Area executives should not hold budget administration through the broad area-coordinator profile.
-- Planning/logistic variants keep their V99 finance roles and are handled by the finance guard backlog.
delete from public.role_has_permissions rhp
using public.roles r, public.permissions p
where r.id = rhp.role_id
  and p.id = rhp.permission_id
  and r.name in ('RAS', 'RC', 'Reg DC', 'DED', 'DAS', 'Dist DC', 'District Commissioner')
  and p.name = 'budget_and_finance.manage';
