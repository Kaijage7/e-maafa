-- Make INFORM sector data-entry REAL for every owner: create an agency + a focal user for each INFORM
-- sector-owner that lacks one, so all 16 owners (not just the 6 EW agencies) have an agency-bound officer who
-- can key ONLY their own indicators (enforced by InformService.assertSectorWrite). Idempotent; the focal
-- password is copied from an existing agency officer (no credential literal in source).

-- 1) agencies for the owners that don't have one (acronym == the INFORM owner code)
insert into public.agencies (name, acronym, agency_type, is_active, created_at, updated_at)
select o.full_name, o.acr, 'Government', true, now(), now()
from (values
  ('MoFP',    'Ministry of Finance and Planning'),
  ('PMO-DMD', 'Prime Minister''s Office – Disaster Management Department'),
  ('TFS',     'Tanzania Forest Services Agency'),
  ('MoHA',    'Ministry of Home Affairs'),
  ('PO-RALG', 'President''s Office – Regional Administration and Local Government'),
  ('TCRA',    'Tanzania Communications Regulatory Authority'),
  ('NBS',     'National Bureau of Statistics'),
  ('MoEST',   'Ministry of Education, Science and Technology'),
  ('BWB',     'Basin Water Boards'),
  ('TPF',     'Tanzania Police Force')
) o(acr, full_name)
where exists (select 1 from public.inform_indicator i where i.owner = o.acr)         -- only real INFORM owners
  and not exists (select 1 from public.agencies a where lower(a.acronym) = lower(o.acr));

-- 2) a focal user per new agency (email acr@pmo.go.tz, role MDA Focal), password copied from an existing officer
insert into public.users (name, email, password, agency_id, notify_in_app, notify_email, notify_sms, created_at, updated_at)
select a.acronym || ' Focal (' || a.name || ')', lower(a.acronym) || '@pmo.go.tz',
       coalesce((select u2.password from public.users u2 where u2.email = 'gst@pmo.go.tz' limit 1),
                (select u3.password from public.users u3 where u3.password is not null limit 1)),
       a.id, true, true, false, now(), now()
from public.agencies a
where a.acronym in ('MoFP','PMO-DMD','TFS','MoHA','PO-RALG','TCRA','NBS','MoEST','BWB','TPF')
  and not exists (select 1 from public.users u where u.email = lower(a.acronym) || '@pmo.go.tz');

-- 3) grant each new focal the MDA Focal role (id 8) — inherits prevention_and_mitigation.view + risk_index.create (V118)
insert into public.model_has_roles (role_id, model_type, model_id)
select 8, 'App\Models\User', u.id
from public.users u
where u.email in ('mofp@pmo.go.tz','pmo-dmd@pmo.go.tz','tfs@pmo.go.tz','moha@pmo.go.tz','po-ralg@pmo.go.tz',
                  'tcra@pmo.go.tz','nbs@pmo.go.tz','moest@pmo.go.tz','bwb@pmo.go.tz','tpf@pmo.go.tz')
  and not exists (select 1 from public.model_has_roles m where m.model_id = u.id and m.role_id = 8);
