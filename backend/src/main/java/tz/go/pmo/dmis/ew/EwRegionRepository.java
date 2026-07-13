package tz.go.pmo.dmis.ew;

import org.springframework.data.jpa.repository.JpaRepository;

/** Read-only repository for regions used by EW hazard rows. Public for eGA service.impl. */
public interface EwRegionRepository extends JpaRepository<EwRegion, Long> {
}
