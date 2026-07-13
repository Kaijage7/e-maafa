package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.CommunicationOverviewService;

/**
 * Communication Center overview. Thin eGA controller. Path {@code /v1/communication} unchanged.
 * Logic in {@link CommunicationOverviewService}. Shared {@code AudienceService} stays in notification/.
 */
@RestController
@RequestMapping("/v1/communication")
@RequiredArgsConstructor
public class CommunicationOverviewController {

    private final CommunicationOverviewService service;

    @PreAuthorize("hasAuthority('communication_and_alerts.view')")
    @GetMapping("/audiences")
    public Map<String, Object> audiences() {
        return service.audiences();
    }

    @PreAuthorize("hasAuthority('communication_and_alerts.view')")
    @GetMapping("/overview")
    public Map<String, Object> overview(@RequestParam(defaultValue = "month") String range) {
        return service.overview(range);
    }
}
