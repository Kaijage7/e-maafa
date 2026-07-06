-- ICS command structure for the Command Post (F05 — all additive).
--
-- Who COMMANDS an activation: the Incident Commander, command staff (Deputy IC / PIO /
-- Safety / Liaison) and the General-Staff section chiefs (Operations / Planning / Logistics /
-- Finance-Admin) — NIMS/ICS doctrine mapped onto the NDPRP activation. Until now DRF lanes
-- were assigned to stakeholder ORGANISATIONS and tasks to users, but nothing named who runs
-- the incident. Appointments and reliefs are journalled into task_activity_log by the
-- controller so the After-Action Review shows every command handover.
create table if not exists public.activation_command_roles (
  id             bigserial primary key,
  activation_id  bigint not null references public.response_activations(id) on delete cascade,
  role           varchar(30) not null check (role in
                   ('IC','Deputy IC','Operations','Planning','Logistics','Finance/Admin','PIO','Safety','Liaison')),
  user_id        bigint not null references public.users(id),
  appointed_at   timestamp with time zone not null default now(),
  appointed_by   bigint,
  relieved_at    timestamp with time zone,                 -- null = currently holding the role
  relieved_by    bigint,
  note           text
);
create index if not exists idx_activation_command_roles_act on public.activation_command_roles(activation_id);
-- Only ONE ACTIVE holder per (activation, role): the appoint endpoint relieves the incumbent
-- first; this partial unique index is the hard guarantee against a split command.
create unique index if not exists uq_activation_command_role_active
  on public.activation_command_roles(activation_id, role) where relieved_at is null;
