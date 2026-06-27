-- Disaster budget & finance (full budgeting) for the resource-mobilization side of the incident chain
-- (INCIDENT-WORKFLOW-PLAN.md). Public-finance shape: fiscal PERIODS → scoped BUDGETS → line-item ALLOCATIONS
-- → COMMITMENTS/expenditures against an incident with maker-checker (Planning requests → DED/RAS approves →
-- Logistic disburses). Plus the missing NDMF→incident link so stakeholder cash is traceable to the incident.

create table if not exists public.budget_periods (
    id          bigserial primary key,
    name        varchar(100) not null,
    fiscal_year varchar(20),
    start_date  date,
    end_date    date,
    status      varchar(20)  not null default 'open',   -- open | closed
    is_active   boolean      not null default true,
    created_at  timestamptz  default now(),
    updated_at  timestamptz  default now()
);

-- A disaster budget scoped to a tier (district / region / national) for a period.
create table if not exists public.disaster_budgets (
    id           bigserial primary key,
    period_id    bigint      not null references public.budget_periods(id),
    scope_level  varchar(20) not null,                  -- district | region | national
    district_id  bigint      references public.districts(id),
    region_id    bigint      references public.regions(id),
    title        varchar(200),
    total_amount numeric(18,2) not null default 0,
    currency     varchar(10) not null default 'TZS',
    status       varchar(20) not null default 'draft',  -- draft | approved | active | closed
    approved_by  bigint      references public.users(id),
    approved_at  timestamptz,
    created_by   bigint      references public.users(id),
    created_at   timestamptz default now(),
    updated_at   timestamptz default now()
);

-- Line-item categories (the allocation) within a budget.
create table if not exists public.budget_lines (
    id                 bigserial primary key,
    disaster_budget_id bigint        not null references public.disaster_budgets(id) on delete cascade,
    category           varchar(100)  not null,          -- Relief Supplies | Logistics | Cash Assistance | Equipment | ...
    description        text,
    allocated_amount   numeric(18,2) not null default 0,
    created_at         timestamptz   default now(),
    updated_at         timestamptz   default now()
);

-- Commitment / expenditure against a line for an incident — maker-checker:
-- requested (Planning Officer) → approved (DED/RAS) → disbursed (Logistic Officer); or rejected.
create table if not exists public.budget_commitments (
    id             bigserial primary key,
    budget_line_id bigint        not null references public.budget_lines(id),
    incident_id    bigint        references public.incidents(id),
    amount         numeric(18,2) not null,
    purpose        text,
    payee          varchar(200),
    status         varchar(20)   not null default 'requested', -- requested | approved | disbursed | rejected
    requested_by   bigint        references public.users(id),
    approved_by    bigint        references public.users(id),
    approved_at    timestamptz,
    disbursed_by   bigint        references public.users(id),
    disbursed_at   timestamptz,
    reject_reason  text,
    created_at     timestamptz   default now(),
    updated_at     timestamptz   default now()
);

-- NDMF disbursement → incident link (stakeholder cash trail back to the incident it served).
alter table public.ndmf_disbursements add column if not exists incident_id bigint references public.incidents(id);

create index if not exists idx_disaster_budgets_district  on public.disaster_budgets(district_id);
create index if not exists idx_disaster_budgets_region    on public.disaster_budgets(region_id);
create index if not exists idx_budget_lines_budget        on public.budget_lines(disaster_budget_id);
create index if not exists idx_budget_commitments_line    on public.budget_commitments(budget_line_id);
create index if not exists idx_budget_commitments_incident on public.budget_commitments(incident_id);
create index if not exists idx_ndmf_disb_incident         on public.ndmf_disbursements(incident_id);

-- Permissions for the Budget & Finance module (created here so the grants below resolve; the seeder
-- catalogue also lists them for fresh installs). Maker-checker: manage=create budget/request spend (Planning),
-- approve=authorise the commitment (DED/RAS), disburse=pay out (Logistic) — three different roles.
insert into public.permissions(name, module, action, label, guard_name, created_at, updated_at) values
  ('budget_and_finance.view',    'Budget & Finance', 'view',    'View — Budget & Finance',    'web', now(), now()),
  ('budget_and_finance.manage',  'Budget & Finance', 'manage',  'Manage — Budget & Finance',  'web', now(), now()),
  ('budget_and_finance.approve', 'Budget & Finance', 'approve', 'Approve — Budget & Finance', 'web', now(), now()),
  ('budget_and_finance.disburse','Budget & Finance', 'disburse','Disburse — Budget & Finance','web', now(), now())
on conflict (name) do nothing;

insert into public.role_has_permissions(permission_id, role_id)
select p.id, r.id
from (values
  ('budget_and_finance.view','DED'),('budget_and_finance.view','RAS'),('budget_and_finance.view','District Planning Officer'),
  ('budget_and_finance.view','Regional Planning Officer'),('budget_and_finance.view','District Logistic Officer'),
  ('budget_and_finance.view','Regional Logistic Officer'),('budget_and_finance.view','Director'),
  ('budget_and_finance.view','Secretary'),('budget_and_finance.view','EOCC'),('budget_and_finance.view','Asst. Director'),
  ('budget_and_finance.view','Super Admin'),('budget_and_finance.view','ICT Admin'),
  -- manage (create budgets/lines + request spend): tier executives + planning officers + admins
  ('budget_and_finance.manage','DED'),('budget_and_finance.manage','RAS'),('budget_and_finance.manage','District Planning Officer'),
  ('budget_and_finance.manage','Regional Planning Officer'),('budget_and_finance.manage','Director'),
  ('budget_and_finance.manage','Secretary'),('budget_and_finance.manage','Super Admin'),('budget_and_finance.manage','ICT Admin'),
  -- approve commitments + budgets: tier executives + national command
  ('budget_and_finance.approve','DED'),('budget_and_finance.approve','RAS'),('budget_and_finance.approve','Director'),
  ('budget_and_finance.approve','Secretary'),('budget_and_finance.approve','Super Admin'),
  -- disburse (pay out): logistic officers + admins
  ('budget_and_finance.disburse','District Logistic Officer'),('budget_and_finance.disburse','Regional Logistic Officer'),
  ('budget_and_finance.disburse','Super Admin'),('budget_and_finance.disburse','ICT Admin')
) as gr(pname, rname)
join public.permissions p on p.name = gr.pname
join public.roles r on r.name = gr.rname
on conflict do nothing;
