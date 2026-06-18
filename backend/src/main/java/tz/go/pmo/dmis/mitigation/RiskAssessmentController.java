package tz.go.pmo.dmis.mitigation;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.security.Authz;

/** Risk Assessments API over the existing {@code risk_assessments} table (shared Postgres). */
@RestController
@RequestMapping("/v1/risk-assessments")
@RequiredArgsConstructor
@Tag(name = "Prevention & Mitigation", description = "Risk assessments (existing risk_assessments table)")
public class RiskAssessmentController {

    private final RiskAssessmentService riskAssessmentService;

    @GetMapping
    @Operation(summary = "Risk assessments page (priority order) + page-scoped stats + hazard options")
    @PreAuthorize("isAuthenticated()")
    public RiskAssessmentResponses.Index index(@RequestParam(defaultValue = "1") int page) {
        return riskAssessmentService.index(page);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Full assessment (view modal / edit page / history modal)")
    @PreAuthorize("isAuthenticated()")
    public RiskAssessmentResponses.Detail show(@PathVariable Long id) {
        return riskAssessmentService.show(id);
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Create (standalone create page: full SRS set, draft/submit, code generation)")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(Authz.MITIGATION_MANAGE)
    public RiskAssessmentResponses.Detail store(@Valid @ModelAttribute RiskAssessmentWriteRequest request) {
        return riskAssessmentService.store(request);
    }

    @PutMapping(value = "/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Update (edit page's narrower field set; approval transition; matrix recalc)")
    @PreAuthorize(Authz.MITIGATION_MANAGE)
    public RiskAssessmentResponses.Detail update(@PathVariable Long id,
                                                 @Valid @ModelAttribute RiskAssessmentWriteRequest request) {
        return riskAssessmentService.update(id, request);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete an assessment and its stored files")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize(Authz.MITIGATION_MANAGE)
    public void destroy(@PathVariable Long id) {
        riskAssessmentService.destroy(id);
    }

    @PostMapping("/{id}/approve")
    @Operation(summary = "Approve an assessment")
    @PreAuthorize(Authz.MITIGATION_APPROVE)
    public void approve(@PathVariable Long id) {
        riskAssessmentService.approve(id);
    }

    @PostMapping("/{id}/publish")
    @Operation(summary = "Publish an approved assessment")
    @PreAuthorize(Authz.MITIGATION_APPROVE)
    public void publish(@PathVariable Long id) {
        riskAssessmentService.publish(id);
    }
}
