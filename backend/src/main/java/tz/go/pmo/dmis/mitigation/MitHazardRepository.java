package tz.go.pmo.dmis.mitigation;

import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

interface MitHazardRepository extends JpaRepository<MitHazard, Long> {

    Page<MitHazard> findAllByOrderByTypeAscNameAsc(Pageable pageable);

    long countByType(String type);

    long countByIsActiveTrue();

    boolean existsByName(String name);

    boolean existsByNameAndIdNot(String name, Long id);

    /** HazardController@index: hazards by category, count desc (chart 1). */
    @Query("select h.category as category, count(h) as total from MitHazard h "
            + "where h.category is not null group by h.category order by count(h) desc")
    List<CategoryCount> countByCategory();

    /** HazardController@index: severity × frequency combos (chart 2 bubbles). */
    @Query("select h.severity as severity, h.frequency as frequency, count(h) as total from MitHazard h "
            + "where h.severity is not null and h.frequency is not null group by h.severity, h.frequency")
    List<SeverityFrequencyCount> countBySeverityAndFrequency();

    interface CategoryCount {
        String getCategory();
        long getTotal();
    }

    interface SeverityFrequencyCount {
        String getSeverity();
        String getFrequency();
        long getTotal();
    }
}
