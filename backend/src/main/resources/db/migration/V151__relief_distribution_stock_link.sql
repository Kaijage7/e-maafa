-- F44: connect relief distributions to incidents/assessments and the warehouse stock journal.
-- Existing seeded/legacy rows stay valid; new controller writes populate these optional links.
alter table public.relief_distributions
    add column if not exists warehouse_id bigint,
    add column if not exists temporary_warehouse_id bigint,
    add column if not exists stock_movement_id bigint;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'relief_distributions_warehouse_id_fkey'
    ) then
        alter table public.relief_distributions
            add constraint relief_distributions_warehouse_id_fkey
            foreign key (warehouse_id) references public.warehouses(id) on delete set null;
    end if;
    if not exists (
        select 1 from pg_constraint where conname = 'relief_distributions_temporary_warehouse_id_fkey'
    ) then
        alter table public.relief_distributions
            add constraint relief_distributions_temporary_warehouse_id_fkey
            foreign key (temporary_warehouse_id) references public.temporary_warehouses(id) on delete set null;
    end if;
    if not exists (
        select 1 from pg_constraint where conname = 'relief_distributions_stock_movement_id_fkey'
    ) then
        alter table public.relief_distributions
            add constraint relief_distributions_stock_movement_id_fkey
            foreign key (stock_movement_id) references public.stock_movements(id) on delete set null;
    end if;
    if not exists (
        select 1 from pg_constraint where conname = 'relief_distributions_one_source_chk'
    ) then
        alter table public.relief_distributions
            add constraint relief_distributions_one_source_chk
            check (warehouse_id is null or temporary_warehouse_id is null);
    end if;
end $$;

create index if not exists idx_relief_distributions_warehouse_id
    on public.relief_distributions(warehouse_id);
create index if not exists idx_relief_distributions_temporary_warehouse_id
    on public.relief_distributions(temporary_warehouse_id);
create index if not exists idx_relief_distributions_stock_movement_id
    on public.relief_distributions(stock_movement_id);
