package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.ChannelTestService;

/**
 * Channel diagnostics (test SMS / email). Thin eGA controller.
 * Path {@code /v1/notifications/test} unchanged. Logic in {@link ChannelTestService}.
 */
@RestController
@RequestMapping("/v1/notifications/test")
@RequiredArgsConstructor
public class ChannelTestController {

    private final ChannelTestService service;

    @PreAuthorize("hasAuthority('communication_and_alerts.send')")
    @PostMapping("/sms")
    public Map<String, Object> testSms(@RequestBody Map<String, Object> body) {
        return service.testSms(body);
    }

    @PreAuthorize("hasAuthority('communication_and_alerts.send')")
    @PostMapping("/email")
    public Map<String, Object> testEmail(@RequestBody Map<String, Object> body) {
        return service.testEmail(body);
    }
}
