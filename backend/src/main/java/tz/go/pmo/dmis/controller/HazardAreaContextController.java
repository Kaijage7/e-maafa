package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.HazardAreaContextService;

/**
 * PMO exposure-context helper for hazard / warned areas. Thin eGA controller;
 * logic in {@link HazardAreaContextService}. Path {@code /v1/ops/hazard-area-context} unchanged.
 */
@RestController
@RequestMapping("/v1/ops/hazard-area-context")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class HazardAreaContextController {

    private final HazardAreaContextService service;

    @GetMapping
    @PreAuthorize("hasAnyAuthority('early_warning.view','monitoring_evaluation.view','incidents.view',"
            + "'roles_and_permissions.view')")
    public Map<String, Object> context(
            @RequestParam(required = false) String areaName,
            @RequestParam(required = false) Long regionId,
            @RequestParam(required = false) Long districtId,
            @RequestParam(required = false) Double lat,
            @RequestParam(required = false) Double lng,
            @RequestParam(required = false) String hazardType,
            @RequestParam(required = false) String warningCode,
            @RequestParam(required = false) Long warningId,
            @RequestParam(required = false) Long submissionId) {
        return service.context(areaName, regionId, districtId, lat, lng, hazardType,
                warningCode, warningId, submissionId);
    }
}
