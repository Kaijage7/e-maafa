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
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.security.Authz;

/** Strategic Infrastructure API over the existing {@code infrastructure_items} table. */
@RestController
@RequestMapping("/v1/infrastructure-items")
@RequiredArgsConstructor
@Tag(name = "Prevention & Mitigation", description = "Strategic infrastructure (existing infrastructure_items table)")
public class InfrastructureItemController {

    private final InfrastructureItemService infrastructureItemService;

    @GetMapping
    @Operation(summary = "Infrastructure registry page + statistics + map markers + form options")
    @PreAuthorize("isAuthenticated()")
    public InfrastructureItemResponses.Index index(@RequestParam(defaultValue = "1") int page) {
        return infrastructureItemService.index(page);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Full infrastructure item (View modal / edit form)")
    @PreAuthorize("isAuthenticated()")
    public InfrastructureItemResponses.Detail show(@PathVariable Long id) {
        return infrastructureItemService.show(id);
    }

    @PostMapping
    @Operation(summary = "Create an infrastructure item")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(Authz.MITIGATION_MANAGE)
    public InfrastructureItemResponses.Detail store(@Valid @RequestBody InfrastructureItemWriteRequest request) {
        return infrastructureItemService.store(request);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update an infrastructure item")
    @PreAuthorize(Authz.MITIGATION_MANAGE)
    public InfrastructureItemResponses.Detail update(@PathVariable Long id,
                                                     @Valid @RequestBody InfrastructureItemWriteRequest request) {
        return infrastructureItemService.update(id, request);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete an infrastructure item")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize(Authz.MITIGATION_MANAGE)
    public void destroy(@PathVariable Long id) {
        infrastructureItemService.destroy(id);
    }
}
