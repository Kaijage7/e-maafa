package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * EW boundary monitoring reports (focal-point panel). Paths and JSON unchanged
 * from the former {@code ew.EwBoundaryController}: GET/POST {@code /ew/monitoring/reports}.
 * Query params {@code bulletin_number} and {@code warning_code} are productive filters
 * (blank = unfiltered; nonsense = empty list, not the full set).
 */
public interface EwBoundaryService {

    Map<String, Object> reports(String bulletinNumber, String warningCode);

    Map<String, Object> storeReport(Map<String, Object> body);
}
