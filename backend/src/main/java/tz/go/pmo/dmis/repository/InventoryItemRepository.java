package tz.go.pmo.dmis.repository;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import tz.go.pmo.dmis.entity.InventoryItem;

/** Data access for inventory_items (Emergency Supplies). */
public interface InventoryItemRepository extends JpaRepository<InventoryItem, Long> {
    List<InventoryItem> findAllByOrderByIdDesc();
}
