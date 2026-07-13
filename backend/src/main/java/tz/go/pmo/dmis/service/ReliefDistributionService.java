package tz.go.pmo.dmis.service;

import java.util.Map;


/**
 * Recovery service for /v1/recovery/relief-distributions. Paths unchanged.
 */
public interface ReliefDistributionService {

    Map<String, Object> index(String status, String search);
    Map<String, Object> store(Map<String, Object> body);
    Map<String, Object> confirm(long id);

}
