package tz.go.pmo.dmis.service;

import java.util.Map;
import tz.go.pmo.dmis.dto.request.AlertSubscriptionWriteRequest;
import tz.go.pmo.dmis.dto.response.AlertSubscriptionResponse;

/** Alert subscription registry (Preparedness). */
public interface AlertSubscriptionService {

    AlertSubscriptionResponse index();

    Map<String, Object> create(AlertSubscriptionWriteRequest request);

    Map<String, Object> detail(long id);

    Map<String, Object> update(long id, AlertSubscriptionWriteRequest request);
}
