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
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import tz.go.pmo.dmis.service.OneHealthDisseminationService;

/**
 * One Health dissemination — thin eGA controller. Paths under {@code /v1/onehealth} unchanged
 * (shared base with action tracking). Dual-track create, approve, acknowledge, resend, recipients.
 */
@RestController
@RequestMapping("/v1/onehealth")
@RequiredArgsConstructor
public class OneHealthDisseminationController {

    private static final String DISSEMINATION_DESK =
            "hasAnyAuthority('one_health.disseminate','one_health.approve','one_health.manage')";

    private final OneHealthDisseminationService service;

    @GetMapping("/disseminations")
    @PreAuthorize(DISSEMINATION_DESK)
    public Map<String, Object> index(@RequestParam(name = "dissemination_type", required = false) String type,
                                     @RequestParam(name = "approval_status", required = false) String approvalStatus,
                                     @RequestParam(required = false) String status,
                                     @RequestParam(defaultValue = "1") int page) {
        return service.index(type, approvalStatus, status, page);
    }

    @GetMapping("/disseminations/{id}")
    @PreAuthorize(DISSEMINATION_DESK)
    public Map<String, Object> show(@PathVariable long id) {
        return service.show(id);
    }

    @PreAuthorize("hasAuthority('one_health.disseminate')")
    @PostMapping(value = "/events/{eventId}/disseminations/stakeholder",
            consumes = {MediaType.MULTIPART_FORM_DATA_VALUE, MediaType.APPLICATION_JSON_VALUE})
    public ResponseEntity<Map<String, Object>> storeStakeholder(@PathVariable long eventId,
            @RequestParam Map<String, String> form,
            @RequestParam(name = "stakeholder_ids", required = false) List<Long> stakeholderIds,
            @RequestParam(name = "channels", required = false) List<String> channels,
            @RequestPart(name = "recipient_file", required = false) MultipartFile recipientFile) {
        return service.storeStakeholder(eventId, form, stakeholderIds, channels, recipientFile);
    }

    @PreAuthorize("hasAuthority('one_health.disseminate')")
    @PostMapping(value = "/events/{eventId}/disseminations/public",
            consumes = {MediaType.MULTIPART_FORM_DATA_VALUE, MediaType.APPLICATION_JSON_VALUE})
    public ResponseEntity<Map<String, Object>> storePublic(@PathVariable long eventId,
            @RequestParam Map<String, String> form,
            @RequestParam(name = "target_audience", required = false) List<String> targetAudience,
            @RequestParam(name = "channels", required = false) List<String> channels,
            @RequestPart(name = "recipient_file", required = false) MultipartFile recipientFile) {
        return service.storePublic(eventId, form, targetAudience, channels, recipientFile);
    }

    @PreAuthorize("hasAuthority('one_health.approve')")
    @PostMapping("/disseminations/{id}/approve")
    public ResponseEntity<Map<String, Object>> approve(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.approve(id, body);
    }

    @PreAuthorize("hasAuthority('one_health.acknowledge')")
    @PostMapping("/disseminations/{id}/acknowledge")
    public ResponseEntity<Map<String, Object>> acknowledge(@PathVariable long id) {
        return service.acknowledge(id);
    }

    @PreAuthorize("hasAuthority('one_health.manage')")
    @PostMapping("/disseminations/{id}/resend")
    public Map<String, Object> resend(@PathVariable long id) {
        return service.resend(id);
    }

    @GetMapping("/disseminations/recipients")
    @PreAuthorize("hasAuthority('one_health.disseminate')")
    public Map<String, Object> recipients(@RequestParam(name = "event_id") long eventId,
                                          @RequestParam String type) {
        return service.recipients(eventId, type);
    }
}
