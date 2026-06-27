-- Report-Hazard "reported by": citizens follow the triage/approval flow; an INSTITUTION, SECTOR or
-- MINISTRY report is a trusted official source and routes straight to an EOCC-stage incident
-- (workflow_status='waiting_eocc'), skipping the district/region verification steps.
alter table public.public_hazard_reports
    add column if not exists reporter_type text not null default 'public',
    add column if not exists reporter_org  text;

comment on column public.public_hazard_reports.reporter_type is
    'public | institution | sector | ministry — official sources auto-route to a waiting_eocc incident';
comment on column public.public_hazard_reports.reporter_org is
    'Name of the reporting institution/sector/ministry (when reporter_type <> public)';
