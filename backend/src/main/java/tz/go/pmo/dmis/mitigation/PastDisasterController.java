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

/** Disaster Repository (past disasters) API over the existing {@code past_disasters} table. */
@RestController
@RequestMapping("/v1/past-disasters")
@RequiredArgsConstructor
@Tag(name = "Prevention & Mitigation", description = "Disaster repository (existing past_disasters table)")
public class PastDisasterController {

    private final PastDisasterService pastDisasterService;

    @GetMapping
    @Operation(summary = "Disaster records page + statistics + chart data + hazard options")
    @PreAuthorize("isAuthenticated()")
    public PastDisasterResponses.Index index(@RequestParam(defaultValue = "1") int page) {
        return pastDisasterService.index(page);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Full disaster record (View modal / edit form)")
    @PreAuthorize("isAuthenticated()")
    public PastDisasterResponses.Detail show(@PathVariable Long id) {
        return pastDisasterService.show(id);
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Create a disaster record (multipart, optional report document)")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(Authz.MITIGATION_MANAGE)
    public PastDisasterResponses.Detail store(@Valid @ModelAttribute PastDisasterWriteRequest request) {
        return pastDisasterService.store(request);
    }

    @PutMapping(value = "/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Update a disaster record (multipart; new file replaces, remove flag clears)")
    @PreAuthorize(Authz.MITIGATION_MANAGE)
    public PastDisasterResponses.Detail update(@PathVariable Long id,
                                               @Valid @ModelAttribute PastDisasterWriteRequest request) {
        return pastDisasterService.update(id, request);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a disaster record (and its stored report document)")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize(Authz.MITIGATION_MANAGE)
    public void destroy(@PathVariable Long id) {
        pastDisasterService.destroy(id);
    }
}
