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
import tz.go.pmo.dmis.common.security.Authz;
import tz.go.pmo.dmis.service.PublicReportsService;

/**
 * Response → Public Reports triage. Thin eGA controller; logic in {@link PublicReportsService}.
 * Paths and JSON unchanged from the former response package.
 */
@RestController
@RequestMapping("/v1/response/public-reports")
@RequiredArgsConstructor
public class PublicReportsController {

    private final PublicReportsService service;

    @GetMapping
    @PreAuthorize("hasAuthority('incidents.view')")
    public Map<String, Object> index(@RequestParam(required = false) String status,
                                     @RequestParam(required = false) String search) {
        return service.index(status, search);
    }

    @PostMapping("/{id}/review")
    @PreAuthorize(Authz.PERM_INCIDENT_UPDATE)
    public Map<String, Object> review(@PathVariable long id,
                                      @RequestBody(required = false) Map<String, Object> body) {
        return service.review(id, body);
    }

    @PostMapping("/{id}/dismiss")
    @PreAuthorize(Authz.PERM_INCIDENT_APPROVE)
    public Map<String, Object> dismiss(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.dismiss(id, body);
    }

    @PostMapping("/{id}/convert")
    @PreAuthorize(Authz.PERM_INCIDENT_APPROVE)
    public Map<String, Object> convert(@PathVariable long id,
                                       @RequestBody(required = false) Map<String, Object> body) {
        return service.convert(id, body);
    }
}
