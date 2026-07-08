-- F37: Emergency Supplies used to edit inventory_items directly, leaving the
-- warehouse ledger ahead of/behind the stock_movements journal. Post one
-- auditable adjustment per zonal warehouse/resource pair so current stock can
-- be explained by the single warehouse journal before the service-side guard
-- prevents future drift.

with actor as (
    select id as user_id
    from public.users
    where email = 'admin@example.com'
    order by id
    limit 1
),
ledger as (
    select resource_id, warehouse_id, coalesce(sum(quantity), 0)::int as ledger_qty
    from public.inventory_items
    where warehouse_id is not null
      and temporary_warehouse_id is null
    group by resource_id, warehouse_id
),
journal_movements as (
    select resource_id, to_warehouse_id as warehouse_id, coalesce(sum(quantity), 0)::int as delta
    from public.stock_movements
    where to_warehouse_id is not null
      and coalesce(status, 'Completed') = 'Completed'
    group by resource_id, to_warehouse_id

    union all

    select resource_id, from_warehouse_id as warehouse_id, -coalesce(sum(quantity), 0)::int as delta
    from public.stock_movements
    where from_warehouse_id is not null
      and coalesce(status, 'Completed') = 'Completed'
    group by resource_id, from_warehouse_id
),
journal as (
    select resource_id, warehouse_id, coalesce(sum(delta), 0)::int as journal_qty
    from journal_movements
    group by resource_id, warehouse_id
),
diff as (
    select coalesce(l.resource_id, j.resource_id) as resource_id,
           coalesce(l.warehouse_id, j.warehouse_id) as warehouse_id,
           coalesce(l.ledger_qty, 0) as ledger_qty,
           coalesce(j.journal_qty, 0) as journal_qty,
           coalesce(l.ledger_qty, 0) - coalesce(j.journal_qty, 0) as delta
    from ledger l
    full join journal j
      on j.resource_id = l.resource_id
     and j.warehouse_id = l.warehouse_id
),
pending as (
    select *
    from diff
    where delta <> 0
      and not exists (
          select 1
          from public.stock_movements sm
          where sm.reason = 'emergency_supplies_reconciliation_20260708'
      )
)
insert into public.stock_movements(resource_id, quantity, movement_type,
    from_warehouse_id, to_warehouse_id, warehouse_type, reason, notes, status,
    user_id, completed_at, completed_by, created_at, updated_at)
select p.resource_id,
       abs(p.delta)::int,
       case when p.delta > 0 then 'Adjustment_Increase' else 'Adjustment_Decrease' end,
       case when p.delta < 0 then p.warehouse_id else null end,
       case when p.delta > 0 then p.warehouse_id else null end,
       'zonal',
       'emergency_supplies_reconciliation_20260708',
       format('One-time F37 reconciliation: ledger %s, journal %s before repair.',
              p.ledger_qty, p.journal_qty),
       'Completed',
       actor.user_id,
       now(),
       actor.user_id,
       now(),
       now()
from pending p
cross join actor;
