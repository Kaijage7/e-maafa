-- Close the warehouse → inventory_items linkage gap. inventory_items.warehouse_id had NO foreign key
-- (orphan risk), whereas temporary_warehouse_id already references temporary_warehouses. All current
-- non-null warehouse_id values resolve to a real warehouse (0 orphans), so adding the constraint is safe.
-- ON DELETE SET NULL matches the existing temporary-warehouse FK behaviour (deleting a warehouse leaves
-- the inventory row, just unlinked, rather than blocking the delete or cascading stock loss).
alter table public.inventory_items
    add constraint inventory_items_warehouse_id_fkey
    foreign key (warehouse_id) references public.warehouses(id) on delete set null;
