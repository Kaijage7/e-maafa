package tz.go.pmo.dmis.preparedness;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

interface EvacuationCenterRepository extends JpaRepository<EvacuationCenter, Long> {
    List<EvacuationCenter> findAllByOrderByIdDesc();
}
