package tz.go.pmo.dmis.mitigation;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.security.Authz;

/** Hazard Management screen API over the existing {@code hazards} table (shared Postgres). */
@RestController
@RequestMapping("/v1/hazards")
@RequiredArgsConstructor
@Tag(name = "Prevention & Mitigation", description = "Hazard registry (existing hazards table)")
public class HazardController {

    private final HazardService hazardService;

    @GetMapping
    @Operation(summary = "Hazard registry page + statistics + chart data")
    @PreAuthorize("isAuthenticated()")
    public HazardIndexResponse index(@RequestParam(defaultValue = "1") int page) {
        return hazardService.index(page);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Full hazard details (View modal)")
    @PreAuthorize("isAuthenticated()")
    public HazardDetailResponse show(@PathVariable Long id) {
        return hazardService.show(id);
    }

    @PostMapping
    @Operation(summary = "Register a new hazard")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('hazards.manage')")
    public HazardDetailResponse store(@Valid @RequestBody HazardWriteRequest request) {
        return hazardService.store(request);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update a hazard")
    @PreAuthorize("hasAuthority('hazards.manage')")
    public HazardDetailResponse update(@PathVariable Long id, @Valid @RequestBody HazardWriteRequest request) {
        return hazardService.update(id, request);
    }

    @PostMapping("/{id}/status")
    @Operation(summary = "Toggle hazard active status")
    @PreAuthorize("hasAuthority('hazards.manage')")
    public void updateStatus(@PathVariable Long id, @Valid @RequestBody StatusRequest request) {
        hazardService.updateStatus(id, request.isActive());
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a hazard (blocked while early warnings / plans reference it)")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAuthority('hazards.manage')")
    public void destroy(@PathVariable Long id) {
        hazardService.destroy(id);
    }

    public record StatusRequest(@NotNull Boolean isActive) {
    }
}
