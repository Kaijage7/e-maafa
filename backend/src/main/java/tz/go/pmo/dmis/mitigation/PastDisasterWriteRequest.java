package tz.go.pmo.dmis.mitigation;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import lombok.Getter;
import lombok.Setter;
import org.springframework.web.multipart.MultipartFile;

/**
 * Multipart form payload for store/update — PastDisasterController's validation rules
 * (event_name + event_date required, the rest nullable; report_document pdf/doc/docx/txt/jpg/png ≤5MB;
 * remove_report_document only meaningful on update).
 */
@Getter
@Setter
public class PastDisasterWriteRequest {
    @NotBlank(message = "The event name field is required.")
    @Size(max = 255)
    private String eventName;
    @NotNull(message = "The event date field is required.")
    private LocalDate eventDate;
    private String locationDescription;
    private Long hazardId;
    private String descriptionOfEvent;
    private String impactDescription;
    private String lessonsLearned;
    @Size(max = 255)
    private String sourceOfInformation;
    private Double latitude;
    private Double longitude;
    private MultipartFile reportDocument;
    private Boolean removeReportDocument;
}
