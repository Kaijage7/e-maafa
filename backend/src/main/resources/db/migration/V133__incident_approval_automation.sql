-- Incident approval-chain automation, controlled from System Settings.
-- Each ladder stage gets a mode in portal_settings (group='incident_approval'):
--   manual            → an officer of that stage's role+area must act (classic behaviour)
--   auto              → the system advances this stage automatically
--   skip_if_unstaffed → advance automatically ONLY when no active officer staffs the
--                       stage in the incident's own area (so an incident never stalls in
--                       a region/district that has no coordinator for that tier)
--
-- Defaults make every region flow to a REAL approver without a full national roster:
-- the district/region COORDINATOR gates (DDMC/RDMC) and the district DED tier skip when
-- unstaffed; RAS (present in all 31 regions) and the national tiers stay manual.
-- IncidentWorkflowService falls back to these same defaults if a row is missing, so the
-- engine is safe even before an admin opens the settings screen.

insert into public.portal_settings ("group", key, value, type, created_at, updated_at) values
  ('incident_approval', 'waiting_ddmc',     'skip_if_unstaffed', 'string', now(), now()),
  ('incident_approval', 'waiting_ded',      'skip_if_unstaffed', 'string', now(), now()),
  ('incident_approval', 'waiting_rdmc',     'skip_if_unstaffed', 'string', now(), now()),
  ('incident_approval', 'waiting_ras',      'manual',            'string', now(), now()),
  ('incident_approval', 'waiting_eocc',     'manual',            'string', now(), now()),
  ('incident_approval', 'waiting_director', 'manual',            'string', now(), now()),
  ('incident_approval', 'waiting_ps',       'manual',            'string', now(), now())
on conflict do nothing;
