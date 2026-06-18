package tz.go.pmo.dmis.mitigation;

import java.util.List;

/** Full hazard as HazardController@show returns it (the index screen's View modal consumes this). */
public record HazardDetailResponse(Long id, String name, String type, String category, String severity,
                                   String frequency, String severityScale, String description,
                                   String typicalDuration, String seasonalPattern, boolean isActive,
                                   List<String> warningSigns, List<String> impactAreas,
                                   List<String> responseRequired, List<String> preventionMeasures,
                                   List<String> historicalIncidents, List<String> affectedSectors,
                                   List<String> vulnerabilityFactors) {
}
