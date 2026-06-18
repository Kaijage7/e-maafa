package tz.go.pmo.dmis.mitigation;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.security.Authz;

/**
 * v2 Mitigation Measures API over the existing {@code mitigation_measures} table. Deliberately only
 * index + store: the source declares show/edit/update/destroy routes whose controller methods DON'T
 * EXIST — the screen's View/Delete actions fail there exactly as they fail here.
 */
@RestController
@RequestMapping("/v1/mitigation-measures")
@RequiredArgsConstructor
@Tag(name = "Prevention & Mitigation", description = "Mitigation measures (existing mitigation_measures table)")
public class MitigationMeasureController {

    private final MitigationMeasureService mitigationMeasureService;

    @GetMapping
    @Operation(summary = "Measures registry page + statistics + priority chart data")
    @PreAuthorize("isAuthenticated()")
    public MitigationMeasureResponses.Index index(@RequestParam(defaultValue = "1") int page) {
        return mitigationMeasureService.index(page);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Full measure (view modal / edit form)")
    @PreAuthorize("isAuthenticated()")
    public MitigationMeasureResponses.Detail show(@PathVariable Long id) {
        return mitigationMeasureService.show(id);
    }

    @PostMapping
    @Operation(summary = "Create a measure (full SRS field set)")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(Authz.MITIGATION_MANAGE)
    public MitigationMeasureResponses.Detail store(@Valid @RequestBody MitigationMeasureWriteRequest request) {
        return mitigationMeasureService.store(request);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update a measure")
    @PreAuthorize(Authz.MITIGATION_MANAGE)
    public MitigationMeasureResponses.Detail update(@PathVariable Long id,
                                                    @Valid @RequestBody MitigationMeasureWriteRequest request) {
        return mitigationMeasureService.update(id, request);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a measure")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize(Authz.MITIGATION_MANAGE)
    public void destroy(@PathVariable Long id) {
        mitigationMeasureService.destroy(id);
    }
}
