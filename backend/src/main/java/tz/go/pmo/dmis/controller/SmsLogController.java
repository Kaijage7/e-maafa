package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.SmsLogService;

/** SMS delivery log + compose. Thin eGA controller. Path {@code /v1/content/sms-logs} unchanged. */
@RestController
@RequestMapping("/v1/content/sms-logs")
@RequiredArgsConstructor
public class SmsLogController {

    private final SmsLogService service;

    @GetMapping
    public Map<String, Object> index(@RequestParam(required = false) String status,
                                     @RequestParam(required = false) String search,
                                     @RequestParam(required = false) String from,
                                     @RequestParam(required = false) String to) {
        return service.index(status, search, from, to);
    }

    @PostMapping("/send")
    @PreAuthorize("hasAuthority('communication_and_alerts.send')")
    public Map<String, Object> send(@RequestBody Map<String, Object> body) {
        return service.send(body);
    }
}
