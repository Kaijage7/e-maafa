package tz.go.pmo.dmis.service;

import java.util.Map;


/**
 * Recovery service for /v1/recovery/recovery-programs. Paths unchanged.
 */
public interface RecoveryProgramService {

    Map<String, Object> index(String status, String search);
    Map<String, Object> store(Map<String, Object> body);
    Map<String, Object> setStatus(long id, Map<String, Object> body);

}
