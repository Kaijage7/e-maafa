package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.IncidentReportService;

/**
 * Incident Reports — thin eGA controller. Path {@code /v1/reports/incidents} unchanged.
 * Logic in {@link IncidentReportService}.
 */
@RestController
@RequestMapping("/v1/reports/incidents")
@RequiredArgsConstructor
public class IncidentReportController {

    private final IncidentReportService service;

    @GetMapping
    @PreAuthorize("hasAuthority('incidents.view')")
    public Map<String, Object> index(@RequestParam(required = false) String start_date,
                                     @RequestParam(required = false) String end_date,
                                     @RequestParam(required = false) String status,
                                     @RequestParam(required = false) String severity,
                                     @RequestParam(required = false) String region) {
        return service.index(start_date, end_date, status, severity, region);
    }
}
