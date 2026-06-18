package tz.go.pmo.dmis.preparedness;

import java.util.List;

/** Payload for the Evacuation Centers index screen: rows + four stat-card values. */
public record EvacuationCenterResponse(List<CenterRow> centers, Stats stats) {

    public record Stats(long total, long active, long totalCapacity, long regionsCovered) {
    }

    public record CenterRow(Long id, String ecentreId, String centreName, List<String> types, String region, String district,
                            String council, Integer capacityPeople, String status, String accessibility,
                            Double latitude, Double longitude) {
    }
}
