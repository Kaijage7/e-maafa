package tz.go.pmo.dmis.service.impl;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tz.go.pmo.dmis.service.TranslationService;

/**
 * Translations registry over {@code public.translations} + controlled {@code translation_groups}.
 * Public portal hydrates i18n from the same table via PortalPublicService (SQL; not this service).
 */
@Service
@RequiredArgsConstructor
public class TranslationServiceImpl implements TranslationService {

    private final JdbcTemplate jdbc;

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> index(String group, String search) {
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

    @Override
    @Transactional
    public Map<String, Object> create(Map<String, Object> req) {
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

    @Override
    @Transactional
    public Map<String, Object> update(long id, Map<String, Object> req) {
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

    @Override
    @Transactional
    public void delete(long id) {
        jdbc.update("delete from public.translations where id = ?", id);
    }

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
