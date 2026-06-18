package tz.go.pmo.dmis.preparedness;

import java.util.List;

/** Payload for the Temporary Warehouses index: rows + stat-card values + map markers. */
public record TemporaryWarehouseResponse(List<Row> warehouses, Stats stats) {

    public record Stats(long total, long active, long regional, long national) {
    }

    public record Row(Long id, String name, String code, String level, String region, String district, String council,
                      String location, String status, boolean active, String contactName, String contactPhone,
                      Double latitude, Double longitude, String established) {
    }
}
