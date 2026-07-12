package tz.go.pmo.dmis.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import tz.go.pmo.dmis.entity.Resource;

/**
 * Read access to the relief-resource catalogue ({@code public.resources}) for inventory join names
 * and low-stock thresholds. Settings catalogue CRUD remains SQL-based in ResourceCatalogueController.
 */
public interface ResourceRepository extends JpaRepository<Resource, Long> {
}
