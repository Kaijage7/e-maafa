package tz.go.pmo.dmis.repository;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import tz.go.pmo.dmis.entity.Warehouse;

/** Data access for permanent warehouses. */
public interface WarehouseRepository extends JpaRepository<Warehouse, Long> {
    List<Warehouse> findAllByOrderByNameAsc();

    /**
     * Jurisdiction-scoped list (shared-or-own). DISTRICT must not treat every null-district row as
     * shared — only own district, own-region (null district), or fully national (null region+district).
     * Matches {@code JurisdictionScope#appendAreaScopeSharedOrOwn}.
     */
    @Query("""
            select w from Warehouse w
            where :scope = 'NATIONAL'
               or (:scope = 'REGION' and (w.regionId = :regionId or w.regionId is null))
               or (:scope = 'DISTRICT' and (
                    w.districtId = :districtId
                    or (w.districtId is null and (w.regionId = :regionId or w.regionId is null))
               ))
            order by w.name asc
            """)
    List<Warehouse> findScoped(@Param("scope") String scope,
                               @Param("regionId") Long regionId,
                               @Param("districtId") Long districtId);
}
