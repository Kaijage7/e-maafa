package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * Resource allocation request queues, form-data, store, forward/approve/reject,
 * status lifecycle, and track. Paths and JSON unchanged from the former response
 * package. ApprovalWorkflowEngine + DispatchSupportService retained as transitional hubs.
 */
public interface ResourceAllocationService {

    Map<String, Object> index();

    Map<String, Object> formData();

    /** Success map, or validation failure map with {@code errors} (controller returns 422). */
    Map<String, Object> store(Map<String, Object> body);

    Map<String, Object> forward(long id, Map<String, Object> body);

    Map<String, Object> approve(long id);

    Map<String, Object> reject(long id, Map<String, Object> body);

    Map<String, Object> updateStatus(long id, Map<String, Object> body);

    Map<String, Object> track(long id);
}
