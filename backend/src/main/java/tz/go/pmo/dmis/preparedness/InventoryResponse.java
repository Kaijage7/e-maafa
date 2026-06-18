package tz.go.pmo.dmis.preparedness;

import java.util.List;

/** Payload for the Emergency Supplies index screen: rows + the four stat-card values + alert-tab counts. */
public record InventoryResponse(List<ItemRow> items, Stats stats) {

    public record Stats(long total, long lowStock, long expiringSoon, long outOfStock, long expired) {
    }

    public record ItemRow(Long id, String resource, String itemName, String category, String warehouse, int quantity,
                          String status, String expiryDate, String batchNumber,
                          boolean lowStock, boolean expiring, boolean expired) {
    }
}
