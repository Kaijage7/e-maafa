#!/usr/bin/env bash
# F118 pre-cutover check: V178's orphan-stock repair re-attaches EVERY orphan inventory line
# (null warehouse ids, qty>0) to the lowest-id active temporary warehouse — broader than its
# comment's stated scope (item 18 / movement 12). Before running V178 on a NEW database (prod
# cutover), prove the orphan set is exactly the expected one so unrelated stock is not silently
# reassigned to one arbitrary store. Read-only.
#
# Usage: PGPASSWORD=... ./check-orphan-stock.sh [host] [port] [user] [db]
set -u
H=${1:-localhost}; P=${2:-5440}; U=${3:-dmis_app}; D=${4:-dmis}
PSQL="psql -h $H -p $P -U $U -d $D -tA"

ORPHANS=$($PSQL -c "select count(*) from public.inventory_items
                     where warehouse_id is null and temporary_warehouse_id is null
                       and coalesce(quantity,0) > 0;")
echo "orphan stock lines (null warehouse ids, qty>0): $ORPHANS"
if [ "$ORPHANS" != "0" ]; then
  echo "--- orphan detail (id, resource_id, quantity, status, created_at) ---"
  $PSQL -c "select id, resource_id, quantity, status, created_at from public.inventory_items
             where warehouse_id is null and temporary_warehouse_id is null
               and coalesce(quantity,0) > 0 order by id;"
  echo "--- movements referencing orphan lines ---"
  $PSQL -c "select sm.id, sm.movement_type, sm.quantity, sm.created_at
              from public.stock_movements sm
              join public.inventory_items ii on ii.id = sm.inventory_item_id
             where ii.warehouse_id is null and ii.temporary_warehouse_id is null;"
  echo "RESULT: FAIL — review the rows above BEFORE applying V178 on this database."
  exit 1
fi
echo "RESULT: PASS — no orphan stock; V178's unscoped repair has nothing unexpected to touch."
