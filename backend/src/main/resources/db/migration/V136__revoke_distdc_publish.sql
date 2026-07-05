-- Revoke incidents.publish from Dist DC. Publishing an incident to the PUBLIC portal (live map /
-- News & Events) is an EOCC coordination-centre function per the platform doctrine (Authz.RESPONSE_PUBLISH:
-- EOCC + national command/comms, "never the district/regional responders who only report & approve within
-- their own area") — yet the matrix granted it to the district-level DDMC entry approver. The permission row
-- itself stays (national roles keep it); only the Dist DC grant is removed. Idempotent.
delete from public.role_has_permissions
where role_id in (select id from public.roles where name = 'Dist DC')
  and permission_id in (select id from public.permissions where name = 'incidents.publish');
