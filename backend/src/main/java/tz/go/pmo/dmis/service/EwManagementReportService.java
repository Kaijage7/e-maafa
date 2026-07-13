package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * Early Warning Management analytics report.
 * Path {@code GET /v1/reports/early-warnings} unchanged.
 * Productive query params {@code from} and {@code to} (yyyy-MM-dd); invalid → full-range fallback.
 * Area officers scoped to their region; stakeholders denied.
 */
public interface EwManagementReportService {

    Map<String, Object> analysis(String from, String to);
}
