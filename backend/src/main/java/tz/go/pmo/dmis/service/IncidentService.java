package tz.go.pmo.dmis.service;

import java.util.List;
import java.util.Map;
import org.springframework.web.multipart.MultipartFile;

/**
 * Incident registry, form, multipart create/update, show hub, situation updates,
 * workflow actions, public push, and history reports. Paths and JSON unchanged.
 * IncidentWorkflowService retained as transitional workflow hub.
 * Shares base path {@code /v1/response/incidents} with ops-timeline controller.
 */
public interface IncidentService {

    Map<String, Object> index(String statusFilter, Long hazardFilter, String workflowFilter, int page);

    /**
     * Same jurisdiction-scoped list as {@link #index(String, Long, String, int)} with an explicit
     * page size (clamped by the implementation). Used by the GraphQL mobileHome composite.
     */
    Map<String, Object> index(String statusFilter, Long hazardFilter, String workflowFilter, int page, int perPage);

    Map<String, Object> formData();

    /** Success map, or validation failure with {@code errors} (controller returns 422). */
    Map<String, Object> store(Map<String, String> form, List<String> infrastructureDamage,
                              List<String> emergencyNeeds, List<MultipartFile> photos, MultipartFile video,
                              String idempotencyKey);

    Map<String, Object> update(long id, Map<String, String> form, List<String> infrastructureDamage,
                               List<String> emergencyNeeds, List<String> removePhotos,
                               List<MultipartFile> photos, MultipartFile video);

    Map<String, Object> show(long id);

    Map<String, Object> storeUpdate(long id, Map<String, Object> body);

    Map<String, Object> submit(long id, Map<String, Object> body);

    Map<String, Object> approve(long id, Map<String, Object> body);

    Map<String, Object> rollback(long id, Map<String, Object> body);

    Map<String, Object> resubmit(long id, Map<String, Object> body);

    Map<String, Object> forward(long id, Map<String, Object> body);

    Map<String, Object> addComment(long id, Map<String, Object> body);

    Map<String, Object> escalate(long id, Map<String, Object> body);

    Map<String, Object> verify(long id, Map<String, Object> body);

    Map<String, Object> close(long id, Map<String, Object> body);

    Map<String, Object> closeRumor(long id, Map<String, Object> body);

    Map<String, Object> resolve(long id, Map<String, Object> body);

    Map<String, Object> pushMap(long id, Map<String, Object> body);

    Map<String, Object> pushNews(long id);

    Map<String, Object> removeNews(long id);

    Map<String, Object> storeHistoryReport(long id, Map<String, Object> body);
}
