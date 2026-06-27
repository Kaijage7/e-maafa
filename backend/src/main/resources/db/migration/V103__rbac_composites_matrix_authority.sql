-- Stage B of making the matrix authoritative: the remaining composite-role @PreAuthorize gates become
-- hasAuthority(<perm>). New permissions are created for actions the matrix could not express, and granted
-- to EXACTLY the roles each role-composite allowed today (behavior-preserving). Roles are created by
-- earlier migrations (V5/V71/V93/V96), so these grants apply on both the live DB and fresh installs.
--   ContingencyPlan store/update/submit  RESPONSE_OPERATE   -> contingency_plans.manage
--   ContingencyPlan approve/reject/archive RESPONSE_OVERSIGHT-> contingency_plans.approve
--   Incident push-map/push-news/remove-news RESPONSE_PUBLISH -> incidents.publish
--   StakeholderAdmin create/update/link    STAKEHOLDER_ADMIN -> stakeholders.manage
--   Declaration technical-review           DECLARE_REVIEW    -> disaster_declarations.review
--   Declaration endorse                    DECLARE_ENDORSE   -> disaster_declarations.endorse
--   OneHealth dissemination acknowledge    OH_ACKNOWLEDGE    -> one_health.acknowledge

insert into public.permissions(name, module, action, label, guard_name, created_at, updated_at) values
  ('contingency_plans.manage','Contingency Plans','manage','Manage — Contingency Plans','web',now(),now()),
  ('contingency_plans.approve','Contingency Plans','approve','Approve — Contingency Plans','web',now(),now()),
  ('incidents.publish','Incidents','publish','Publish — Incidents','web',now(),now()),
  ('stakeholders.view','Stakeholders','view','View — Stakeholders','web',now(),now()),
  ('stakeholders.manage','Stakeholders','manage','Manage — Stakeholders','web',now(),now()),
  ('disaster_declarations.review','Disaster Declarations','review','Technical review — Disaster Declarations','web',now(),now()),
  ('disaster_declarations.endorse','Disaster Declarations','endorse','Endorse — Disaster Declarations','web',now(),now()),
  ('one_health.acknowledge','One Health','acknowledge','Acknowledge — One Health','web',now(),now())
on conflict (name) do nothing;

insert into public.role_has_permissions(permission_id, role_id)
select p.id, r.id from (values
  -- contingency_plans.manage = RESPONSE_OPERATE
  ('contingency_plans.manage','Super Admin'),('contingency_plans.manage','ICT Admin'),('contingency_plans.manage','EOCC'),
  ('contingency_plans.manage','Director'),('contingency_plans.manage','Asst. Director'),('contingency_plans.manage','MDA Focal'),
  ('contingency_plans.manage','RAS'),('contingency_plans.manage','Reg DC'),('contingency_plans.manage','DAS'),
  ('contingency_plans.manage','Dist DC'),('contingency_plans.manage','DED'),('contingency_plans.manage','Secretary'),
  -- contingency_plans.approve = RESPONSE_OVERSIGHT
  ('contingency_plans.approve','Super Admin'),('contingency_plans.approve','EOCC'),
  ('contingency_plans.approve','Director'),('contingency_plans.approve','Asst. Director'),
  -- incidents.publish = RESPONSE_PUBLISH
  ('incidents.publish','EOCC'),('incidents.publish','Comms Officer'),('incidents.publish','Director'),
  ('incidents.publish','Asst. Director'),('incidents.publish','Secretary'),('incidents.publish','Super Admin'),('incidents.publish','ICT Admin'),
  -- stakeholders.view/manage = STAKEHOLDER_ADMIN
  ('stakeholders.view','Super Admin'),('stakeholders.view','ICT Admin'),('stakeholders.view','Director'),
  ('stakeholders.manage','Super Admin'),('stakeholders.manage','ICT Admin'),('stakeholders.manage','Director'),
  -- disaster_declarations.review = DECLARE_REVIEW ; endorse = DECLARE_ENDORSE
  ('disaster_declarations.review','Super Admin'),('disaster_declarations.review','National Technical Committee'),
  ('disaster_declarations.endorse','Super Admin'),('disaster_declarations.endorse','National Steering Committee'),
  -- one_health.acknowledge = OH_ACKNOWLEDGE
  ('one_health.acknowledge','Super Admin'),('one_health.acknowledge','Partners'),('one_health.acknowledge','MDA Focal'),
  ('one_health.acknowledge','RAS'),('one_health.acknowledge','Reg DC'),('one_health.acknowledge','DAS'),('one_health.acknowledge','Dist DC')
) as g(pname, rname)
join public.permissions p on p.name = g.pname
join public.roles r on r.name = g.rname
on conflict do nothing;
