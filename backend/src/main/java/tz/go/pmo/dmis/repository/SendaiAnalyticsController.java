package tz.go.pmo.dmis.repository;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Sendai analytics API — target progress, loss trends and the auto-computed insight layer,
 * all derived live from validated disaster repository cards and the operational modules.
 */
@RestController
@RequestMapping("/v1/repository/analytics")
@Tag(name = "Sendai Analytics", description = "Sendai target progress + DMD intervention insights")
@RequiredArgsConstructor
public class SendaiAnalyticsController {

    private final SendaiAnalyticsService service;

    @GetMapping
    @Operation(summary = "Sendai dashboard: targets A–G, yearly series, hazard/region profiles, insights")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> dashboard(@RequestParam(required = false) Integer year) {
        return service.dashboard(year);
    }
}
