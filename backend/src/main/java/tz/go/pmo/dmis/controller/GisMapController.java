package tz.go.pmo.dmis.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.GisMapService;

/**
 * Risk Mapping & GIS reference map. Thin eGA controller; logic in {@link GisMapService}.
 */
@RestController
@RequestMapping("/v1/gis-map")
@RequiredArgsConstructor
@Tag(name = "Prevention & Mitigation", description = "Risk Mapping & GIS reference map data")
public class GisMapController {

    private final GisMapService service;

    @GetMapping
    @Operation(summary = "GIS map payload: 5 marker layers + stats + choropleth region data")
    @PreAuthorize("hasAnyAuthority('risk_mapping.view','reports_and_analytics.view')")
    public Map<String, Object> index() {
        return service.index();
    }
}
