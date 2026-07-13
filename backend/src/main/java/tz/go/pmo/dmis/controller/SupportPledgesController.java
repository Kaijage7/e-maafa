package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.SupportPledgesService;

/**
 * Response → Support needs / pledges. Thin eGA controller; logic in {@link SupportPledgesService}.
 * Paths and JSON unchanged from the former response package.
 */
@RestController
@RequestMapping("/v1/response/support")
@RequiredArgsConstructor
public class SupportPledgesController {

    private final SupportPledgesService service;

    @GetMapping("/needs")
    @PreAuthorize("hasAnyAuthority('resource_allocation.view','stakeholder_portal.donate')")
    public Map<String, Object> needs() {
        return service.needs();
    }

    @PostMapping("/pledges")
    @PreAuthorize("hasAnyAuthority('resource_allocation.request','stakeholder_portal.donate')")
    public Map<String, Object> pledge(@RequestBody Map<String, Object> body) {
        return service.pledge(body);
    }

    @GetMapping("/pledges")
    @PreAuthorize("hasAnyAuthority('resource_allocation.view','stakeholder_portal.donate')")
    public Map<String, Object> pledges() {
        return service.pledges();
    }

    @PostMapping("/pledges/{id}/accept")
    @PreAuthorize("hasAuthority('resource_allocation.approve')")
    public Map<String, Object> accept(@PathVariable long id,
                                      @RequestBody(required = false) Map<String, Object> body) {
        return service.accept(id, body);
    }

    @PostMapping("/pledges/{id}/decline")
    @PreAuthorize("hasAuthority('resource_allocation.approve')")
    public Map<String, Object> decline(@PathVariable long id,
                                       @RequestBody(required = false) Map<String, Object> body) {
        return service.decline(id, body);
    }
}
