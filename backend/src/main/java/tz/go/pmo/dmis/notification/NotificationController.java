package tz.go.pmo.dmis.notification;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.security.CurrentUserResolver;
import org.springframework.security.access.prepost.PreAuthorize;
import tz.go.pmo.dmis.common.security.Authz;

/**
 * The signed-in user's notification feed (the bell) + their channel preferences. Reads the unified
 * feed (public.resource_notifications, generalised in V64) for ALL notification types — approvals,
 * incidents, early warnings, activations, publications — not just resource approvals.
 */
@RestController
@RequestMapping("/v1/notifications")
public class NotificationController {

    private final JdbcTemplate jdbc;
    private final CurrentUserResolver currentUser;

    public NotificationController(JdbcTemplate jdbc, CurrentUserResolver currentUser) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
    }

    /** Recent notifications + unread count for the bell dropdown. */
    @GetMapping
    public Map<String, Object> feed(@RequestParam(defaultValue = "20") int limit) {
        long uid = currentUser.actingUserId();
        int lim = Math.min(Math.max(limit, 1), 100);
        List<Map<String, Object>> items = jdbc.queryForList("""
                select id, type, title, message, link, entity_type, entity_id, severity, is_read, created_at
                from public.resource_notifications
                where user_id = ?
                order by created_at desc
                limit ?
                """, uid, lim);
        Integer unread = jdbc.queryForObject(
                "select count(*) from public.resource_notifications where user_id = ? and is_read = false",
                Integer.class, uid);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("unread_count", unread == null ? 0 : unread);
        return out;
    }

    /** Lightweight badge poll. */
    @GetMapping("/unread-count")
    public Map<String, Object> unreadCount() {
        long uid = currentUser.actingUserId();
        Integer unread = jdbc.queryForObject(
                "select count(*) from public.resource_notifications where user_id = ? and is_read = false",
                Integer.class, uid);
        return Map.of("count", unread == null ? 0 : unread);
    }

    @PreAuthorize(Authz.AUTHENTICATED)
    @PostMapping("/{id}/read")
    public Map<String, Object> markRead(@PathVariable long id) {
        long uid = currentUser.actingUserId();
        jdbc.update("update public.resource_notifications set is_read = true, read_at = now() "
                + "where id = ? and user_id = ?", id, uid);
        return Map.of("success", true);
    }

    @PreAuthorize(Authz.AUTHENTICATED)
    @PostMapping("/read-all")
    public Map<String, Object> markAllRead() {
        long uid = currentUser.actingUserId();
        int n = jdbc.update("update public.resource_notifications set is_read = true, read_at = now() "
                + "where user_id = ? and is_read = false", uid);
        return Map.of("success", true, "updated", n);
    }

    /** The signed-in user's own channel preferences (self-service). */
    @GetMapping("/preferences")
    public Map<String, Object> myPreferences() {
        long uid = currentUser.actingUserId();
        Map<String, Object> row = jdbc.queryForMap("""
                select id, name, email, phone, notify_in_app, notify_email, notify_sms
                from public.users where id = ?
                """, uid);
        return row;
    }

    @PreAuthorize(Authz.AUTHENTICATED)
    @PostMapping("/preferences")
    public Map<String, Object> saveMyPreferences(@RequestBody Map<String, Object> body) {
        long uid = currentUser.actingUserId();
        jdbc.update("""
                update public.users set
                    notify_in_app = ?, notify_email = ?, notify_sms = ?,
                    phone = coalesce(?, phone), updated_at = now()
                where id = ?
                """,
                boolOf(body.get("notify_in_app"), true),
                boolOf(body.get("notify_email"), true),
                boolOf(body.get("notify_sms"), false),
                body.get("phone") == null ? null : body.get("phone").toString().trim(),
                uid);
        return Map.of("success", true);
    }

    private static boolean boolOf(Object o, boolean dflt) {
        if (o == null) return dflt;
        if (o instanceof Boolean b) return b;
        String s = o.toString();
        return "true".equalsIgnoreCase(s) || "1".equals(s) || "t".equalsIgnoreCase(s) || "on".equalsIgnoreCase(s);
    }
}
