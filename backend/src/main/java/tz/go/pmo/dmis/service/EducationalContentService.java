package tz.go.pmo.dmis.service;

import java.util.List;
import java.util.Map;

/** eGA service — paths unchanged (/v1/content/education). */
public interface EducationalContentService {

    record EduWriteRequest(String title, String contentType, String summary, String fullContent, String author, String publicationDate, String targetAudience, String keywords, Boolean isPublished, String titleSw, String summarySw, String fullContentSw) {}

    Map<String, Object> index();

    Map<String, Object> create(EduWriteRequest req);

    Map<String, Object> update(long id, EduWriteRequest req);

    Map<String, Object> delete(long id);

}
