package tz.go.pmo.dmis.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
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
import org.springframework.web.multipart.MultipartFile;
import tz.go.pmo.dmis.service.ThreatAdminService;

/**
 * Hazard Monitor / Threat Monitoring — DMD manages the national threats shown on the
 * public front: the threat itself (source agency, trend, severity, graphic, bilingual
 * descriptions + past-impacts), its intervention timeline (UPCOMING/NEW → ONGOING → COMPLETED, or POSTPONED) and
 * the review status of stakeholder plan submissions.
 */
@RestController
@RequestMapping("/v1/content/threats")
@RequiredArgsConstructor
@Tag(name = "Hazards", description = "Threat monitoring (admin)")
public class ThreatAdminController {

    private final ThreatAdminService service;

    @GetMapping
    @Operation(summary = "All threats + their updates and plan counts (admin)")
    @PreAuthorize("hasAuthority('hazards.view')")
    public Map<String, Object> index() {
        return service.index();
    }

    @GetMapping("/{id}")
    @Operation(summary = "One threat with full updates + plans (admin editing view)")
    @PreAuthorize("hasAuthority('hazards.view')")
    public Map<String, Object> detail(@PathVariable long id) {
        return service.detail(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Register a threat")
    @PreAuthorize("hasAuthority('hazards.manage')")
    public Map<String, Object> create(@RequestBody ThreatAdminService.ThreatWrite req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update a threat")
    @PreAuthorize("hasAuthority('hazards.manage')")
    public Map<String, Object> update(@PathVariable long id, @RequestBody ThreatAdminService.ThreatWrite req) {
        return service.update(id, req);
    }

    @PostMapping(value = "/{id}/graphic", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Upload and attach the public graphic for a threat")
    @PreAuthorize("hasAuthority('hazards.manage')")
    public Map<String, Object> uploadGraphic(@PathVariable long id, @RequestParam("file") MultipartFile file) {
        return service.uploadGraphic(id, file);
    }

    @PostMapping("/{id}/updates")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Add a DMD intervention/update to the threat timeline")
    @PreAuthorize("hasAuthority('hazards.manage')")
    public Map<String, Object> addUpdate(@PathVariable long id, @RequestBody ThreatAdminService.UpdateWrite req) {
        return service.addUpdate(id, req);
    }

    @PutMapping("/updates/{updateId}")
    @Operation(summary = "Edit a timeline entry (e.g. flip NEW → ONGOING → COMPLETED, or POSTPONED)")
    @PreAuthorize("hasAuthority('hazards.manage')")
    public Map<String, Object> editUpdate(@PathVariable long updateId, @RequestBody ThreatAdminService.UpdateWrite req) {
        return service.editUpdate(updateId, req);
    }

    @PutMapping("/plans/{planId}/status")
    @Operation(summary = "Review a stakeholder plan (Submitted → Under review → Approved)")
    @PreAuthorize("hasAuthority('hazards.manage')")
    public Map<String, Object> reviewPlan(@PathVariable long planId, @RequestBody Map<String, Object> req) {
        return service.reviewPlan(planId, req);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a threat (cascades its timeline + plans)")
    @PreAuthorize("hasAuthority('hazards.manage')")
    public Map<String, Object> delete(@PathVariable long id) {
        return service.delete(id);
    }
}
