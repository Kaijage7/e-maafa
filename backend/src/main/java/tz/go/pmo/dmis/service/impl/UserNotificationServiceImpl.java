package tz.go.pmo.dmis.service.impl;

import org.springframework.stereotype.Service;
import tz.go.pmo.dmis.service.UserNotificationService;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.security.CurrentUserResolver;

/**
 * The signed-in user's notification feed (the bell) + their channel preferences. Reads the unified
 * feed (public.resource_notifications, generalised in V64) for ALL notification types — approvals,
 * incidents, early warnings, activations, publications — not just resource approvals.
 */
@Service
public class UserNotificationServiceImpl implements UserNotificationService {

    private final JdbcTemplate jdbc;
    private final CurrentUserResolver currentUser;

    public UserNotificationServiceImpl(JdbcTemplate jdbc, CurrentUserResolver currentUser) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
    }

    /** Recent notifications + unread count for the bell dropdown. */
    @Override
    public Map<String, Object> feed(int limit) {
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
    @Override
    public Map<String, Object> unreadCount() {
        long uid = currentUser.actingUserId();
        Integer unread = jdbc.queryForObject(
                "select count(*) from public.resource_notifications where user_id = ? and is_read = false",
                Integer.class, uid);
        return Map.of("count", unread == null ? 0 : unread);
    }

    @Override
    public Map<String, Object> markRead(long id) {
        long uid = currentUser.actingUserId();
        jdbc.update("update public.resource_notifications set is_read = true, read_at = now() "
                + "where id = ? and user_id = ?", id, uid);
        return Map.of("success", true);
    }

    @Override
    public Map<String, Object> markAllRead() {
        long uid = currentUser.actingUserId();
        int n = jdbc.update("update public.resource_notifications set is_read = true, read_at = now() "
                + "where user_id = ? and is_read = false", uid);
        return Map.of("success", true, "updated", n);
    }

    /** The signed-in user's own channel preferences (self-service). */
    @Override
    public Map<String, Object> myPreferences() {
        long uid = currentUser.actingUserId();
        Map<String, Object> row = jdbc.queryForMap("""
                select id, name, email, phone, notify_in_app, notify_email, notify_sms
                from public.users where id = ?
                """, uid);
        return row;
    }

    @Override
    public Map<String, Object> saveMyPreferences(Map<String, Object> body) {
        long uid = currentUser.actingUserId();
        boolean notifyInApp = boolOf(body.get("notify_in_app"), true);
        boolean notifyEmail = boolOf(body.get("notify_email"), true);
        boolean notifySms = boolOf(body.get("notify_sms"), false);
        String phone = body.get("phone") == null ? null : body.get("phone").toString().trim();
        if (phone != null && phone.isBlank()) {
            phone = null;
        }
        String effectivePhone = phone;
        if (effectivePhone == null) {
            effectivePhone = jdbc.query("select phone from public.users where id = ?",
                    rs -> rs.next() ? rs.getString(1) : null, uid);
        }
        if (phone != null && !validTanzanianMobile(phone)) {
            throw new BusinessRuleException("Enter a valid Tanzanian phone number, e.g. 0712345678 or +255712345678.");
        }
        if (notifySms && (effectivePhone == null || effectivePhone.isBlank())) {
            throw new BusinessRuleException("Add a phone number before enabling SMS notifications.");
        }
        if (notifySms && !validTanzanianMobile(effectivePhone)) {
            throw new BusinessRuleException("Enter a valid Tanzanian phone number before enabling SMS notifications.");
        }
        jdbc.update("""
                update public.users set
                    notify_in_app = ?, notify_email = ?, notify_sms = ?,
                    phone = coalesce(?, phone), updated_at = now()
                where id = ?
                """,
                notifyInApp, notifyEmail, notifySms, phone,
                uid);
        return Map.of("success", true);
    }

    private static boolean boolOf(Object o, boolean dflt) {
        if (o == null) return dflt;
        if (o instanceof Boolean b) return b;
        String s = o.toString();
        return "true".equalsIgnoreCase(s) || "1".equals(s) || "t".equalsIgnoreCase(s) || "on".equalsIgnoreCase(s);
    }

    private static boolean validTanzanianMobile(String phone) {
        if (phone == null) {
            return false;
        }
        return phone.replaceAll("[\\s-]", "").matches("^(\\+?255|0)[67]\\d{8}$");
    }
}
