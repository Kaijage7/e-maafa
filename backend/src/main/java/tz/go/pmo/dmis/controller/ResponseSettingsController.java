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
import tz.go.pmo.dmis.service.ResponseSettingsService;

/**
 * Response → System Settings hub. Thin eGA controller; logic in {@link ResponseSettingsService}.
 * Paths and JSON unchanged from the former response package.
 */
@RestController
@RequestMapping("/v1/response/settings")
@RequiredArgsConstructor
public class ResponseSettingsController {

    private final ResponseSettingsService service;

    @PreAuthorize("hasAuthority('approval_workflows.view')")
    @GetMapping("/approval-chains")
    public Map<String, Object> approvalChains() {
        return service.approvalChains();
    }

    @PreAuthorize("hasAuthority('approval_workflows.view')")
    @GetMapping("/approval-chains/{moduleId}")
    public Map<String, Object> approvalChain(@PathVariable long moduleId) {
        return service.approvalChain(moduleId);
    }

    @PreAuthorize("hasAuthority('approval_workflows.manage')")
    @PostMapping("/approval-chains/{moduleId}/steps")
    public Map<String, Object> saveChain(@PathVariable long moduleId, @RequestBody Map<String, Object> body) {
        return service.saveChain(moduleId, body);
    }

    @PreAuthorize("hasAuthority('approval_workflows.manage')")
    @PostMapping("/approval-chains/{moduleId}/toggle")
    public Map<String, Object> toggleModule(@PathVariable long moduleId) {
        return service.toggleModule(moduleId);
    }

    @PreAuthorize("hasAuthority('resource_catalogue.view')")
    @GetMapping("/resources")
    public Map<String, Object> resources() {
        return service.resources();
    }

    @PreAuthorize("hasAuthority('resource_catalogue.manage')")
    @PostMapping("/resources")
    public Map<String, Object> createResource(@RequestBody Map<String, Object> body) {
        return service.createResource(body);
    }

    @PreAuthorize("hasAuthority('resource_catalogue.manage')")
    @PostMapping("/resources/{id}")
    public Map<String, Object> updateResource(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.updateResource(id, body);
    }

    @PreAuthorize("hasAuthority('resource_catalogue.manage')")
    @DeleteMapping("/resources/{id}")
    public Map<String, Object> deleteResource(@PathVariable long id) {
        return service.deleteResource(id);
    }

    @PreAuthorize("hasAuthority('resource_catalogue.view')")
    @GetMapping("/incident-types")
    public Map<String, Object> incidentTypes() {
        return service.incidentTypes();
    }

    @PreAuthorize("hasAuthority('resource_catalogue.manage')")
    @PostMapping("/incident-types")
    public Map<String, Object> createIncidentType(@RequestBody Map<String, Object> body) {
        return service.createIncidentType(body);
    }

    @PreAuthorize("hasAuthority('resource_catalogue.manage')")
    @PostMapping("/incident-types/{id}")
    public Map<String, Object> updateIncidentType(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.updateIncidentType(id, body);
    }

    @PreAuthorize("hasAuthority('resource_catalogue.manage')")
    @DeleteMapping("/incident-types/{id}")
    public Map<String, Object> deleteIncidentType(@PathVariable long id) {
        return service.deleteIncidentType(id);
    }

    @GetMapping("/approval-automation")
    @PreAuthorize("hasAuthority('approval_workflows.manage')")
    public Map<String, Object> approvalAutomation() {
        return service.approvalAutomation();
    }

    @PostMapping("/approval-automation")
    @PreAuthorize("hasAuthority('approval_workflows.manage')")
    public Map<String, Object> saveApprovalAutomation(@RequestBody Map<String, Object> body) {
        return service.saveApprovalAutomation(body);
    }
}
