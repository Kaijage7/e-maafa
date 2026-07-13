package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.OneHealthDashboardService;

/**
 * One Health dashboard — thin eGA controller. Path {@code /v1/onehealth/dashboard}.
 * National situational aggregates; recent_events list remains area-scoped in the service.
 */
@RestController
@RequestMapping("/v1/onehealth/dashboard")
@RequiredArgsConstructor
public class OneHealthDashboardController {

    private final OneHealthDashboardService service;

    @GetMapping
    public Map<String, Object> index() {
        return service.index();
    }
}
