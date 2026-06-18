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

/** API for the Warehouses screen, over the existing table (read + create). */
@RestController
@RequestMapping("/v1/warehouses")
@RequiredArgsConstructor
@Tag(name = "Preparedness", description = "Warehouses")
public class WarehouseController {

    private final WarehouseService warehouseService;

    @GetMapping
    @Operation(summary = "Warehouse registry + statistics + map markers")
    @PreAuthorize("isAuthenticated()")
    public WarehouseResponse index() {
        return warehouseService.index();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a new warehouse")
    @PreAuthorize(Authz.PREPAREDNESS_MANAGE)
    public Map<String, Object> create(@RequestBody WarehouseWriteRequest request) {
        return warehouseService.create(request);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Single warehouse (edit form pre-fill)")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> show(@PathVariable long id) {
        return warehouseService.show(id);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update an existing warehouse")
    @PreAuthorize(Authz.PREPAREDNESS_MANAGE)
    public Map<String, Object> update(@PathVariable long id, @RequestBody WarehouseWriteRequest request) {
        return warehouseService.update(id, request);
    }
}
