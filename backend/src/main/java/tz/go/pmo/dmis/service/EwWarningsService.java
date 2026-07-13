package tz.go.pmo.dmis.service;

import tz.go.pmo.dmis.dto.response.EwIndexResponse;

/**
 * Early Warning registry (workbench index). Path and JSON unchanged:
 * {@code GET /v1/ew/warnings}. Area isolation via JurisdictionScope is productive
 * (national sees all; region/district see only warnings that touch their area).
 * No unused query parameters — this endpoint has none by contract.
 */
public interface EwWarningsService {

    EwIndexResponse index();
}
