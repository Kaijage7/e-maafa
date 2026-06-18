package tz.go.pmo.dmis.preparedness;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import lombok.Getter;
import org.hibernate.annotations.Immutable;

/** Read-only view of the existing {@code inventory_items} table (Emergency Supplies). */
@Getter
@Entity
@Immutable
@Table(schema = "public", name = "inventory_items")
public class InventoryItem {
    @Id
    private Long id;
    @Column(name = "resource_id")
    private Long resourceId;
    @Column(name = "warehouse_id")
    private Long warehouseId;
    @Column(name = "item_name")
    private String itemName;
    private String category;
    private Integer quantity;
    @Column(name = "batch_number")
    private String batchNumber;
    @Column(name = "expiry_date")
    private LocalDate expiryDate;
    private String status;
    @Column(name = "minimum_threshold")
    private Integer minimumThreshold;
    @Column(name = "warehouse_type")
    private String warehouseType;
}
