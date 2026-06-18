package tz.go.pmo.dmis.mitigation;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;
import lombok.Getter;
import lombok.Setter;
import org.springframework.web.multipart.MultipartFile;

/** frameworkStore/frameworkUpdate's field set (multipart for the attachment). */
@Getter
@Setter
public class FrameworkWriteRequest {
    @NotBlank(message = "The document type field is required.")
    private String documentType;
    @Size(max = 255)
    private String documentTypeOther;
    @NotBlank(message = "The document name field is required.")
    @Size(max = 255)
    private String documentName;
    @NotNull(message = "The year of approval field is required.")
    private Integer yearOfApproval;
    private List<String> hazardTypes;
    private String geographicScope;
    private String narrativeDescription;
    @Size(max = 50)
    private String status;
    private String sectorsCovered;
    private String keyStakeholders;
    private LocalDate implementationPeriodStart;
    private LocalDate implementationPeriodEnd;
    @Size(max = 255)
    private String externalLink;
    /** en | sw — which language edition this document is. */
    private String language;
    private String relatedDocuments;
    private MultipartFile attachment;
}
