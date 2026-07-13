package tz.go.pmo.dmis.ew;

import org.springframework.data.jpa.repository.JpaRepository;

/** Read-only repository for districts used by EW hazard rows. Public for eGA service.impl. */
public interface EwDistrictRepository extends JpaRepository<EwDistrict, Long> {
}
