package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * Communication & Alert Center (compose, history, templates, analytics).
 * Paths and JSON unchanged from the former response package controller.
 */
public interface CommunicationService {

    Map<String, Object> index();

    Map<String, Object> formData();

    Map<String, Object> sendAlert(Map<String, Object> body) throws Exception;

    Map<String, Object> history();

    Map<String, Object> alertDetails(long id);

    Map<String, Object> resendFailed(long id);

    Map<String, Object> saveTemplate(Map<String, Object> body) throws Exception;

    Map<String, Object> updateTemplate(long id, Map<String, Object> body) throws Exception;

    Map<String, Object> toggleTemplate(long id);

    Map<String, Object> deleteTemplate(long id);

    Map<String, Object> previewTemplate(long id, Map<String, Object> body);

    Map<String, Object> analytics();
}
