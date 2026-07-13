package tz.go.pmo.dmis.service;

import java.util.List;
import java.util.Map;

/**
 * M&amp;E registry / value workbench — indicator catalogue, period values,
 * organization assignments. Paths/JSON unchanged for Angular.
 */
public interface MonitoringEvaluationEntryService {

    Map<String, Object> workbench(String requestedLevel, String period, String domain, String search);

    Map<String, Object> workbench(String requestedLevel, String period, String domain, String search,
                                  String institutionClass);

    List<Map<String, Object>> indicators(String requestedLevel, String domain, String search, boolean activeOnly);

    List<Map<String, Object>> targets(String requestedLevel, String search);

    List<Map<String, Object>> targets(String requestedLevel, String search, String institutionClass);

    Map<String, Object> createIndicator(Map<String, Object> req);

    Map<String, Object> updateIndicator(long id, Map<String, Object> req);

    Map<String, Object> saveValue(Map<String, Object> req);

    Map<String, Object> saveBatch(Map<String, Object> req);

    Map<String, Object> organizationIndicators(Long agencyId, Long stakeholderId);

    Map<String, Object> assignIndicatorToOrganization(Map<String, Object> req);

    Map<String, Object> removeIndicatorFromOrganization(long assignmentId);

    Map<String, Object> captureOrganizationValues(Long agencyId, Long stakeholderId, String period);
}
