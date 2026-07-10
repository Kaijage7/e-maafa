-- F65: re-attach orphan temporary stock (inventory_items id 18 / movement 12) that was written
-- without a store id by a pre-fix donation receive path. Prefer Ilala temp store (id=1) when present.
UPDATE public.inventory_items ii
   SET temporary_warehouse_id = tw.id,
       warehouse_type = 'temporary',
       updated_at = now()
  FROM (
        select id from public.temporary_warehouses
         where coalesce(is_active, true) = true
         order by id
         limit 1
       ) tw
 WHERE ii.warehouse_id is null
   and ii.temporary_warehouse_id is null
   and coalesce(ii.quantity, 0) > 0
   and lower(coalesce(ii.warehouse_type, 'temporary')) in ('temporary', '');

UPDATE public.stock_movements sm
   SET to_temporary_warehouse_id = tw.id,
       updated_at = now()
  FROM (
        select id from public.temporary_warehouses
         where coalesce(is_active, true) = true
         order by id
         limit 1
       ) tw
 WHERE sm.id = 12
   and sm.to_warehouse_id is null
   and sm.to_temporary_warehouse_id is null
   and sm.movement_type = 'Intake';

-- F61: make Dist DC vs District Commissioner doctrine explicit (no more "viewer DC" confusion).
UPDATE public.roles
   SET description = 'District Disaster Management Committee (DDMC) entry-stage approver for the attached council/LGA. Owns waiting_ddmc: can escalate or close-as-rumour. Not a read-only viewer.',
       assignment_hint = 'Requires region + district + council/LGA. Canonical working DDMC seat (not the District Commissioner viewer role).',
       updated_at = now()
 WHERE name = 'Dist DC';

UPDATE public.roles
   SET description = 'District Commissioner — area oversight and advisory/comment. Does not own the DDMC approval gate (that is Dist DC).',
       assignment_hint = 'Requires region + district + council/LGA. Viewer/comment path; Dist DC owns waiting_ddmc approvals.',
       updated_at = now()
 WHERE name = 'District Commissioner';
