package tz.go.pmo.dmis.ew;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** Read-only repositories for the existing EW tables. */
interface EwWarningRepository extends JpaRepository<EwWarning, Long> {
    List<EwWarning> findByDeletedAtIsNullOrderByCreatedAtDesc();
}

interface EwWarningHazardRepository extends JpaRepository<EwWarningHazard, Long> {
    List<EwWarningHazard> findByDeletedAtIsNull();
}

interface EwHazardRepository extends JpaRepository<EwHazard, Long> {
}

interface EwRegionRepository extends JpaRepository<EwRegion, Long> {
}

interface EwDistrictRepository extends JpaRepository<EwDistrict, Long> {
}
