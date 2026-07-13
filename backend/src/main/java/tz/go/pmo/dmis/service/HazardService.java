package tz.go.pmo.dmis.service;

import tz.go.pmo.dmis.mitigation.HazardDetailResponse;
import tz.go.pmo.dmis.mitigation.HazardIndexResponse;
import tz.go.pmo.dmis.mitigation.HazardWriteRequest;

/**
 * Hazard registry (prevention & mitigation).
 * Path {@code /v1/hazards} unchanged. Productive {@code page} pagination.
 */
public interface HazardService {

    HazardIndexResponse index(int page);

    HazardDetailResponse show(Long id);

    HazardDetailResponse store(HazardWriteRequest request);

    HazardDetailResponse update(Long id, HazardWriteRequest request);

    void updateStatus(Long id, boolean isActive);

    void destroy(Long id);
}
