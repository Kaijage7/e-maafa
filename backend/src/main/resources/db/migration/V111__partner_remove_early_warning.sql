-- Early Warning is an internal government function. Partners RECEIVE warnings via dissemination — CAP-style
-- alerts pushed to them through the communication/alert channel — they do NOT access the Early Warning system
-- itself (warnings registry, agency consoles, EW dashboards). A partner currently holding early_warning.view
-- can read /v1/ew/* (e.g. the warnings list). Remove early_warning.view from the Partners role (least-privilege;
-- the bidding/donor portal relies only on resource_allocation.*). The /v1/ew module guard then denies partner
-- accounts. After this the Partners role retains only resource_allocation.view + resource_allocation.request.
delete from public.role_has_permissions rhp
using public.roles r, public.permissions p
where rhp.role_id = r.id
  and rhp.permission_id = p.id
  and r.name = 'Partners'
  and p.name = 'early_warning.view';
