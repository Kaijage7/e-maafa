package tz.go.pmo.dmis.preparedness;

/** Payload for creating a temporary warehouse, mirroring the temporary_warehouses schema. */
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
