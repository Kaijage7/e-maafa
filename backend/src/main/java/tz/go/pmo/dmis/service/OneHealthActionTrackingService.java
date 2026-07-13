package tz.go.pmo.dmis.service;

import java.util.Map;
import org.springframework.http.ResponseEntity;

/** eGA service — paths unchanged under /v1/onehealth (actions + close/archive). */
public interface OneHealthActionTrackingService {

    Map<String, Object> index(long eventId);

    ResponseEntity<Map<String, Object>> store(long eventId, Map<String, Object> body);

    ResponseEntity<Map<String, Object>> update(long id, Map<String, Object> body);

    ResponseEntity<Map<String, Object>> updateProgress(long id, Map<String, Object> body);

    ResponseEntity<Map<String, Object>> closeEvent(long eventId, Map<String, Object> body);

    ResponseEntity<Map<String, Object>> archiveEvent(long eventId);
}
