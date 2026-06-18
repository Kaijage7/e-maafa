package tz.go.pmo.dmis.preparedness;

import java.util.List;

/** Payload for the Warehouses index screen: rows + four stat-card values. */
public record WarehouseResponse(List<WarehouseRow> warehouses, Stats stats) {

    public record Stats(long total, long operational, long underMaintenance, long totalCapacity) {
    }

    public record WarehouseRow(Long id, String name, String cityOrRegion, String address, String zone,
                               Long capacitySqm, String status, int stocks,
                               String contactName, String contactPhone, Double latitude, Double longitude,
                               String region, String district) {
    }
}
