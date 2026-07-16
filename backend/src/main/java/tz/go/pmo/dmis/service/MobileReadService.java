package tz.go.pmo.dmis.service;

import tz.go.pmo.dmis.dto.response.IncidentWorkspaceResponse;
import tz.go.pmo.dmis.dto.response.MobileHomeResponse;
import tz.go.pmo.dmis.dto.response.MobileReferenceResponse;

/** Additive composite reads for mobile/web clients; no commands or workflow transitions. */
public interface MobileReadService {

    MobileHomeResponse mobileHome(
            int incidentPage, int incidentLimit, int notificationLimit, Long notificationBeforeId);

    /** Single-incident workspace; reuses jurisdiction-scoped {@code IncidentService#show}. */
    IncidentWorkspaceResponse incidentWorkspace(long incidentId);

    /**
     * Offline bootstrap reference catalogue (hazards, types, vocab, regions). Commands and large
     * geo downloads remain on REST.
     */
    MobileReferenceResponse mobileReference();
}
