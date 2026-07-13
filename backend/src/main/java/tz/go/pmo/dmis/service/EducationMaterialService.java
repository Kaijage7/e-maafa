package tz.go.pmo.dmis.service;

import java.util.List;
import java.util.Map;

/** eGA service — paths unchanged (/v1/content/education-materials). */
public interface EducationMaterialService {

    record MaterialWrite(String hazard, String audience, String materialType, String title, String body, String titleSw, String bodySw, String videoUrl, String filePath, Integer sortOrder, Boolean isActive, String phase) {}

    Map<String, Object> index();

    Map<String, Object> create(MaterialWrite req);

    Map<String, Object> update(long id, MaterialWrite req);

    Map<String, Object> delete(long id);

}
