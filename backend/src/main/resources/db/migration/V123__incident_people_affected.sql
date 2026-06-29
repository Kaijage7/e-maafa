-- E4 (national stakeholders feedback): capture "People Affected" as the human-impact DENOMINATOR.
-- The existing deaths/injured/missing/displaced/children/PWD/pregnant counts are SUBSETS of this total.
-- Additive + nullable: existing rows and flows that don't supply it are unaffected.
alter table public.incidents add column if not exists people_affected integer;

comment on column public.incidents.people_affected is
    'Total people affected by the incident — the denominator; deaths/injured/missing/displaced/children/PWD/pregnant are subsets of it.';
