package tz.go.pmo.dmis.repository;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import tz.go.pmo.dmis.entity.TemporaryWarehouse;

/** Data access for temporary_warehouses. */
public interface TemporaryWarehouseRepository extends JpaRepository<TemporaryWarehouse, Long> {
    List<TemporaryWarehouse> findAllByOrderByNameAsc();

    /**
     * Jurisdiction-scoped list (shared-or-own): national tier sees all; a region/district officer sees
     * their own area plus shared (NULL-area) rows.
     */
    @Query("""
            select w from TemporaryWarehouse w
            where :scope = 'NATIONAL'
               or (:scope = 'REGION'   and (w.regionId   = :regionId   or w.regionId   is null))
               or (:scope = 'DISTRICT' and (w.districtId = :districtId or w.districtId is null))
            order by w.name asc
            """)
    List<TemporaryWarehouse> findScoped(@Param("scope") String scope,
                                        @Param("regionId") Long regionId,
                                        @Param("districtId") Long districtId);
}
