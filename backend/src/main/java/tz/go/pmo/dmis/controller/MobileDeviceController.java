package tz.go.pmo.dmis.controller;

import jakarta.validation.Valid;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.dto.request.MobileDeviceRegistrationRequest;
import tz.go.pmo.dmis.service.MobileDeviceService;

/**
 * REST command surface for the caller's current mobile/web installation. Any authenticated user may
 * register devices they own; push delivery remains a later provider-backed step.
 */
@RestController
@RequestMapping("/v1/mobile/devices")
@RequiredArgsConstructor
public class MobileDeviceController {

    private final MobileDeviceService service;

    @PreAuthorize("isAuthenticated()")
    @PutMapping("/current")
    public ResponseEntity<Map<String, Object>> registerCurrent(
            @Valid @RequestBody MobileDeviceRegistrationRequest request) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(service.registerCurrent(request));
    }

    @PreAuthorize("isAuthenticated()")
    @DeleteMapping("/current")
    public ResponseEntity<Map<String, Object>> revokeCurrent(
            @RequestParam(name = "installation_id", required = false) String installationId,
            @RequestHeader(name = "X-Device-Installation", required = false) String installationHeader) {
        String resolved = installationId != null && !installationId.isBlank()
                ? installationId
                : installationHeader;
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(service.revokeCurrent(resolved));
    }
}
