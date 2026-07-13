package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * Hazard / warned-area context links (OSM, imagery, Street View, open EO).
 * Path {@code GET /v1/ops/hazard-area-context} unchanged.
 * Productive params: areaName, regionId, districtId, lat, lng, hazardType,
 * warningCode, warningId, submissionId — each resolves coordinates/hazard payload or errors honestly.
 */
public interface HazardAreaContextService {

    Map<String, Object> context(String areaName, Long regionId, Long districtId,
                                Double lat, Double lng, String hazardType,
                                String warningCode, Long warningId, Long submissionId);
}
