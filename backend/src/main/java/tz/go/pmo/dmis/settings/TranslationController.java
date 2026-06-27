package tz.go.pmo.dmis.settings;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
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
import org.springframework.web.server.ResponseStatusException;
import tz.go.pmo.dmis.common.security.Authz;

/**
 * System Settings → Translations. The bilingual (English / Kiswahili) UI-string registry seeded
 * from the public portal's i18n labels. Admins maintain the EN/SW pairs here; {@code GET /map}
 * serves the flat key→{en,sw} dictionary an i18n loader can hydrate from.
 *
 * <p>Honest scope: the live public i18n is still the code-based {@code PortalLabels} service —
 * this table is the managed source of truth and the read endpoint that a future loader consumes.</p>
 */
@RestController
@RequestMapping("/v1/settings/translations")
@Tag(name = "Settings: Translations", description = "Bilingual EN/SW UI strings")
@RequiredArgsConstructor
public class TranslationController {

    private static final String CAN_WRITE = "hasAuthority('translations.manage')";

    private final JdbcTemplate jdbc;

    @GetMapping
    @Operation(summary = "Translations (filterable) + groups + stats")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> index(@RequestParam(required = false) String group,
                                     @RequestParam(required = false) String search) {
        StringBuilder where = new StringBuilder(" where 1=1");
        List<Object> args = new ArrayList<>();
        if (group != null && !group.isBlank()) {
            where.append(" and group_name = ?");
            args.add(group);
        }
        if (search != null && !search.isBlank()) {
            where.append(" and (label_key ilike ? or en ilike ? or sw ilike ?)");
            args.add("%" + search + "%");
            args.add("%" + search + "%");
            args.add("%" + search + "%");
        }
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select id, label_key as \"labelKey\", group_name as \"group\", en, sw"
                        + " from public.translations" + where + " order by group_name, label_key", args.toArray());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("translations", rows);
        out.put("groups", jdbc.queryForList(
                "select name from public.translation_groups where active order by sort_order, name", String.class));
        out.put("stats", jdbc.queryForMap(
                "select count(*) as total, count(distinct group_name) as groups,"
                        + " count(*) filter (where en = sw) as untranslated from public.translations"));
        return out;
    }

    /** Flat key → {en, sw} dictionary for an i18n loader (the wiring target). */
    @GetMapping("/map")
    @Operation(summary = "Flat key→{en,sw} dictionary")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> map() {
        Map<String, Object> dict = new LinkedHashMap<>();
        for (Map<String, Object> r : jdbc.queryForList("select label_key, en, sw from public.translations")) {
            dict.put(String.valueOf(r.get("label_key")), Map.of("en", r.get("en"), "sw", r.get("sw")));
        }
        return dict;
    }

    @PostMapping
    @Operation(summary = "Add a translation key")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> create(@RequestBody Map<String, Object> req) {
        String key = req(req, "labelKey");
        Long dup = jdbc.queryForObject(
                "select count(*) from public.translations where label_key = ?", Long.class, key);
        if (dup != null && dup > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "That key already exists");
        }
        String group = str(req.getOrDefault("group", "General"));
        requireGroup(group);
        Long id = jdbc.queryForObject(
                "insert into public.translations(label_key, group_name, en, sw, created_at, updated_at)"
                        + " values (?,?,?,?,now(),now()) returning id", Long.class,
                key, group, req(req, "en"), req(req, "sw"));
        return Map.of("id", id, "message", "Translation added");
    }

    @PutMapping("/{id}")
    @Operation(summary = "Edit a translation (EN / SW / group)")
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> update(@PathVariable long id, @RequestBody Map<String, Object> req) {
        String group = str(req.get("group"));
        if (group != null) {
            requireGroup(group);
        }
        int n = jdbc.update("update public.translations set en = coalesce(?,en), sw = coalesce(?,sw),"
                        + " group_name = coalesce(?,group_name), updated_at = now() where id = ?",
                str(req.get("en")), str(req.get("sw")), str(req.get("group")), id);
        if (n == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Translation not found");
        }
        return Map.of("message", "Translation updated");
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a translation key")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize(CAN_WRITE)
    public void delete(@PathVariable long id) {
        jdbc.update("delete from public.translations where id = ?", id);
    }

    /** The group must be a live row in the authoritative {@code translation_groups} vocabulary. */
    private void requireGroup(String group) {
        Integer n = jdbc.queryForObject(
                "select count(*) from public.translation_groups where name = ? and active", Integer.class, group);
        if (n == null || n == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Unknown translation group \"" + group + "\" — choose one from the group list.");
        }
    }

    private static String req(Map<String, Object> m, String key) {
        String v = str(m.get(key));
        if (v == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, key + " is required");
        }
        return v;
    }

    private static String str(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }
}
