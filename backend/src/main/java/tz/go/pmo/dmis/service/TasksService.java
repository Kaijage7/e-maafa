package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * Incident task board, calendar, create/assign/status. Paths and JSON unchanged
 * from the former response package controller.
 */
public interface TasksService {

    Map<String, Object> index(String status, Boolean mine);

    Map<String, Object> calendar();

    Map<String, Object> formData(Long incidentId);

    Map<String, Object> store(Map<String, Object> body);

    Map<String, Object> show(long id);

    Map<String, Object> update(long id, Map<String, Object> body);

    Map<String, Object> assign(long id, Map<String, Object> body);

    Map<String, Object> updateStatus(long id, Map<String, Object> body);
}
