package tz.go.pmo.dmis.controller;

import jakarta.validation.Valid;
import java.net.URI;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.security.Authz;
import tz.go.pmo.dmis.dto.request.MobileIncidentCreateRequest;
import tz.go.pmo.dmis.service.MobileIncidentCommandService;

/** REST command endpoint for durable mobile/offline incident queues. */
@RestController
@RequestMapping("/v1/mobile/incidents")
@RequiredArgsConstructor
public class MobileIncidentCommandController {

    private final MobileIncidentCommandService service;

    @PreAuthorize(Authz.PERM_INCIDENT_CREATE)
    @PostMapping
    public ResponseEntity<Map<String, Object>> create(
            @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey,
            @Valid @RequestBody MobileIncidentCreateRequest request) {
        MobileIncidentCommandService.CommandResult result = service.createIncident(idempotencyKey, request);
        ResponseEntity.BodyBuilder response = ResponseEntity.status(result.httpStatus())
                .header(HttpHeaders.CACHE_CONTROL, "no-store");
        if (result.resourceId() != null) {
            response.location(URI.create("/api/v1/response/incidents/" + result.resourceId()));
        }
        return response.body(result.body());
    }
}
