package tz.go.pmo.dmis.service;

import java.util.Map;
import tz.go.pmo.dmis.dto.request.InstitutionClassificationRequest;
import tz.go.pmo.dmis.dto.request.InstitutionProfileRequest;

/**
 * Unified System Settings view over {@code agencies} + {@code stakeholders}.
 * Login/sector control stays on agencies; partner portal on stakeholders; this service
 * is the governance layer (class, sector tags, provenance, policy role, M&amp;E).
 */
public interface InstitutionRegistryService {

    Map<String, Object> index(String kind, String institutionClass, String sector, String source,
                              String search, int limit);

    Map<String, Object> one(String kind, long id);

    Map<String, Object> updateClassification(String kind, long id, InstitutionClassificationRequest request);

    Map<String, Object> updateProfile(String kind, long id, InstitutionProfileRequest request);
}
