package tz.go.pmo.dmis.service;

import java.util.Map;
import tz.go.pmo.dmis.dto.request.MobileDeviceRegistrationRequest;

/**
 * Installation registry for authenticated mobile/web clients. Stores only addressing metadata for
 * optional push wake-ups; durable recovery remains the REST cursor contract.
 */
public interface MobileDeviceService {

    Map<String, Object> registerCurrent(MobileDeviceRegistrationRequest request);

    Map<String, Object> revokeCurrent(String installationId);
}
