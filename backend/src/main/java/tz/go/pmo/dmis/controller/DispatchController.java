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
import tz.go.pmo.dmis.service.DispatchService;

/**
 * Response → Dispatch console. Thin eGA controller; logic in
 * {@link DispatchService}. Paths and JSON unchanged from the former response package.
 */
@RestController
@RequestMapping("/v1/response/dispatch")
@RequiredArgsConstructor
public class DispatchController {

    private final DispatchService service;

    @GetMapping
    public Map<String, Object> index(@RequestParam(required = false) Long incident_id) {
        return service.index(incident_id);
    }

    @GetMapping("/allocations/{id}/sources")
    public Map<String, Object> sourcesFor(@PathVariable long id) {
        return service.sourcesFor(id);
    }

    @PostMapping("/allocations/{id}/dispatch")
    @PreAuthorize("hasAuthority('resource_allocation.dispatch')")
    public Map<String, Object> dispatch(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.dispatch(id, body);
    }

    @GetMapping("/approvals")
    public Map<String, Object> approvals() {
        return service.approvals();
    }

    @PostMapping("/approvals/{id}/approve")
    @PreAuthorize("hasAuthority('resource_allocation.approve')")
    public Map<String, Object> approveDispatch(@PathVariable long id,
                                               @RequestBody(required = false) Map<String, Object> body) {
        return service.approveDispatch(id, body);
    }

    @PostMapping("/approvals/{id}/reject")
    @PreAuthorize("hasAuthority('resource_allocation.approve')")
    public Map<String, Object> rejectDispatch(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.rejectDispatch(id, body);
    }

    @PostMapping("/allocations/{id}/procurement")
    @PreAuthorize("hasAuthority('resource_allocation.dispatch')")
    public Map<String, Object> submitProcurement(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.submitProcurement(id, body);
    }

    @GetMapping("/procurement-requests")
    public Map<String, Object> procurementRequests() {
        return service.procurementRequests();
    }

    @PostMapping("/procurement/{allocationId}/approve")
    @PreAuthorize("hasAuthority('resource_allocation.approve')")
    public Map<String, Object> approveProcurement(@PathVariable long allocationId,
                                                  @RequestBody(required = false) Map<String, Object> body) {
        return service.approveProcurement(allocationId, body);
    }

    @PostMapping("/procurement/{allocationId}/deliver")
    @PreAuthorize("hasAuthority('resource_allocation.dispatch')")
    public Map<String, Object> deliverProcurement(@PathVariable long allocationId,
                                                  @RequestBody Map<String, Object> body) {
        return service.deliverProcurement(allocationId, body);
    }

    @PostMapping("/procurement/{allocationId}/cancel")
    @PreAuthorize("hasAuthority('resource_allocation.approve')")
    public Map<String, Object> cancelProcurement(@PathVariable long allocationId,
                                                 @RequestBody Map<String, Object> body) {
        return service.cancelProcurement(allocationId, body);
    }

    @GetMapping("/procurement/{allocationId}/track")
    public Map<String, Object> trackProcurement(@PathVariable long allocationId) {
        return service.trackProcurement(allocationId);
    }

    @PostMapping("/allocations/{id}/agency-request")
    @PreAuthorize("hasAuthority('resource_allocation.request')")
    public Map<String, Object> submitAgencyRequest(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.submitAgencyRequest(id, body);
    }
}
