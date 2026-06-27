package tz.go.pmo.dmis.portal;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import tz.go.pmo.dmis.common.security.Authz;

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

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public record HazardCardWrite(String name, String icon, String color, String descriptionEn,
                                  String descriptionSw, String link, Integer sortOrder, Boolean isActive) {
    }

    // ------------------------------------------------------------ hazard cards

    @GetMapping("/hazard-cards")
    @Operation(summary = "All hazard education cards (admin)")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> hazardCards() {
        return Map.of("items", jdbc.queryForList(
                "select id, name, icon, color, description_en as \"descriptionEn\","
                        + " description_sw as \"descriptionSw\", link, sort_order as \"sortOrder\","
                        + " is_active as \"isActive\" from public.portal_hazard_cards order by sort_order, id"));
    }

    @PostMapping("/hazard-cards")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Add a hazard card")
    @PreAuthorize("hasAuthority('content_management.manage')")
    @Transactional
    public Map<String, Object> createHazardCard(@RequestBody HazardCardWrite req) {
        if (req.name() == null || req.name().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name is required");
        }
        Long id = jdbc.queryForObject(
                "insert into public.portal_hazard_cards(name,icon,color,description_en,description_sw,link,"
                        + "sort_order,is_active,created_at,updated_at) values (?,?,?,?,?,?,?,?,now(),now())"
                        + " returning id", Long.class,
                req.name().trim(), nz(req.icon(), "fa-exclamation-triangle"), nz(req.color(), "#6b7280"),
                req.descriptionEn(), req.descriptionSw(), nz(req.link(), "/education"),
                req.sortOrder() == null ? 0 : req.sortOrder(), req.isActive() == null || req.isActive());
        return Map.of("id", id, "message", "Hazard card added");
    }

    @PutMapping("/hazard-cards/{id}")
    @Operation(summary = "Update a hazard card")
    @PreAuthorize("hasAuthority('content_management.manage')")
    @Transactional
    public Map<String, Object> updateHazardCard(@PathVariable long id, @RequestBody HazardCardWrite req) {
        int n = jdbc.update("update public.portal_hazard_cards set name=coalesce(?,name), icon=coalesce(?,icon),"
                        + " color=coalesce(?,color), description_en=coalesce(?,description_en),"
                        + " description_sw=coalesce(?,description_sw), link=coalesce(?,link),"
                        + " sort_order=coalesce(?,sort_order), is_active=coalesce(?,is_active), updated_at=now()"
                        + " where id=?",
                req.name(), req.icon(), req.color(), req.descriptionEn(), req.descriptionSw(), req.link(),
                req.sortOrder(), req.isActive(), id);
        if (n == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Card not found");
        }
        return Map.of("id", id, "message", "Updated");
    }

    @DeleteMapping("/hazard-cards/{id}")
    @Operation(summary = "Delete a hazard card")
    @PreAuthorize("hasAuthority('content_management.manage')")
    @Transactional
    public Map<String, Object> deleteHazardCard(@PathVariable long id) {
        jdbc.update("delete from public.portal_hazard_cards where id=?", id);
        return Map.of("id", id, "message", "Deleted");
    }

    // ----------------------------------------- capabilities + emergency numbers

    /** Both JSON-list settings, returned parsed for the editors. */
    @GetMapping("/json-settings")
    @Operation(summary = "Capability cards + emergency numbers (parsed JSON settings)")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> jsonSettings() {
        return Map.of("capabilities", readJsonSetting("capabilities.items"),
                "emergencyNumbers", readJsonSetting("emergency.numbers"),
                "unsubscribeReasons", readJsonSetting("unsubscribe.reasons"));
    }

    /** Replaces one JSON-list setting wholesale (the editors submit the full list). */
    @PutMapping("/json-settings/{key}")
    @Operation(summary = "Save capabilities.items or emergency.numbers")
    @PreAuthorize("hasAuthority('content_management.manage')")
    @Transactional
    public Map<String, Object> saveJsonSetting(@PathVariable String key, @RequestBody List<Map<String, Object>> items) {
        if (!List.of("capabilities.items", "emergency.numbers", "unsubscribe.reasons").contains(key)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown setting key");
        }
        try {
            String value = json.writeValueAsString(items);
            int n = jdbc.update("update public.portal_settings set value=?, type='json', updated_at=now() where key=?",
                    value, key);
            if (n == 0) {
                jdbc.update("insert into public.portal_settings(\"group\",key,value,type,created_at,updated_at)"
                        + " values (split_part(?, '.', 1), ?, ?, 'json', now(), now())", key, key, value);
            }
            return Map.of("key", key, "count", items.size(), "message", "Saved");
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid items payload");
        }
    }

    private List<Map<String, Object>> readJsonSetting(String key) {
        try {
            String value = jdbc.queryForObject("select value from public.portal_settings where key=?", String.class, key);
            return json.readValue(value, json.getTypeFactory().constructCollectionType(List.class, Map.class));
        } catch (Exception e) {
            return List.of();
        }
    }

    private static String nz(String v, String dflt) {
        return (v == null || v.isBlank()) ? dflt : v;
    }
}
