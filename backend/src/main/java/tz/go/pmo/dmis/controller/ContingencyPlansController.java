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
import tz.go.pmo.dmis.service.ContingencyPlansService;

/**
 * Preparedness → Contingency Plans. Thin eGA controller; logic in {@link ContingencyPlansService}.
 * Paths and JSON unchanged from the former response package.
 */
@RestController
@RequestMapping("/v1/response/contingency-plans")
@RequiredArgsConstructor
public class ContingencyPlansController {

    private final ContingencyPlansService service;

    @GetMapping
    @PreAuthorize("hasAuthority('contingency_plans.view')")
    public Map<String, Object> index(@RequestParam(required = false) String status,
                                     @RequestParam(required = false) String hazard) {
        return service.index(status, hazard);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('contingency_plans.view')")
    public Map<String, Object> show(@PathVariable long id) {
        return service.show(id);
    }

    @PostMapping
    @PreAuthorize("hasAuthority('contingency_plans.manage')")
    public Map<String, Object> store(@RequestBody Map<String, Object> body) throws Exception {
        return service.store(body);
    }

    @PostMapping("/{id}")
    @PreAuthorize("hasAuthority('contingency_plans.manage')")
    public Map<String, Object> update(@PathVariable long id, @RequestBody Map<String, Object> body) throws Exception {
        return service.update(id, body);
    }

    @PostMapping("/{id}/submit")
    @PreAuthorize("hasAuthority('contingency_plans.manage')")
    public Map<String, Object> submit(@PathVariable long id) {
        return service.submit(id);
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAuthority('contingency_plans.approve')")
    public Map<String, Object> approve(@PathVariable long id) {
        return service.approve(id);
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAuthority('contingency_plans.approve')")
    public Map<String, Object> reject(@PathVariable long id) {
        return service.reject(id);
    }

    @PostMapping("/{id}/archive")
    @PreAuthorize("hasAuthority('contingency_plans.approve')")
    public Map<String, Object> archive(@PathVariable long id) {
        return service.archive(id);
    }
}
