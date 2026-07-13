package tz.go.pmo.dmis.service;

import java.util.Map;

/** Resource allocation analytical report. Paths/JSON unchanged. */
public interface ResourceReportService {

    Map<String, Object> index(String startDate, String endDate);
}
