package tz.go.pmo.dmis.service;

import java.util.Map;
import tz.go.pmo.dmis.dto.request.MobileIncidentCreateRequest;

/** Retry-safe mobile command facade over the existing incident domain service. */
public interface MobileIncidentCommandService {

    CommandResult createIncident(String idempotencyKey, MobileIncidentCreateRequest request);

    record CommandResult(int httpStatus, Map<String, Object> body, Long resourceId) {
    }
}
