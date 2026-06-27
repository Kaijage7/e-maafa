-- Policy (user): warehouses/stock are managed at the REGIONAL level, not the district. A district officer
-- (DED / DAS / District DC) should not see the warehouse module — they request resources; the region holds
-- and manages stock. Revoke Warehouse & Stock from the district-tier roles; regional (RAS, Reg DC), EOCC and
-- national keep it. (The module guard /v1/warehouses|/inventory|/response/warehouse-ops needs
-- warehouse_and_stock.view, so removing it hides the module + its menu items for district officers.)
delete from public.role_has_permissions rhp
 using public.permissions p, public.roles r
 where rhp.permission_id = p.id and rhp.role_id = r.id
   and p.module = 'Warehouse & Stock'
   and r.name in ('DED', 'DAS', 'Dist DC');
