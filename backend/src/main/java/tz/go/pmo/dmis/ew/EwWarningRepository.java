package tz.go.pmo.dmis.ew;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** Read-only repository for existing EW warnings table. Public for eGA service.impl. */
public interface EwWarningRepository extends JpaRepository<EwWarning, Long> {
    List<EwWarning> findByDeletedAtIsNullOrderByCreatedAtDesc();
}
