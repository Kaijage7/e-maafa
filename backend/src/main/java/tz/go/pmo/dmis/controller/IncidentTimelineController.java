package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.security.Authz;
import tz.go.pmo.dmis.service.IncidentTimelineService;

/**
 * Response → Incident operations timeline. Thin eGA controller; logic in
 * {@link IncidentTimelineService}. Path and JSON unchanged from the former response package.
 */
@RestController
@RequestMapping("/v1/response/incidents")
@RequiredArgsConstructor
public class IncidentTimelineController {

    private final IncidentTimelineService service;

    @GetMapping("/{id}/ops-timeline")
    @PreAuthorize(Authz.PERM_INCIDENT_VIEW)
    public Map<String, Object> opsTimeline(@PathVariable long id,
                                           @RequestParam(required = false) String source,
                                           @RequestParam(defaultValue = "100") int limit) {
        return service.opsTimeline(id, source, limit);
    }
}
