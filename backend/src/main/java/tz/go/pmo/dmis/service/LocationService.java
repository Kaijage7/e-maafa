package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * System Settings → Location Management. Administers the Tanzania administrative hierarchy
 * (regions → districts → councils/LGAs → wards). Operational modules geo-reference these tables
 * via SQL only — this service owns admin CRUD.
 */
public interface LocationService {

    Map<String, Object> index();

    Map<String, Object> districts(long regionId);

    Map<String, Object> councils(long districtId);

    Map<String, Object> wards(long districtId);

    Map<String, Object> councilWards(long councilId);

    Map<String, Object> createRegion(Map<String, Object> request);

    Map<String, Object> updateRegion(long id, Map<String, Object> request);

    void deleteRegion(long id);

    Map<String, Object> createDistrict(long regionId, Map<String, Object> request);

    Map<String, Object> updateDistrict(long id, Map<String, Object> request);

    void deleteDistrict(long id);

    Map<String, Object> createCouncil(long districtId, Map<String, Object> request);

    Map<String, Object> updateCouncil(long id, Map<String, Object> request);

    void deleteCouncil(long id);

    Map<String, Object> createWard(long districtId, Map<String, Object> request);

    Map<String, Object> createCouncilWard(long councilId, Map<String, Object> request);

    Map<String, Object> updateWard(long id, Map<String, Object> request);

    void deleteWard(long id);
}
