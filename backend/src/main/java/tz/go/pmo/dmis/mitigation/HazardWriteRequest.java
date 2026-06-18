package tz.go.pmo.dmis.mitigation;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Store/update payload — the fields the existing create/edit hazard forms actually post
 * (HazardController@store/@update validation: name + type required, the rest nullable strings).
 * {@code isActive} mirrors Laravel's {@code $request->has('is_active')}: absent means false.
 */
public record HazardWriteRequest(
        @NotBlank(message = "The name field is required.") @Size(max = 255) String name,
        @NotBlank(message = "The type field is required.") @Size(max = 255) String type,
        String description,
        @Size(max = 255) String category,
        @Size(max = 255) String severity,
        @Size(max = 255) String frequency,
        @Size(max = 255) String typicalDuration,
        @Size(max = 255) String seasonalPattern,
        @Size(max = 255) String severityScale,
        Boolean isActive) {
}
