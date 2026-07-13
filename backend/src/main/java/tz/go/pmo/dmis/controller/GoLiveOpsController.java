package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.GoLiveOpsService;

/**
 * Go-live readiness / ops honesty board. Thin eGA controller.
 * Path {@code /v1/ops} unchanged. Logic in {@link GoLiveOpsService}.
 */
@RestController
@RequestMapping("/v1/ops")
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
public class GoLiveOpsController {

    private final GoLiveOpsService service;

    @GetMapping("/go-live-readiness")
    @PreAuthorize("hasAnyAuthority('roles_and_permissions.view','user_management.view','roles_and_permissions.manage') "
            + "or hasAuthority('early_warning.view')")
    public Map<String, Object> readiness() {
        return service.readiness();
    }

    @GetMapping("/integration-registry")
    @PreAuthorize("hasAnyAuthority('roles_and_permissions.view','user_management.view','user_management.manage')")
    public Map<String, Object> integrationRegistry() {
        return service.integrationRegistry();
    }

    @GetMapping("/integrity-summary")
    @PreAuthorize("hasAnyAuthority('roles_and_permissions.view','user_management.view','user_management.manage')")
    public Map<String, Object> integritySummary() {
        return service.integritySummary();
    }

    @PostMapping("/integrations/ifmis/export-commitments")
    @PreAuthorize("hasAnyAuthority('resource_allocation.view','roles_and_permissions.manage','user_management.manage') "
            + "or hasAuthority('monitoring_evaluation.view')")
    public Map<String, Object> exportIfmisCommitments(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Integer days) {
        return service.exportIfmisCommitments(status, days);
    }

    @GetMapping("/geo/resolve")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> resolveGeo(@RequestParam String name) {
        return service.resolveGeo(name);
    }
}
