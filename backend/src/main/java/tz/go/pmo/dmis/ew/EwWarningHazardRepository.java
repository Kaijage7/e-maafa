package tz.go.pmo.dmis.ew;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** Read-only repository for warning_hazards. Public for eGA service.impl. */
public interface EwWarningHazardRepository extends JpaRepository<EwWarningHazard, Long> {
    List<EwWarningHazard> findByDeletedAtIsNull();
}
