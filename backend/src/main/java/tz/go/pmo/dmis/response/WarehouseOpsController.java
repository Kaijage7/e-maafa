package tz.go.pmo.dmis.response;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import tz.go.pmo.dmis.common.security.Authz;

/**
 * Warehouse operations on the inventory_items ledger — the stocking, restocking
 * and dispatch-support flows the user called out: intake, removal (with the
 * source's verbatim reason list), inter-warehouse transfer, the movements
 * journal, and periodic stock-taking with automatic adjustments.
 *
 * Port of Admin\WarehouseController::stock/addStock/removeStock +
 * Admin\InventoryItemController::stockTaking/processStockTaking, consolidated
 * by the dedup decisions: inventory_items is the single ledger
 * (zonal + temporary warehouses via warehouse_type) and stock_movements is the
 * single journal (the source's parallel inventory_transactions writes are folded
 * into it).
 */
@RestController
@RequestMapping("/v1/response/warehouse-ops")
public class WarehouseOpsController {

    /** Verbatim removal reason map from WarehouseController::removeStock. */
    private static final Map<String, String> REMOVAL_REASONS = new LinkedHashMap<>();
    static {
        REMOVAL_REASONS.put("dispatch_to_incident", "Dispatched to Incident");
        REMOVAL_REASONS.put("dispatch_to_partner", "Dispatched to Partner Organization");
        REMOVAL_REASONS.put("transfer_to_zonal", "Transferred to Another Zonal Warehouse");
        REMOVAL_REASONS.put("transfer_to_temporary", "Transferred to Temporary Warehouse");
        REMOVAL_REASONS.put("damaged", "Damaged/Expired");
        REMOVAL_REASONS.put("used_for_training", "Used for Training");
        REMOVAL_REASONS.put("inventory_adjustment", "Inventory Adjustment");
        REMOVAL_REASONS.put("other", "Other");
    }

    private final JdbcTemplate jdbc;
    private final DispatchSupportService stock;
    private final IncidentWorkflowService users;

    public WarehouseOpsController(JdbcTemplate jdbc, DispatchSupportService stock, IncidentWorkflowService users) {
        this.jdbc = jdbc;
        this.stock = stock;
        this.users = users;
    }

    // ─── Stock dashboard ───

