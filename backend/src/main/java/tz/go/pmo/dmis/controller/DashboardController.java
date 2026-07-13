package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.DashboardService;

/**
 * Response → Dashboard + EOCC board. Thin eGA controller; logic in
 * {@link DashboardService}. Paths and JSON unchanged from the former response package.
 */
@RestController
@RequestMapping("/v1/response")
@RequiredArgsConstructor
public class DashboardController {

    private final DashboardService service;

    /** Response overview dashboard (stat cards, feeds, type/region rollups, map markers). */
    @PreAuthorize("hasAuthority('incidents.view')")
    @GetMapping("/dashboard")
    public Map<String, Object> dashboard() {
        return service.dashboard();
    }

    /** The merged EOCC live board payload (also the 30-second poll). */
    @PreAuthorize("hasAuthority('command_post.view')")
    @GetMapping("/eocc")
    public Map<String, Object> eocc() {
        return service.eocc();
    }

    /**
     * EOCC Quick Action "Activate Emergency Protocol" — opens a response activation
     * for an incident (Command Center coordination).
     */
    @PreAuthorize("hasAuthority('command_post.activate')")
    @PostMapping("/eocc/activate")
    public Map<String, Object> activate(@RequestBody Map<String, Object> body) {
        return service.activate(body);
    }
}
