package tz.go.pmo.dmis.service;

import java.util.Map;


/**
 * Recovery service for /v1/recovery/strategic-projects. Paths unchanged.
 */
public interface StrategicProjectService {

    Map<String, Object> index(String status, String sector, String search);
    Map<String, Object> store(Map<String, Object> body) throws Exception;
    Map<String, Object> setStatus(long id, Map<String, Object> body);

}
