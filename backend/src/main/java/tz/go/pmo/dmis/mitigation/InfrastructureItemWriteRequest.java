package tz.go.pmo.dmis.mitigation;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Store/update payload — InfrastructureItemController's validation rules, field for field. */
public record InfrastructureItemWriteRequest(
        @NotBlank(message = "The name field is required.") @Size(max = 255) String name,
        @NotBlank(message = "The type field is required.") String type,
        String locationDescription,
        @Size(max = 255) String address,
        @Min(-90) @Max(90) Double latitude,
        @Min(-180) @Max(180) Double longitude,
        @Min(0) Integer capacity,
        @Size(max = 255) String contactPersonName,
        @Size(max = 30) String contactPersonPhone,
        @Email @Size(max = 255) String contactPersonEmail,
        @NotBlank(message = "The status field is required.") String status,
        String additionalInfo) {
}
