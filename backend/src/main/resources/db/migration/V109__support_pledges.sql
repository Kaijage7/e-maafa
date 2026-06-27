-- Donor/partner funding pledges. A stakeholder (donor/partner) pledges ITS OWN contribution (cash or
-- in-kind) toward a mitigation measure (a DRR priority) or a training that needs support; PMO staff then
-- review and accept/decline. This is the prevention/preparedness funding side of the partner portal — the
-- donor sees ONLY the measures + trainings that need support (from anywhere) and pledges; their pledges are
-- private to them + PMO. Mirrors the resource-bid flow but for cash/in-kind support of measures/trainings.

-- A measure is "funded" once a pledge against it is accepted → it then leaves the donor feed (mirrors
-- training_plans.source_of_fund). The measure's own additional_support_required text is the "needs support" flag.
alter table public.mitigation_measures add column if not exists support_funded_at timestamptz;

create table if not exists public.support_pledges (
    id                    bigserial primary key,
    target_type           varchar(20)   not null,                 -- 'measure' | 'training'
    mitigation_measure_id bigint        references public.mitigation_measures(id),
    training_plan_id      bigint        references public.training_plans(id),
    stakeholder_id        bigint        not null references public.stakeholders(id),
    contribution_type     varchar(20)   not null default 'cash',  -- cash | in_kind
    amount                numeric(18,2),
    currency              varchar(10)   default 'TZS',
    description           text,
    status                varchar(20)   not null default 'pledged', -- pledged | accepted | declined
    pledged_by            bigint        references public.users(id),
    reviewed_by           bigint        references public.users(id),
    reviewed_at           timestamptz,
    review_note           text,
    created_at            timestamptz   default now(),
    updated_at            timestamptz   default now(),
    constraint support_pledges_target_chk check (target_type in ('measure', 'training')),
    constraint support_pledges_contrib_chk check (contribution_type in ('cash', 'in_kind'))
);
create index if not exists idx_support_pledges_measure     on public.support_pledges(mitigation_measure_id);
create index if not exists idx_support_pledges_training    on public.support_pledges(training_plan_id);
create index if not exists idx_support_pledges_stakeholder on public.support_pledges(stakeholder_id);
