package tz.go.pmo.dmis.mitigation;

import java.time.LocalDate;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

interface PastDisasterRepository extends JpaRepository<PastDisaster, Long> {

    /** PastDisasterController@index: with('hazard')->latest('event_date')->paginate(15). */
    @EntityGraph(attributePaths = "hazard")
    Page<PastDisaster> findAllByOrderByEventDateDesc(Pageable pageable);

    long countByEventDateGreaterThanEqual(LocalDate date);

    long countByReportDocumentPathNotNull();

    long countByLatitudeNotNullAndLongitudeNotNull();

    boolean existsByEventName(String eventName);

    boolean existsByEventNameAndIdNot(String eventName, Long id);

    /** Chart 1: disasters joined to hazards, grouped by hazard name, count desc. */
    @Query("select h.name as hazardName, count(d) as total from PastDisaster d join d.hazard h "
            + "group by h.name order by count(d) desc")
    List<HazardNameCount> countByHazardName();

    /** Chart 2: disasters per year of event_date. */
    @Query("select year(d.eventDate) as year, count(d) as total from PastDisaster d "
            + "where d.eventDate is not null group by year(d.eventDate) order by year(d.eventDate)")
    List<YearCount> countByYear();

    interface HazardNameCount {
        String getHazardName();
        long getTotal();
    }

    interface YearCount {
        Integer getYear();
        long getTotal();
    }
}
