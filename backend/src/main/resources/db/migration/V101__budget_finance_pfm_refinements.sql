-- Budget & finance refinements grounded in verified public-finance practice:
--   • commitment ≠ expenditure  — IMF TNM 2016/02 (7-stage budget execution: …commitment→verification→payment),
--                                 PEFA PI-25 (commitment controls), IPSAS 24 (commitments = obligations/encumbrances)
--   • virement                  — IPSAS 24 (final budget = original adjusted for authorized transfers/reallocations)
--   • donor earmarking          — IATI Standard v2.03 earmarking modality (1=Unearmarked..4=Tightly), IPSAS 24 restricted
-- All additive (if-not-exists) so it is safe over the live V99/V100 schema and existing data.

-- 1) Commitment vs expenditure -------------------------------------------------------------------
-- The commitment lifecycle becomes requested → approved → committed → disbursed (or rejected):
-- approve = authorise (DED/RAS); commit = obligate/encumber the funds; disburse = actual payment.
-- budget_commitments.status carries no CHECK constraint, so the new 'committed' value needs no DDL.
alter table public.budget_commitments add column if not exists committed_by    bigint references public.users(id);
alter table public.budget_commitments add column if not exists committed_at     timestamptz;
alter table public.budget_commitments add column if not exists expended_amount  numeric(18,2);   -- actual paid (may differ from the committed amount)

-- 2) Donor earmarking / ring-fencing on the NDMF ------------------------------------------------
-- IATI v2.03 earmarking modality codes: 1=Unearmarked, 2=Softly earmarked, 3=Earmarked, 4=Tightly earmarked.
alter table public.ndmf_donations add column if not exists earmark_type        smallint not null default 1;
alter table public.ndmf_donations add column if not exists earmark_purpose     text;
alter table public.ndmf_donations add column if not exists earmark_incident_id bigint references public.incidents(id);
alter table public.ndmf_donations drop constraint if exists ndmf_donations_earmark_chk;
alter table public.ndmf_donations add  constraint ndmf_donations_earmark_chk check (earmark_type between 1 and 4);
-- link every disbursement back to the donation that funded it (the audit trail / ring-fence)
alter table public.ndmf_disbursements add column if not exists donation_id bigint references public.ndmf_donations(id);
create index if not exists idx_ndmf_disb_donation               on public.ndmf_disbursements(donation_id);
create index if not exists idx_ndmf_donations_earmark_incident  on public.ndmf_donations(earmark_incident_id);

-- 3a) Virement (reallocation between budget lines) — an authorized budget change under IPSAS 24.
--     The record itself is the mandatory disclosure / audit trail of the reallocation.
create table if not exists public.budget_virements (
    id                 bigserial primary key,
    disaster_budget_id bigint        not null references public.disaster_budgets(id) on delete cascade,
    from_line_id       bigint        not null references public.budget_lines(id),
    to_line_id         bigint        not null references public.budget_lines(id),
    amount             numeric(18,2) not null,
    reason             text,
    status             varchar(20)   not null default 'requested',   -- requested | approved | rejected
    requested_by       bigint        references public.users(id),
    approved_by        bigint        references public.users(id),
    approved_at        timestamptz,
    reject_reason      text,
    created_at         timestamptz   default now(),
    updated_at         timestamptz   default now()
);
create index if not exists idx_budget_virements_budget on public.budget_virements(disaster_budget_id);

-- 3b) Tier-based approval thresholds (configurable, NOT hardcoded). A commitment above the ceiling
--     for its budget's tier must escalate to a higher tier; national = unlimited (max_amount null).
create table if not exists public.budget_approval_thresholds (
    id          bigserial primary key,
    scope_level varchar(20)   not null unique,            -- district | region | national
    max_amount  numeric(18,2),                             -- null = unlimited
    created_at  timestamptz   default now(),
    updated_at  timestamptz   default now()
);
insert into public.budget_approval_thresholds(scope_level, max_amount) values
  ('district',  50000000),
  ('region',   200000000),
  ('national',      null)
on conflict (scope_level) do nothing;
