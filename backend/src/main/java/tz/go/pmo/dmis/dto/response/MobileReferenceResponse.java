package tz.go.pmo.dmis.dto.response;

import java.util.List;

/** Offline bootstrap catalogue for mobile GraphQL {@code mobileReference}. */
public record MobileReferenceResponse(
        String generatedAt,
        List<RefItem> hazards,
        List<IncidentTypeRef> incidentTypes,
        List<String> severityLevels,
        List<String> sourcesOfReport,
        List<String> infrastructureDamageOptions,
        List<String> emergencyNeedsOptions,
        List<RefItem> regions) {

    public record RefItem(String id, String name) {
    }

    public record IncidentTypeRef(String id, String name, String defaultSeverity) {
    }
}
