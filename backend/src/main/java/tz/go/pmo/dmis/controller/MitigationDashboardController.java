package tz.go.pmo.dmis.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.MitigationDashboardService;

/**
 * Mitigation module dashboard. Thin eGA controller; logic in {@link MitigationDashboardService}.
 */
@RestController
@RequestMapping("/v1/mitigation/dashboard")
@RequiredArgsConstructor
@Tag(name = "Prevention & Mitigation", description = "Module dashboard aggregates")
public class MitigationDashboardController {

    private final MitigationDashboardService service;

    @GetMapping
    @Operation(summary = "Dashboard payload: counts + choropleth + chart datasets + recent tables")
    @PreAuthorize("hasAuthority('prevention_dashboard.view')")
    public Map<String, Object> index() {
        return service.index();
    }
}
