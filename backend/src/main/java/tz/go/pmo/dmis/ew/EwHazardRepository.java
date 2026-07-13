package tz.go.pmo.dmis.ew;

import org.springframework.data.jpa.repository.JpaRepository;

/** Read-only repository for EW hazards catalogue. Public for eGA service.impl. */
public interface EwHazardRepository extends JpaRepository<EwHazard, Long> {
}
