package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.ResourceReportService;

/**
 * Resource Allocation Report — thin eGA controller. Path {@code /v1/reports/resource-allocations}
 * unchanged. Logic in {@link ResourceReportService}.
 */
@RestController
@RequestMapping("/v1/reports/resource-allocations")
@RequiredArgsConstructor
public class ResourceReportController {

    private final ResourceReportService service;

    @GetMapping
    @PreAuthorize("hasAuthority('resource_allocation.view')")
    public Map<String, Object> index(@RequestParam(required = false) String start_date,
                                     @RequestParam(required = false) String end_date) {
        return service.index(start_date, end_date);
    }
}
