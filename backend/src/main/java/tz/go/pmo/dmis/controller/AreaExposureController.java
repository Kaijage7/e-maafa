package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.AreaExposureService;

/**
 * Best-effort area exposure from INFORM + live DMIS assets.
 * Does not claim satellite footprint∩population or live institution registries.
 */
@RestController
@RequestMapping("/v1/ops/exposure")
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
public class AreaExposureController {

    private final AreaExposureService service;

    @GetMapping("/area")
    @PreAuthorize("hasAnyAuthority('early_warning.view','risk_index.view','roles_and_permissions.view') "
            + "or hasAuthority('user_management.view')")
    public Map<String, Object> area(@RequestParam String name) {
        return service.areaExposure(name);
    }

    @GetMapping("/summary")
    @PreAuthorize("hasAnyAuthority('early_warning.view','risk_index.view','roles_and_permissions.view') "
            + "or hasAuthority('user_management.view')")
    public Map<String, Object> summary(
            @RequestParam(required = false) String region,
            @RequestParam(required = false) Integer limit) {
        return service.summary(region, limit);
    }
}
