package tz.go.pmo.dmis.dto.request;

/** Payload for creating or updating an evacuation center. */
public record EvacuationCenterWriteRequest(
        String centreName,
        String centreType,
        String region,
        String district,
        String council,
        Integer capacityPeople,
        String accessibility,
        String status,
        Double latitude,
        Double longitude) {
}
