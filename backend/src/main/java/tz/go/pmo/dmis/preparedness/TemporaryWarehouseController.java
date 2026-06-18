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

/** API for the Temporary Warehouses screen, over the existing table (read + create). */
@RestController
@RequestMapping("/v1/temporary-warehouses")
@RequiredArgsConstructor
@Tag(name = "Preparedness", description = "Temporary warehouses")
public class TemporaryWarehouseController {

    private final TemporaryWarehouseService service;

    @GetMapping
    @Operation(summary = "Temporary warehouse registry + statistics + map markers")
    @PreAuthorize("isAuthenticated()")
    public TemporaryWarehouseResponse index() {
        return service.index();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a new temporary warehouse")
    @PreAuthorize(Authz.PREPAREDNESS_MANAGE)
    public Map<String, Object> create(@RequestBody TemporaryWarehouseWriteRequest request) {
        return service.create(request);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Temporary warehouse detail (for the edit form)")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> detail(@PathVariable long id) {
        return service.detail(id);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update a temporary warehouse")
    @PreAuthorize(Authz.PREPAREDNESS_MANAGE)
    public Map<String, Object> update(@PathVariable long id, @RequestBody TemporaryWarehouseWriteRequest request) {
        return service.update(id, request);
    }
}
