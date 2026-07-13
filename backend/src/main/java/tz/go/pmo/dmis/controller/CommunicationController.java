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
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.CommunicationService;

/**
 * Response → Communication & Alert Center. Thin eGA controller; logic in
 * {@link CommunicationService}. Paths and JSON unchanged from the former response package.
 */
@RestController
@RequestMapping("/v1/response/communication")
@RequiredArgsConstructor
public class CommunicationController {

    private final CommunicationService service;

    @GetMapping
    public Map<String, Object> index() {
        return service.index();
    }

    @GetMapping("/form-data")
    public Map<String, Object> formData() {
        return service.formData();
    }

    @PostMapping("/alerts")
    @PreAuthorize("hasAuthority('communication_and_alerts.send')")
    public Map<String, Object> sendAlert(@RequestBody Map<String, Object> body) throws Exception {
        return service.sendAlert(body);
    }

    @GetMapping("/alerts")
    public Map<String, Object> history() {
        return service.history();
    }

    @GetMapping("/alerts/{id}")
    public Map<String, Object> alertDetails(@PathVariable long id) {
        return service.alertDetails(id);
    }

    @PostMapping("/alerts/{id}/resend-failed")
    @PreAuthorize("hasAuthority('communication_and_alerts.send')")
    public Map<String, Object> resendFailed(@PathVariable long id) {
        return service.resendFailed(id);
    }

    @PostMapping("/templates")
    @PreAuthorize("hasAuthority('communication_and_alerts.send')")
    public Map<String, Object> saveTemplate(@RequestBody Map<String, Object> body) throws Exception {
        return service.saveTemplate(body);
    }

    @PostMapping("/templates/{id}")
    @PreAuthorize("hasAuthority('communication_and_alerts.send')")
    public Map<String, Object> updateTemplate(@PathVariable long id, @RequestBody Map<String, Object> body) throws Exception {
        return service.updateTemplate(id, body);
    }

    @PostMapping("/templates/{id}/toggle")
    @PreAuthorize("hasAuthority('communication_and_alerts.send')")
    public Map<String, Object> toggleTemplate(@PathVariable long id) {
        return service.toggleTemplate(id);
    }

    @DeleteMapping("/templates/{id}")
    @PreAuthorize("hasAuthority('communication_and_alerts.send')")
    public Map<String, Object> deleteTemplate(@PathVariable long id) {
        return service.deleteTemplate(id);
    }

    @PostMapping("/templates/{id}/preview")
    @PreAuthorize("hasAuthority('communication_and_alerts.view')")
    public Map<String, Object> previewTemplate(@PathVariable long id,
                                               @RequestBody(required = false) Map<String, Object> body) {
        return service.previewTemplate(id, body);
    }

    @GetMapping("/analytics")
    public Map<String, Object> analytics() {
        return service.analytics();
    }
}
