-- R11 Command Center: Live vs Simulation modes (user requirement — "two options,
-- one for virtual simulation and other for during events").
-- A simulation activates against a CLONED drill incident so live data is never
-- touched; both the clone and its activation carry the flag, and public reads
-- exclude flagged incidents (manual D1 contract).
alter table public.incidents
    add column if not exists is_simulation boolean not null default false;
alter table public.response_activations
    add column if not exists is_simulation boolean not null default false;
create index if not exists idx_incidents_simulation on public.incidents(is_simulation) where is_simulation;
