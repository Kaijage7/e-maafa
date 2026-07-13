package tz.go.pmo.dmis.controller;

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
import tz.go.pmo.dmis.service.StakeholderAdminService;
import tz.go.pmo.dmis.service.StakeholderAdminService.StakeholderWriteRequest;

/**
 * Stakeholder Portal directory + verification. Thin eGA controller.
 * Path {@code /v1/stakeholders} unchanged. Logic in {@link StakeholderAdminService}.
 */
@RestController
@RequestMapping("/v1/stakeholders")
@RequiredArgsConstructor
@Tag(name = "Stakeholder Portal", description = "Partner directory + verification")
public class StakeholderAdminController {

    private final StakeholderAdminService service;

    @GetMapping
    @Operation(summary = "Stakeholder directory + stats")
    @PreAuthorize("hasAuthority('stakeholders.view')")
    public Map<String, Object> index() {
        return service.index();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Register a stakeholder (admin)")
    @PreAuthorize("hasAuthority('stakeholders.manage')")
    public Map<String, Object> create(@RequestBody StakeholderWriteRequest req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update a stakeholder")
    @PreAuthorize("hasAuthority('stakeholders.manage')")
    public Map<String, Object> update(@PathVariable long id, @RequestBody StakeholderWriteRequest req) {
        return service.update(id, req);
    }

    @PutMapping("/{id}/verify")
    @Operation(summary = "Verify / unverify a partner and provision partner login when possible")
    @PreAuthorize("hasAuthority('resource_allocation.approve')")
    public Map<String, Object> verify(@PathVariable long id, @RequestBody Map<String, Object> req) {
        return service.verify(id, req);
    }

    @PutMapping("/{id}/link-user")
    @Operation(summary = "Link a login account to this partner (enables self-service donations)")
    @PreAuthorize("hasAuthority('stakeholders.manage')")
    public Map<String, Object> linkUser(@PathVariable long id, @RequestBody Map<String, Object> req) {
        return service.linkUser(id, req);
    }
}
