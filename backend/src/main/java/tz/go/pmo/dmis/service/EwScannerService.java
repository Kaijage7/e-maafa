package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * Disaster Scanner / EW Monitoring bus.
 * Paths under {@code /v1/ew/scanner} unchanged.
 * <p>Detections filters are productive AND: status, hazard, source, severity, reliability,
 * region, q (title/summary), days (detected within N days). Blank ignored; nonsense → empty list.
 * Stats are dual-layer: {@code stats} match the same WHERE as the list; {@code global} is unfiltered.
 * {@code matched} is the full match count before {@code limit}.
 */
public interface EwScannerService {

    Map<String, Object> scan(int days);

    Map<String, Object> detections(String status, String hazard, String source, String severity,
                                   String reliability, String region, String q, Integer days, int limit);

    Map<String, Object> showDetection(long id);

    Map<String, Object> manualReport(Map<String, Object> body);

    Map<String, Object> dismiss(long id);

    Map<String, Object> dispatch(long id, Map<String, Object> body);

    Map<String, Object> entityTaskings(String agency, String status);

    Map<String, Object> acknowledgeTasking(long id);

    Map<String, Object> respondTasking(long id, Map<String, Object> body);

    Map<String, Object> reviewTasking(long id, Map<String, Object> body);
}
