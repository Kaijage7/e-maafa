package tz.go.pmo.dmis.mitigation;

import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

interface InfrastructureItemRepository extends JpaRepository<InfrastructureItem, Long> {

    /** index: InfrastructureItem::latest()->paginate(15). */
    Page<InfrastructureItem> findAllByOrderByCreatedAtDesc(Pageable pageable);

    long countByStatus(String status);

    /** index $mapItems: all geo-located items for the #infraMap markers. */
    List<InfrastructureItem> findByLatitudeNotNullAndLongitudeNotNull();
}
