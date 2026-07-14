package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.NationalIntegrationService;

/**
 * Honest national integration adapters (NBS / NIDA / LATRA / NAPA).
 * Thin eGA controller — no live registry claims.
 */
@RestController
@RequestMapping("/v1/ops/integrations")
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
public class NationalIntegrationController {

    private final NationalIntegrationService service;

    @GetMapping("/catalogue")
    @PreAuthorize("hasAnyAuthority('roles_and_permissions.view','user_management.view','user_management.manage') "
            + "or hasAuthority('early_warning.view') or hasAuthority('risk_index.view')")
    public Map<String, Object> catalogue() {
        return service.catalogue();
    }

    @GetMapping("/{systemCode}/status")
    @PreAuthorize("hasAnyAuthority('roles_and_permissions.view','user_management.view','user_management.manage') "
            + "or hasAuthority('early_warning.view') or hasAuthority('risk_index.view')")
    public Map<String, Object> status(@PathVariable String systemCode) {
        return service.status(systemCode);
    }

    @GetMapping("/{systemCode}/contract")
    @PreAuthorize("hasAnyAuthority('roles_and_permissions.view','user_management.view','user_management.manage') "
            + "or hasAuthority('early_warning.view') or hasAuthority('risk_index.view')")
    public Map<String, Object> contract(@PathVariable String systemCode) {
        return service.contract(systemCode);
    }

    @PostMapping("/nbs/population-request")
    @PreAuthorize("hasAnyAuthority('risk_index.view','roles_and_permissions.manage','user_management.manage') "
            + "or hasAuthority('early_warning.view')")
    public Map<String, Object> nbsPopulationRequest(
            @RequestParam(required = false) String areaLevel,
            @RequestParam(required = false) Integer limit) {
        return service.nbsPopulationRequest(areaLevel, limit);
    }

    @PostMapping("/nida/verify-request")
    @PreAuthorize("hasAnyAuthority('user_management.manage','roles_and_permissions.manage','user_management.view')")
    public Map<String, Object> nidaVerifyRequest(@RequestBody(required = false) Map<String, Object> body) {
        return service.nidaVerifyRequest(body);
    }

    @PostMapping("/latra/logistics-snapshot")
    @PreAuthorize("hasAnyAuthority('resource_allocation.view','roles_and_permissions.manage','user_management.manage') "
            + "or hasAuthority('early_warning.view')")
    public Map<String, Object> latraLogisticsSnapshot(
            @RequestParam(required = false) String district,
            @RequestParam(required = false) Integer limit) {
        return service.latraLogisticsSnapshot(district, limit);
    }

    @PostMapping("/napa/programme-map-export")
    @PreAuthorize("hasAnyAuthority('monitoring_evaluation.view','roles_and_permissions.manage','user_management.manage') "
            + "or hasAuthority('risk_index.view')")
    public Map<String, Object> napaProgrammeMapExport(@RequestParam(required = false) Integer limit) {
        return service.napaProgrammeMapExport(limit);
    }
}
