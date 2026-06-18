package tz.go.pmo.dmis.preparedness;

/** Payload for creating an emergency-supply (inventory) item, mirroring inventory_items/create-v2. */
public record InventoryWriteRequest(
        Long resourceId,
        String itemName,
        String category,
        Long warehouseId,
        Integer quantity,
        Integer minimumThreshold,
        String batchNumber,
        String expiryDate,
        String status) {
}
