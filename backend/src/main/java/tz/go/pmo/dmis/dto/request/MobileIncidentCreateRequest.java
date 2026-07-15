package tz.go.pmo.dmis.dto.request;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * File-free incident command for a queued mobile/offline write.
 *
 * <p>The snake-case JSON contract matches the existing REST API. Status, source and workflow fields are
 * intentionally not client-controlled: a mobile create always enters as a Reported / draft incident from
 * the Mobile App Report channel. Attachments remain on the existing multipart REST path until a separately
 * idempotent upload contract is implemented.</p>
 */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record MobileIncidentCreateRequest(
        @Size(max = 255) String title,
        Long hazardId,
        Long incidentTypeId,
        @Size(max = 10_000) String locationDescription,
        Long regionId,
        Long districtId,
        Long councilId,
        Long wardId,
        @DecimalMin("-90.0") @DecimalMax("90.0") Double latitude,
        @DecimalMin("-180.0") @DecimalMax("180.0") Double longitude,
        @NotBlank
        @Size(max = 64)
        @Pattern(regexp = RFC_3339, message = "must be an RFC 3339 timestamp with an explicit offset")
        String reportedAt,
        @Size(max = 64)
        @Pattern(regexp = RFC_3339, message = "must be an RFC 3339 timestamp with an explicit offset")
        String occurredAt,
        @Size(max = 64)
        @Pattern(regexp = RFC_3339, message = "must be an RFC 3339 timestamp with an explicit offset")
        String endedAt,
        @Size(max = 20_000) String description,
        @Size(max = 255) String severityLevel,
        @Size(max = 255) String reportedByName,
        @Size(max = 255) String reportedByContact,
        Long assignedToUserId,
        @PositiveOrZero Integer deathsMale,
        @PositiveOrZero Integer deathsFemale,
        @PositiveOrZero Integer deathsTotal,
        @PositiveOrZero Integer injuredMale,
        @PositiveOrZero Integer injuredFemale,
        @PositiveOrZero Integer injuredTotal,
        @PositiveOrZero Integer missingMale,
        @PositiveOrZero Integer missingFemale,
        @PositiveOrZero Integer missingTotal,
        @PositiveOrZero Integer displaced,
        @PositiveOrZero Integer peopleWithDisabilities,
        @PositiveOrZero Integer pregnantAffected,
        @PositiveOrZero Integer childrenAffected,
        @PositiveOrZero Long peopleAffected,
        @Size(max = 8) List<@Size(max = 255) String> infrastructureDamage,
        @Size(max = 7) List<@Size(max = 255) String> emergencyNeeds,
        @Size(max = 255) String emergencyNeedsOther,
        @Size(max = 20_000) String actionTaken) {

    private static final String RFC_3339 =
            "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d{1,9})?)?(?:Z|[+-]\\d{2}:\\d{2})$";
}
