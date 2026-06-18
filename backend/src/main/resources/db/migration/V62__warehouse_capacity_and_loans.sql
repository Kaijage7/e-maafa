-- Warehouse capacity statistics + inter-warehouse borrowing/return.
-- Builds on the existing single ledger (inventory_items)
-- and single journal (stock_movements); adds the two capabilities the audit found missing:
--   (1) capacity utilisation — a per-resource storage footprint so we can compute
--       Σ(quantity × footprint) / storage_capacity_sqm per warehouse; and
--   (2) borrowing — a formal loan record (lender → borrower, due date, return) on top of
--       the existing transfer mechanics, so stock lent between stores is tracked and repaid.

-- ── (1) per-resource storage footprint (sqm per unit) ───────────────────────────────
alter table public.resources
    add column if not exists footprint_sqm numeric(10,4);

-- Sensible, EDITABLE defaults by category (warehouse managers can refine per resource).
update public.resources set footprint_sqm = case
        when category ilike '%shelter%'                              then 1.5000   -- tents, tarpaulins (bulky)
        when category ilike '%search%' or category ilike '%rescue%'  then 0.2000   -- equipment
        when category ilike '%water%'  or category ilike '%sanitation%' then 0.1000
        when category ilike '%non-food%' or category ilike '%nfi%'    then 0.0500   -- blankets, kits
        when category ilike '%food%'                                  then 0.0200
        when category ilike '%medic%' or category ilike '%health%'    then 0.0300
        else 0.0500 end
    where footprint_sqm is null;

comment on column public.resources.footprint_sqm is
    'Storage footprint in square metres per unit; used for warehouse capacity utilisation. Editable.';

-- ── (2) inter-warehouse loans (borrowing) ───────────────────────────────────────────
create table if not exists public.warehouse_loans (
    id                          bigserial primary key,
    resource_id                 bigint not null references public.resources(id),
    quantity                    integer not null check (quantity > 0),
    -- lender (source) and borrower (destination): each is exactly one of zonal / temporary
    from_warehouse_id           bigint references public.warehouses(id),
    from_temporary_warehouse_id bigint references public.temporary_warehouses(id),
    to_warehouse_id             bigint references public.warehouses(id),
    to_temporary_warehouse_id   bigint references public.temporary_warehouses(id),
    borrowed_at                 date not null default current_date,
    due_date                    date,
    returned_at                 date,
    returned_quantity           integer not null default 0,
    status                      varchar(32) not null default 'Outstanding',
        -- Outstanding | Partially_Returned | Returned | Overdue (overdue derived from due_date at read time)
    notes                       text,
    created_by                  bigint references public.users(id),
    created_at                  timestamptz not null default now(),
    updated_at                  timestamptz not null default now(),
    constraint warehouse_loans_from_one_store check (
        (from_warehouse_id is not null)::int + (from_temporary_warehouse_id is not null)::int = 1),
    constraint warehouse_loans_to_one_store check (
        (to_warehouse_id is not null)::int + (to_temporary_warehouse_id is not null)::int = 1)
);
create index if not exists idx_warehouse_loans_status on public.warehouse_loans(status);
create index if not exists idx_warehouse_loans_resource on public.warehouse_loans(resource_id);

-- ── (3) journal: allow Borrow / Return movement types ───────────────────────────────
alter table public.stock_movements drop constraint if exists stock_movements_movement_type_check;
alter table public.stock_movements add constraint stock_movements_movement_type_check
    check (movement_type in ('Intake','Transfer','Dispatch','Adjustment_Increase','Adjustment_Decrease',
                             'Deduction','Removal','Deployment','Borrow','Return'));
