-- V204: Resource-allocation chain roles must hold resource_allocation.approve.
--
-- The configured chain is DAS → RAS → EOCC → Asst. Director → Director → NTC (PS step),
-- but only EOCC / Asst. Director / Director held the approve permission. Area seats could
-- appear on the chain and still get 403 from @PreAuthorize — unrealistic / non-productive.
--
-- Warehouse dispatch-manager gate also requires the same permission; logistic officers
-- who manage stock must be able to approve (or reject) dispatches in their area.
-- Step-role enforcement in ApprovalWorkflowEngine still blocks wrong roles on the
-- multi-step resource chain (maker ≠ checker + designated step role).

insert into public.role_has_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.name = 'resource_allocation.approve'
  and r.name in (
      'DAS',
      'RAS',
      'National Technical Committee',
      'Secretary',
      'District Logistic Officer',
      'Regional Logistic Officer'
  )
  and not exists (
      select 1 from public.role_has_permissions rhp
      where rhp.role_id = r.id and rhp.permission_id = p.id
  );
