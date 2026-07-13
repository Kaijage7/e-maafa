package tz.go.pmo.dmis.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import tz.go.pmo.dmis.service.PortalManagementService;

/**
 * Content Management → Portal Management — controls what the PUBLIC landing shows,
 * reproducing Admin/PortalManagementController: hero slide toggles/order, gallery
 * image toggles + marquee row placement, and the key/value portal settings
 * (hero stat tiles, counters). Changes are visible on the public site immediately.
 */
@RestController
@RequestMapping("/v1/content/portal")
@RequiredArgsConstructor
@Tag(name = "Content Management", description = "Public portal management (admin)")
public class PortalManagementAdminController {

    private final PortalManagementService service;

    @GetMapping
    @Operation(summary = "Slides + gallery + settings in one admin payload")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> index() {
        return service.index();
    }

    @PutMapping("/slides/{id}")
    @Operation(summary = "Toggle a hero slide / change its order")
    @PreAuthorize("hasAuthority('content_management.manage')")
    public Map<String, Object> updateSlide(@PathVariable long id, @RequestBody Map<String, Object> req) {
        return service.updateSlide(id, req);
    }

    @PutMapping("/gallery/{id}")
    @Operation(summary = "Toggle a gallery image / move it between marquee rows")
    @PreAuthorize("hasAuthority('content_management.manage')")
    public Map<String, Object> updateGallery(@PathVariable long id, @RequestBody Map<String, Object> req) {
        return service.updateGallery(id, req);
    }

    @PutMapping("/settings/{key}")
    @Operation(summary = "Update one portal setting value (hero stats, counters …)")
    @PreAuthorize("hasAuthority('content_management.manage')")
    public Map<String, Object> updateSetting(@PathVariable String key, @RequestBody Map<String, Object> req) {
        return service.updateSetting(key, req);
    }

}
