package tz.go.pmo.dmis.service;

import java.util.List;
import java.util.Map;

/** eGA service — paths unchanged (/v1/settings/agencies). */
public interface AgencyAdminService {

    record AgencyWriteRequest(String name, String acronym, String agencyType, String mandateDescription, String contactPersonName, String contactPersonEmail, String contactPersonPhone, String website, Boolean isActive) {}

    Map<String, Object> index();

    Map<String, Object> create(AgencyWriteRequest req);

    Map<String, Object> update(long id, AgencyWriteRequest req);

    void delete(long id);

}
