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
import tz.go.pmo.dmis.service.AnticipatoryPlansService;

/**
 * Preparedness → Anticipatory Action Plans. Thin eGA controller; logic in
 * {@link AnticipatoryPlansService}. Paths and JSON unchanged from the former response package.
 */
@RestController
@RequestMapping("/v1/response/anticipatory-plans")
@RequiredArgsConstructor
public class AnticipatoryPlansController {

    private final AnticipatoryPlansService service;

    @GetMapping
    @PreAuthorize("hasAuthority('anticipatory_action_plans.view')")
    public Map<String, Object> index(@RequestParam(required = false) String status,
                                     @RequestParam(required = false) String hazard,
                                     @RequestParam(required = false) String search) {
        return service.index(status, hazard, search);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('anticipatory_action_plans.view')")
    public Map<String, Object> show(@PathVariable long id) {
        return service.show(id);
    }

    @PreAuthorize("hasAuthority('anticipatory_action_plans.create')")
    @PostMapping
    public Map<String, Object> store(@RequestBody Map<String, Object> body) throws Exception {
        return service.store(body);
    }

    @PreAuthorize("hasAuthority('anticipatory_action_plans.create')")
    @PostMapping("/{id}")
    public Map<String, Object> update(@PathVariable long id, @RequestBody Map<String, Object> body) throws Exception {
        return service.update(id, body);
    }

    @PreAuthorize("hasAuthority('anticipatory_action_plans.create')")
    @PostMapping("/{id}/submit")
    public Map<String, Object> submit(@PathVariable long id) {
        return service.submit(id);
    }

    @PreAuthorize("hasAuthority('anticipatory_action_plans.approve')")
    @PostMapping("/{id}/approve")
    public Map<String, Object> approve(@PathVariable long id) {
        return service.approve(id);
    }

    @PreAuthorize("hasAuthority('anticipatory_action_plans.approve')")
    @PostMapping("/{id}/reject")
    public Map<String, Object> reject(@PathVariable long id,
                                      @RequestBody(required = false) Map<String, Object> body) {
        return service.reject(id, body);
    }

    @PreAuthorize("hasAuthority('anticipatory_action_plans.approve')")
    @PostMapping("/{id}/archive")
    public Map<String, Object> archive(@PathVariable long id) {
        return service.archive(id);
    }
}
