package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.EwAgencyService;

/**
 * Cross-agency Early Warning integration bus. Thin eGA controller;
 * logic in {@link EwAgencyService}. Base path {@code /v1/ew} unchanged.
 */
@RestController
@RequestMapping("/v1/ew")
// Cross-agency reads stay authenticated; WRITES are role-gated per method.
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
public class EwAgencyController {

    private final EwAgencyService service;

    @PostMapping("/agency/{agency}/submission")
    @PreAuthorize("hasAuthority('early_warning.create')")
    public Map<String, Object> submit(@PathVariable String agency,
                                      @RequestBody Map<String, Object> payload) throws Exception {
        return service.submit(agency, payload);
    }

    @PostMapping("/agency/{agency}/update")
    @PreAuthorize("hasAuthority('early_warning.create')")
    public Map<String, Object> update(@PathVariable String agency,
                                      @RequestParam("warningCode") String warningCode,
                                      @RequestBody Map<String, Object> payload) throws Exception {
        return service.update(agency, warningCode, payload);
    }

    /** Productive filters: warning_code, agency (blank ignored; agency-bound forced to self). */
    @GetMapping("/agency/updates")
    public Map<String, Object> updates(@RequestParam(required = false) String warning_code,
                                       @RequestParam(required = false) String agency) {
        return service.updates(warning_code, agency);
    }

    @GetMapping("/agency/{agency}/latest")
    public Map<String, Object> latest(@PathVariable String agency) {
        return service.latest(agency);
    }

    /** Productive limit: clamped to 1–200 (default 20). */
    @GetMapping("/agency/{agency}/history")
    public Map<String, Object> history(@PathVariable String agency,
                                       @RequestParam(required = false, defaultValue = "20") int limit) {
        return service.history(agency, limit);
    }

    @DeleteMapping("/agency/{agency}/latest")
    @PreAuthorize("hasAuthority('early_warning.create') or hasAuthority('early_warning.approve')")
    public Map<String, Object> withdraw(@PathVariable String agency) {
        return service.withdraw(agency);
    }

    /** Productive exclude: drops that agency from the map (blank = no exclude). */
    @GetMapping("/agency/latest")
    public Map<String, Object> allLatest(@RequestParam(required = false) String exclude) {
        return service.allLatest(exclude);
    }

    /** Productive days: number of forecast day slots returned (default 5). */
    @GetMapping("/dmd/consolidated")
    public Map<String, Object> consolidated(@RequestParam(required = false, defaultValue = "5") int days) {
        return service.consolidated(days);
    }

    /** Productive: day, days, hazardFocus (auto|flood|drought|…). */
    @GetMapping("/dmd/impact-support")
    public Map<String, Object> impactSupport(@RequestParam(required = false, defaultValue = "1") int day,
                                             @RequestParam(required = false, defaultValue = "5") int days,
                                             @RequestParam(required = false, defaultValue = "auto") String hazardFocus) {
        return service.impactSupport(day, days, hazardFocus);
    }

    @GetMapping("/dmd/action-guide")
    public Map<String, Object> actionGuideMeta() {
        return service.actionGuideMeta();
    }

    @PostMapping("/dmd/action-statements")
    public Map<String, Object> actionStatements(@RequestBody Map<String, Object> body) {
        return service.actionStatements(body);
    }
}
