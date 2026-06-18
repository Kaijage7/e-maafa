package tz.go.pmo.dmis.mitigation;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * The existing {@code mitigation_measures} table (renamed from mitigation_strategies), as the v2
 * Mitigation Measures screen uses it. Maps the index columns plus the fields the source's
 * measuresStore mass-assigns ($fillable-filtered — note implementing_institution and
 * type_of_mitigation are validated but NOT fillable, so they are absent here on purpose).
 */
@Getter
@Setter
@Entity
@Table(schema = "public", name = "mitigation_measures")
public class MitigationMeasure {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String title;
    @Column(name = "project_programme_name")
    private String projectProgrammeName;
    @Column(name = "implementing_entity")
    private String implementingEntity;
    @Column(name = "implementing_institution")
    private String implementingInstitution;
    @Column(name = "type_of_mitigation")
    private String typeOfMitigation;
    @Column(name = "hazard_risk_addressed")
    private String hazardRiskAddressed;
    @Column(name = "implementation_period_start")
    private LocalDate implementationPeriodStart;
    @Column(name = "implementation_period_end")
    private LocalDate implementationPeriodEnd;
    @Column(name = "project_status")
    private String projectStatus;
    @Column(name = "narrative_description")
    private String narrativeDescription;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "project_coverage")
    private String projectCoverage;
    @Column(name = "project_beneficiaries")
    private String projectBeneficiaries;
    @Column(name = "project_activities")
    private String projectActivities;
    @Column(name = "expected_outcome")
    private String expectedOutcome;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "associated_partners")
    private String associatedPartners;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "resources_allocated")
    private String resourcesAllocated;
    @Column(name = "additional_support_required")
    private String additionalSupportRequired;
    @Column(name = "challenges_barriers_needs")
    private String challengesBarriersNeeds;
    private String priority;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "attachment_documents")
    private String attachmentDocuments;
    @Column(name = "created_at")
    private Instant createdAt;
    @Column(name = "updated_at")
    private Instant updatedAt;
}
