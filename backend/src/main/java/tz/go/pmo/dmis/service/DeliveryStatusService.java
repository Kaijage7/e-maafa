package tz.go.pmo.dmis.service;

import java.util.Map;

/** Inbound SMS DLR webhook processing. Paths/JSON unchanged. */
public interface DeliveryStatusService {

    Map<String, Object> smsDlr(Map<String, Object> body, String headerSecret);
}
