package tz.go.pmo.dmis.mitigation;

import java.time.Instant;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

interface RiskAssessmentRepository extends JpaRepository<RiskAssessment, Long> {

    /**
     * index: orderBy(priority_level desc)->latest(assessment_date)->latest(created_at)->paginate(15).
     * Plain DESC keeps Postgres' NULLS FIRST default — the source's ordering quirk.
     */
    @EntityGraph(attributePaths = "hazard")
    @Query("select r from RiskAssessment r order by r.priorityLevel desc, r.assessmentDate desc, r.createdAt desc")
    Page<RiskAssessment> pageForIndex(Pageable pageable);

    long countByRiskLevelIn(java.util.List<String> riskLevels);

    long countByIsPublishedTrue();

    long countByAssessmentStatus(String status);

    /** generateAssessmentCode: last record created in the given window, by id desc. */
    Optional<RiskAssessment> findFirstByCreatedAtBetweenOrderByIdDesc(Instant from, Instant to);

    /** generateRepositoryEntryId: last repository entry this year, by id desc. */
    Optional<RiskAssessment> findFirstByRepositoryEntryIdNotNullAndCreatedAtBetweenOrderByIdDesc(Instant from, Instant to);
}
