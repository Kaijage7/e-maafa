package tz.go.pmo.dmis.service.impl;

import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.stereotype.Service;
import tz.go.pmo.dmis.service.PortalManagementService;

/**
 * Content Management → Portal Management — controls what the PUBLIC landing shows,
 * reproducing Admin/PortalManagementController: hero slide toggles/order, gallery
 * image toggles + marquee row placement, and the key/value portal settings
 * (hero stat tiles, counters). Changes are visible on the public site immediately.
 */
@Service
@lombok.RequiredArgsConstructor
public class PortalManagementServiceImpl implements PortalManagementService {


    private final JdbcTemplate jdbc;

    @Override
    public Map<String, Object> index() {
        List<Map<String, Object>> slides = jdbc.queryForList(
                "select id, title, slide_type as \"slideType\", sort_order as \"sortOrder\","
                        + " is_active as \"isActive\" from public.portal_slides order by sort_order");
        List<Map<String, Object>> gallery = jdbc.queryForList(
                "select id, image_path as \"imagePath\", caption, marquee_row as \"marqueeRow\","
                        + " sort_order as \"sortOrder\", is_active as \"isActive\""
                        + " from public.portal_gallery order by marquee_row, sort_order");
        List<Map<String, Object>> settings = jdbc.queryForList(
                "select id, \"group\", key, value from public.portal_settings order by \"group\", key");
        return Map.of("slides", slides, "gallery", gallery, "settings", settings);
    }

    @Override
    @Transactional
    public Map<String, Object> updateSlide(long id, Map<String, Object> req) {
        jdbc.update("update public.portal_slides set is_active = coalesce(?, is_active),"
                        + " sort_order = coalesce(?, sort_order), updated_at = now() where id = ?",
                bool(req.get("isActive")), intOrNull(req.get("sortOrder")), id);
        return Map.of("id", id, "message", "Slide updated");
    }

    @Override
    @Transactional
    public Map<String, Object> updateGallery(long id, Map<String, Object> req) {
        jdbc.update("update public.portal_gallery set is_active = coalesce(?, is_active),"
                        + " marquee_row = coalesce(?, marquee_row), caption = coalesce(?, caption),"
                        + " updated_at = now() where id = ?",
                bool(req.get("isActive")), intOrNull(req.get("marqueeRow")),
                req.get("caption") == null ? null : String.valueOf(req.get("caption")), id);
        return Map.of("id", id, "message", "Gallery image updated");
    }

    @Override
    @Transactional
    public Map<String, Object> updateSetting(String key, Map<String, Object> req) {
        String value = req.get("value") == null ? null : String.valueOf(req.get("value"));
        int updated = jdbc.update("update public.portal_settings set value=?, updated_at=now() where key=?", value, key);
        if (updated == 0) {
            // Settings are a flexible key/value store — create on first write, like PortalSetting::set()
            jdbc.update("insert into public.portal_settings(\"group\",key,value,type,created_at,updated_at)"
                    + " values (split_part(?, '.', 1), ?, ?, 'text', now(), now())", key, key, value);
        }
        return Map.of("key", key, "message", "Setting saved");
    }

    private static Boolean bool(Object v) {
        return v == null ? null : Boolean.valueOf(String.valueOf(v));
    }

    private static Integer intOrNull(Object v) {
        try {
            return v == null ? null : Integer.valueOf(String.valueOf(v));
        } catch (NumberFormatException e) {
            return null;
        }
    }

}
