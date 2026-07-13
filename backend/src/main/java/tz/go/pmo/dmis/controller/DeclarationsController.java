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
import tz.go.pmo.dmis.service.DeclarationsService;

/**
 * Response → Disaster Declarations (DM Act 2022 ss.32–33). Thin eGA controller;
 * logic in {@link DeclarationsService}. Paths and JSON unchanged from the former response package.
 */
@RestController
@RequestMapping("/v1/response/declarations")
@RequiredArgsConstructor
public class DeclarationsController {

    private final DeclarationsService service;

    @GetMapping
    public Map<String, Object> index() {
        return service.index();
    }

    @GetMapping("/{id}")
    public Map<String, Object> show(@PathVariable long id) {
        return service.show(id);
    }

    @PreAuthorize("hasAuthority('disaster_declarations.propose')")
    @PostMapping
    public Map<String, Object> propose(@RequestBody Map<String, Object> body) {
        return service.propose(body);
    }

    @PreAuthorize("hasAuthority('disaster_declarations.review')")
    @PostMapping("/{id}/technical-review")
    public Map<String, Object> technicalReview(@PathVariable long id,
                                               @RequestBody(required = false) Map<String, Object> body) {
        return service.technicalReview(id, body);
    }

    @PreAuthorize("hasAuthority('disaster_declarations.endorse')")
    @PostMapping("/{id}/endorse")
    public Map<String, Object> endorse(@PathVariable long id,
                                       @RequestBody(required = false) Map<String, Object> body) {
        return service.endorse(id, body);
    }

    @PreAuthorize("hasAuthority('disaster_declarations.declare')")
    @PostMapping("/{id}/declare")
    public Map<String, Object> declare(@PathVariable long id,
                                       @RequestBody(required = false) Map<String, Object> body) {
        return service.declare(id, body);
    }

    @PreAuthorize("hasAuthority('disaster_declarations.declare')")
    @PostMapping("/{id}/extend")
    public Map<String, Object> extend(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.extend(id, body);
    }

    @PreAuthorize("hasAuthority('disaster_declarations.declare')")
    @PostMapping("/{id}/revoke")
    public Map<String, Object> revoke(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.revoke(id, body);
    }

    @GetMapping("/committees")
    public Map<String, Object> committees() {
        return service.committees();
    }
}
