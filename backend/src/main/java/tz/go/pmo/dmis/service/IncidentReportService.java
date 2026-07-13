package tz.go.pmo.dmis.service;

import java.util.Map;

/** Analytical incident report for Reports &amp; Analytics. Paths/JSON unchanged. */
public interface IncidentReportService {

    Map<String, Object> index(String startDate, String endDate, String status, String severity, String region);
}
