-- F1 (national stakeholders feedback): the citizen Report-Hazard form had no email field and gave no
-- proper "invalid email / invalid phone" message. Capture an optional reporter email (phone format is
-- already validated server-side). Additive + nullable.
alter table public.public_hazard_reports add column if not exists reporter_email text;

comment on column public.public_hazard_reports.reporter_email is 'Optional reporter email (validated for format when supplied).';
