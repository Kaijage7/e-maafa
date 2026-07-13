package tz.go.pmo.dmis.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.stereotype.Service;
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
@Service
@lombok.RequiredArgsConstructor
public class PortalSectionsServiceImpl implements PortalSectionsService {


    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    // ------------------------------------------------------------ hazard cards

    @Override
    public Map<String, Object> hazardCards() {
        return Map.of("items", jdbc.queryForList(
                "select id, name, name_sw as \"nameSw\", icon, color, description_en as \"descriptionEn\","
                        + " description_sw as \"descriptionSw\", link, sort_order as \"sortOrder\","
                        + " is_active as \"isActive\" from public.portal_hazard_cards order by sort_order, id"));
    }

    @Override
    @Transactional
    public Map<String, Object> createHazardCard(PortalSectionsService.HazardCardWrite req) {
        if (req.name() == null || req.name().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name is required");
        }
        Long id = jdbc.queryForObject(
                "insert into public.portal_hazard_cards(name,name_sw,icon,color,description_en,description_sw,link,"
                        + "sort_order,is_active,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,now(),now())"
                        + " returning id", Long.class,
                req.name().trim(), req.nameSw(), nz(req.icon(), "fa-exclamation-triangle"), nz(req.color(), "#6b7280"),
                req.descriptionEn(), req.descriptionSw(), nz(req.link(), "/education"),
                req.sortOrder() == null ? 0 : req.sortOrder(), req.isActive() == null || req.isActive());
        return Map.of("id", id, "message", "Hazard card added");
    }

    @Override
    @Transactional
    public Map<String, Object> updateHazardCard(long id, PortalSectionsService.HazardCardWrite req) {
        int n = jdbc.update("update public.portal_hazard_cards set name=coalesce(?,name), name_sw=coalesce(?,name_sw), icon=coalesce(?,icon),"
                        + " color=coalesce(?,color), description_en=coalesce(?,description_en),"
                        + " description_sw=coalesce(?,description_sw), link=coalesce(?,link),"
                        + " sort_order=coalesce(?,sort_order), is_active=coalesce(?,is_active), updated_at=now()"
                        + " where id=?",
                req.name(), req.nameSw(), req.icon(), req.color(), req.descriptionEn(), req.descriptionSw(), req.link(),
                req.sortOrder(), req.isActive(), id);
        if (n == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Card not found");
        }
        return Map.of("id", id, "message", "Updated");
    }

    @Override
    @Transactional
    public Map<String, Object> deleteHazardCard(long id) {
        jdbc.update("delete from public.portal_hazard_cards where id=?", id);
        return Map.of("id", id, "message", "Deleted");
    }

    // ----------------------------------------- capabilities + emergency numbers

    /** Both JSON-list settings, returned parsed for the editors. */
    @Override
    public Map<String, Object> jsonSettings() {
        return Map.of("capabilities", readJsonSetting("capabilities.items"),
                "emergencyNumbers", readJsonSetting("emergency.numbers"),
                "unsubscribeReasons", readJsonSetting("unsubscribe.reasons"));
    }

    /** Replaces one JSON-list setting wholesale (the editors submit the full list). */
    @Override
    @Transactional
    public Map<String, Object> saveJsonSetting(String key, List<Map<String, Object>> items) {
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
