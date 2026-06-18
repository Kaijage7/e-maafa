package tz.go.pmo.dmis.preparedness;

/** Payload for creating an evacuation center, mirroring admin/evacuation_centers/create-v2. */
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
