package tz.go.pmo.dmis.service;

import java.util.Map;
import org.springframework.http.ResponseEntity;

/** eGA service — paths unchanged (/v1/onehealth/directives). */
public interface OneHealthDirectiveService {

    Map<String, Object> index(String status, String priority, Long eventId,
                              String dateFrom, String dateTo, String search,
                              String filter, int page);

    Map<String, Object> show(long id);

    ResponseEntity<Map<String, Object>> update(long id, Map<String, Object> body);

    ResponseEntity<Map<String, Object>> acknowledge(long id, Map<String, Object> body);

    Map<String, Object> escalate(long id);

    ResponseEntity<Map<String, Object>> respond(long id, Map<String, Object> body);

    Map<String, Object> implementationHistory(long id);
}
