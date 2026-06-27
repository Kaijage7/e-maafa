package tz.go.pmo.dmis.preparedness;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import tz.go.pmo.dmis.common.security.AreaGuard;

/** API for the Emergency Supplies screen, over the existing inventory_items table (read + create). */
@RestController
@RequestMapping("/v1/inventory")
@Tag(name = "Preparedness", description = "Emergency supplies / inventory")
public class InventoryController {

    private final InventoryService inventoryService;
    private final AreaGuard areaGuard;
    private final JdbcTemplate jdbc;

    public InventoryController(InventoryService inventoryService, AreaGuard areaGuard, JdbcTemplate jdbc) {
        this.inventoryService = inventoryService;
        this.areaGuard = areaGuard;
        this.jdbc = jdbc;
    }

    @GetMapping
    @Operation(summary = "Inventory items + statistics + alert flags")
    @PreAuthorize("isAuthenticated()")
    public InventoryResponse index() {
        return inventoryService.index();
    }

    @GetMapping("/reference")
    @Operation(summary = "Resources + warehouses for the New Item form")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> reference() {
        return inventoryService.reference();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a new emergency-supply item")
    @PreAuthorize("hasAuthority('warehouse_and_stock.manage')")
    public Map<String, Object> create(@RequestBody InventoryWriteRequest request) {
        // CREATE references a target warehouse from the body — an area officer may only stock into a
        // warehouse in their own area (or a shared/national one); national tier may target any. The
        // warehouse list is scoped shared-or-own (warehouses carry region_id/district_id, NULL = national),
        // so mirror that policy on the target before the item is written. Out-of-area target → 404.
        if (request != null && request.warehouseId() != null) {
            areaGuard.assertWarehouseVisible("public.warehouses", request.warehouseId());
        }
        return inventoryService.create(request);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Inventory item detail (for the edit form)")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> detail(@PathVariable long id) {
        guardItemArea(id);
        return inventoryService.detail(id);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update an emergency-supply item")
    @PreAuthorize("hasAuthority('warehouse_and_stock.manage')")
    public Map<String, Object> update(@PathVariable long id, @RequestBody InventoryWriteRequest request) {
        // Scope the EXISTING item by its current warehouse before any field is read or written, so an
        // out-of-area officer cannot edit (or move) another region's stock.
        guardItemArea(id);
        // The update may RE-POINT the item at a different warehouse — that target is body-supplied, so
        // it must also be in the caller's area (or shared/national), otherwise the move would smuggle
        // stock across areas. National tier may target any warehouse.
        if (request != null && request.warehouseId() != null) {
            areaGuard.assertWarehouseVisible("public.warehouses", request.warehouseId());
        }
        return inventoryService.update(id, request);
    }

    /**
     * Scope an inventory item by the area of the warehouse it lives in, mirroring the shared-or-own policy
     * the warehouse registry uses (own area or a NULL-area national/shared warehouse is visible; national
     * tier sees all). An item with NO warehouse (warehouse_id IS NULL) is the national/unassigned pool and
     * stays visible to everyone — exactly as a NULL-area warehouse would. Anything else outside the caller's
     * area resolves to 404 ({@link ResourceNotFoundException}), never 403, so an officer cannot tell
     * "exists elsewhere" from "does not exist".
     */
    private void guardItemArea(long id) {
        List<Long> warehouseIds = jdbc.queryForList(
                "select warehouse_id from public.inventory_items where id = ?", Long.class, id);
        if (warehouseIds.isEmpty()) {
            throw new ResourceNotFoundException("Inventory item not found.");
        }
        Long warehouseId = warehouseIds.get(0);
        if (warehouseId == null) {
            return; // national / unassigned pool — visible to all, like a NULL-area warehouse
        }
        areaGuard.assertWarehouseVisible("public.warehouses", warehouseId);
    }
}
