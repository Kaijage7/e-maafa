package tz.go.pmo.dmis.dto.request;

/** Payload for creating or updating a temporary warehouse. */
public record TemporaryWarehouseWriteRequest(
        String name,
        String level,
        String region,
        String district,
        String council,
        String locationDescription,
        String contactPersonName,
        String contactPersonPhone,
        String operationalStatus,
        Double latitude,
        Double longitude) {
}
