package tz.go.pmo.dmis.preparedness;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface WarehouseRepository extends JpaRepository<Warehouse, Long> {
    List<Warehouse> findAllByOrderByNameAsc();

    /**
     * Jurisdiction-scoped list (shared-or-own policy): national tier sees all; a region/district officer
     * sees their own area plus shared (NULL-area) rows. Driven by {@link
     * tz.go.pmo.dmis.common.security.JurisdictionScope#sharedOrOwnFilter()}.
     */
    @Query("""
            select w from Warehouse w
            where :scope = 'NATIONAL'
               or (:scope = 'REGION'   and (w.regionId   = :regionId   or w.regionId   is null))
               or (:scope = 'DISTRICT' and (w.districtId = :districtId or w.districtId is null))
            order by w.name asc
            """)
    List<Warehouse> findScoped(@Param("scope") String scope,
                               @Param("regionId") Long regionId,
                               @Param("districtId") Long districtId);
}
