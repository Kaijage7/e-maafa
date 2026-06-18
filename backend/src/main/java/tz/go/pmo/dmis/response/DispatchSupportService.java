package tz.go.pmo.dmis.response;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tz.go.pmo.dmis.common.error.BusinessRuleException;

/**
 * Port of App\Services\DispatchSourceService + the stock arithmetic from
 * DispatchApprovalService — everything the dispatch console needs to answer
 * "where can this resource come from, and is there enough of it there?".
 *
 * The live stock ledger is {@code inventory_items} (post-2026-04 backfill);
 * {@code warehouse_stocks} is legacy and never consulted. A zonal-warehouse
 * row has warehouse_id set, a temporary-warehouse row has temporary_warehouse_id
 * set, and warehouse_type ('zonal'/'temporary') disambiguates legacy rows.
 *
 * Source bug fixed here: the source compared lowercase request values
 * ('warehouse') against capitalised model constants ('Warehouse'), so approving
 * a dispatch never actually deducted stock. This port normalizes the source
 * type at the boundary so deduction always runs.
 */
@Service
public class DispatchSupportService {

    /** Dispatch source types that need a source-manager approval before stock moves. */
    static final List<String> APPROVAL_REQUIRED_SOURCES = List.of("warehouse", "temporary_warehouse");

    /** Warehouse operational statuses (lowercased) that may serve as dispatch sources. */
    private static final List<String> WAREHOUSE_AVAILABLE_STATUSES = List.of("operational", "full", "standby");
    private static final List<String> TEMP_WAREHOUSE_AVAILABLE_STATUSES = List.of("active");

    private final JdbcTemplate jdbc;

    public DispatchSupportService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ─── Source discovery ───

    /**
     * Every place a resource can be fulfilled from, sorted nearest-first:
     * zonal warehouses and temporary warehouses with stock, agency-held stock,
     * plus the three always-available channels (request agency, publish to
     * stakeholders, procurement). Local sessions act as Super Admin, so the
     * source's level-based visibility filtering resolves to "see everything".
     */
    public List<Map<String, Object>> availableSources(long resourceId, long incidentId) {
        Map<String, Object> incident = jdbc.queryForMap(
                "select latitude, longitude from public.incidents where id = ?", incidentId);
        Double incLat = numOrNull(incident.get("latitude"));
        Double incLng = numOrNull(incident.get("longitude"));

        List<Map<String, Object>> sources = new ArrayList<>();

        // Zonal warehouses holding stock for this resource
        for (Map<String, Object> row : jdbc.queryForList("""
                select w.id, w.name, w.zone, coalesce(w.city_or_region, w.location_address) as location_name,
                       w.latitude, w.longitude, sum(ii.quantity) as available
                from public.inventory_items ii
                join public.warehouses w on w.id = ii.warehouse_id
                where ii.resource_id = ? and ii.quantity > 0 and ii.temporary_warehouse_id is null
                  and (ii.warehouse_type is null or ii.warehouse_type <> 'temporary')
                  and lower(w.operational_status) = any (?)
                group by w.id
                """, resourceId, WAREHOUSE_AVAILABLE_STATUSES.toArray(new String[0]))) {
            sources.add(source("warehouse", row.get("id"), row.get("name"), row.get("location_name"),
                    str(row.get("zone"), "Unknown Zone"), row.get("available"), "Zonal Warehouse",
                    true, distanceKm(incLat, incLng, row.get("latitude"), row.get("longitude"))));
        }

        // Temporary warehouses (district/regional/national stores stood up for an operation)
        for (Map<String, Object> row : jdbc.queryForList("""
                select tw.id, tw.name, tw.level, tw.location_description as location_name,
                       tw.latitude, tw.longitude, sum(ii.quantity) as available
                from public.inventory_items ii
                join public.temporary_warehouses tw on tw.id = ii.temporary_warehouse_id
                where ii.resource_id = ? and ii.quantity > 0
                  and lower(tw.operational_status) = any (?) and tw.is_active = true
                group by tw.id
                """, resourceId, TEMP_WAREHOUSE_AVAILABLE_STATUSES.toArray(new String[0]))) {
            sources.add(source("temporary_warehouse", row.get("id"), row.get("name"), row.get("location_name"),
                    str(row.get("level"), "district"), row.get("available"), "Temporary Warehouse",
                    true, distanceKm(incLat, incLng, row.get("latitude"), row.get("longitude"))));
        }

        // Agency-held stock dispatched directly (no warehouse-manager gate)
        for (Map<String, Object> row : jdbc.queryForList("""
                select ar.id, a.name, ar.location_description as location_name, ar.condition_status,
                       ar.latitude, ar.longitude, ar.quantity as available
                from public.agency_resources ar
                join public.agencies a on a.id = ar.agency_id
                where ar.resource_id = ? and ar.quantity > 0
                """, resourceId)) {
            sources.add(source("agency", row.get("id"), row.get("name"), row.get("location_name"),
                    "Agency Stock", row.get("available"), "Agency Resource",
                    false, distanceKm(incLat, incLng, row.get("latitude"), row.get("longitude"))));
        }

        // Nearest first; channels without coordinates sink to the bottom
        sources.sort(Comparator.comparingDouble(s ->
                s.get("distance_km") == null ? Double.MAX_VALUE : ((Number) s.get("distance_km")).doubleValue()));

        // Always-available channels (the source appends these after the stocked ones)
        sources.add(source("request_agency", 0, "Request from Agency", null, "national",
                null, "Agency Request (national)", false, null));
        sources.add(source("publish_stakeholders", 0, "Publish to Stakeholders", null, null,
                null, "Stakeholder Bidding", false, null));
        sources.add(source("procurement", 0, "External Procurement", null, null,
                null, "Procurement", false, null));
        return sources;
    }

