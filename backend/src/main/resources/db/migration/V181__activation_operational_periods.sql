-- V181: Command Post operational periods (IAP cadence) — F31
-- Real period rows (not only age-derived labels) with objectives and handover notes.

create table if not exists public.activation_periods (
    id              bigserial primary key,
    activation_id   bigint not null references public.response_activations(id) on delete cascade,
    period_number   int not null,
    label           varchar(80) not null,
    objectives      text,
    status          varchar(16) not null default 'open'
                    check (status in ('open', 'closed')),
    started_at      timestamptz not null default now(),
    ended_at        timestamptz,
    handover_notes  text,
    created_by      bigint references public.users(id) on delete set null,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (activation_id, period_number)
);

create index if not exists activation_periods_act_idx
    on public.activation_periods (activation_id, status);

comment on table public.activation_periods is
    'ICS-style operational periods for an activation: objectives, open/closed window, handover notes for AAR.';

-- Seed period 1 for each currently active activation that has none (idempotent).
insert into public.activation_periods (activation_id, period_number, label, objectives, status, started_at, created_at, updated_at)
select a.id, 1, 'Operational Period 1',
       'Establish command, confirm DRF lane ownership, publish first situation report.',
       'open', coalesce(a.activated_at, a.created_at, now()), now(), now()
from public.response_activations a
where lower(coalesce(a.status, '')) = 'active'
  and not exists (
      select 1 from public.activation_periods p where p.activation_id = a.id
  );
