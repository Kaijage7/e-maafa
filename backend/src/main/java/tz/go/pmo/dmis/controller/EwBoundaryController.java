package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.EwBoundaryService;

/**
 * Early Warning → boundary monitoring reports (Disaster Scanner focal-point panel).
 * Thin eGA controller; logic in {@link EwBoundaryService}. Paths unchanged:
 * {@code /ew/monitoring/reports} (context-path {@code /api}).
 */
@RestController
@RequestMapping("/ew")
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
public class EwBoundaryController {

    private final EwBoundaryService service;

    /** Focal-point reports list. Filters: bulletin_number, warning_code (productive). */
    @GetMapping("/monitoring/reports")
    public Map<String, Object> reports(@RequestParam(required = false) String bulletin_number,
                                       @RequestParam(required = false) String warning_code) {
        return service.reports(bulletin_number, warning_code);
    }

    /** Store one focal-point report. Requires {@code early_warning.create}. */
    @PostMapping("/monitoring/reports")
    @PreAuthorize("hasAuthority('early_warning.create')")
    public Map<String, Object> storeReport(@RequestBody Map<String, Object> body) {
        return service.storeReport(body);
    }
}
