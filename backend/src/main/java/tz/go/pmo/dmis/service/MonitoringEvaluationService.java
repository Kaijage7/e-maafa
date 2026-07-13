package tz.go.pmo.dmis.service;

import java.util.List;
import java.util.Map;

/**
 * Monitoring &amp; Evaluation command dashboard — live operational evidence
 * (budgets, readiness, framework aims). Paths/JSON unchanged for Angular.
 */
public interface MonitoringEvaluationService {

    Map<String, Object> dashboard();

    List<Map<String, Object>> frameworkAimsPublic();
}
