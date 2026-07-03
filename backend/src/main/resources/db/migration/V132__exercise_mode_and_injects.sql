-- Advanced exercises for the Command Post (all additive).
--
-- 1) Exercise realism option: a simulation opened as a TABLE-TOP drill (default) is hard-blocked from
--    real side-effects (stock, dispatch, budget, partner notifications, SMS); opened as a FULL-SCALE
--    exercise (allow_real_ops = true) it may run real operations, with communications [DRILL]-marked.
alter table public.response_activations
  add column if not exists allow_real_ops boolean not null default false;

-- 2) Scenario injects: timed events the exercise director scripts into a running activation
--    ("bridge reported washed out", "hospital requests evacuation support"). An inject fires at its
--    due time (or manually), lands on the Command Board, and the commander resolves it with a note —
--    feeding the after-action review.
create table if not exists public.activation_injects (
  id             bigserial primary key,
  activation_id  bigint not null references public.response_activations(id),
  title          varchar(200) not null,
  detail         text,
  inject_type    varchar(20) not null default 'event',      -- event | decision | message
  due_at         timestamp without time zone,               -- null = manual fire only
  status         varchar(16) not null default 'pending',    -- pending | fired | resolved
  fired_at       timestamp without time zone,
  resolved_at    timestamp without time zone,
  resolution     text,
  created_by     bigint,
  created_at     timestamp without time zone not null default now(),
  updated_at     timestamp without time zone not null default now()
);
create index if not exists idx_activation_injects_act on public.activation_injects(activation_id, status);
