-- Partner (donor/NGO stakeholder) accounts were granted INTERNAL STAFF permissions so they could use the
-- resource-bidding / donation portal. But a partner login is a no-area ("NONE-tier") account, and the
-- area-scoping helper treats no-area callers as the full national view — so those staff permissions exposed
-- the entire national One Health clinical registry (case data, lab results, contact PII) and national
-- analytics to external partner organisations. Under the Tanzania Personal Data Protection Act 2022 health
-- data is SENSITIVE personal data with no lawful basis for that blanket external access; the One Health /
-- reporting modules are also internal government coordination functions with no partner workflow.
--
-- Least-privilege correction: strip from the Partners role the staff permissions that NO partner-facing
-- feature uses. The bidding + donor-pledge portals rely only on resource_allocation.* (verified), so removing
-- one_health.* and reports_and_analytics.view does not affect them. early_warning.view and
-- resource_allocation.view/request are retained. The /v1/onehealth and /v1/reports module guards then deny
-- partner accounts at the filter, closing the exposure centrally.
delete from public.role_has_permissions rhp
using public.roles r, public.permissions p
where rhp.role_id = r.id
  and rhp.permission_id = p.id
  and r.name = 'Partners'
  and p.name in ('one_health.view', 'one_health.manage', 'one_health.acknowledge', 'reports_and_analytics.view');
