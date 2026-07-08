-- F39: Anticipatory command-post activations must be traceable to the issued
-- early warning that triggered them. Manual/off-platform forecasts remain
-- possible with warning_id NULL, but selected DMIS warnings persist here.
alter table public.response_activations
    add column if not exists warning_id bigint;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'response_activations_warning_id_fkey'
    ) then
        alter table public.response_activations
            add constraint response_activations_warning_id_fkey
            foreign key (warning_id) references public.warnings(id) on delete set null;
    end if;
end $$;

create index if not exists idx_response_activations_warning_id
    on public.response_activations(warning_id);

create unique index if not exists uq_response_activations_active_live_warning
    on public.response_activations(warning_id)
    where warning_id is not null
      and status = 'active'
      and trigger_type = 'forecast'
      and coalesce(is_simulation, false) = false;
