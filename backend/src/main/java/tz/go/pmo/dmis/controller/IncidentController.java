package tz.go.pmo.dmis.controller;

import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import tz.go.pmo.dmis.common.security.Authz;
import tz.go.pmo.dmis.service.IncidentService;

/**
 * Response → Incidents registry & workflow. Thin eGA controller; logic in
 * {@link IncidentService}. Paths and JSON unchanged. Coexists on
 * {@code /v1/response/incidents} with {@link IncidentTimelineController}.
 */
@RestController
@RequestMapping("/v1/response/incidents")
@RequiredArgsConstructor
public class IncidentController {

    private final IncidentService service;

    @GetMapping
    public Map<String, Object> index(@RequestParam(name = "status_filter", required = false) String statusFilter,
                                     @RequestParam(name = "hazard_filter", required = false) Long hazardFilter,
                                     @RequestParam(name = "workflow_filter", required = false) String workflowFilter,
                                     @RequestParam(defaultValue = "1") int page) {
        return service.index(statusFilter, hazardFilter, workflowFilter, page);
    }

    @GetMapping("/form-data")
    public Map<String, Object> formData() {
        return service.formData();
    }

    @PreAuthorize(Authz.PERM_INCIDENT_CREATE)
    @PostMapping(consumes = {MediaType.MULTIPART_FORM_DATA_VALUE, MediaType.APPLICATION_FORM_URLENCODED_VALUE})
    public ResponseEntity<Map<String, Object>> store(@RequestParam Map<String, String> form,
            @RequestParam(name = "infrastructure_damage", required = false) List<String> infrastructureDamage,
            @RequestParam(name = "emergency_needs", required = false) List<String> emergencyNeeds,
            @RequestPart(name = "photos", required = false) List<MultipartFile> photos,
            @RequestPart(name = "video", required = false) MultipartFile video,
            @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey) {
        Map<String, Object> result = service.store(
                form, infrastructureDamage, emergencyNeeds, photos, video, idempotencyKey);
        if (result.containsKey("errors")) {
            return ResponseEntity.unprocessableEntity().body(result);
        }
        return ResponseEntity.ok(result);
    }

    @PreAuthorize(Authz.PERM_INCIDENT_UPDATE)
    @PutMapping(value = "/{id}", consumes = {MediaType.MULTIPART_FORM_DATA_VALUE, MediaType.APPLICATION_FORM_URLENCODED_VALUE})
    public ResponseEntity<Map<String, Object>> update(@PathVariable long id,
            @RequestParam Map<String, String> form,
            @RequestParam(name = "infrastructure_damage", required = false) List<String> infrastructureDamage,
            @RequestParam(name = "emergency_needs", required = false) List<String> emergencyNeeds,
            @RequestParam(name = "remove_photos", required = false) List<String> removePhotos,
            @RequestPart(name = "photos", required = false) List<MultipartFile> photos,
            @RequestPart(name = "video", required = false) MultipartFile video) {
        Map<String, Object> result = service.update(id, form, infrastructureDamage, emergencyNeeds,
                removePhotos, photos, video);
        if (result.containsKey("errors")) {
            return ResponseEntity.unprocessableEntity().body(result);
        }
        return ResponseEntity.ok(result);
    }

    @GetMapping("/{id}")
    public Map<String, Object> show(@PathVariable long id) {
        return service.show(id);
    }

    @PreAuthorize(Authz.PERM_INCIDENT_UPDATE)
    @PostMapping("/{id}/updates")
    public ResponseEntity<Map<String, Object>> storeUpdate(@PathVariable long id, @RequestBody Map<String, Object> body) {
        Map<String, Object> result = service.storeUpdate(id, body);
        if (result.containsKey("errors")) {
            return ResponseEntity.unprocessableEntity().body(result);
        }
        return ResponseEntity.ok(result);
    }

    @PreAuthorize(Authz.PERM_INCIDENT_CREATE)
    @PostMapping("/{id}/submit")
    public Map<String, Object> submit(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        return service.submit(id, body);
    }

    @PreAuthorize(Authz.PERM_INCIDENT_APPROVE)
    @PostMapping("/{id}/approve")
    public Map<String, Object> approve(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        return service.approve(id, body);
    }

    @PreAuthorize(Authz.PERM_INCIDENT_APPROVE)
    @PostMapping("/{id}/rollback")
    public Map<String, Object> rollback(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.rollback(id, body);
    }

    @PreAuthorize(Authz.PERM_INCIDENT_APPROVE)
    @PostMapping("/{id}/resubmit")
    public Map<String, Object> resubmit(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        return service.resubmit(id, body);
    }

    @PreAuthorize(Authz.PERM_INCIDENT_APPROVE)
    @PostMapping("/{id}/forward")
    public Map<String, Object> forward(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.forward(id, body);
    }

    @PreAuthorize(Authz.PERM_INCIDENT_COMMENT)
    @PostMapping("/{id}/comments")
    public Map<String, Object> addComment(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.addComment(id, body);
    }

    @PreAuthorize(Authz.PERM_INCIDENT_UPDATE)
    @PostMapping("/{id}/escalate")
    public Map<String, Object> escalate(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        return service.escalate(id, body);
    }

    @PreAuthorize(Authz.PERM_INCIDENT_UPDATE)
    @PostMapping("/{id}/verify")
    public Map<String, Object> verify(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        return service.verify(id, body);
    }

    @PreAuthorize(Authz.PERM_INCIDENT_CLOSE)
    @PostMapping("/{id}/close")
    public Map<String, Object> close(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        return service.close(id, body);
    }

    @PreAuthorize(Authz.PERM_INCIDENT_APPROVE)
    @PostMapping("/{id}/close-rumor")
    public Map<String, Object> closeRumor(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        return service.closeRumor(id, body);
    }

    @PreAuthorize(Authz.PERM_INCIDENT_APPROVE)
    @PostMapping("/{id}/resolve")
    public Map<String, Object> resolve(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        return service.resolve(id, body);
    }

    @PreAuthorize("hasAuthority('incidents.publish')")
    @PostMapping("/{id}/push-map")
    public Map<String, Object> pushMap(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        return service.pushMap(id, body);
    }

    @PreAuthorize("hasAuthority('incidents.publish')")
    @PostMapping("/{id}/push-news")
    public Map<String, Object> pushNews(@PathVariable long id) {
        return service.pushNews(id);
    }

    @PreAuthorize("hasAuthority('incidents.publish')")
    @PostMapping("/{id}/remove-news")
    public Map<String, Object> removeNews(@PathVariable long id) {
        return service.removeNews(id);
    }

    @PreAuthorize(Authz.PERM_INCIDENT_UPDATE)
    @PostMapping("/{id}/history-reports")
    public Map<String, Object> storeHistoryReport(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.storeHistoryReport(id, body);
    }
}
