package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.OneHealthDirectiveService;

/**
 * One Health directives — thin eGA controller. Path {@code /v1/onehealth/directives}.
 * Filters, show, update, acknowledge, escalate, respond, implementation history unchanged.
 */
@RestController
@RequestMapping("/v1/onehealth/directives")
@RequiredArgsConstructor
public class OneHealthDirectiveController {

    private final OneHealthDirectiveService service;

    @PreAuthorize("hasAuthority('one_health.directive')")
    @GetMapping
    public Map<String, Object> index(@RequestParam(required = false) String status,
                                     @RequestParam(required = false) String priority,
                                     @RequestParam(name = "event_id", required = false) Long eventId,
                                     @RequestParam(name = "date_from", required = false) String dateFrom,
                                     @RequestParam(name = "date_to", required = false) String dateTo,
                                     @RequestParam(required = false) String search,
                                     @RequestParam(required = false) String filter,
                                     @RequestParam(defaultValue = "1") int page) {
        return service.index(status, priority, eventId, dateFrom, dateTo, search, filter, page);
    }

    @PreAuthorize("hasAuthority('one_health.directive')")
    @GetMapping("/{id}")
    public Map<String, Object> show(@PathVariable long id) {
        return service.show(id);
    }

    @PreAuthorize("hasAuthority('one_health.directive')")
    @PutMapping("/{id}")
    public ResponseEntity<Map<String, Object>> update(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.update(id, body);
    }

    @PreAuthorize("hasAuthority('one_health.manage')")
    @PostMapping("/{id}/acknowledge")
    public ResponseEntity<Map<String, Object>> acknowledge(@PathVariable long id,
                                                           @RequestBody(required = false) Map<String, Object> body) {
        return service.acknowledge(id, body);
    }

    @PreAuthorize("hasAuthority('one_health.directive')")
    @PostMapping("/{id}/escalate")
    public Map<String, Object> escalate(@PathVariable long id) {
        return service.escalate(id);
    }

    @PreAuthorize("hasAuthority('one_health.manage')")
    @PostMapping("/{id}/respond")
    public ResponseEntity<Map<String, Object>> respond(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.respond(id, body);
    }

    @PreAuthorize("hasAuthority('one_health.directive')")
    @GetMapping("/{id}/implementation-history")
    public Map<String, Object> implementationHistory(@PathVariable long id) {
        return service.implementationHistory(id);
    }
}
