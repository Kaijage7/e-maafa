package tz.go.pmo.dmis.mitigation;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;
import lombok.Getter;
import lombok.Setter;
import org.springframework.web.multipart.MultipartFile;

/**
 * Multipart payload covering BOTH RiskAssessmentController@store (full SRS set, the standalone
 * create page) and @update (the narrower edit-page set) — store() / update() in the service apply
 * the field subsets exactly as the Laravel validations do.
 */
@Getter
@Setter
public class RiskAssessmentWriteRequest {
    @NotBlank(message = "The assessment title field is required.")
    @Size(max = 255)
    private String assessmentTitle;
    @NotNull(message = "The hazard id field is required.")
    private Long hazardId;
    @NotBlank(message = "The location name field is required.")
    @Size(max = 255)
    private String locationName;
    @Size(max = 255)
    private String districtCouncil;
    @Size(max = 255)
    private String ward;
    @Size(max = 255)
    private String village;
    @Min(-90) @Max(90)
    private Double latitude;
    @Min(-180) @Max(180)
    private Double longitude;
    @Min(0)
    private Integer populationAtRisk;
    @Min(0)
    private Integer householdsAffected;
    private List<String> vulnerableGroups;
    @NotBlank(message = "The risk level field is required.")
    private String riskLevel;
    @NotBlank(message = "The likelihood field is required.")
    private String likelihood;
    @NotBlank(message = "The severity of impact field is required.")
    private String severityOfImpact;
    private String impactDescription;
    @Min(0)
    private Double economicImpact;
    private List<String> criticalInfrastructure;
    private List<String> environmentalImpact;
    private String existingControls;
    private String earlyWarningSystems;
    private String evacuationPlan;
    private List<String> stakeholders;
    private String recommendedActions;
    @Min(0)
    private Double mitigationBudget;
    @Size(max = 255)
    private String fundingSource;
    @NotNull(message = "The assessment date field is required.")
    private LocalDate assessmentDate;
    @Size(max = 255)
    private String assessedBy;
    private LocalDate reviewDate;
    private String assessmentStatus;
    @Min(1) @Max(10)
    private Integer priorityLevel;
    private String lessonsLearned;
    // SRS-specific (store only)
    private String planType;
    private String coverageRegions;
    private String sectors;
    @Size(max = 255)
    private String timeframe;
    private String knowledgeType;
    private String narrativeDescription;
    private String keyLessons;
    @Size(max = 255)
    private String implementationPeriod;
    private String challengesEncountered;
    private String successFactors;
    private String recommendations;
    @Size(max = 255)
    private String awarenessType;
    @Size(max = 255)
    private String targetAudience;
    private String educationPlanning;
    private String categoryTags;
    @Size(max = 255)
    private String author;
    private String visibilityLevel;
    private List<String> deliveryChannels;
    private Boolean isPostDisaster;
    /** store action: save_draft | submit. */
    private String action;
    private List<MultipartFile> attachments;
    private List<MultipartFile> riskMaps;
    private List<MultipartFile> hazardMaps;
    private List<MultipartFile> mediaFiles;
}
