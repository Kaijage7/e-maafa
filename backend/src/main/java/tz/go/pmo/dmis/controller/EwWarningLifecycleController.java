package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import tz.go.pmo.dmis.service.EwWarningLifecycleService;

/**
 * EW warning lifecycle — approve, publish, map, manual bulletin.
 * Thin eGA controller; logic in {@link EwWarningLifecycleService}.
 * Base path {@code /v1/ew/warnings} coexists with GET index ({@code EwController}).
 */
@RestController
@RequestMapping("/v1/ew/warnings")
@PreAuthorize("hasAuthority('early_warning.approve')")
@RequiredArgsConstructor
public class EwWarningLifecycleController {

    private final EwWarningLifecycleService service;

    @PostMapping("/{id}/approve")
    public Map<String, Object> approve(@PathVariable long id,
                                       @RequestBody(required = false) Map<String, Object> body) {
        return service.approve(id, body);
    }

    @PostMapping("/{id}/map")
    public Map<String, Object> setOnMap(@PathVariable long id,
                                        @RequestBody(required = false) Map<String, Object> body) {
        return service.setOnMap(id, body);
    }

    @PostMapping("/{id}/bulletin")
    public Map<String, Object> uploadBulletin(@PathVariable long id,
                                              @RequestParam("pdf") MultipartFile pdf,
                                              @RequestParam(value = "description", required = false) String description)
            throws Exception {
        return service.uploadBulletin(id, pdf, description);
    }

    @PostMapping("/{id}/publish")
    public Map<String, Object> publish(@PathVariable long id) {
        return service.publish(id);
    }
}
