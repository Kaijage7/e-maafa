package tz.go.pmo.dmis.preparedness;

/** Payload for creating a warehouse, mirroring admin/warehouses/create-v2. */
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
