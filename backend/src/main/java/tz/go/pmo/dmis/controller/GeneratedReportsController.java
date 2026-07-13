package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.GeneratedReportsService;

/**
 * Reports &amp; Analytics — generated official documents. Thin eGA controller; logic in
 * {@link GeneratedReportsService}. Path {@code /v1/reports/generated} unchanged.
 */
@RestController
@RequestMapping("/v1/reports/generated")
@RequiredArgsConstructor
public class GeneratedReportsController {

    private final GeneratedReportsService service;

    @GetMapping
    @PreAuthorize("hasAuthority('damage_assessment.view')")
    public Map<String, Object> index(@RequestParam(required = false) String type,
                                     @RequestParam(required = false) Long incident_id) {
        return service.index(type, incident_id);
    }
}
