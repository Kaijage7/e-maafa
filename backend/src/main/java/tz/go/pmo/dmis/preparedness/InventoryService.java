package tz.go.pmo.dmis.preparedness;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tz.go.pmo.dmis.common.security.JurisdictionScope;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

/**
 * Reads the existing inventory_items (joining resources + warehouses) for the Emergency Supplies index,
 * with low-stock / expiring / expired flags and the four statistics. Also creates new items (writes
 * via JdbcTemplate so the read entity stays immutable).
 */
@Service
@RequiredArgsConstructor
public class InventoryService {

    private static final ZoneId ZONE = ZoneId.of("Africa/Dar_es_Salaam");
    private static final DateTimeFormatter D_MON_Y = DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.ENGLISH);

    private final InventoryItemRepository items;
    private final ResourceRepository resources;
    private final WarehouseRepository warehouses;
    private final JdbcTemplate jdbc;
    private final JurisdictionScope jurisdiction;

    /**
     * Warehouse ids the caller may see — own area + NULL-area national/shared stores. Returns {@code null}
     * for the national / non-area tier, meaning "no restriction" (sees every warehouse). Used to keep the
     * Emergency-Supplies list and the New-Item warehouse dropdown to the officer's own jurisdiction.
     */
    private java.util.Set<Long> visibleWarehouseIds() {
        JurisdictionScope.Tier t = jurisdiction.currentTier();
        if (t != JurisdictionScope.Tier.REGION && t != JurisdictionScope.Tier.DISTRICT) {
            return null;   // national + non-area: full view
        }
        StringBuilder w = new StringBuilder("1=1");
        List<Object> p = new java.util.ArrayList<>();
        jurisdiction.appendWarehouseScope("", w, p);
        return new java.util.HashSet<>(jdbc.queryForList(
                "select id from public.warehouses where " + w, Long.class, p.toArray()));
    }

    @Transactional(readOnly = true)
    public InventoryResponse index() {
        List<Resource> catalogue = resources.findAll();
        Map<Long, String> resourceName = catalogue.stream()
                .collect(Collectors.toMap(Resource::getId, Resource::getName));
        Map<Long, Integer> resourceThreshold = catalogue.stream()
                .filter(r -> r.getLowStockThreshold() != null)
                .collect(Collectors.toMap(Resource::getId, Resource::getLowStockThreshold));
        Map<Long, String> warehouseName = warehouses.findAll().stream()
                .collect(Collectors.toMap(Warehouse::getId, Warehouse::getName));
        LocalDate today = LocalDate.now(ZONE);

        java.util.Set<Long> visibleW = visibleWarehouseIds();
        List<InventoryItem> all = items.findAllByOrderByIdDesc();
        if (visibleW != null) {
            // own-area + national-shared stores; a NULL-warehouse item is the national/unassigned pool (kept)
            all = all.stream()
                    .filter(i -> i.getWarehouseId() == null || visibleW.contains(i.getWarehouseId()))
                    .toList();
        }
        List<InventoryResponse.ItemRow> rows = all.stream()
                .map(i -> toRow(i, resourceName, warehouseName, resourceThreshold, today)).toList();

        long total = all.size();
        long lowStock = all.stream().filter(i -> lowStock(i, resourceThreshold)).count();
        long expiringSoon = all.stream().filter(i -> expiring(i, today)).count();
        long outOfStock = all.stream().filter(i -> qty(i) == 0).count();
        long expired = all.stream().filter(i -> expired(i, today)).count();
        return new InventoryResponse(rows,
                new InventoryResponse.Stats(total, lowStock, expiringSoon, outOfStock, expired));
    }

    /** Resources + warehouses for the New Item form dropdowns. */
    @Transactional(readOnly = true)
    public Map<String, Object> reference() {
        List<Map<String, Object>> res = resources.findAll().stream()
                .sorted((a, b) -> safe(a.getName()).compareToIgnoreCase(safe(b.getName())))
                .map(r -> Map.<String, Object>of("id", r.getId(), "name", safe(r.getName()),
                        "category", safe(r.getCategory())))
                .toList();
        java.util.Set<Long> visibleW = visibleWarehouseIds();
        List<Map<String, Object>> wh = warehouses.findAll().stream()
                .filter(w -> visibleW == null || visibleW.contains(w.getId()))
                .sorted((a, b) -> safe(a.getName()).compareToIgnoreCase(safe(b.getName())))
                .map(w -> Map.<String, Object>of("id", w.getId(), "name", safe(w.getName())))
                .toList();
        return Map.of("resources", res, "warehouses", wh);
    }

    /** Creates a new inventory item (Emergency Supplies → New Item). */
    @Transactional
    public Map<String, Object> create(InventoryWriteRequest req) {
        if (req.resourceId() == null || req.itemName() == null || req.itemName().isBlank()
                || req.warehouseId() == null || req.quantity() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Resource, item name, warehouse and quantity are required");
        }
        if (req.quantity() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Quantity cannot be negative");
        }
        Long id = jdbc.queryForObject(
                "insert into public.inventory_items(resource_id,warehouse_id,item_name,category,quantity,"
                        + "minimum_threshold,batch_number,expiry_date,status,warehouse_type,created_at,updated_at) "
                        + "values (?,?,?,?,?,?,?,?::date,?,'zonal',now(),now()) returning id",
                Long.class,
                req.resourceId(), req.warehouseId(), req.itemName().trim(), blankToNull(req.category()),
                req.quantity(), req.minimumThreshold() == null ? 0 : req.minimumThreshold(),
                blankToNull(req.batchNumber()), blankToNull(req.expiryDate()),
                req.status() == null || req.status().isBlank() ? "Good Condition" : req.status());
        return Map.of("id", id, "message", "Item created");
    }

    /** One inventory item's fields for the edit form. */
    @Transactional(readOnly = true)
    public Map<String, Object> detail(long id) {
        InventoryItem i = items.findById(id).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Inventory item not found"));
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("id", i.getId());
        m.put("resourceId", i.getResourceId());
        m.put("itemName", i.getItemName());
        m.put("category", i.getCategory());
        m.put("warehouseId", i.getWarehouseId());
        m.put("quantity", i.getQuantity());
        m.put("minimumThreshold", i.getMinimumThreshold());
        m.put("batchNumber", i.getBatchNumber());
        m.put("expiryDate", i.getExpiryDate() == null ? null : i.getExpiryDate().toString());
        m.put("status", i.getStatus());
        return m;
    }

    /** Updates an existing inventory item (Emergency Supplies → Edit). */
    @Transactional
    public Map<String, Object> update(long id, InventoryWriteRequest req) {
        if (req.resourceId() == null || req.itemName() == null || req.itemName().isBlank()
                || req.warehouseId() == null || req.quantity() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Resource, item name, warehouse and quantity are required");
        }
        if (req.quantity() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Quantity cannot be negative");
        }
        int n = jdbc.update(
                "update public.inventory_items set resource_id=?, warehouse_id=?, item_name=?, category=?, "
                        + "quantity=?, minimum_threshold=?, batch_number=?, expiry_date=?::date, status=?, updated_at=now() "
                        + "where id=?",
                req.resourceId(), req.warehouseId(), req.itemName().trim(), blankToNull(req.category()),
                req.quantity(), req.minimumThreshold() == null ? 0 : req.minimumThreshold(),
                blankToNull(req.batchNumber()), blankToNull(req.expiryDate()),
                req.status() == null || req.status().isBlank() ? "Good Condition" : req.status(), id);
        if (n == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Inventory item not found");
        }
        return Map.of("id", id, "message", "Item updated");
    }

    private static String safe(String s) {
        return s == null ? "" : s;
    }

    private static String blankToNull(String v) {
        return (v == null || v.isBlank()) ? null : v;
    }

    private InventoryResponse.ItemRow toRow(InventoryItem i, Map<Long, String> resourceName,
                                            Map<Long, String> warehouseName,
                                            Map<Long, Integer> resourceThreshold, LocalDate today) {
        String warehouse = "temporary".equalsIgnoreCase(i.getWarehouseType())
                ? "(Temporary)"
                : warehouseName.getOrDefault(i.getWarehouseId(), "-");
        return new InventoryResponse.ItemRow(
                i.getId(),
                resourceName.getOrDefault(i.getResourceId(), "-"),
                i.getItemName(), i.getCategory(), warehouse, qty(i),
                i.getStatus() == null ? "Good Condition" : i.getStatus(),
                i.getExpiryDate() == null ? "" : D_MON_Y.format(i.getExpiryDate()),
                i.getBatchNumber(), lowStock(i, resourceThreshold), expiring(i, today), expired(i, today));
    }

    private static int qty(InventoryItem i) {
        return i.getQuantity() == null ? 0 : i.getQuantity();
    }

    /**
     * Low-stock threshold comes from the Resource Catalogue ({@code resources.low_stock_threshold}),
     * so it is maintained in one place under Resource Management rather than re-entered per item. When
     * a resource has no catalogue threshold set yet, fall back to the item's legacy value (then 10) so
     * the signal never silently disappears.
     */
    private static boolean lowStock(InventoryItem i, Map<Long, Integer> resourceThreshold) {
        Integer catalogue = resourceThreshold.get(i.getResourceId());
        int threshold = catalogue != null ? catalogue
                : (i.getMinimumThreshold() == null ? 10 : i.getMinimumThreshold());
        return qty(i) <= threshold && qty(i) > 0;
    }

    private static boolean expired(InventoryItem i, LocalDate today) {
        return i.getExpiryDate() != null && i.getExpiryDate().isBefore(today);
    }

    private static boolean expiring(InventoryItem i, LocalDate today) {
        return i.getExpiryDate() != null && !i.getExpiryDate().isBefore(today)
                && !i.getExpiryDate().isAfter(today.plusDays(30));
    }
}
