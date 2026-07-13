package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * Stakeholder Portal directory + verification. Paths/JSON unchanged for Angular.
 */
public interface StakeholderAdminService {

    /** Write body for create/update (JSON field names unchanged). */
    record StakeholderWriteRequest(String name, String organization, String type, String sector,
                                   String email, String phone, String region, String district,
                                   String contactPersonName, String contactPersonTitle,
                                   Boolean isActive) {
    }

    Map<String, Object> index();

    Map<String, Object> create(StakeholderWriteRequest req);

    Map<String, Object> update(long id, StakeholderWriteRequest req);

    Map<String, Object> verify(long id, Map<String, Object> req);

    Map<String, Object> linkUser(long id, Map<String, Object> req);
}
