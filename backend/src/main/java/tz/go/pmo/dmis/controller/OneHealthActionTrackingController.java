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
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.OneHealthActionTrackingService;

/**
 * One Health action tracking + close/archive — thin eGA controller.
 * Paths under {@code /v1/onehealth} unchanged (shared base with dissemination).
 */
@RestController
@RequestMapping("/v1/onehealth")
@RequiredArgsConstructor
public class OneHealthActionTrackingController {

    private final OneHealthActionTrackingService service;

    @GetMapping("/events/{eventId}/actions")
    public Map<String, Object> index(@PathVariable long eventId) {
        return service.index(eventId);
    }

    @PreAuthorize("hasAuthority('one_health.manage')")
    @PostMapping("/events/{eventId}/actions")
    public ResponseEntity<Map<String, Object>> store(@PathVariable long eventId, @RequestBody Map<String, Object> body) {
        return service.store(eventId, body);
    }

    @PreAuthorize("hasAuthority('one_health.manage')")
    @PutMapping("/actions/{id}")
    public ResponseEntity<Map<String, Object>> update(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.update(id, body);
    }

    @PreAuthorize("hasAuthority('one_health.manage')")
    @PostMapping("/actions/{id}/progress")
    public ResponseEntity<Map<String, Object>> updateProgress(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.updateProgress(id, body);
    }

    @PreAuthorize("hasAuthority('one_health.manage')")
    @PostMapping("/events/{eventId}/close")
    public ResponseEntity<Map<String, Object>> closeEvent(@PathVariable long eventId, @RequestBody Map<String, Object> body) {
        return service.closeEvent(eventId, body);
    }

    @PreAuthorize("hasAuthority('one_health.manage')")
    @PostMapping("/events/{eventId}/archive")
    public ResponseEntity<Map<String, Object>> archiveEvent(@PathVariable long eventId) {
        return service.archiveEvent(eventId);
    }
}
