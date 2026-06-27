package tz.go.pmo.dmis.repository;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
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
import tz.go.pmo.dmis.common.security.SecurityUtils;
import tz.go.pmo.dmis.common.security.Authz;

/**
 * Disaster Repository API — the national disaster loss database.
 *
 * <p>Reads are open to any signed-in officer (the repository is the institution's memory);
 * writes are the EOCC's duty per the SRS role model, with management roles able to step in.
 * Cards are validated (frozen) before they feed the Sendai analytics.</p>
 */
@RestController
@RequestMapping("/v1/repository/events")
@Tag(name = "Disaster Repository", description = "Sendai-compliant disaster loss database (event cards)")
@RequiredArgsConstructor
public class DisasterEventController {

    /** Write access: EOCC officers own data entry; leadership + admins can intervene. */
    private static final String CAN_WRITE = "hasAuthority('disaster_repository.enter')";

    private final DisasterEventService service;

    @GetMapping
    @Operation(summary = "Event registry with filters + repository stats")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> index(@RequestParam(required = false) String hazard,
                                     @RequestParam(required = false) String region,
                                     @RequestParam(required = false) Integer year,
                                     @RequestParam(required = false) String status) {
        return service.index(hazard, region, year, status);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Full event card: effects, linked records, totals, response investment")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> show(@PathVariable long id) {
        return service.show(id);
    }

    @PostMapping
    @Operation(summary = "Register a disaster event card (EOCC)")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> create(@RequestBody Map<String, Object> req) {
        return service.create(req, SecurityUtils.currentUserName());
    }

    @PutMapping("/{id}")
    @Operation(summary = "Edit an Open event card")
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> update(@PathVariable long id, @RequestBody Map<String, Object> req) {
        service.update(id, req);
        return Map.of("id", id, "message", "Event updated");
    }

    @PostMapping("/{id}/transition")
    @Operation(summary = "Card lifecycle: validate (freeze for Sendai) / reopen / archive")
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> transition(@PathVariable long id, @RequestBody Map<String, String> req) {
        return service.transition(id, req.getOrDefault("action", ""), SecurityUtils.currentUserName());
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a mis-registered card (Open cards only — validated history is corrected, not deleted)")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize(CAN_WRITE)
    public void delete(@PathVariable long id) {
        service.delete(id);
    }

    // ---------------------------------------------------------------- effects

    @PostMapping("/{id}/effects")
    @Operation(summary = "Add or update an effects record (per region/district, Sendai-disaggregated)")
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> saveEffects(@PathVariable long id, @RequestBody Map<String, Object> req) {
        return service.saveEffects(id, req);
    }

    @DeleteMapping("/{id}/effects/{effectsId}")
    @Operation(summary = "Remove an effects record")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize(CAN_WRITE)
    public void deleteEffects(@PathVariable long id, @PathVariable long effectsId) {
        service.deleteEffects(id, effectsId);
    }

    @GetMapping("/{id}/pull")
    @Operation(summary = "Aggregate casualty/loss figures from the linked records (pre-fill, never auto-saved)")
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> pullFromLinks(@PathVariable long id) {
        return service.pullFromLinks(id);
    }

    // ---------------------------------------------------------------- links

    @GetMapping("/{id}/link-suggestions")
    @Operation(summary = "Unlinked incidents/warnings/assessments inside the event window")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> suggestions(@PathVariable long id) {
        return service.linkSuggestions(id);
    }

    @PostMapping("/{id}/links")
    @Operation(summary = "Link a system record (incident, warning, threat, assessment …) to the event")
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> addLink(@PathVariable long id, @RequestBody Map<String, Object> req) {
        return service.addLink(id, String.valueOf(req.get("entityType")),
                Long.parseLong(String.valueOf(req.get("entityId"))),
                req.get("note") == null ? null : String.valueOf(req.get("note")),
                SecurityUtils.currentUserName());
    }

    @DeleteMapping("/{id}/links/{linkId}")
    @Operation(summary = "Unlink a record")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize(CAN_WRITE)
    public void removeLink(@PathVariable long id, @PathVariable long linkId) {
        service.removeLink(id, linkId);
    }
}
