package tz.go.pmo.dmis.mitigation;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;

/** measuresStore validation, field for field (the SRS rule set of the v2 family). */
public record MitigationMeasureWriteRequest(
        @NotBlank(message = "The project programme name field is required.") @Size(max = 255) String projectProgrammeName,
        @NotBlank(message = "The implementing entity field is required.") String implementingEntity,
        @NotBlank(message = "The implementing institution field is required.") @Size(max = 255) String implementingInstitution,
        @NotBlank(message = "The hazard risk addressed field is required.") @Size(max = 255) String hazardRiskAddressed,
        @NotNull(message = "The implementation period start field is required.") LocalDate implementationPeriodStart,
        @NotNull(message = "The implementation period end field is required.") LocalDate implementationPeriodEnd,
        @NotBlank(message = "The project status field is required.") String projectStatus,
        @NotBlank(message = "The type of mitigation field is required.") String typeOfMitigation,
        @NotBlank(message = "The narrative description field is required.") String narrativeDescription,
        @NotEmpty(message = "The project coverage field is required.") List<String> projectCoverage,
        @NotBlank(message = "The project beneficiaries field is required.") String projectBeneficiaries,
        @NotBlank(message = "The project activities field is required.") String projectActivities,
        @NotBlank(message = "The expected outcome field is required.") String expectedOutcome,
        List<String> associatedPartners,
        String resourcesAllocated,
        String additionalSupportRequired,
        String challengesBarriersNeeds,
        @NotBlank(message = "The priority field is required.") String priority) {
}
