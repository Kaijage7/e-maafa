package tz.go.pmo.dmis.preparedness;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

interface InventoryItemRepository extends JpaRepository<InventoryItem, Long> {
    List<InventoryItem> findAllByOrderByIdDesc();
}

interface ResourceRepository extends JpaRepository<Resource, Long> {
}
