package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * Response module System Settings hub (approval chains, resource catalogue,
 * incident types, incident-ladder automation). Paths and JSON unchanged from
 * the former response package controller.
 */
public interface ResponseSettingsService {

    Map<String, Object> approvalChains();

    Map<String, Object> approvalChain(long moduleId);

    Map<String, Object> saveChain(long moduleId, Map<String, Object> body);

    Map<String, Object> toggleModule(long moduleId);

    Map<String, Object> resources();

    Map<String, Object> createResource(Map<String, Object> body);

    Map<String, Object> updateResource(long id, Map<String, Object> body);

    Map<String, Object> deleteResource(long id);

    Map<String, Object> incidentTypes();

    Map<String, Object> createIncidentType(Map<String, Object> body);

    Map<String, Object> updateIncidentType(long id, Map<String, Object> body);

    Map<String, Object> deleteIncidentType(long id);

    Map<String, Object> approvalAutomation();

    Map<String, Object> saveApprovalAutomation(Map<String, Object> body);
}
