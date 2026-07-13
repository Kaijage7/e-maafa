package tz.go.pmo.dmis.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import tz.go.pmo.dmis.service.EducationMaterialService;

/**
 * Content Management → Public Awareness — the hazard education repository. Every material is
 * tied to a hazard and an AUDIENCE (children / adults / persons with disabilities / all) and is
 * one of: action guide (action statements), video, document or poster. The public hazard hubs
 * (/education/hazard/{name}) render exactly what is managed here.
 */
@RestController
@RequestMapping("/v1/content/education-materials")
@RequiredArgsConstructor
@Tag(name = "Content Management", description = "Hazard education materials (admin)")
public class EducationMaterialAdminController {

    private final EducationMaterialService service;

    @GetMapping
    @Operation(summary = "All materials + per-hazard counts (admin list)")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> index() {
        return service.index();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Add a material to a hazard's repository")
    @PreAuthorize("hasAuthority('content_management.manage')")
    public Map<String, Object> create(@RequestBody EducationMaterialService.MaterialWrite req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update a material")
    @PreAuthorize("hasAuthority('content_management.manage')")
    public Map<String, Object> update(@PathVariable long id, @RequestBody EducationMaterialService.MaterialWrite req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a material")
    @PreAuthorize("hasAuthority('content_management.manage')")
    public Map<String, Object> delete(@PathVariable long id) {
        return service.delete(id);
    }

}
