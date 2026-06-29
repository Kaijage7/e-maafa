-- K8 (national stakeholders feedback): the captured time was ambiguous (report time vs event time).
-- reported_at already records WHEN IT WAS REPORTED; add the event's own occurrence and end times.
-- Additive + nullable: existing rows and flows are unaffected (ended_at stays null while ongoing).
alter table public.incidents add column if not exists occurred_at timestamptz;
alter table public.incidents add column if not exists ended_at   timestamptz;

comment on column public.incidents.occurred_at is 'When the incident actually occurred / began (distinct from reported_at = when it was reported).';
comment on column public.incidents.ended_at   is 'When the incident ended / was resolved (null while still ongoing).';
