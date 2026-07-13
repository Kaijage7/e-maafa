package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.EwScannerService;

/**
 * OSINT Disaster Scanner / EW Monitoring. Thin eGA controller;
 * logic in {@link EwScannerService}. Path {@code /v1/ew/scanner} unchanged.
 */
@RestController
@RequestMapping("/v1/ew/scanner")
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
public class EwScannerController {

    private final EwScannerService service;

    @PostMapping("/scan")
    @PreAuthorize("hasAuthority('early_warning.create')")
    public Map<String, Object> scan(@RequestParam(defaultValue = "7") int days) {
        return service.scan(days);
    }

    /**
     * List detections. Productive AND filters: status, hazard, source, severity, reliability,
     * region, q (search), days (lookback). Dual stats: filtered {@code stats} + unfiltered {@code global}.
     */
    @GetMapping("/detections")
    public Map<String, Object> detections(@RequestParam(required = false) String status,
                                          @RequestParam(required = false) String hazard,
                                          @RequestParam(required = false) String source,
                                          @RequestParam(required = false) String severity,
                                          @RequestParam(required = false) String reliability,
                                          @RequestParam(required = false) String region,
                                          @RequestParam(required = false) String q,
                                          @RequestParam(required = false) Integer days,
                                          @RequestParam(defaultValue = "200") int limit) {
        return service.detections(status, hazard, source, severity, reliability, region, q, days, limit);
    }

    @GetMapping("/detections/{id}")
    public Map<String, Object> showDetection(@PathVariable long id) {
        return service.showDetection(id);
    }

    @PostMapping("/report")
    @PreAuthorize("hasAuthority('early_warning.create')")
    public Map<String, Object> manualReport(@RequestBody Map<String, Object> body) {
        return service.manualReport(body);
    }

    @PostMapping("/{id}/dismiss")
    @PreAuthorize("hasAuthority('early_warning.create')")
    public Map<String, Object> dismiss(@PathVariable long id) {
        return service.dismiss(id);
    }

    @PostMapping("/{id}/dispatch")
    @PreAuthorize("hasAuthority('early_warning.create')")
    public Map<String, Object> dispatch(@PathVariable long id,
                                        @RequestBody(required = false) Map<String, Object> body) {
        return service.dispatch(id, body);
    }

    /** Productive filters: agency, status. Agency-bound logins forced to own agency. */
    @GetMapping("/entity-taskings")
    public Map<String, Object> entityTaskings(@RequestParam(required = false) String agency,
                                              @RequestParam(required = false) String status) {
        return service.entityTaskings(agency, status);
    }

    @PostMapping("/taskings/{id}/acknowledge")
    @PreAuthorize("hasAuthority('early_warning.create')")
    public Map<String, Object> acknowledgeTasking(@PathVariable long id) {
        return service.acknowledgeTasking(id);
    }

    @PostMapping("/taskings/{id}/respond")
    @PreAuthorize("hasAuthority('early_warning.create')")
    public Map<String, Object> respondTasking(@PathVariable long id,
                                              @RequestBody(required = false) Map<String, Object> body) {
        return service.respondTasking(id, body);
    }

    @PostMapping("/taskings/{id}/review")
    @PreAuthorize("hasAuthority('early_warning.approve')")
    public Map<String, Object> reviewTasking(@PathVariable long id,
                                             @RequestBody(required = false) Map<String, Object> body) {
        return service.reviewTasking(id, body);
    }
}
