package tz.go.pmo.dmis.mitigation;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** The existing {@code risk_assessments} table (shared Postgres) — the module's richest record. */
@Getter
@Setter
@Entity
@Table(schema = "public", name = "risk_assessments")
public class RiskAssessment {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "assessment_code")
    private String assessmentCode;
    @Column(name = "plan_type")
    private String planType;
    @Column(name = "assessment_title")
    private String assessmentTitle;
    @Column(name = "hazard_id")
    private Long hazardId;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hazard_id", insertable = false, updatable = false)
    private MitHazard hazard;
    @Column(name = "location_name")
    private String locationName;
    @Column(name = "district_council")
    private String districtCouncil;
    private String ward;
    private String village;
    private BigDecimal latitude;
    private BigDecimal longitude;
    @Column(name = "population_at_risk")
    private Integer populationAtRisk;
    @Column(name = "households_affected")
    private Integer householdsAffected;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "vulnerable_groups")
    private String vulnerableGroups;
    @Column(name = "risk_level")
    private String riskLevel;
    private String likelihood;
    @Column(name = "severity_of_impact")
    private String severityOfImpact;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "risk_matrix")
    private String riskMatrix;
    @Column(name = "impact_description")
    private String impactDescription;
    @Column(name = "economic_impact")
    private BigDecimal economicImpact;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "critical_infrastructure")
    private String criticalInfrastructure;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "environmental_impact")
    private String environmentalImpact;
    @Column(name = "existing_controls")
    private String existingControls;
    @Column(name = "early_warning_systems")
    private String earlyWarningSystems;
    @Column(name = "evacuation_plan")
    private String evacuationPlan;
    @JdbcTypeCode(SqlTypes.JSON)
    private String stakeholders;
    @Column(name = "recommended_actions")
    private String recommendedActions;
    @Column(name = "mitigation_budget")
    private BigDecimal mitigationBudget;
    @Column(name = "funding_source")
    private String fundingSource;
    @Column(name = "assessment_date")
    private LocalDate assessmentDate;
    @Column(name = "assessed_by")
    private String assessedBy;
    @Column(name = "review_date")
    private LocalDate reviewDate;
    @Column(name = "assessment_status")
    private String assessmentStatus;
    @Column(name = "approved_by")
    private Long approvedBy;
    @Column(name = "approved_date")
    private Instant approvedDate;
    @JdbcTypeCode(SqlTypes.JSON)
    private String attachments;
    @Column(name = "is_published")
    private Boolean isPublished;
    @Column(name = "priority_level")
    private Integer priorityLevel;
    @Column(name = "lessons_learned")
    private String lessonsLearned;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "coverage_regions")
    private String coverageRegions;
    @JdbcTypeCode(SqlTypes.JSON)
    private String sectors;
    private String timeframe;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "risk_maps")
    private String riskMaps;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "hazard_maps")
    private String hazardMaps;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "media_files")
    private String mediaFiles;
    @Column(name = "knowledge_type")
    private String knowledgeType;
    @Column(name = "narrative_description")
    private String narrativeDescription;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "key_lessons")
    private String keyLessons;
    @Column(name = "implementation_period")
    private String implementationPeriod;
    @Column(name = "challenges_encountered")
    private String challengesEncountered;
    @Column(name = "success_factors")
    private String successFactors;
    private String recommendations;
    @Column(name = "awareness_type")
    private String awarenessType;
    @Column(name = "target_audience")
    private String targetAudience;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "education_planning")
    private String educationPlanning;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "category_tags")
    private String categoryTags;
    private String author;
    @Column(name = "visibility_level")
    private String visibilityLevel;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "delivery_channels")
    private String deliveryChannels;
    @Column(name = "is_post_disaster")
    private Boolean isPostDisaster;
    @Column(name = "repository_entry_id")
    private String repositoryEntryId;
    @Column(name = "submitted_for_approval_at")
    private Instant submittedForApprovalAt;
    private Integer version;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "version_history")
    private String versionHistory;
    @Column(name = "created_at")
    private Instant createdAt;
    @Column(name = "updated_at")
    private Instant updatedAt;
}
