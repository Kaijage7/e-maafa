package tz.go.pmo.dmis.service;

import java.util.List;
import java.util.Map;

/** eGA service — paths unchanged (public threats + plan submit). */
public interface ThreatService {

    List<Map<String, Object>> activeThreats();

    Map<String, Object> threatDetail(long id);

    Map<String, Object> submitPlan(long threatId, Map<String, Object> req);

}
