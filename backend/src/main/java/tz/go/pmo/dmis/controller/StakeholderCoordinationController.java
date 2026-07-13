package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.StakeholderCoordinationService;

/**
 * Response → Stakeholder Coordination. Thin eGA controller; logic in
 * {@link StakeholderCoordinationService}. Read-only; paths and JSON unchanged.
 */
@RestController
@RequestMapping("/v1/response/stakeholder-coordination")
@RequiredArgsConstructor
public class StakeholderCoordinationController {

    private final StakeholderCoordinationService service;

    @GetMapping
    public Map<String, Object> index() {
        return service.index();
    }

    /** The full 360° footprint of one stakeholder across response, recovery and warehouse. */
    @GetMapping("/{id}")
    public Map<String, Object> show(@PathVariable long id) {
        return service.show(id);
    }
}
