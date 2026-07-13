package tz.go.pmo.dmis.service;

import java.util.Map;

/** Disaster Repository (Sendai loss database). Paths/JSON unchanged. */
public interface DisasterEventService {

    Map<String, Object> index(String hazard, String region, Integer year, String status);

    byte[] exportCsv(String hazard, String region, Integer year, String status);

    Map<String, Object> incidentWorklist();

    Map<String, Object> createFromIncident(long incidentId, String actor);

    Map<String, Object> show(long id);

    Map<String, Object> create(Map<String, Object> req, String actor);

    void update(long id, Map<String, Object> req);

    Map<String, Object> transition(long id, String action, String actor);

    void delete(long id);

    Map<String, Object> saveEffects(long eventId, Map<String, Object> r);

    void deleteEffects(long eventId, long effectsId);

    Map<String, Object> addLink(long eventId, String entityType, long entityId, String note, String actor);

    void removeLink(long eventId, long linkId);

    Map<String, Object> linkSuggestions(long eventId);

    Map<String, Object> pullFromLinks(long eventId);

}
