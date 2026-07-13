package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.ResourceAllocationService;

/**
 * Response → Resource Allocations. Thin eGA controller; logic in
 * {@link ResourceAllocationService}. Paths and JSON unchanged from the former response package.
 */
@RestController
@RequestMapping("/v1/response/allocations")
@RequiredArgsConstructor
public class ResourceAllocationController {

    private final ResourceAllocationService service;

    @GetMapping
    public Map<String, Object> index() {
        return service.index();
    }

    @GetMapping("/form-data")
    public Map<String, Object> formData() {
        return service.formData();
    }

    @PreAuthorize("hasAuthority('resource_allocation.request')")
    @PostMapping
    public ResponseEntity<Map<String, Object>> store(@RequestBody Map<String, Object> body) {
        Map<String, Object> result = service.store(body);
        if (result.containsKey("errors")) {
            return ResponseEntity.unprocessableEntity().body(result);
        }
        return ResponseEntity.ok(result);
    }

    @PreAuthorize("hasAuthority('resource_allocation.request')")
    @PostMapping("/{id}/forward")
    public Map<String, Object> forward(@PathVariable long id,
                                       @RequestBody(required = false) Map<String, Object> body) {
        return service.forward(id, body);
    }

    @PreAuthorize("hasAuthority('resource_allocation.approve')")
    @PostMapping("/{id}/approve")
    public Map<String, Object> approve(@PathVariable long id) {
        return service.approve(id);
    }

    @PreAuthorize("hasAuthority('resource_allocation.approve')")
    @PostMapping("/{id}/reject")
    public Map<String, Object> reject(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.reject(id, body);
    }

    @PreAuthorize("hasAuthority('resource_allocation.dispatch')")
    @PostMapping("/{id}/status")
    public Map<String, Object> updateStatus(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.updateStatus(id, body);
    }

    @GetMapping("/{id}/track")
    public Map<String, Object> track(@PathVariable long id) {
        return service.track(id);
    }
}
