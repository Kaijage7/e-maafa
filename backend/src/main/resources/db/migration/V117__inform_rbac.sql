-- Risk Index (INFORM) RBAC. Self-contained and idempotent: creates the permissions AND grants them
-- directly to roles, so it works on a production (non-local) profile and on an already-seeded DB where
-- PermissionLocalSeeder skips roles that already hold permissions.
--
-- READS are NOT a new permission: the whole /v1/inform module is gated by the module filter on
-- `prevention_and_mitigation.view` (Risk Mapping is a Prevention & Mitigation sub-section, exactly like
-- /v1/risk-assessments). Every operational role already holds prevention_and_mitigation.view via *|view.
-- Only the two WRITE capabilities are new and grantable per role.

insert into public.permissions (name, module, action, label, guard_name, created_at, updated_at)
values
  ('risk_index.create',  'Risk Index', 'create',  'Create — Risk Index',  'web', now(), now()),
  ('risk_index.approve', 'Risk Index', 'approve', 'Approve — Risk Index', 'web', now(), now())
on conflict (name) do nothing;

-- Grant (maker != checker): data entry (create) to EOCC; approval to Director. Super Admin holds both
-- (its "*" policy is resolved at seed time, so a permission added afterwards must be granted explicitly).
-- NOTE: only the 6 roles holding prevention_and_mitigation.view can reach /v1/inform at all (the module
-- gate). Both EOCC and Director hold it, so these grants are live. Sector-officer entry (MDA Focal / EW
-- agency users keying only their own indicators) is deferred: it needs (1) granting those roles
-- prevention_and_mitigation.view + risk_index.create AND (2) the assertAgencyWrite sector-isolation layer.
insert into public.role_has_permissions (permission_id, role_id)
select p.id, r.id
from public.permissions p
join public.roles r on (
       (p.name = 'risk_index.create'  and r.name in ('Super Admin', 'EOCC'))
    or (p.name = 'risk_index.approve' and r.name in ('Super Admin', 'Director'))
)
where p.name in ('risk_index.create', 'risk_index.approve')
  and not exists (
        select 1 from public.role_has_permissions x
        where x.permission_id = p.id and x.role_id = r.id
  );
