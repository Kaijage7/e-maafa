package tz.go.pmo.dmis.mitigation;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.Map;
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

/** Risk Frameworks API over the existing {@code disaster_risk_frameworks} table (shared Postgres). */
@RestController
@RequestMapping("/v1/frameworks")
@RequiredArgsConstructor
@Tag(name = "Content Management", description = "Disaster risk frameworks (existing table)")
public class FrameworkController {

    private final FrameworkService frameworkService;

    @GetMapping
    @Operation(summary = "Framework registry page + statistics + doughnut datasets")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> index(@RequestParam(defaultValue = "1") int page) {
        return frameworkService.index(page);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Full framework (view modal / edit form)")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> show(@PathVariable Long id) {
        return frameworkService.show(id);
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Create a framework (draft relaxes requireds; status defaults Active)")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('prevention_and_mitigation.manage')")
    public Map<String, Object> store(@Valid @ModelAttribute FrameworkWriteRequest request) {
        return frameworkService.store(request);
    }

    @PutMapping(value = "/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Update a framework (new attachment replaces the old)")
    @PreAuthorize("hasAuthority('prevention_and_mitigation.manage')")
    public Map<String, Object> update(@PathVariable Long id, @Valid @ModelAttribute FrameworkWriteRequest request) {
        return frameworkService.update(id, request);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a framework and its attachment")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAuthority('prevention_and_mitigation.manage')")
    public void destroy(@PathVariable Long id) {
        frameworkService.destroy(id);
    }
}
