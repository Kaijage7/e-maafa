package tz.go.pmo.dmis.service;

import java.util.Map;

/** Mitigation module dashboard aggregates. Path {@code GET /v1/mitigation/dashboard} unchanged. */
public interface MitigationDashboardService {
    Map<String, Object> index();
}
