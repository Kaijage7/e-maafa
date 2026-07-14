package tz.go.pmo.dmis.service;

import java.util.Map;
import tz.go.pmo.dmis.dto.request.InstitutionClassificationRequest;
import tz.go.pmo.dmis.dto.request.InstitutionCreateRequest;
import tz.go.pmo.dmis.dto.request.InstitutionProfileRequest;

/**
 * Unified System Settings view over {@code agencies} + {@code stakeholders}.
 * Login/sector control stays on agencies; partner portal on stakeholders; this service
 * is the governance layer (class, sector tags, provenance, policy role, M&amp;E).
 */
public interface InstitutionRegistryService {

    Map<String, Object> index(String kind, String institutionClass, String sector, String source,
                              String search, int limit, Boolean includeInactive);

    Map<String, Object> one(String kind, long id);

    Map<String, Object> updateClassification(String kind, long id, InstitutionClassificationRequest request);

    Map<String, Object> updateProfile(String kind, long id, InstitutionProfileRequest request);

    /** Add a new agency or stakeholder to the registry. */
    Map<String, Object> create(String kind, InstitutionCreateRequest request);

    /**
     * Remove from the active registry (soft: {@code is_active=false}).
     * Does not hard-delete rows that may be referenced by users, M&amp;E values, or resources.
     */
    Map<String, Object> remove(String kind, long id);

    /** Restore a previously removed (inactive) institution. */
    Map<String, Object> restore(String kind, long id);
}
