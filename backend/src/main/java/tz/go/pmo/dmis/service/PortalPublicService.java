package tz.go.pmo.dmis.service;

import java.util.List;
import java.util.Map;

/** eGA service — paths unchanged (/v1/portal). */
public interface PortalPublicService {

    Map<String, Object> landing();

    Map<String, Object> newsArticle(String slug);

    Map<String, Object> publications(String type);

    Map<String, Object> incidentSnapshot(long id);

    Map<String, Object> submitHazardReport(Map<String, Object> req);

    Map<String, Object> reportStatus(String rawCode);

    Map<String, Object> subscribe(Map<String, Object> req);

    Map<String, Object> unsubscribe(Map<String, Object> req);

    Map<String, Object> confirmUnsubscribe(Map<String, Object> req);

    Map<String, Object> unsubscribeReasons();

    Map<String, Object> registerStakeholder(Map<String, Object> req);

    List<Map<String, Object>> regions();

    List<Map<String, Object>> districts(long regionId);

    List<Map<String, Object>> councils(long districtId);

    List<Map<String, Object>> wards(long councilId);

    Map<String, Object> education();

    Map<String, Object> shelters();

    List<Map<String, Object>> hazardCalendar();

    Map<String, Object> hazardHub(String hazardName);

    Map<String, Object> educationItem(long id);

    Map<String, Object> i18n();

}
