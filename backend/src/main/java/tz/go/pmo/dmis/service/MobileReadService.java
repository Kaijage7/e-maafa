package tz.go.pmo.dmis.service;

import tz.go.pmo.dmis.dto.response.MobileHomeResponse;

/** Additive composite reads for mobile/web clients; no commands or workflow transitions. */
public interface MobileReadService {

    MobileHomeResponse mobileHome(
            int incidentPage, int incidentLimit, int notificationLimit, Long notificationBeforeId);
}
