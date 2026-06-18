package tz.go.pmo.dmis.mitigation;

import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

interface MitigationMeasureRepository extends JpaRepository<MitigationMeasure, Long> {

    /** measuresIndex: MitigationMeasure::latest()->paginate(15). */
    Page<MitigationMeasure> findAllByOrderByCreatedAtDesc(Pageable pageable);

    long countByProjectStatus(String projectStatus);

    /** Chart: measures grouped by priority where not null. */
    @Query("select m.priority as priority, count(m) as total from MitigationMeasure m "
            + "where m.priority is not null group by m.priority")
    List<PriorityCount> countByPriority();

    interface PriorityCount {
        String getPriority();
        long getTotal();
    }
}
