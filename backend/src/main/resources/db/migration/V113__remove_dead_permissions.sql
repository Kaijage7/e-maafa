-- Remove DEAD permissions: catalogued in the Roles & Permissions matrix but enforced by NO @PreAuthorize and
-- NO ModuleGuardFilter mapping, so granting or revoking them did nothing (matrix theatre). Per the decision
-- that Hazards / Risk Assessment / Disaster Repository remain folded under their parent modules (Prevention &
-- Mitigation governs /v1/hazards + /v1/risk-assessments via prevention_and_mitigation.view; /v1/repository via
-- reports_and_analytics.view), their dead `view`/`validate` cells are removed. incidents.comment has no endpoint.
-- Zero functional impact (the perms enforced nothing). The REAL perms remain untouched: hazards.manage,
-- risk_assessment.create/approve, disaster_repository.enter, and all incidents.* actions.
delete from public.role_has_permissions
where permission_id in (
    select id from public.permissions
    where name in ('hazards.view', 'risk_assessment.view', 'disaster_repository.view',
                   'disaster_repository.validate', 'incidents.comment'));

delete from public.permissions
where name in ('hazards.view', 'risk_assessment.view', 'disaster_repository.view',
               'disaster_repository.validate', 'incidents.comment');
