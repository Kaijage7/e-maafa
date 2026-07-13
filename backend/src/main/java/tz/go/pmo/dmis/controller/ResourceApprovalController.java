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
import tz.go.pmo.dmis.service.ResourceApprovalService;

/**
 * Response → Resource Approvals. Thin eGA controller; logic in
 * {@link ResourceApprovalService}. Paths and JSON unchanged from the former response package.
 */
@RestController
@RequestMapping("/v1/response/approvals")
@RequiredArgsConstructor
public class ResourceApprovalController {

    private final ResourceApprovalService service;

    @GetMapping
    public Map<String, Object> index(@RequestParam(required = false) String search) {
        return service.index(search);
    }

    @GetMapping("/my-requests")
    public Map<String, Object> myRequests(@RequestParam(required = false) String search) {
        return service.myRequests(search);
    }

    @GetMapping("/{id}")
    public Map<String, Object> show(@PathVariable long id) {
        return service.show(id);
    }

    @PreAuthorize("hasAuthority('resource_allocation.approve')")
    @PostMapping("/{id}/approve")
    public Map<String, Object> approve(@PathVariable long id,
                                       @RequestBody(required = false) Map<String, Object> body) {
        return service.approve(id, body);
    }

    @PreAuthorize("hasAuthority('resource_allocation.approve')")
    @PostMapping("/{id}/fast-track")
    public Map<String, Object> fastTrack(@PathVariable long id,
                                         @RequestBody(required = false) Map<String, Object> body) {
        return service.fastTrack(id, body);
    }

    @PreAuthorize("hasAuthority('resource_allocation.approve')")
    @PostMapping("/{id}/reject")
    public Map<String, Object> reject(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.reject(id, body);
    }

    @PreAuthorize("hasAuthority('resource_allocation.approve')")
    @PostMapping("/{id}/rollback")
    public Map<String, Object> rollback(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.rollback(id, body);
    }

    @PreAuthorize("hasAuthority('resource_allocation.approve')")
    @PostMapping("/{id}/resubmit")
    public Map<String, Object> resubmit(@PathVariable long id) {
        return service.resubmit(id);
    }

    @PreAuthorize("hasAuthority('resource_allocation.approve')")
    @PostMapping("/{id}/update-source")
    public Map<String, Object> updateSource(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.updateSource(id, body);
    }

    @PreAuthorize("hasAuthority('resource_allocation.approve')")
    @PostMapping("/bulk-approve")
    public Map<String, Object> bulkApprove(@RequestBody Map<String, Object> body) {
        return service.bulkApprove(body);
    }
}
