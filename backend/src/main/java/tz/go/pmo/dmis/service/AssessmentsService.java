package tz.go.pmo.dmis.service;

import java.util.List;
import java.util.Map;
import org.springframework.web.multipart.MultipartFile;

/**
 * Disaster Needs Assessments (damage survey + photos + verify workflow).
 * Paths and multipart/JSON shape unchanged from the former response package controller.
 */
public interface AssessmentsService {

    Map<String, Object> index(String status, Long incidentId);

    Map<String, Object> formData();

    Map<String, Object> store(Map<String, String> form, List<MultipartFile> photos) throws Exception;

    Map<String, Object> show(long id);

    Map<String, Object> update(long id, Map<String, String> form, List<MultipartFile> photos) throws Exception;

    Map<String, Object> submit(long id);

    Map<String, Object> verify(long id, Map<String, Object> body);

    Map<String, Object> deletePhoto(long id, long photoId);

    Map<String, Object> report(long id);
}
