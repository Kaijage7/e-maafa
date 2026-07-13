package tz.go.pmo.dmis.service;

import java.util.List;
import java.util.Map;

/** eGA service — paths unchanged (/v1/content/sections). */
public interface PortalSectionsService {

    record HazardCardWrite(String name, String nameSw, String icon, String color, String descriptionEn, String descriptionSw, String link, Integer sortOrder, Boolean isActive) {}

    Map<String, Object> hazardCards();

    Map<String, Object> createHazardCard(HazardCardWrite req);

    Map<String, Object> updateHazardCard(long id, HazardCardWrite req);

    Map<String, Object> deleteHazardCard(long id);

    Map<String, Object> jsonSettings();

    Map<String, Object> saveJsonSetting(String key, List<Map<String, Object>> items);

}
