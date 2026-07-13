package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.DeliveryStatusService;

/**
 * Inbound SMS delivery-status webhooks. Thin eGA controller.
 * Paths {@code /v1/webhooks/mgov/dlr} and {@code /v1/webhooks/sms/dlr} unchanged (public + secret).
 * Logic in {@link DeliveryStatusService}.
 */
@RestController
@RequestMapping("/v1/webhooks")
@RequiredArgsConstructor
public class DeliveryStatusController {

    private final DeliveryStatusService service;

    @PostMapping({"/mgov/dlr", "/sms/dlr"})
    public Map<String, Object> smsDlr(@RequestBody(required = false) Map<String, Object> body,
                                      @RequestHeader(value = "X-MGov-Dlr-Secret", required = false) String headerSecret) {
        return service.smsDlr(body, headerSecret);
    }
}
