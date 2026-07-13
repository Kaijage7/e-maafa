package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.EwManagementReportService;

/**
 * Early Warning Management analytics. Thin eGA controller;
 * logic in {@link EwManagementReportService}. Path unchanged.
 * Productive filters: {@code from}, {@code to} (yyyy-MM-dd).
 */
@RestController
@RequestMapping("/v1/reports/early-warnings")
@RequiredArgsConstructor
public class EwManagementReportController {

    private final EwManagementReportService service;

    @GetMapping
    public Map<String, Object> analysis(@RequestParam(required = false) String from,
                                        @RequestParam(required = false) String to) {
        return service.analysis(from, to);
    }
}
