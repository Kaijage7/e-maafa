package tz.go.pmo.dmis.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import tz.go.pmo.dmis.service.PortalSectionsService;

/**
 * Content Management → landing-page sections that were previously hardcoded, now fully managed:
 *
 * <ul>
 *   <li><b>Hazard cards</b> ("Know Your Hazards" / Fahamu Hatari Zako) — own table, bilingual,
 *       each with a configurable click-through link.</li>
 *   <li><b>Capability cards</b> ("Core System Features" / Huduma Kuu za Mfumo) — stored as the
 *       {@code capabilities.items} JSON setting, exactly how Laravel's welcomeV2 models them.</li>
 *   <li><b>Emergency numbers</b> (topbar hotlines) — the {@code emergency.numbers} JSON setting.</li>
 * </ul>
 *
 * The public landing consumes all three through /v1/portal/landing, so every edit here is
 * immediately visible on the public site.
 */
@RestController
@RequestMapping("/v1/content/sections")
@RequiredArgsConstructor
@Tag(name = "Content Management", description = "Landing sections: hazard cards, capabilities, hotlines")
public class PortalSectionsAdminController {

    private final PortalSectionsService service;

    @GetMapping("/hazard-cards")
    @Operation(summary = "All hazard education cards (admin)")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> hazardCards() {
        return service.hazardCards();
    }

    @PostMapping("/hazard-cards")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Add a hazard card")
    @PreAuthorize("hasAuthority('content_management.manage')")
    public Map<String, Object> createHazardCard(@RequestBody PortalSectionsService.HazardCardWrite req) {
        return service.createHazardCard(req);
    }

    @PutMapping("/hazard-cards/{id}")
    @Operation(summary = "Update a hazard card")
    @PreAuthorize("hasAuthority('content_management.manage')")
    public Map<String, Object> updateHazardCard(@PathVariable long id, @RequestBody PortalSectionsService.HazardCardWrite req) {
        return service.updateHazardCard(id, req);
    }

    @DeleteMapping("/hazard-cards/{id}")
    @Operation(summary = "Delete a hazard card")
    @PreAuthorize("hasAuthority('content_management.manage')")
    public Map<String, Object> deleteHazardCard(@PathVariable long id) {
        return service.deleteHazardCard(id);
    }

    @GetMapping("/json-settings")
    @Operation(summary = "Capability cards + emergency numbers (parsed JSON settings)")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> jsonSettings() {
        return service.jsonSettings();
    }

    @PutMapping("/json-settings/{key}")
    @Operation(summary = "Save capabilities.items or emergency.numbers")
    @PreAuthorize("hasAuthority('content_management.manage')")
    public Map<String, Object> saveJsonSetting(@PathVariable String key, @RequestBody List<Map<String, Object>> items) {
        return service.saveJsonSetting(key, items);
    }

}