    /** Per-warehouse stock totals + the alert strips (low / expired / expiring ≤30 days). */
    @GetMapping
    public Map<String, Object> index() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("warehouses", jdbc.queryForList("""
                select w.id, w.name, w.zone, coalesce(w.city_or_region, w.location_address) as location,
                       w.operational_status, count(ii.id) as line_items, coalesce(sum(ii.quantity),0) as total_quantity
                from public.warehouses w
                left join public.inventory_items ii on ii.warehouse_id = w.id and ii.temporary_warehouse_id is null
                group by w.id order by w.name
                """));
        out.put("temporary_warehouses", jdbc.queryForList("""
                select tw.id, tw.name, tw.level, tw.location_description as location, tw.operational_status,
                       count(ii.id) as line_items, coalesce(sum(ii.quantity),0) as total_quantity
                from public.temporary_warehouses tw
                left join public.inventory_items ii on ii.temporary_warehouse_id = tw.id
                where tw.is_active = true
                group by tw.id order by tw.level, tw.name
                """));
        out.put("alerts", Map.of(
                "low_stock", jdbc.queryForList("""
                        select ii.id, ii.item_name, ii.quantity, ii.minimum_threshold, r.name as resource_name,
                               coalesce(w.name, tw.name) as warehouse_name
                        from public.inventory_items ii
                        join public.resources r on r.id = ii.resource_id
                        left join public.warehouses w on w.id = ii.warehouse_id
                        left join public.temporary_warehouses tw on tw.id = ii.temporary_warehouse_id
                        where ii.minimum_threshold > 0 and ii.quantity <= ii.minimum_threshold
                        order by ii.quantity limit 25
                        """),
                "expired", countItems("ii.expiry_date is not null and ii.expiry_date < current_date"),
                "expiring_soon", countItems(
                        "ii.expiry_date is not null and ii.expiry_date >= current_date and ii.expiry_date <= current_date + 30")));
        out.put("removal_reasons", REMOVAL_REASONS);
        out.put("resources", jdbc.queryForList(
                "select id, name, category, unit_of_measure from public.resources order by name"));
        // Open incidents so any warehouse operation can optionally be linked to the emergency it supports.
        out.put("incidents", jdbc.queryForList(
                "select id, title, status from public.incidents order by created_at desc limit 60"));
        out.put("recent_movements", movementsQuery("", 10));
        return out;
    }

    /** Ledger lines for one store (the warehouse stock sheet). */
    @GetMapping("/stock")
    public Map<String, Object> stockFor(@RequestParam String warehouse_type, @RequestParam long warehouse_id) {
        // Reject unknown warehouse_type instead of silently treating it as temporary.
        warehouseType(warehouse_type);
        String filter = "zonal".equals(warehouse_type)
                ? "ii.warehouse_id = ? and ii.temporary_warehouse_id is null" : "ii.temporary_warehouse_id = ?";
        return Map.of("items", jdbc.queryForList("""
                select ii.*, r.name as resource_name, r.category as resource_category
                from public.inventory_items ii
                join public.resources r on r.id = ii.resource_id
                where %s order by r.name, ii.id
                """.formatted(filter), warehouse_id));
    }

    // ─── Intake / removal / transfer ───

    /** Stock intake (new batch or restock), journalled as an 'Intake' movement. */
    @PostMapping("/intake")
    @PreAuthorize(Authz.RESPONSE_OPERATE)
    @Transactional
    public Map<String, Object> intake(@RequestBody Map<String, Object> body) {
        String warehouseType = warehouseType(body.get("warehouse_type"));
        long warehouseId = lng(body.get("warehouse_id"), "warehouse_id");
        long resourceId = lng(body.get("resource_id"), "resource_id");
        int quantity = positiveInt(body.get("quantity"));
        requireStore(warehouseType, warehouseId);

        String resourceName = jdbc.queryForObject("select name from public.resources where id = ?", String.class, resourceId);
        // A dated/batched intake always opens its own ledger row so expiry tracking stays per-batch
        jdbc.update("""
                insert into public.inventory_items(resource_id, warehouse_id, temporary_warehouse_id, warehouse_type,
                    item_name, category, quantity, minimum_threshold, batch_number, expiry_date, status,
                    supplier_donor, received_date, notes, created_at, updated_at)
                values (?,?,?,?,?,?,?,?,?,?::date,?,?,coalesce(?::date, current_date),?,now(),now())
                """, resourceId,
                "zonal".equals(warehouseType) ? warehouseId : null,
                "temporary".equals(warehouseType) ? warehouseId : null,
                warehouseType,
                str(body.get("item_name")) != null ? str(body.get("item_name")) : resourceName,
                str(body.get("category")), quantity,
                body.get("minimum_threshold") == null ? 0 : positiveOrZeroInt(body.get("minimum_threshold")),
                str(body.get("batch_number")), str(body.get("expiry_date")),
                str(body.get("status")) != null ? str(body.get("status")) : "Good Condition",
                str(body.get("supplier_donor")), str(body.get("received_date")), str(body.get("notes")));

        Long userId = users.actingUserId();
        jdbc.update("""
                insert into public.stock_movements(resource_id, quantity, movement_type, to_warehouse_id,
                    to_temporary_warehouse_id, warehouse_type, batch_number, expiry_date, supplier, notes,
                    incident_id, status, user_id, completed_at, completed_by, created_at, updated_at)
                values (?,?,'Intake',?,?,?,?,?::date,?,?,?, 'Completed', ?, now(), ?, now(), now())
                """, resourceId, quantity,
                "zonal".equals(warehouseType) ? warehouseId : null,
                "temporary".equals(warehouseType) ? warehouseId : null,
                warehouseType, str(body.get("batch_number")), str(body.get("expiry_date")),
                str(body.get("supplier_donor")), str(body.get("notes")), incidentId(body), userId, userId);
        if (incidentId(body) != null) {
            notifyRole("EOCC", "warehouse_receipt", "Supplies received for an incident",
                    resourceName + " ×" + quantity + " received into " + storeName(warehouseType, warehouseId)
                            + " for an active incident.");
        }
        return Map.of("success", true, "message", "Stock added successfully.");
    }

    /** Stock removal with the source's reason list; FIFO across the store's batches. */
    @PostMapping("/remove")
    @PreAuthorize(Authz.RESPONSE_OPERATE)
    @Transactional
    public Map<String, Object> remove(@RequestBody Map<String, Object> body) {
        String warehouseType = warehouseType(body.get("warehouse_type"));
        long warehouseId = lng(body.get("warehouse_id"), "warehouse_id");
        long resourceId = lng(body.get("resource_id"), "resource_id");
        int quantity = positiveInt(body.get("quantity"));
        String reason = str(body.get("reason"));
        if (reason == null || !REMOVAL_REASONS.containsKey(reason)) {
            throw new BusinessRuleException("The selected removal reason is invalid.");
        }
        stock.deductStock("zonal".equals(warehouseType) ? "warehouse" : "temporary_warehouse",
                warehouseId, resourceId, quantity);
        Long userId = users.actingUserId();
        jdbc.update("""
                insert into public.stock_movements(resource_id, quantity, movement_type, from_warehouse_id,
                    from_temporary_warehouse_id, warehouse_type, reason, notes, incident_id, status, user_id,
                    completed_at, completed_by, created_at, updated_at)
                values (?,?,'Removal',?,?,?,?,?,?, 'Completed', ?, now(), ?, now(), now())
                """, resourceId, quantity,
                "zonal".equals(warehouseType) ? warehouseId : null,
                "temporary".equals(warehouseType) ? warehouseId : null,
                warehouseType, reason,
                REMOVAL_REASONS.get(reason) + (str(body.get("notes")) == null ? "" : " — " + str(body.get("notes"))),
                incidentId(body), userId, userId);
        return Map.of("success", true, "message", "Stock removed: " + REMOVAL_REASONS.get(reason) + ".");
    }

    /** Transfer between stores: deduct at origin, intake at destination, one 'Transfer' journal row. */
    @PostMapping("/transfer")
    @PreAuthorize(Authz.RESPONSE_OPERATE)
    @Transactional
    public Map<String, Object> transfer(@RequestBody Map<String, Object> body) {
        String fromType = warehouseType(body.get("from_type"));
        String toType = warehouseType(body.get("to_type"));
        long fromId = lng(body.get("from_id"), "from_id");
        long toId = lng(body.get("to_id"), "to_id");
        long resourceId = lng(body.get("resource_id"), "resource_id");
        int quantity = positiveInt(body.get("quantity"));
        if (fromType.equals(toType) && fromId == toId) {
            throw new BusinessRuleException("Source and destination must differ.");
        }
        requireStore(toType, toId);
        stock.deductStock("zonal".equals(fromType) ? "warehouse" : "temporary_warehouse", fromId, resourceId, quantity);
        String resourceName = jdbc.queryForObject("select name from public.resources where id = ?", String.class, resourceId);
        stock.addStock(toType, toId, resourceId, quantity, resourceName, users.actingUserId());
        Long userId = users.actingUserId();
        jdbc.update("""
                insert into public.stock_movements(resource_id, quantity, movement_type, from_warehouse_id,
                    from_temporary_warehouse_id, to_warehouse_id, to_temporary_warehouse_id, notes, incident_id,
                    status, user_id, completed_at, completed_by, created_at, updated_at)
                values (?,?,'Transfer',?,?,?,?,?,?, 'Completed', ?, now(), ?, now(), now())
                """, resourceId, quantity,
                "zonal".equals(fromType) ? fromId : null, "temporary".equals(fromType) ? fromId : null,
                "zonal".equals(toType) ? toId : null, "temporary".equals(toType) ? toId : null,
                str(body.get("notes")), incidentId(body), userId, userId);
        return Map.of("success", true, "message", "Stock transferred successfully.");
    }

    // ─── Movements journal ───

    @GetMapping("/movements")
    public Map<String, Object> movements(@RequestParam(required = false) String movement_type,
                                         @RequestParam(required = false) Long resource_id) {
        StringBuilder where = new StringBuilder();
        List<Object> params = new ArrayList<>();
        if (movement_type != null && !movement_type.isBlank()) {
            where.append(" and sm.movement_type = ?");
            params.add(movement_type);
        }
        if (resource_id != null) {
            where.append(" and sm.resource_id = ?");
            params.add(resource_id);
        }
        return Map.of("movements", movementsQuery(where.toString(), 200, params.toArray()));
    }

    private List<Map<String, Object>> movementsQuery(String extraWhere, int limit, Object... params) {
        return jdbc.queryForList("""
                select sm.*, r.name as resource_name, u.name as user_name,
                       fw.name as from_warehouse_name, twh.name as to_warehouse_name,
                       ftw.name as from_temp_warehouse_name, ttw.name as to_temp_warehouse_name,
                       inc.title as incident_title
                from public.stock_movements sm
                join public.resources r on r.id = sm.resource_id
                left join public.users u on u.id = sm.user_id
                left join public.warehouses fw on fw.id = sm.from_warehouse_id
                left join public.warehouses twh on twh.id = sm.to_warehouse_id
                left join public.temporary_warehouses ftw on ftw.id = sm.from_temporary_warehouse_id
                left join public.temporary_warehouses ttw on ttw.id = sm.to_temporary_warehouse_id
                left join public.incidents inc on inc.id = sm.incident_id
                where 1=1%s
                order by sm.created_at desc limit %d
                """.formatted(extraWhere, limit), params);
    }

    // ─── Stock taking ───

    /** Count sheet for a zonal warehouse (the source limits stock-taking to zonal stores). */
    @GetMapping("/stock-taking")
    public Map<String, Object> stockTakingSheet(@RequestParam long warehouse_id) {
        return Map.of(
                "items", jdbc.queryForList("""
                        select ii.id, ii.item_name, ii.quantity, ii.batch_number, ii.expiry_date, ii.status,
                               r.name as resource_name
                        from public.inventory_items ii
                        join public.resources r on r.id = ii.resource_id
                        where ii.warehouse_id = ? and ii.temporary_warehouse_id is null
                        order by r.name, ii.id
                        """, warehouse_id),
                "history", jdbc.queryForList("""
                        select str.*, u.name as verified_by_name from public.stock_taking_records str
                        left join public.users u on u.id = str.verified_by
                        where str.warehouse_id = ? order by str.created_at desc limit 50
                        """, warehouse_id));
    }

    /**
     * Process a physical count: write a record per line; where counted differs from
     * book quantity, post an adjustment movement and correct the ledger row.
     */
    @PostMapping("/stock-taking")
    @PreAuthorize(Authz.RESPONSE_OPERATE)
    @Transactional
    public Map<String, Object> processStockTaking(@RequestBody Map<String, Object> body) {
        long warehouseId = lng(body.get("warehouse_id"), "warehouse_id");
        if (!(body.get("items") instanceof List<?> items) || items.isEmpty()) {
            throw new BusinessRuleException("At least one counted item is required.");
        }
        Long userId = users.actingUserId();
        int adjustments = 0;
        for (Object raw : items) {
            @SuppressWarnings("unchecked")
            Map<String, Object> item = (Map<String, Object>) raw;
            long itemId = lng(item.get("inventory_item_id"), "inventory_item_id");
            int counted = positiveOrZeroInt(item.get("quantity_counted"));
            String condition = str(item.get("condition"));
            if (condition == null || !List.of("good", "damaged", "expired").contains(condition)) {
                throw new BusinessRuleException("Condition must be good, damaged or expired.");
            }
            List<Map<String, Object>> rows = jdbc.queryForList(
                    "select quantity, resource_id from public.inventory_items where id = ? for update", itemId);
            if (rows.isEmpty()) {
                throw new ResourceNotFoundException("Inventory item " + itemId + " not found.");
            }
            int onRecord = ((Number) rows.get(0).get("quantity")).intValue();
            long resourceId = ((Number) rows.get(0).get("resource_id")).longValue();
            int difference = counted - onRecord;

            jdbc.update("""
                    insert into public.stock_taking_records(warehouse_id, stock_taking_date, inventory_item_id,
                        item_code, unit_of_measure, quantity_on_record, quantity_counted, difference, condition,
                        remarks, verified_by, created_at, updated_at)
                    values (?, current_date, ?, ?, 'Units', ?, ?, ?, ?, ?, ?, now(), now())
                    """, warehouseId, itemId, String.valueOf(itemId), onRecord, counted, difference,
                    condition, str(item.get("remarks")), userId);

            if (difference != 0) {
                jdbc.update("""
                        insert into public.stock_movements(resource_id, inventory_item_id, quantity, movement_type,
                            %s, warehouse_type, reason, notes, status, user_id, completed_at, completed_by,
                            created_at, updated_at)
                        values (?,?,?,?,?, 'zonal', 'stock_taking', ?, 'Completed', ?, now(), ?, now(), now())
                        """.formatted(difference > 0 ? "to_warehouse_id" : "from_warehouse_id"),
                        resourceId, itemId, Math.abs(difference),
                        difference > 0 ? "Adjustment_Increase" : "Adjustment_Decrease",
                        warehouseId, "Stock taking adjustment" + (str(item.get("remarks")) == null ? "" : ": " + str(item.get("remarks"))),
                        userId, userId);
                jdbc.update("update public.inventory_items set quantity = ?, last_audited = now(), updated_at = now() where id = ?",
                        counted, itemId);
                adjustments++;
            }
            if ("expired".equals(condition)) {
                jdbc.update("update public.inventory_items set status = 'Expired', updated_at = now() where id = ?", itemId);
            } else if ("damaged".equals(condition)) {
                jdbc.update("update public.inventory_items set status = 'Damaged', updated_at = now() where id = ?", itemId);
            }
        }
        return Map.of("success", true, "adjustments", adjustments,
                "message", "Stock taking completed successfully. " + adjustments + " adjustment(s) posted.");
    }

    // ─── Capacity statistics ───

    /**
     * Capacity utilisation per warehouse — used space = Σ(quantity × resource footprint) against
     * storage_capacity_sqm — plus space-pressure flags, network roll-up, and a stockout forecast
     * derived from the last 30 days of out-movements (dispatch/removal/borrow velocity).
     */
    @GetMapping("/capacity")
    public Map<String, Object> capacity() {
        List<Map<String, Object>> warehouses = new ArrayList<>();
        for (Map<String, Object> w : jdbc.queryForList("""
                select w.id, w.name, w.zone, coalesce(w.storage_capacity_sqm, 0) as capacity_sqm,
                       count(ii.id) as line_items, coalesce(sum(ii.quantity),0) as total_quantity,
                       round(coalesce(sum(ii.quantity * coalesce(r.footprint_sqm, 0.05)),0),2) as used_sqm
                from public.warehouses w
                left join public.inventory_items ii on ii.warehouse_id = w.id and ii.temporary_warehouse_id is null
                left join public.resources r on r.id = ii.resource_id
                group by w.id order by w.name
                """)) {
            warehouses.add(withUtilisation(w, "zonal"));
        }
        for (Map<String, Object> w : jdbc.queryForList("""
                select tw.id, tw.name, tw.level as zone, 0 as capacity_sqm,
                       count(ii.id) as line_items, coalesce(sum(ii.quantity),0) as total_quantity,
                       round(coalesce(sum(ii.quantity * coalesce(r.footprint_sqm, 0.05)),0),2) as used_sqm
                from public.temporary_warehouses tw
                left join public.inventory_items ii on ii.temporary_warehouse_id = tw.id
                left join public.resources r on r.id = ii.resource_id
                where tw.is_active = true
                group by tw.id order by tw.name
                """)) {
            warehouses.add(withUtilisation(w, "temporary"));
        }

        double totalCap = 0, totalUsed = 0;
        int overPressure = 0;
        for (Map<String, Object> w : warehouses) {
            totalCap += num(w.get("capacity_sqm"));
            totalUsed += num(w.get("used_sqm"));
            if ("high".equals(w.get("space_pressure")) || "full".equals(w.get("space_pressure"))) {
                overPressure++;
            }
        }
        Map<String, Object> network = new LinkedHashMap<>();
        network.put("total_capacity_sqm", Math.round(totalCap * 100) / 100.0);
        network.put("total_used_sqm", Math.round(totalUsed * 100) / 100.0);
        network.put("utilisation_pct", totalCap > 0 ? Math.round(totalUsed / totalCap * 1000) / 10.0 : null);
        network.put("warehouses_under_pressure", overPressure);
        network.put("warehouse_count", warehouses.size());

        // Stockout forecast: per resource, days = on-hand / avg daily out-velocity (last 30 days).
        Map<Long, Double> velocity = new LinkedHashMap<>();
        for (Map<String, Object> v : jdbc.queryForList("""
                select resource_id, round(coalesce(sum(quantity),0) / 30.0, 4) as daily
                from public.stock_movements
                where movement_type in ('Removal','Dispatch','Deduction','Deployment','Borrow')
                  and created_at >= now() - interval '30 days'
                group by resource_id
                """)) {
            velocity.put(((Number) v.get("resource_id")).longValue(), num(v.get("daily")));
        }
        List<Map<String, Object>> forecast = new ArrayList<>();
        for (Map<String, Object> r : jdbc.queryForList("""
                select r.id, r.name, coalesce(sum(ii.quantity),0) as on_hand
                from public.resources r
                join public.inventory_items ii on ii.resource_id = r.id
                group by r.id having coalesce(sum(ii.quantity),0) > 0 order by r.name
                """)) {
            long rid = ((Number) r.get("id")).longValue();
            double daily = velocity.getOrDefault(rid, 0.0);
            if (daily <= 0) { continue; }                       // no recent consumption → not forecastable
            double onHand = num(r.get("on_hand"));
            Map<String, Object> f = new LinkedHashMap<>();
            f.put("resource_id", rid);
            f.put("resource_name", r.get("name"));
            f.put("on_hand", (long) onHand);
            f.put("daily_velocity", Math.round(daily * 100) / 100.0);
            f.put("days_to_stockout", (int) Math.floor(onHand / daily));
            forecast.add(f);
        }
        forecast.sort((a, b) -> Integer.compare((int) a.get("days_to_stockout"), (int) b.get("days_to_stockout")));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("warehouses", warehouses);
        out.put("network", network);
        out.put("stockout_forecast", forecast);
        return out;
    }

    private Map<String, Object> withUtilisation(Map<String, Object> w, String type) {
        Map<String, Object> row = new LinkedHashMap<>(w);
        row.put("type", type);
        double cap = num(w.get("capacity_sqm"));
        double used = num(w.get("used_sqm"));
        Double pct = cap > 0 ? Math.round(used / cap * 1000) / 10.0 : null;
        row.put("utilisation_pct", pct);
        row.put("space_pressure", pct == null ? "unknown" : pct >= 90 ? "full" : pct >= 70 ? "high" : "ok");
        return row;
    }

    // ─── Borrowing (inter-warehouse loans) ───

    /** Borrow stock from a lender store to a borrower store: moves stock + records an outstanding loan. */
    @PostMapping("/borrow")
    @PreAuthorize(Authz.RESPONSE_OPERATE)
    @Transactional
    public Map<String, Object> borrow(@RequestBody Map<String, Object> body) {
        String fromType = warehouseType(body.get("from_type"));
        String toType = warehouseType(body.get("to_type"));
        long fromId = lng(body.get("from_id"), "from_id");
        long toId = lng(body.get("to_id"), "to_id");
        long resourceId = lng(body.get("resource_id"), "resource_id");
        int quantity = positiveInt(body.get("quantity"));
        if (fromType.equals(toType) && fromId == toId) {
            throw new BusinessRuleException("Lender and borrower stores must differ.");
        }
        requireStore(fromType, fromId);
        requireStore(toType, toId);
        String dueDate = str(body.get("due_date"));
        stock.deductStock("zonal".equals(fromType) ? "warehouse" : "temporary_warehouse", fromId, resourceId, quantity);
        String resourceName = jdbc.queryForObject("select name from public.resources where id = ?", String.class, resourceId);
        stock.addStock(toType, toId, resourceId, quantity, resourceName, users.actingUserId());
        Long userId = users.actingUserId();
        jdbc.update("""
                insert into public.warehouse_loans(resource_id, quantity, from_warehouse_id, from_temporary_warehouse_id,
                    to_warehouse_id, to_temporary_warehouse_id, borrowed_at, due_date, status, notes, created_by,
                    created_at, updated_at)
                values (?,?,?,?,?,?, current_date, ?::date, 'Outstanding', ?, ?, now(), now())
                """, resourceId, quantity,
                "zonal".equals(fromType) ? fromId : null, "temporary".equals(fromType) ? fromId : null,
                "zonal".equals(toType) ? toId : null, "temporary".equals(toType) ? toId : null,
                dueDate, str(body.get("notes")), userId);
        jdbc.update("""
                insert into public.stock_movements(resource_id, quantity, movement_type, from_warehouse_id,
                    from_temporary_warehouse_id, to_warehouse_id, to_temporary_warehouse_id, notes, incident_id,
                    status, user_id, completed_at, completed_by, created_at, updated_at)
                values (?,?,'Borrow',?,?,?,?,?,?, 'Completed', ?, now(), ?, now(), now())
                """, resourceId, quantity,
                "zonal".equals(fromType) ? fromId : null, "temporary".equals(fromType) ? fromId : null,
                "zonal".equals(toType) ? toId : null, "temporary".equals(toType) ? toId : null,
                "Borrowed" + (dueDate == null ? "" : ", due " + dueDate)
                        + (str(body.get("notes")) == null ? "" : " — " + str(body.get("notes"))),
                incidentId(body), userId, userId);
        notifyRole("EOCC", "warehouse_borrow", "Stock lent between stores",
                resourceName + " ×" + quantity + " lent from " + storeName(fromType, fromId)
                        + " to " + storeName(toType, toId) + (dueDate == null ? "" : ", due " + dueDate) + ".");
        return Map.of("success", true, "message", "Stock borrowed; loan recorded as outstanding.");
    }

    /** Outstanding / historical loans, with derived overdue flag and remaining quantity. */
    @GetMapping("/loans")
    public Map<String, Object> loans(@RequestParam(required = false) String status) {
        String where = "outstanding".equalsIgnoreCase(status)
                ? " where wl.status in ('Outstanding','Partially_Returned')" : "";
        return Map.of("loans", jdbc.queryForList("""
                select wl.*, r.name as resource_name,
                       coalesce(fw.name, ftw.name) as lender_name,
                       coalesce(tw.name, ttw.name) as borrower_name,
                       (wl.quantity - wl.returned_quantity) as outstanding_quantity,
                       (wl.status in ('Outstanding','Partially_Returned') and wl.due_date is not null
                            and wl.due_date < current_date) as overdue
                from public.warehouse_loans wl
                join public.resources r on r.id = wl.resource_id
                left join public.warehouses fw on fw.id = wl.from_warehouse_id
                left join public.temporary_warehouses ftw on ftw.id = wl.from_temporary_warehouse_id
                left join public.warehouses tw on tw.id = wl.to_warehouse_id
                left join public.temporary_warehouses ttw on ttw.id = wl.to_temporary_warehouse_id
                %s
                order by (wl.status = 'Returned'), wl.due_date nulls last, wl.created_at desc
                """.formatted(where)));
    }

    /** Record a (full or partial) return of a loan: moves stock back to the lender, closes the loan. */
    @PostMapping("/loans/{id}/return")
    @PreAuthorize(Authz.RESPONSE_OPERATE)
    @Transactional
    public Map<String, Object> returnLoan(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select * from public.warehouse_loans where id = ? for update", id);
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Loan " + id + " not found.");
        }
        Map<String, Object> loan = rows.get(0);
        if ("Returned".equals(loan.get("status"))) {
            throw new BusinessRuleException("This loan has already been fully returned.");
        }
        int loanQty = ((Number) loan.get("quantity")).intValue();
        int alreadyReturned = ((Number) loan.get("returned_quantity")).intValue();
        int outstanding = loanQty - alreadyReturned;
        int returnQty = b.get("quantity") == null ? outstanding : positiveInt(b.get("quantity"));
        if (returnQty > outstanding) {
            throw new BusinessRuleException("Return quantity exceeds the outstanding " + outstanding + ".");
        }
        long resourceId = ((Number) loan.get("resource_id")).longValue();
        boolean borrowerIsZonal = loan.get("to_warehouse_id") != null;
        long borrowerId = ((Number) (borrowerIsZonal ? loan.get("to_warehouse_id") : loan.get("to_temporary_warehouse_id"))).longValue();
        boolean lenderIsZonal = loan.get("from_warehouse_id") != null;
        long lenderId = ((Number) (lenderIsZonal ? loan.get("from_warehouse_id") : loan.get("from_temporary_warehouse_id"))).longValue();

        stock.deductStock(borrowerIsZonal ? "warehouse" : "temporary_warehouse", borrowerId, resourceId, returnQty);
        String resourceName = jdbc.queryForObject("select name from public.resources where id = ?", String.class, resourceId);
        stock.addStock(lenderIsZonal ? "zonal" : "temporary", lenderId, resourceId, returnQty, resourceName, users.actingUserId());

        int newReturned = alreadyReturned + returnQty;
        String newStatus = newReturned >= loanQty ? "Returned" : "Partially_Returned";
        jdbc.update("""
                update public.warehouse_loans set returned_quantity = ?, status = ?,
                    returned_at = case when ? >= quantity then current_date else returned_at end, updated_at = now()
                where id = ?
                """, newReturned, newStatus, newReturned, id);
        Long userId = users.actingUserId();
        jdbc.update("""
                insert into public.stock_movements(resource_id, quantity, movement_type, from_warehouse_id,
                    from_temporary_warehouse_id, to_warehouse_id, to_temporary_warehouse_id, notes, status,
                    user_id, completed_at, completed_by, created_at, updated_at)
                values (?,?,'Return',?,?,?,?,?, 'Completed', ?, now(), ?, now(), now())
                """, resourceId, returnQty,
                borrowerIsZonal ? borrowerId : null, borrowerIsZonal ? null : borrowerId,
                lenderIsZonal ? lenderId : null, lenderIsZonal ? null : lenderId,
                "Loan return (" + newStatus.replace('_', ' ').toLowerCase() + ")", userId, userId);
        notifyRole("EOCC", "warehouse_loan_return", "Loan returned",
                resourceName + " ×" + returnQty + " returned to " + storeName(lenderIsZonal ? "zonal" : "temporary", lenderId)
                        + " (" + newStatus.replace('_', ' ').toLowerCase() + ").");
        return Map.of("success", true, "returned", returnQty,
                "message", "Returned " + returnQty + "; loan " + newStatus.replace('_', ' ').toLowerCase() + ".");
    }

    // ─── helpers ───

    private static double num(Object v) {
        return v == null ? 0 : ((Number) v).doubleValue();
    }

    /** Display name of a store for notification/journal text. */
    private String storeName(String type, long id) {
        String table = "zonal".equals(type) ? "public.warehouses" : "public.temporary_warehouses";
        List<String> n = jdbc.queryForList("select name from " + table + " where id = ?", String.class, id);
        return n.isEmpty() ? ("#" + id) : n.get(0);
    }

    /**
     * Raise an in-app notification for every user holding {@code roleName}, reusing the existing
     * resource_notifications channel (shown in the response notifications panel). Warehouse ops have
     * no allocation, so allocated_resource_id is null.
     */
    private void notifyRole(String roleName, String type, String title, String message) {
        jdbc.update("""
                insert into public.resource_notifications(user_id, allocated_resource_id, type, title, message,
                    channel, created_at, updated_at)
                select u.id, null, ?, ?, ?, 'database', now(), now()
                from public.users u
                join public.model_has_roles mhr on mhr.model_id = u.id
                join public.roles r on r.id = mhr.role_id and r.name = ?
                """, type, title, message, roleName);
    }

    private long countItems(String where) {
        Long c = jdbc.queryForObject("select count(*) from public.inventory_items ii where " + where, Long.class);
        return c == null ? 0 : c;
    }

    private void requireStore(String warehouseType, long id) {
        String table = "zonal".equals(warehouseType) ? "public.warehouses" : "public.temporary_warehouses";
        Long c = jdbc.queryForObject("select count(*) from " + table + " where id = ?", Long.class, id);
        if (c == null || c == 0) {
            throw new BusinessRuleException("Selected " + ("zonal".equals(warehouseType) ? "zonal" : "temporary")
                    + " warehouse does not exist.");
        }
    }

    private static String warehouseType(Object v) {
        String t = str(v);
        if (t == null || !List.of("zonal", "temporary").contains(t)) {
            throw new BusinessRuleException("warehouse_type must be 'zonal' or 'temporary'.");
        }
        return t;
    }

    private static int positiveInt(Object v) {
        int q = (int) Double.parseDouble(String.valueOf(v));
        if (q <= 0) {
            throw new BusinessRuleException("Quantity must be greater than zero.");
        }
        return q;
    }

    private static int positiveOrZeroInt(Object v) {
        int q = (int) Double.parseDouble(String.valueOf(v));
        if (q < 0) {
            throw new BusinessRuleException("Quantity cannot be negative.");
        }
        return q;
    }

    private static long lng(Object v, String field) {
        if (v == null) {
            throw new BusinessRuleException("The " + field + " field is required.");
        }
        return (long) Double.parseDouble(String.valueOf(v));
    }

    private static String str(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    /** Extract incident_id (nullable) from the request body — mirrors the longOf(body.get("incident_id"))
     * pattern in ResourceAllocationController. */
    private static Long incidentId(java.util.Map<String, Object> body) {
        Object v = body == null ? null : body.get("incident_id");
        if (v instanceof Number n) return n.longValue();
        String s = str(v);
        try { return s == null ? null : Long.parseLong(s); } catch (Exception e) { return null; }
    }
}
