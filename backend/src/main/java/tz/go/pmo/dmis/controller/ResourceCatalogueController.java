package tz.go.pmo.dmis.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.ResourceCatalogueService;

/**
 * System Settings → Resource Management. Thin eGA controller; logic in {@link ResourceCatalogueService}.
 * Paths unchanged. Named ResourceCatalogue* to avoid clashing with inventory {@code entity.Resource}.
 */
@RestController
@RequestMapping("/v1/settings/resources")
@Tag(name = "Settings: Resource Catalogue", description = "Relief-resource catalogue CRUD")
@RequiredArgsConstructor
public class ResourceCatalogueController {

    private static final String CAN_WRITE = "hasAuthority('resource_catalogue.manage')";

    private final ResourceCatalogueService service;

    @GetMapping
    @Operation(summary = "Catalogue + categories + stats")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> index(@RequestParam(required = false) String category,
                                     @RequestParam(required = false) String search) {
        return service.index(category, search);
    }

    @PostMapping
    @Operation(summary = "Add a catalogue item")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> create(@RequestBody Map<String, Object> req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Edit a catalogue item")
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> update(@PathVariable long id, @RequestBody Map<String, Object> req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a catalogue item (blocked if it is used by live operational rows)")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize(CAN_WRITE)
    public void delete(@PathVariable long id) {
        service.delete(id);
    }
}
