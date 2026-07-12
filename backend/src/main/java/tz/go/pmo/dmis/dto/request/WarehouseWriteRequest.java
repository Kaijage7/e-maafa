package tz.go.pmo.dmis.dto.request;

/** Payload for creating or updating a warehouse. */
public record WarehouseWriteRequest(
        String name,
        String zone,
        String cityOrRegion,
        String locationAddress,
        Long storageCapacitySqm,
        String contactPersonName,
        String contactPersonPhone,
        String operationalStatus,
        Double latitude,
        Double longitude,
        String region,
        String district) {
}
