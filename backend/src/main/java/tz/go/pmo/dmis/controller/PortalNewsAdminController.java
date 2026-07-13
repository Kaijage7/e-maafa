package tz.go.pmo.dmis.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import tz.go.pmo.dmis.service.PortalNewsService;

/**
 * Content Management → News & Events — admin CRUD over portal_news, reproducing
 * Admin/PortalNewsController: slug auto-generated from the title (unique), and
 * published_at auto-set the moment an item is activated without a date.
 * The PUBLIC landing/news pages consume what is managed here.
 */
@RestController
@RequestMapping("/v1/content/news")
@RequiredArgsConstructor
@Tag(name = "Content Management", description = "Portal news & events (admin)")
public class PortalNewsAdminController {

    private final PortalNewsService service;

    @GetMapping
    @Operation(summary = "All news/events with stats (admin list)")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> index() {
        return service.index();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a news/event item (slug auto-generated)")
    @PreAuthorize("hasAuthority('content_management.manage')")
    public Map<String, Object> create(@RequestBody PortalNewsService.NewsWriteRequest req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update a news/event item")
    @PreAuthorize("hasAuthority('content_management.manage')")
    public Map<String, Object> update(@PathVariable long id, @RequestBody PortalNewsService.NewsWriteRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a news/event item")
    @PreAuthorize("hasAuthority('content_management.manage')")
    public Map<String, Object> delete(@PathVariable long id) {
        return service.delete(id);
    }

}