    private static Map<String, Object> source(String type, Object id, Object name, Object location,
                                              String level, Object available, String label,
                                              boolean requiresApproval, Double distanceKm) {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("source_type", type);
        s.put("source_id", id);
        s.put("source_name", name);
        s.put("location_name", location);
        s.put("level", level);
        s.put("available_quantity", available == null ? null : ((Number) available).doubleValue());
        s.put("source_type_label", label);
        s.put("requires_approval", requiresApproval);
        s.put("distance_km", distanceKm == null ? null : Math.round(distanceKm * 10.0) / 10.0);
        return s;
    }

    // ─── Stock arithmetic on the inventory_items ledger ───

    /** Total quantity a source currently holds for a resource. */
    public double availableQuantity(String sourceType, long sourceId, long resourceId) {
        return switch (sourceType) {
            case "warehouse" -> sum("""
                    select coalesce(sum(quantity),0) from public.inventory_items
                    where resource_id = ? and warehouse_id = ? and temporary_warehouse_id is null
                      and (warehouse_type is null or warehouse_type <> 'temporary')
                    """, resourceId, sourceId);
            case "temporary_warehouse" -> sum("""
                    select coalesce(sum(quantity),0) from public.inventory_items
                    where resource_id = ? and temporary_warehouse_id = ?
                    """, resourceId, sourceId);
            case "agency" -> sum("""
                    select coalesce(sum(quantity),0) from public.agency_resources
                    where resource_id = ? and id = ?
                    """, resourceId, sourceId);
            default -> 0;
        };
    }

    /**
     * FIFO deduction: oldest ledger rows drain first, under row locks so two
     * approvers cannot double-spend the same batch. Caller must be in a transaction.
     */
    public void deductStock(String sourceType, long sourceId, long resourceId, double quantity) {
        if ("agency".equals(sourceType)) {
            int updated = jdbc.update("""
                    update public.agency_resources set quantity = quantity - ?, updated_at = now()
                    where id = ? and resource_id = ? and quantity >= ?
                    """, quantity, sourceId, resourceId, quantity);
            if (updated == 0) {
                throw new BusinessRuleException("Insufficient stock at the selected agency.");
            }
            return;
        }
        String locationFilter = "warehouse".equals(sourceType)
                ? "warehouse_id = ? and temporary_warehouse_id is null and (warehouse_type is null or warehouse_type <> 'temporary')"
                : "temporary_warehouse_id = ?";
        List<Map<String, Object>> batches = jdbc.queryForList("""
                select id, quantity from public.inventory_items
                where resource_id = ? and quantity > 0 and %s
                order by id for update
                """.formatted(locationFilter), resourceId, sourceId);
        double remaining = quantity;
        for (Map<String, Object> batch : batches) {
            if (remaining <= 0) {
                break;
            }
            double available = ((Number) batch.get("quantity")).doubleValue();
            double deduct = Math.min(available, remaining);
            jdbc.update("update public.inventory_items set quantity = ?, updated_at = now() where id = ?",
                    (int) Math.max(0, Math.round(available - deduct)), batch.get("id"));
            remaining -= deduct;
        }
        if (remaining > 0) {
            throw new BusinessRuleException("Insufficient stock available in "
                    + ("warehouse".equals(sourceType) ? "warehouse" : "temporary warehouse") + ".");
        }
    }

    /** Intake: top up an existing batch for the resource at the destination, or open a new one. */
    public void addStock(String warehouseType, long warehouseId, long resourceId, double quantity,
                         String itemName, Long userId) {
        String locationFilter = "zonal".equals(warehouseType)
                ? "warehouse_id = ? and temporary_warehouse_id is null" : "temporary_warehouse_id = ?";
        List<Map<String, Object>> rows = jdbc.queryForList("""
                select id from public.inventory_items where resource_id = ? and %s
                order by id desc limit 1
                """.formatted(locationFilter), resourceId, warehouseId);
        if (!rows.isEmpty()) {
            jdbc.update("update public.inventory_items set quantity = quantity + ?, updated_at = now() where id = ?",
                    (int) quantity, rows.get(0).get("id"));
            return;
        }
        jdbc.update("""
                insert into public.inventory_items(resource_id, warehouse_id, temporary_warehouse_id, warehouse_type,
                    item_name, quantity, status, received_date, created_at, updated_at)
                values (?,?,?,?,?,?,'Good Condition', current_date, now(), now())
                """, resourceId, "zonal".equals(warehouseType) ? warehouseId : null,
                "temporary".equals(warehouseType) ? warehouseId : null, warehouseType,
                itemName, (int) quantity);
    }

    // ─── helpers ───

    private double sum(String sql, Object... args) {
        Double v = jdbc.queryForObject(sql, Double.class, args);
        return v == null ? 0 : v;
    }

    /** Haversine distance, as in the source's calculateDistance(). */
    static Double distanceKm(Double lat1, Double lon1, Object lat2raw, Object lon2raw) {
        Double lat2 = numOrNull(lat2raw);
        Double lon2 = numOrNull(lon2raw);
        if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) {
            return null;
        }
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    private static Double numOrNull(Object v) {
        return v instanceof Number n ? n.doubleValue() : null;
    }

    private static String str(Object v, String fallback) {
        return v == null ? fallback : String.valueOf(v);
    }
}
