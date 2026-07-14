package tz.go.pmo.dmis.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.dto.request.InstitutionClassificationRequest;
import tz.go.pmo.dmis.dto.request.InstitutionCreateRequest;
import tz.go.pmo.dmis.dto.request.InstitutionProfileRequest;
import tz.go.pmo.dmis.service.InstitutionRegistryService;

/**
 * Unified System Settings view over agencies + stakeholders. Thin eGA controller;
 * logic in {@link InstitutionRegistryService}.
 */
@RestController
@RequestMapping("/v1/settings/institutions")
@RequiredArgsConstructor
@Tag(name = "System Settings", description = "Unified institution/stakeholder registry")
public class InstitutionRegistryController {

    private final InstitutionRegistryService service;

    @GetMapping
    @Operation(summary = "Unified institution registry with provenance, classes and policy roles")
    @PreAuthorize("hasAuthority('user_management.view')")
    public Map<String, Object> index(@RequestParam(required = false) String kind,
                                     @RequestParam(required = false) String institutionClass,
                                     @RequestParam(required = false) String sector,
                                     @RequestParam(required = false) String source,
                                     @RequestParam(required = false) String search,
                                     @RequestParam(defaultValue = "500") int limit,
                                     @RequestParam(required = false) Boolean includeInactive) {
        return service.index(kind, institutionClass, sector, source, search, limit, includeInactive);
    }

    @PostMapping("/{kind}")
    @Operation(summary = "Add institution to agency or stakeholder registry")
    @PreAuthorize("hasAuthority('user_management.manage')")
    public Map<String, Object> create(@PathVariable String kind,
                                      @RequestBody InstitutionCreateRequest req) {
        return service.create(kind, req);
    }

    @DeleteMapping("/{kind}/{id}")
    @Operation(summary = "Remove institution from active registry (soft deactivate)")
    @PreAuthorize("hasAuthority('user_management.manage')")
    public Map<String, Object> remove(@PathVariable String kind, @PathVariable long id) {
        return service.remove(kind, id);
    }

    @PostMapping("/{kind}/{id}/restore")
    @Operation(summary = "Restore a removed (inactive) institution")
    @PreAuthorize("hasAuthority('user_management.manage')")
    public Map<String, Object> restore(@PathVariable String kind, @PathVariable long id) {
        return service.restore(kind, id);
    }

    @PutMapping("/{kind}/{id}/classification")
    @Operation(summary = "Update institution governance fields (class, policy role, M&E flag)")
    @PreAuthorize("hasAuthority('user_management.manage')")
    public Map<String, Object> updateClassification(@PathVariable String kind, @PathVariable long id,
                                                    @RequestBody InstitutionClassificationRequest req) {
        return service.updateClassification(kind, id, req);
    }

    @PutMapping("/{kind}/{id}")
    @Operation(summary = "Full institution profile update (name, contacts, class, active, M&E)")
    @PreAuthorize("hasAuthority('user_management.manage')")
    public Map<String, Object> updateProfile(@PathVariable String kind, @PathVariable long id,
                                             @RequestBody InstitutionProfileRequest req) {
        return service.updateProfile(kind, id, req);
    }

    @GetMapping("/{kind}/{id}")
    @Operation(summary = "Get one institution for editing")
    @PreAuthorize("hasAuthority('user_management.view')")
    public Map<String, Object> one(@PathVariable String kind, @PathVariable long id) {
        return service.one(kind, id);
    }
}
