package tz.go.pmo.dmis.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import tz.go.pmo.dmis.service.EducationalContentService;

/**
 * Content Management → Educational Content — admin CRUD over educational_contents,
 * reproducing Admin/EducationalContentController. Published items feed the PUBLIC
 * education portal (/education) via PortalPublicService.
 */
@RestController
@RequestMapping("/v1/content/education")
@RequiredArgsConstructor
@Tag(name = "Content Management", description = "Educational content (admin)")
public class EducationalContentAdminController {

    private final EducationalContentService service;

    @GetMapping
    @Operation(summary = "All educational content + stats")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> index() {
        return service.index();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create educational content")
    @PreAuthorize("hasAuthority('content_management.manage')")
    public Map<String, Object> create(@RequestBody EducationalContentService.EduWriteRequest req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update educational content")
    @PreAuthorize("hasAuthority('content_management.manage')")
    public Map<String, Object> update(@PathVariable long id, @RequestBody EducationalContentService.EduWriteRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete educational content")
    @PreAuthorize("hasAuthority('content_management.manage')")
    public Map<String, Object> delete(@PathVariable long id) {
        return service.delete(id);
    }

}
