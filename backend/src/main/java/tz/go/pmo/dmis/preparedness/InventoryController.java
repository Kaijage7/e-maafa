package tz.go.pmo.dmis.preparedness;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.security.Authz;

/** API for the Emergency Supplies screen, over the existing inventory_items table (read + create). */
@RestController
@RequestMapping("/v1/inventory")
@RequiredArgsConstructor
@Tag(name = "Preparedness", description = "Emergency supplies / inventory")
public class InventoryController {

    private final InventoryService inventoryService;

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
    @PreAuthorize(Authz.PREPAREDNESS_MANAGE)
    public Map<String, Object> create(@RequestBody InventoryWriteRequest request) {
        return inventoryService.create(request);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Inventory item detail (for the edit form)")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> detail(@PathVariable long id) {
        return inventoryService.detail(id);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update an emergency-supply item")
    @PreAuthorize(Authz.PREPAREDNESS_MANAGE)
    public Map<String, Object> update(@PathVariable long id, @RequestBody InventoryWriteRequest request) {
        return inventoryService.update(id, request);
    }
}
