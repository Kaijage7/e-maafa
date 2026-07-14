package tz.go.pmo.dmis.service;

import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import tz.go.pmo.dmis.dto.request.OhEventWriteRequest;

/** eGA service — paths unchanged (/v1/onehealth/events). */
public interface OneHealthEventApiService {

    Map<String, Object> index(String status, Long areaOfConcernId, Long regionId, Long stakeholderId,
                              String dateFrom, String dateTo, String eventType, String priorityLevel,
                              String search, int page);

    Map<String, Object> formData();

    ResponseEntity<Map<String, Object>> store(OhEventWriteRequest r);

    Map<String, Object> show(long id);

    Map<String, Object> comments(long id);

    Map<String, Object> addComment(long id, Map<String, Object> body);

    ResponseEntity<Map<String, Object>> edit(long id);

    ResponseEntity<Map<String, Object>> update(long id);

    ResponseEntity<Map<String, Object>> review(long id, Map<String, Object> body);

    Map<String, Object> quickView(long id);

    ResponseEntity<Map<String, Object>> storeDirective(long id, Map<String, Object> body);

    List<Map<String, Object>> districts(long regionId);

    List<Map<String, Object>> wards(long districtId);

    List<Map<String, Object>> concernItems(long areaId);

    List<Map<String, Object>> areaStakeholders(long areaId);
}
