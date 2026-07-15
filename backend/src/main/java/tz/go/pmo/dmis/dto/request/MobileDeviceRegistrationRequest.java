package tz.go.pmo.dmis.dto.request;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Registers or refreshes the caller's current mobile/web installation for future push wake-ups.
 *
 * <p>Snake-case JSON matches the existing REST surface. The server never treats a push token as
 * domain data and does not accept an arbitrary user id — the authenticated JWT subject owns the
 * installation row.</p>
 */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record MobileDeviceRegistrationRequest(
        @NotBlank
        @Size(min = 8, max = 128)
        @Pattern(
                regexp = "^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$",
                message = "installation_id must be 8–128 characters from [A-Za-z0-9._:-]")
        String installationId,

        @NotBlank
        @Pattern(regexp = "^(android|ios|web)$", message = "platform must be android, ios, or web")
        String platform,

        @Size(max = 64)
        @Pattern(
                regexp = "^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$",
                message = "app_version must be a short version label")
        String appVersion,

        @Pattern(regexp = "^(none|fcm|apns)$", message = "push_provider must be none, fcm, or apns")
        String pushProvider,

        @Size(max = 4096)
        String pushToken
) {
}
