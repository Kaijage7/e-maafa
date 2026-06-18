package tz.go.pmo.dmis.mitigation;

import java.util.List;
import java.util.Map;

/** Payloads for the Risk Assessments screens, mirroring what the Blade view + its AJAX show receive. */
public final class RiskAssessmentResponses {

    private RiskAssessmentResponses() {
    }

    public record Index(List<Row> riskAssessments, Pagination pagination, Stats stats,
                        List<HazardOption> hazards) {
    }

    /**
     * Source quirk (reproduced): all but {@code total} are computed from the CURRENT PAGE's
     * rows, not the dataset.
     */
    public record Stats(long total, long highRisk, long published, long pendingReview) {
    }

    public record Pagination(int currentPage, int lastPage, long total, int firstItem, int lastItem) {
    }

    public record Row(Long id, Integer priorityLevel, String assessmentCode, String assessmentTitle,
                      String planType, String hazardName, String locationName, String districtCouncil,
                      String riskLevel, String assessmentStatus, boolean isPublished,
                      String assessmentDate, String assessmentDateRelative) {
    }

    public record HazardOption(Long id, String name) {
    }

    /** Full record as the AJAX show returns it (view modal / edit page / history modal). */
    public record Detail(Long id, String assessmentCode, String planType, String assessmentTitle,
                         Long hazardId, String hazardName, String locationName, String districtCouncil,
                         String ward, String village, Double latitude, Double longitude,
                         Integer populationAtRisk, Integer householdsAffected, List<String> vulnerableGroups,
                         String riskLevel, String likelihood, String severityOfImpact,
                         Map<String, Object> riskMatrix, String impactDescription, Double economicImpact,
                         List<String> criticalInfrastructure, List<String> environmentalImpact,
                         String existingControls, String earlyWarningSystems, String evacuationPlan,
                         List<String> stakeholders, String recommendedActions, Double mitigationBudget,
                         String fundingSource, String assessmentDate, String assessedBy, String reviewDate,
                         String assessmentStatus, boolean isPublished, Integer priorityLevel,
                         String lessonsLearned, List<String> coverageRegions, List<String> sectors,
                         String timeframe, String knowledgeType, String narrativeDescription,
                         List<String> keyLessons, String implementationPeriod, String challengesEncountered,
                         String successFactors, String recommendations, String awarenessType,
                         String targetAudience, List<String> categoryTags, String author,
                         String visibilityLevel, List<String> deliveryChannels, boolean isPostDisaster,
                         String repositoryEntryId, Integer version, List<Map<String, Object>> versionHistory,
                         String createdAt) {
    }
}
