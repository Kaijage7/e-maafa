package tz.go.pmo.dmis.repository;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import tz.go.pmo.dmis.entity.EvacuationCenter;

/** Data access for evacuation_centers. */
public interface EvacuationCenterRepository extends JpaRepository<EvacuationCenter, Long> {
    List<EvacuationCenter> findAllByOrderByIdDesc();
}
