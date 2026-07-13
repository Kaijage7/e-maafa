package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * Go-live readiness and ops honesty board. Paths/JSON unchanged ({@code /v1/ops/*}).
 */
public interface GoLiveOpsService {

    Map<String, Object> readiness();

    Map<String, Object> integrationRegistry();

    Map<String, Object> integritySummary();

    Map<String, Object> exportIfmisCommitments(String status, Integer days);

    Map<String, Object> resolveGeo(String name);
}
