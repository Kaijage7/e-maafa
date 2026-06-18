package tz.go.pmo.dmis.mitigation;

import java.util.List;

/** Payloads for the v2 Mitigation Measures index screen (the only working v2 surface). */
public final class MitigationMeasureResponses {

    private MitigationMeasureResponses() {
    }

    public record Index(List<Row> measures, Pagination pagination, Stats stats,
                        List<PriorityDatum> byPriority) {
    }

    public record Stats(long total, long ongoing, long notStarted, long completed) {
    }

    public record Pagination(int currentPage, int lastPage, long total, int firstItem, int lastItem) {
    }

    public record Row(Long id, String projectProgrammeName, String implementingInstitution,
                      String hazardRiskAddressed, String projectStatus, String priority,
                      String periodStart, String periodEnd) {
    }

    public record PriorityDatum(String priority, long total) {
    }

    /** Full measure for the view modal and the edit form (SRS field set). */
    public record Detail(Long id, String projectProgrammeName, String implementingEntity,
                         String implementingInstitution, String hazardRiskAddressed,
                         String implementationPeriodStart, String implementationPeriodEnd,
                         String projectStatus, String typeOfMitigation, String narrativeDescription,
                         List<String> projectCoverage, String projectBeneficiaries,
                         String projectActivities, String expectedOutcome, List<String> associatedPartners,
                         String resourcesAllocated, String additionalSupportRequired,
                         String challengesBarriersNeeds, String priority) {
    }
}
