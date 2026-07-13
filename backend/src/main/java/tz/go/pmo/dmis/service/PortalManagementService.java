package tz.go.pmo.dmis.service;

import java.util.List;
import java.util.Map;

/** eGA service — paths unchanged (/v1/content/portal). */
public interface PortalManagementService {

    Map<String, Object> index();

    Map<String, Object> updateSlide(long id, Map<String, Object> req);

    Map<String, Object> updateGallery(long id, Map<String, Object> req);

    Map<String, Object> updateSetting(String key, Map<String, Object> req);

}
