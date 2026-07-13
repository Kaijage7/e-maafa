package tz.go.pmo.dmis.service;

import java.util.Map;
import org.springframework.web.multipart.MultipartFile;

/** eGA service — paths unchanged (/v1/content/threats). */
public interface ThreatAdminService {

    record ThreatWrite(String name, String sourceAgency, String trendLabel, String severity,
                       String graphicPath, String descriptionEn, String descriptionSw,
                       String pastImpactsEn, String pastImpactsSw, Boolean isActive) {}

    record UpdateWrite(String title, String detail, String status, String startsOn,
                       String endsOn, Integer sortOrder, Boolean isActive) {}

    Map<String, Object> index();

    Map<String, Object> detail(long id);

    Map<String, Object> create(ThreatWrite req);

    Map<String, Object> update(long id, ThreatWrite req);

    Map<String, Object> uploadGraphic(long id, MultipartFile file);

    Map<String, Object> addUpdate(long id, UpdateWrite req);

    Map<String, Object> editUpdate(long updateId, UpdateWrite req);

    Map<String, Object> reviewPlan(long planId, Map<String, Object> req);

    Map<String, Object> delete(long id);
}
